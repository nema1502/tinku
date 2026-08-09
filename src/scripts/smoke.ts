/**
 * End-to-end smoke test against a live network.
 *
 * Exercises the real path — seal, wait for the beacon round, read the VRF
 * output, derive winners, verify — without going through the payment layer.
 * Run it after any deploy to confirm the chain integration still works:
 *
 *   pnpm exec tsx --env-file=.env src/scripts/smoke.ts
 */
import { getCurrentRound } from "../algorand/client.js";
import { BEACON_APP_ID, NETWORK_NAME } from "../config.js";
import { verifyDraw, winnerEntries } from "../domain/draw.js";
import { DrawService } from "../service/draws.js";
import { MemoryDrawRepository } from "../store/memory.js";

const PARTICIPANTS = ["ana", "beto", "carla", "dani", "edu", "fer", "gabi", "hugo"];
const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 180_000;

/**
 * Pauses execution.
 *
 * @param ms - Milliseconds to wait.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const repository = new MemoryDrawRepository();
await repository.init();
const service = new DrawService(repository);

console.log(`network      ${NETWORK_NAME}`);
console.log(`beacon app   ${BEACON_APP_ID}`);
console.log(`round now    ${await getCurrentRound()}`);

const sealed = await service.create({ participants: PARTICIPANTS, winners: 3, label: "smoke" });
console.log(`\nsealed       ${sealed.id}`);
console.log(`commit       ${sealed.commit}`);
console.log(`targetRound  ${sealed.targetRound}  (does not exist yet)`);

const deadline = Date.now() + TIMEOUT_MS;
let record = sealed;
while (!record.beacon) {
  if (Date.now() > deadline) throw new Error("timed out waiting for the beacon round");
  await sleep(POLL_INTERVAL_MS);
  const current = await getCurrentRound();
  process.stdout.write(`\rwaiting      round ${current} / ${sealed.targetRound}   `);
  record = (await service.load(sealed.id))!;
}

console.log(`\n\nbeacon       ${record.beacon}`);
console.log(`winners      ${winnerEntries(record)!.join(", ")}`);
console.log(`indexes      [${record.winnerIndexes!.join(", ")}]`);
console.log(`anchor tx    ${record.anchorTxId ?? "(anchoring disabled or failed)"}`);

const report = verifyDraw(record);
console.log(`\nverification`);
console.log(`  entries unchanged        ${report.entriesUnchanged}`);
console.log(`  winners match the chain  ${report.winnersMatchTheChain}`);

if (!report.entriesUnchanged || !report.winnersMatchTheChain) {
  console.error("\nSMOKE TEST FAILED");
  process.exit(1);
}
console.log("\nSMOKE TEST PASSED");
process.exit(0);
