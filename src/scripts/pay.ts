/**
 * x402 client — pays the endpoint and runs a draw.
 *
 * This is what an agent does: request, get told the price, pay, get the result.
 * No account, no API key, no subscription. It is also how the competition's
 * required "one real MainNet payment" gets made, so it is kept as a script
 * rather than a one-off command.
 *
 *   PAYER_SK_B64=... pnpm exec tsx src/scripts/pay.ts https://tinku-zeta.vercel.app
 *
 * PAYER_SK_B64 is the base64 of the payer's 64-byte Algorand secret key. It is
 * the account that spends, and it must be opted in to USDC.
 */
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { decodePaymentResponseHeader } from "@x402/core/http";
import {
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  toClientAvmSigner,
} from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/client";

const baseUrl = (process.argv[2] ?? process.env.TARGET_URL ?? "http://localhost:8402").replace(/\/+$/, "");
const secretKey = process.env.PAYER_SK_B64;
const network = process.env.ALGORAND_NETWORK === "mainnet" ? "mainnet" : "testnet";

if (!secretKey) {
  throw new Error("PAYER_SK_B64 is required — base64 of the payer's 64-byte Algorand secret key");
}

const participants = (process.env.PARTICIPANTS ?? "ana,beto,carla,dani,edu")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const winners = Number(process.env.WINNERS ?? 1);
const label = process.env.LABEL ?? "x402 client test";

const caip2 = `algorand:${
  network === "mainnet" ? ALGORAND_MAINNET_GENESIS_HASH : ALGORAND_TESTNET_GENESIS_HASH
}` as `${string}:${string}`;

const signer = toClientAvmSigner(secretKey);
const payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: caip2, client: new ExactAvmScheme(signer) }],
});

console.log(`target   ${baseUrl}`);
console.log(`network  ${network}`);
console.log(`payer    ${signer.address}`);
console.log(`entries  ${participants.length}, ${winners} winner(s)\n`);

const response = await payingFetch(`${baseUrl}/v1/draws?entries=${participants.length}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ participants, winners, label }),
});

if (!response.ok) {
  console.error(`request failed: HTTP ${response.status}`);
  console.error(await response.text());
  process.exit(1);
}

const draw = (await response.json()) as Record<string, unknown>;

const settlementHeader = response.headers.get("x-payment-response");
if (settlementHeader) {
  const settlement = decodePaymentResponseHeader(settlementHeader);
  console.log("payment settled");
  console.log(`  success      ${settlement.success}`);
  if (settlement.transaction) console.log(`  transaction  ${settlement.transaction}`);
  if (settlement.network) console.log(`  network      ${settlement.network}`);
  console.log();
}

console.log("draw sealed");
console.log(`  id           ${draw.id}`);
console.log(`  commit       ${draw.commit}`);
console.log(`  target round ${draw.targetRound}`);
console.log(`\n  result   ${draw.resultUrl}`);
console.log(`  verify   ${draw.verifyUrl}`);
