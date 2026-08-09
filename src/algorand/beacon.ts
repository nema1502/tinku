/**
 * Algorand randomness beacon reader.
 *
 * The beacon is a smart contract maintained by the Algorand Foundation that
 * publishes a VRF output for every round that is a multiple of 8. A VRF output
 * cannot be predicted before its round is produced and cannot be forged
 * afterwards, which is exactly the property a fair draw needs.
 *
 * We read it off-chain with `simulate`, so no transaction is submitted and no
 * fee is paid — but simulate still applies balance checks, hence the funded
 * reader address in the configuration.
 */
import {
  ABIMethod,
  AtomicTransactionComposer,
  makeEmptyTransactionSigner,
  modelsv2,
} from "algosdk";
import { BEACON_APP_ID, BEACON_READER_ADDRESS } from "../config.js";
import { algod, getCurrentRound } from "./client.js";

/** The beacon only publishes on rounds that are multiples of this. */
export const BEACON_ROUND_MULTIPLE = 8;

/**
 * How many rounds of history the beacon keeps.
 *
 * 189 stored outputs × 8 rounds each. Past this window the contract no longer
 * answers for a round, which is why every revealed draw is anchored on chain.
 */
export const BEACON_RETENTION_ROUNDS = 189 * BEACON_ROUND_MULTIPLE;

const MUST_GET = ABIMethod.fromSignature("must_get(uint64,byte[])byte[]");

export class BeaconUnavailableError extends Error {
  constructor(
    readonly round: number,
    cause: string,
  ) {
    super(`randomness beacon has no value for round ${round}: ${cause}`);
    this.name = "BeaconUnavailableError";
  }
}

/**
 * Rounds a round number up to the next round the beacon publishes on.
 *
 * @param round - Earliest acceptable round.
 * @returns The next round that is a multiple of 8, at or after `round`.
 */
export function toBeaconRound(round: number): number {
  return Math.ceil(round / BEACON_ROUND_MULTIPLE) * BEACON_ROUND_MULTIPLE;
}

/**
 * Reads the beacon's VRF output for a round.
 *
 * @param round - A round that is a multiple of 8 and already produced.
 * @param userData - Optional domain separator mixed into the output by the contract.
 * @returns The 32-byte VRF output.
 * @throws BeaconUnavailableError when the round is outside the retention window.
 */
export async function readBeacon(round: number, userData: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
  if (round % BEACON_ROUND_MULTIPLE !== 0) {
    throw new BeaconUnavailableError(round, `not a multiple of ${BEACON_ROUND_MULTIPLE}`);
  }

  const suggestedParams = await algod.getTransactionParams().do();
  const composer = new AtomicTransactionComposer();
  composer.addMethodCall({
    appID: BEACON_APP_ID,
    method: MUST_GET,
    methodArgs: [round, userData],
    sender: BEACON_READER_ADDRESS,
    suggestedParams,
    signer: makeEmptyTransactionSigner(),
  });

  let result;
  try {
    result = await composer.simulate(
      algod,
      new modelsv2.SimulateRequest({ txnGroups: [], allowEmptySignatures: true }),
    );
  } catch (error) {
    throw new BeaconUnavailableError(round, error instanceof Error ? error.message : String(error));
  }

  const methodResult = result.methodResults[0];
  if (!methodResult || methodResult.decodeError) {
    throw new BeaconUnavailableError(round, methodResult?.decodeError?.message ?? "no method result");
  }

  const value = methodResult.returnValue as ArrayLike<number> | undefined;
  if (!value || value.length === 0) {
    throw new BeaconUnavailableError(round, "beacon returned an empty value");
  }
  return Uint8Array.from(value);
}

/**
 * Picks the round that will decide a draw being sealed right now.
 *
 * @param leadRounds - Minimum distance from the current round.
 * @returns A future round that the beacon will publish on.
 */
export async function pickTargetRound(leadRounds: number): Promise<number> {
  const current = await getCurrentRound();
  return toBeaconRound(current + leadRounds);
}

/**
 * Reports whether a round is still inside the beacon's retention window.
 *
 * @param round - Round to check.
 * @param currentRound - Current chain round.
 * @returns True when the beacon can still be queried for that round.
 */
export function isWithinRetention(round: number, currentRound: number): boolean {
  return currentRound - round < BEACON_RETENTION_ROUNDS;
}
