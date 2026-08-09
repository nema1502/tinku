/**
 * Draw orchestration: seal, reveal, anchor.
 *
 * This is the only place that knows about all three of the chain, the store and
 * the domain rules. The HTTP layer above it does no business logic.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { getCurrentRound } from "../algorand/client.js";
import { anchorResult } from "../algorand/anchor.js";
import { BeaconUnavailableError, pickTargetRound, readBeacon } from "../algorand/beacon.js";
import { BEACON_SETTLE_ROUNDS, COMMIT_LEAD_ROUNDS, MAX_PARTICIPANTS } from "../config.js";
import {
  computeCommit,
  computeResultHash,
  deriveWinners,
  type DrawRecord,
} from "../domain/draw.js";
import { log } from "../logger.js";
import type { DrawRepository } from "../store/index.js";

export class ValidationError extends Error {}

export interface CreateDrawInput {
  participants: string[];
  winners: number;
  label?: string | null;
}

/**
 * Validates untrusted request input.
 *
 * @param body - The parsed JSON body.
 * @returns Clean, typed input.
 * @throws ValidationError when the payload is unusable.
 */
export function parseCreateDrawInput(body: unknown): CreateDrawInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("body must be a JSON object");
  }
  const { participants, winners, label } = body as Record<string, unknown>;

  if (!Array.isArray(participants) || participants.length === 0) {
    throw new ValidationError("participants must be a non-empty array");
  }
  if (participants.length > MAX_PARTICIPANTS) {
    throw new ValidationError(`participants is limited to ${MAX_PARTICIPANTS} entries`);
  }
  if (!participants.every(p => typeof p === "string" && p.length > 0 && p.length <= 512)) {
    throw new ValidationError("every participant must be a non-empty string of at most 512 characters");
  }
  if (typeof winners !== "number" || !Number.isInteger(winners) || winners < 1) {
    throw new ValidationError("winners must be a positive integer");
  }
  if (winners > participants.length) {
    throw new ValidationError("winners cannot exceed the number of participants");
  }
  if (label !== undefined && label !== null && (typeof label !== "string" || label.length > 200)) {
    throw new ValidationError("label must be a string of at most 200 characters");
  }

  return {
    participants: participants as string[],
    winners,
    label: typeof label === "string" ? label : null,
  };
}

export class DrawService {
  /**
   * In-flight reveals, so concurrent requests for the same draw do the work once.
   *
   * This guards a single process. A multi-instance deployment can still reveal
   * the same draw twice; the outcome is identical either way because the
   * derivation is pure, but it can pay the anchor fee twice. Add a row-level
   * lock before scaling past one instance.
   */
  private readonly reveals = new Map<string, Promise<DrawRecord>>();

  constructor(private readonly repository: DrawRepository) {}

  /**
   * Seals a new draw against a beacon round that does not exist yet.
   *
   * @param input - Validated draw input.
   * @returns The sealed record.
   */
  async create(input: CreateDrawInput): Promise<DrawRecord> {
    const targetRound = await pickTargetRound(COMMIT_LEAD_ROUNDS);
    const commitInput = {
      participants: input.participants,
      winners: input.winners,
      nonce: randomBytes(16).toString("hex"),
      targetRound,
    };

    const record: DrawRecord = {
      id: randomUUID(),
      label: input.label ?? null,
      ...commitInput,
      commit: computeCommit(commitInput),
      createdAt: new Date().toISOString(),
      beacon: null,
      winnerIndexes: null,
      revealedAt: null,
      anchorTxId: null,
    };

    await this.repository.save(record);
    log.info("draw sealed", {
      drawId: record.id,
      participants: record.participants.length,
      winners: record.winners,
      targetRound,
    });
    return record;
  }

  /**
   * Loads a draw, revealing it when the chain has reached its target round.
   *
   * @param id - Draw identifier.
   * @returns The record, or null when unknown.
   */
  async load(id: string): Promise<DrawRecord | null> {
    const record = await this.repository.get(id);
    if (!record || record.beacon) return record;

    // The oracle publishes its proof a little after the round it covers, so
    // give it a few rounds of slack rather than failing the first attempt.
    const current = await getCurrentRound();
    if (current < record.targetRound + BEACON_SETTLE_ROUNDS) return record;

    const existing = this.reveals.get(id);
    if (existing) return existing;

    const pending = this.reveal(record).finally(() => this.reveals.delete(id));
    this.reveals.set(id, pending);
    return pending;
  }

  /**
   * Reads the beacon, derives the winners and writes a permanent on-chain record.
   *
   * @param record - The sealed record to reveal.
   * @returns The revealed record, or the untouched record if the beacon is unavailable.
   */
  private async reveal(record: DrawRecord): Promise<DrawRecord> {
    let beacon: string;
    try {
      beacon = Buffer.from(await readBeacon(record.targetRound)).toString("hex");
    } catch (error) {
      if (error instanceof BeaconUnavailableError) {
        log.error("beacon unavailable for a sealed draw", {
          drawId: record.id,
          targetRound: record.targetRound,
          error,
        });
        return record;
      }
      throw error;
    }

    const winnerIndexes = deriveWinners(
      record.commit,
      beacon,
      record.participants.length,
      record.winners,
    );

    const anchorTxId = await anchorResult({
      id: record.id,
      commit: record.commit,
      targetRound: record.targetRound,
      beacon,
      resultHash: computeResultHash(record.commit, beacon, winnerIndexes),
    });

    const revealed: DrawRecord = {
      ...record,
      beacon,
      winnerIndexes,
      revealedAt: new Date().toISOString(),
      anchorTxId,
    };
    await this.repository.save(revealed);

    log.info("draw revealed", {
      drawId: revealed.id,
      targetRound: revealed.targetRound,
      anchored: Boolean(anchorTxId),
    });
    return revealed;
  }
}
