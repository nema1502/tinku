/**
 * HTTP surface.
 *
 * Paid: running a draw, because that is the work.
 * Free, forever: reading a result and verifying it, because a proof nobody can
 * afford to check is not a proof.
 */
import { Hono } from "hono";
import { getCurrentRound } from "../algorand/client.js";
import { BEACON_APP_ID } from "../config.js";
import {
  ANCHOR_ENABLED,
  CHALLENGE_TAG,
  NETWORK,
  NETWORK_NAME,
  PRICE_DRAW_BASE,
  PRICE_PER_ENTRY,
  PUBLIC_BASE_URL,
  USDC_ASA_ID,
  priceForEntries,
} from "../config.js";
import { verifyDraw, winnerEntries, type DrawRecord } from "../domain/draw.js";
import { log } from "../logger.js";
import { DrawService, ValidationError, parseCreateDrawInput } from "../service/draws.js";
import type { DrawRepository } from "../store/index.js";
import { drawPage, landingPage, verifyPage } from "../web/pages.js";
import { createPaymentMiddleware } from "./payment.js";

/**
 * Shapes a record for public consumption.
 *
 * @param record - The stored record.
 * @returns The public view of a draw.
 */
function present(record: DrawRecord) {
  const base = {
    id: record.id,
    label: record.label,
    commit: record.commit,
    targetRound: record.targetRound,
    participantCount: record.participants.length,
    winnerCount: record.winners,
    createdAt: record.createdAt,
    resultUrl: `${PUBLIC_BASE_URL}/v1/draws/${record.id}`,
    verifyUrl: `${PUBLIC_BASE_URL}/v1/draws/${record.id}/verify`,
  };

  if (!record.beacon) {
    return { ...base, status: "sealed" as const };
  }

  return {
    ...base,
    status: "revealed" as const,
    beacon: record.beacon,
    winners: winnerEntries(record),
    winnerIndexes: record.winnerIndexes,
    revealedAt: record.revealedAt,
    anchorTxId: record.anchorTxId,
  };
}

/**
 * Assembles the HTTP application.
 *
 * @param repository - Initialised storage.
 * @returns The Hono app and the service it wraps.
 */
