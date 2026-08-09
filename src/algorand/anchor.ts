/**
 * On-chain anchoring of revealed draws.
 *
 * The beacon forgets a round after roughly 1512 rounds — about seventy minutes.
 * A proof that stops being checkable after seventy minutes is not much of a
 * proof, so at reveal time we write the result into the note field of a
 * zero-amount self-payment. That transaction is permanent, timestamped by the
 * network, and readable from any indexer for as long as Algorand exists.
 *
 * Cost is one minimum fee (0.001 ALGO) per draw.
 */
import {
  makePaymentTxnWithSuggestedParamsFromObject,
  waitForConfirmation,
} from "algosdk";
import { ANCHOR_ACCOUNT } from "../config.js";
import { log } from "../logger.js";
import { algod } from "./client.js";

/** Algorand caps the note field at 1000 bytes. */
const MAX_NOTE_BYTES = 1000;

export interface AnchorPayload {
  id: string;
  commit: string;
  targetRound: number;
  beacon: string;
  resultHash: string;
}

/**
 * Writes a draw result to the chain and waits for confirmation.
 *
 * Anchoring is best-effort by design: a draw is already correct and verifiable
 * without it, so a chain hiccup must not fail the user's request. Failures are
 * logged and reported back so they can be retried.
 *
 * @param payload - The compact proof to embed in the note field.
 * @returns The confirmed transaction id, or null when anchoring is off or failed.
 */
export async function anchorResult(payload: AnchorPayload): Promise<string | null> {
  if (!ANCHOR_ACCOUNT) return null;

  const note = new TextEncoder().encode(`tinku/v1 ${JSON.stringify(payload)}`);
  if (note.byteLength > MAX_NOTE_BYTES) {
    log.error("anchor note exceeds the 1000 byte limit", {
      drawId: payload.id,
      bytes: note.byteLength,
    });
    return null;
  }

  try {
    const suggestedParams = await algod.getTransactionParams().do();
    const txn = makePaymentTxnWithSuggestedParamsFromObject({
      sender: ANCHOR_ACCOUNT.addr,
      receiver: ANCHOR_ACCOUNT.addr,
      amount: 0,
      note,
      suggestedParams,
    });

    const signed = txn.signTxn(ANCHOR_ACCOUNT.sk);
    const { txid } = await algod.sendRawTransaction(signed).do();

    // Algorand finalises in about three seconds, so four rounds is generous.
    // Kept short on purpose: this runs inside the user's request, which on a
    // serverless platform has a hard execution ceiling.
    await waitForConfirmation(algod, txid, 4);

    log.info("draw anchored on chain", { drawId: payload.id, txId: txid });
    return txid;
  } catch (error) {
    log.error("failed to anchor draw on chain", { drawId: payload.id, error });
    return null;
  }
}
