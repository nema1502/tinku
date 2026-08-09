/**
 * The draw engine. Pure functions, no I/O — this is the part a skeptic reruns.
 *
 * A Tinku draw happens in two moves that cannot be swapped:
 *
 *   1. Commit — hash the exact entry list, the winner count, a server nonce and
 *      the future beacon round. Published immediately.
 *   2. Reveal — once that round exists, the beacon's VRF output is combined
 *      with the commit to derive the winners deterministically.
 *
 * The organizer cannot change the entries after the fact because the commit
 * pins them, and cannot steer the outcome because the randomness comes from a
 * VRF that did not exist when the commit was published.
 */
import { createHash } from "node:crypto";

export type DrawStatus = "sealed" | "revealed";

export interface DrawCommitInput {
  /** Entries in submission order. Order is part of the commit. */
  participants: string[];
  /** How many winners to select. */
  winners: number;
  /** Server-side randomness, so a known entry list cannot be brute-forced. */
  nonce: string;
  /** Beacon round whose VRF output decides the result. Must not exist yet at commit time. */
  targetRound: number;
}

export interface DrawRecord extends DrawCommitInput {
  id: string;
  label: string | null;
  commit: string;
  createdAt: string;
  /** Hex VRF output from the beacon, once the target round has been produced. */
  beacon: string | null;
  winnerIndexes: number[] | null;
  revealedAt: string | null;
  /** Transaction id of the permanent on-chain record of this result. */
  anchorTxId: string | null;
}

/**
 * Hashes the concatenation of its arguments with SHA-256.
 *
 * @param parts - Buffers or utf-8 strings to hash in order.
 * @returns The 32-byte digest.
 */
function sha256(...parts: Array<Buffer | Uint8Array | string>): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(typeof part === "string" ? Buffer.from(part, "utf8") : part);
  }
  return hash.digest();
}

/**
 * Serializes the committed values into one unambiguous string.
 *
 * @param input - The values being committed to.
 * @returns A canonical string representation.
 */
function canonicalize(input: DrawCommitInput): string {
  return JSON.stringify({
    participants: input.participants,
    winners: input.winners,
    nonce: input.nonce,
    targetRound: input.targetRound,
  });
}

/**
 * Computes the commit hash of a draw.
 *
 * @param input - The values being committed to.
 * @returns Lowercase hex SHA-256 of the canonical form.
 */
export function computeCommit(input: DrawCommitInput): string {
  return sha256(canonicalize(input)).toString("hex");
}

/**
 * Deterministic random stream derived from the commit and the beacon output.
 *
 * Neither side alone determines it: the commit is fixed before the VRF output
 * exists, and the VRF output is produced by the network afterwards.
 */
class SeededRng {
  private buffer: Buffer = Buffer.alloc(0);
  private counter = 0;

  constructor(private readonly root: Buffer) {}

  private refill(): void {
    const counterBytes = Buffer.alloc(4);
    counterBytes.writeUInt32BE(this.counter++, 0);
    this.buffer = Buffer.concat([this.buffer, sha256(this.root, counterBytes)]);
  }

  private take(n: number): Buffer {
    while (this.buffer.length < n) this.refill();
    const out = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return out;
  }

  /**
   * Returns a uniformly distributed integer in [0, max).
   *
   * Rejection sampling rather than a modulo: a modulo would make earlier
   * entries very slightly likelier to win, which is precisely the kind of
   * quiet unfairness this product exists to rule out.
   *
   * @param max - Exclusive upper bound, must be positive.
   * @returns An integer in [0, max).
   */
  nextBelow(max: number): number {
    if (max <= 0) throw new RangeError("max must be positive");
    if (max === 1) return 0;

    const bits = 32 - Math.clz32(max - 1);
    const bytes = Math.ceil(bits / 8);
    const mask = (1 << bits) - 1;

    for (;;) {
      const candidate = this.take(bytes).readUIntBE(0, bytes) & mask;
      if (candidate < max) return candidate;
    }
  }
}

/**
 * Derives the winning positions of a draw.
 *
 * @param commit - Hex commit hash from `computeCommit`.
 * @param beacon - Hex VRF output of the committed target round.
 * @param participantCount - Total number of entries.
 * @param winners - How many winners to select.
 * @returns Winning indexes, in the order they were drawn.
 */
export function deriveWinners(
  commit: string,
  beacon: string,
  participantCount: number,
  winners: number,
): number[] {
  if (winners < 1) throw new RangeError("a draw needs at least one winner");
  if (winners > participantCount) {
    throw new RangeError("cannot select more winners than there are participants");
  }

  const rng = new SeededRng(sha256(Buffer.from(commit, "hex"), Buffer.from(beacon, "hex")));

  // Partial Fisher-Yates: unbiased, and it stops after `winners` swaps.
  const pool = Array.from({ length: participantCount }, (_, i) => i);
  const picked: number[] = [];
  for (let i = 0; i < winners; i++) {
    const j = i + rng.nextBelow(participantCount - i);
    const a = pool[i]!;
    const b = pool[j]!;
    pool[i] = b;
    pool[j] = a;
    picked.push(b);
  }
  return picked;
}

/**
 * Computes the compact digest that gets written on chain.
 *
 * @param commit - Hex commit hash.
 * @param beacon - Hex VRF output.
 * @param winnerIndexes - Winning positions.
 * @returns Lowercase hex SHA-256 binding the three together.
 */
export function computeResultHash(
  commit: string,
  beacon: string,
  winnerIndexes: number[],
): string {
  return sha256(
    Buffer.from(commit, "hex"),
    Buffer.from(beacon, "hex"),
    winnerIndexes.join(","),
  ).toString("hex");
}

export interface VerificationReport {
  entriesUnchanged: boolean;
  winnersMatchTheChain: boolean | null;
  recomputedCommit: string;
  recomputedWinners: number[] | null;
}

/**
 * Recomputes a published record from its raw inputs and reports whether it holds up.
 *
 * Nothing stored is trusted: both the commit and the winners are rebuilt from
 * scratch and compared against what was published.
 *
 * @param record - The published draw record.
 * @returns Which checks passed and what the recomputation produced.
 */
export function verifyDraw(record: DrawRecord): VerificationReport {
  const recomputedCommit = computeCommit(record);
  const entriesUnchanged = recomputedCommit === record.commit;

  if (!record.beacon || !record.winnerIndexes) {
    return {
      entriesUnchanged,
      winnersMatchTheChain: null,
      recomputedCommit,
      recomputedWinners: null,
    };
  }

  const recomputedWinners = deriveWinners(
    record.commit,
    record.beacon,
    record.participants.length,
    record.winners,
  );
  const winnersMatchTheChain =
    recomputedWinners.length === record.winnerIndexes.length &&
    recomputedWinners.every((value, i) => value === record.winnerIndexes![i]);

  return { entriesUnchanged, winnersMatchTheChain, recomputedCommit, recomputedWinners };
}

/**
 * Maps winning indexes back to the entries they refer to.
 *
 * @param record - A draw record.
 * @returns The winning entries, or null when the draw is still sealed.
 */
export function winnerEntries(record: DrawRecord): string[] | null {
  if (!record.winnerIndexes) return null;
  return record.winnerIndexes.map(i => record.participants[i]!);
}
