/**
 * Shared algod client and chain helpers.
 */
import { Algodv2 } from "algosdk";
import { ALGOD_TOKEN, ALGOD_URL } from "../config.js";

export const algod = new Algodv2(ALGOD_TOKEN, ALGOD_URL, "");

/**
 * Reads the latest round the node has seen.
 *
 * @returns The current round number.
 */
export async function getCurrentRound(): Promise<number> {
  const status = await algod.status().do();
  return Number(status.lastRound);
}