export function createApp(repository: DrawRepository) {
  const service = new DrawService(repository);
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400);
    }
    log.error("unhandled request error", { path: c.req.path, error });
    return c.json({ error: "internal error" }, 500);
  });

  // Storage is prepared lazily so the same app works both as a long-lived
  // server (initialised once at boot) and as a serverless function (where
  // there is no boot phase). `init()` is memoised, so this is a no-op after
  // the first request handled by an instance.
  app.use(async (_c, next) => {
    await repository.init();
    await next();
  });

  app.use(createPaymentMiddleware());

  /* ---------------- paid ---------------- */

  app.post("/v1/draws", async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError("body must be valid JSON");
    }

    const input = parseCreateDrawInput(body);

    // The price was quoted from ?entries=N before this body existed, so the
    // list cannot be larger than what was paid for. Smaller is fine.
    const declared = Number(c.req.query("entries"));
    if (Number.isFinite(declared) && declared > 0 && input.participants.length > declared) {
      throw new ValidationError(
        `paid for ${Math.floor(declared)} entries but sent ${input.participants.length} — ` +
          `re-request with ?entries=${input.participants.length}`,
      );
    }

    const record = await service.create(input);
    return c.json(
      {
        ...present(record),
        message:
          "Entries are sealed. The winners come from the Algorand randomness beacon at the target round, which does not exist yet.",
      },
      201,
    );
  });

  /* ---------------- free ---------------- */

  app.get("/v1/draws/:id", async c => {
    const record = await service.load(c.req.param("id"));
    if (!record) return c.json({ error: "unknown draw" }, 404);

    if (!record.beacon) {
      const current = await getCurrentRound();
      return c.json({
        ...present(record),
        currentRound: current,
        roundsRemaining: Math.max(0, record.targetRound - current),
      });
    }
    return c.json(present(record));
  });

  app.get("/v1/draws/:id/verify", async c => {
    const record = await service.load(c.req.param("id"));
    if (!record) return c.json({ error: "unknown draw" }, 404);

    const report = verifyDraw(record);

    return c.json({
      id: record.id,
      verdict: {
        entriesUnchanged: report.entriesUnchanged,
        winnersMatchTheChain: report.winnersMatchTheChain,
      },
      record: {
        participants: record.participants,
        winners: record.winners,
        nonce: record.nonce,
        targetRound: record.targetRound,
        commit: record.commit,
        beacon: record.beacon,
        winnerIndexes: record.winnerIndexes,
        winnerEntries: winnerEntries(record),
        createdAt: record.createdAt,
        revealedAt: record.revealedAt,
        anchorTxId: record.anchorTxId,
      },
      checkItYourself: {
        step1: "commit = sha256(JSON.stringify({participants, winners, nonce, targetRound}))",
        step2: `read the randomness beacon (app ${BEACON_APP_ID}) via must_get(${record.targetRound}, "")`,
        step3: "winners = partial Fisher-Yates over sha256(commit || beacon), rejection sampled",
        step4: record.anchorTxId
          ? "the same result was written on chain at reveal time — see anchorTxId"
          : "this draw has no on-chain anchor",
        beaconApp: BEACON_APP_ID,
        network: NETWORK_NAME,
        sourceCode: "https://github.com/nema1502/tinku",
      },
    });
  });

  /* ---------------- operations ---------------- */

  app.get("/health", c => c.json({ ok: true, service: "tinku" }));

  app.get("/ready", async c => {
    const [storeOk, round] = await Promise.all([
      repository.healthy(),
      getCurrentRound().then(
        r => r,
        () => null,
      ),
    ]);
    const ready = storeOk && round !== null;
    return c.json({ ready, storage: storeOk, algod: round !== null, round }, ready ? 200 : 503);
  });

  /* ---------------- web ---------------- */

  /**
   * True when the caller is a browser rather than an agent or a script.
   *
   * @param accept - The request's Accept header.
   * @returns Whether to answer with HTML.
   */
  const wantsHtml = (accept: string | undefined) => (accept ?? "").includes("text/html");

  app.get("/d/:id", async c => {
    const record = await service.load(c.req.param("id"));
    if (!record) return c.notFound();
    return c.html(drawPage(record, await getCurrentRound()));
  });

  app.get("/v/:id", async c => {
    const record = await service.load(c.req.param("id"));
    if (!record) return c.notFound();
    return c.html(verifyPage(record, verifyDraw(record)));
  });

  app.get("/", c => {
    // Browsers get the product; agents and scripts get the machine-readable
    // description they came for.
    if (wantsHtml(c.req.header("accept"))) return c.html(landingPage());

    return c.json({
      name: "Tinku",
      description:
        "Provably fair draws on Algorand. Running a draw is paid per request with x402; reading and verifying a result is free.",
      network: { name: NETWORK_NAME, caip2: NETWORK, usdcAsaId: USDC_ASA_ID },
      randomness: { source: "Algorand randomness beacon", appId: BEACON_APP_ID },
      onChainAnchoring: ANCHOR_ENABLED,
      challengeTag: CHALLENGE_TAG,
      pricing: {
        formula: `$${PRICE_DRAW_BASE} + $${PRICE_PER_ENTRY} per entry`,
        note: "Declare the entry count as ?entries=N — the price is quoted before the body is read.",
        examples: {
          "10 entries": priceForEntries(10),
          "100 entries": priceForEntries(100),
          "300 entries": priceForEntries(300),
        },
      },
      endpoints: {
        "POST /v1/draws?entries=N": "paid — seal and run a verifiable draw",
        "GET /v1/draws/:id": "free — the result once the target round exists",
        "GET /v1/draws/:id/verify": "free — full record and independent recomputation",
      },
    });
  });

  return app;
}
