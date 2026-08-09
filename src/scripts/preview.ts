/**
 * Local preview server.
 *
 * Seeds one already-decided draw and one still sealed, then serves the app so
 * the pages can be looked at without settling a payment first. The seeded draw
 * is real: its randomness is read from the live beacon and its winners are
 * derived the same way a paid draw's are, so the verification page is
 * genuinely verifying something.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/preview.ts
 */
import { randomBytes, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { getCurrentRound } from "../algorand/client.js";
import { readBeacon, toBeaconRound } from "../algorand/beacon.js";
import { computeCommit, deriveWinners, type DrawRecord } from "../domain/draw.js";
import { createApp } from "../http/app.js";
import { MemoryDrawRepository } from "../store/memory.js";

const PORT = 8403;

const PARTICIPANTS = [
  "ana", "beto", "carla", "dani", "edu", "fer", "gabi", "hugo",
  "ines", "juan", "kari", "luis",
];

const repository = new MemoryDrawRepository();
await repository.init();

const current = await getCurrentRound();

/* A draw whose deciding round is already in the past, so it is fully revealed. */
const pastRound = toBeaconRound(current - 40);
const beacon = Buffer.from(await readBeacon(pastRound)).toString("hex");

const revealedInput = {
  participants: PARTICIPANTS,
  winners: 3,
  nonce: randomBytes(16).toString("hex"),
  targetRound: pastRound,
};
const commit = computeCommit(revealedInput);
const revealed: DrawRecord = {
  id: randomUUID(),
  label: "GDG Santa Cruz — workshop seats",
  ...revealedInput,
  commit,
  createdAt: new Date(Date.now() - 120_000).toISOString(),
  beacon,
  winnerIndexes: deriveWinners(commit, beacon, PARTICIPANTS.length, 3),
  revealedAt: new Date(Date.now() - 60_000).toISOString(),
  anchorTxId: null,
};
await repository.save(revealed);

/* A draw still waiting for its round, to preview the sealed state. */
const pendingInput = {
  participants: PARTICIPANTS.slice(0, 8),
  winners: 1,
  nonce: randomBytes(16).toString("hex"),
  targetRound: toBeaconRound(current + 16),
};
const pending: DrawRecord = {
  id: randomUUID(),
  label: "Women Techmakers — scholarship",
  ...pendingInput,
  commit: computeCommit(pendingInput),
  createdAt: new Date().toISOString(),
  beacon: null,
  winnerIndexes: null,
  revealedAt: null,
  anchorTxId: null,
};
await repository.save(pending);

serve({ fetch: createApp(repository).fetch, port: PORT }, () => {
  console.log(`\n  preview on http://localhost:${PORT}\n`);
  console.log(`  landing   http://localhost:${PORT}/`);
  console.log(`  revealed  http://localhost:${PORT}/d/${revealed.id}`);
  console.log(`  verify    http://localhost:${PORT}/v/${revealed.id}`);
  console.log(`  sealed    http://localhost:${PORT}/d/${pending.id}\n`);
});
