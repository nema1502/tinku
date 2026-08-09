/**
 * Tests for the draw engine.
 *
 * The product's entire claim is that these functions are deterministic,
 * unbiased and tamper-evident, so those are exactly what is asserted here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCommit,
  computeResultHash,
  deriveWinners,
  verifyDraw,
  type DrawRecord,
} from "./draw.js";

const BEACON = "c3d8c4365136584dcd023c8205304100b0d9a127d2a4c6e70c4a78ea42478028";

/**
 * Builds a draw record for testing.
 *
 * @param overrides - Fields to override on the base record.
 * @returns A complete record.
 */
function makeRecord(overrides: Partial<DrawRecord> = {}): DrawRecord {
  const base = {
    participants: ["ana", "beto", "carla", "dani", "edu"],
    winners: 2,
    nonce: "3f9c1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
    targetRound: 66126840,
  };
  const record: DrawRecord = {
    id: "11111111-2222-3333-4444-555555555555",
    label: null,
    ...base,
    commit: computeCommit(base),
    createdAt: "2026-08-09T00:00:00.000Z",
    beacon: null,
    winnerIndexes: null,
    revealedAt: null,
    anchorTxId: null,
    ...overrides,
  };
  return record;
}

describe("computeCommit", () => {
  it("is deterministic", () => {
    const input = { participants: ["a", "b"], winners: 1, nonce: "ff", targetRound: 8 };
    assert.equal(computeCommit(input), computeCommit(input));
  });

  it("changes when any committed field changes", () => {
    const base = { participants: ["a", "b"], winners: 1, nonce: "ff", targetRound: 8 };
    const commit = computeCommit(base);

    assert.notEqual(commit, computeCommit({ ...base, participants: ["b", "a"] }));
    assert.notEqual(commit, computeCommit({ ...base, winners: 2 }));
    assert.notEqual(commit, computeCommit({ ...base, nonce: "fe" }));
    assert.notEqual(commit, computeCommit({ ...base, targetRound: 16 }));
  });
});

describe("deriveWinners", () => {
  it("is deterministic for the same commit and beacon", () => {
    const commit = computeCommit({
      participants: ["a", "b", "c"],
      winners: 2,
      nonce: "ff",
      targetRound: 8,
    });
    assert.deepEqual(deriveWinners(commit, BEACON, 3, 2), deriveWinners(commit, BEACON, 3, 2));
  });

  it("returns the requested number of distinct, in-range indexes", () => {
    const commit = computeCommit({
      participants: Array.from({ length: 50 }, (_, i) => `p${i}`),
      winners: 7,
      nonce: "ab",
      targetRound: 8,
    });
    const winners = deriveWinners(commit, BEACON, 50, 7);

    assert.equal(winners.length, 7);
    assert.equal(new Set(winners).size, 7, "winners must be distinct");
    assert.ok(winners.every(i => i >= 0 && i < 50), "winners must be in range");
  });

  it("produces a different result for a different beacon value", () => {
    const commit = computeCommit({
      participants: ["a", "b", "c", "d", "e", "f", "g", "h"],
      winners: 3,
      nonce: "ff",
      targetRound: 8,
    });
    const other = "0".repeat(64);
    assert.notDeepEqual(deriveWinners(commit, BEACON, 8, 3), deriveWinners(commit, other, 8, 3));
  });

  it("rejects impossible requests", () => {
    assert.throws(() => deriveWinners("ab".repeat(32), BEACON, 3, 0), RangeError);
    assert.throws(() => deriveWinners("ab".repeat(32), BEACON, 3, 4), RangeError);
  });

  it("selects positions roughly uniformly", () => {
    // A modulo-based shuffle would skew towards the low indexes. With 10 slots
    // and 20k single-winner draws, each slot should land near 2000; anything
    // outside +/-25% would mean the derivation is biased.
    const slots = 10;
    const trials = 20_000;
    const counts = new Array<number>(slots).fill(0);

    for (let i = 0; i < trials; i++) {
      const commit = computeCommit({
        participants: [],
        winners: 1,
        nonce: `nonce-${i}`,
        targetRound: 8,
      });
      counts[deriveWinners(commit, BEACON, slots, 1)[0]!]! += 1;
    }

    const expected = trials / slots;
    for (const [index, count] of counts.entries()) {
      const drift = Math.abs(count - expected) / expected;
      assert.ok(drift < 0.25, `slot ${index} drifted ${(drift * 100).toFixed(1)}% from uniform`);
    }
  });
});

describe("verifyDraw", () => {
  it("accepts an untampered revealed record", () => {
    const record = makeRecord();
    const winnerIndexes = deriveWinners(
      record.commit,
      BEACON,
      record.participants.length,
      record.winners,
    );
    const report = verifyDraw({ ...record, beacon: BEACON, winnerIndexes });

    assert.equal(report.entriesUnchanged, true);
    assert.equal(report.winnersMatchTheChain, true);
  });

  it("detects an entry list edited after the commit", () => {
    const record = makeRecord();
    const tampered = { ...record, participants: [...record.participants, "colado"] };

    assert.equal(verifyDraw(tampered).entriesUnchanged, false);
  });

  it("detects winners that do not follow from the beacon", () => {
    const record = makeRecord();
    const report = verifyDraw({ ...record, beacon: BEACON, winnerIndexes: [0, 1] });

    assert.equal(report.entriesUnchanged, true);
    assert.equal(report.winnersMatchTheChain, false);
  });

  it("reports winners as unknown while the draw is still sealed", () => {
    assert.equal(verifyDraw(makeRecord()).winnersMatchTheChain, null);
  });
});

describe("computeResultHash", () => {
  it("binds commit, beacon and winners together", () => {
    const commit = "ab".repeat(32);
    const hash = computeResultHash(commit, BEACON, [1, 2]);

    assert.equal(hash, computeResultHash(commit, BEACON, [1, 2]));
    assert.notEqual(hash, computeResultHash(commit, BEACON, [2, 1]));
    assert.notEqual(hash, computeResultHash("cd".repeat(32), BEACON, [1, 2]));
  });
});
