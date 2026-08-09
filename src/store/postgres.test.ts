/**
 * Integration tests for the Postgres repository.
 *
 * Skipped unless DATABASE_URL points at a real database — CI provides one as a
 * service container. The storage layer is where a verification link goes to die
 * if it is wrong, so it gets exercised against actual Postgres rather than a
 * mock that agrees with whatever we wrote.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { computeCommit, deriveWinners, type DrawRecord } from "../domain/draw.js";
import type { DrawRepository } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL;
const BEACON = "c3d8c4365136584dcd023c8205304100b0d9a127d2a4c6e70c4a78ea42478028";

// Importing the repository pulls in config, which refuses to load without a
// valid receiving address. These tests never settle a payment, so any
// well-formed address will do.
if (DATABASE_URL && !process.env.PAY_TO) {
  process.env.PAY_TO = "PEW65C77CTTOHDBM2M4LUYXSG6HWJNPOAGPSD5C33IVWILS46PI6SVN4BM";
  process.env.ANCHOR_ENABLED = "false";
}

/**
 * Builds a sealed draw record.
 *
 * @returns A record that has not been revealed yet.
 */
function sealedRecord(): DrawRecord {
  const input = {
    participants: ["ana", "beto", "carla", "dani"],
    winners: 2,
    nonce: randomUUID().replace(/-/g, ""),
    targetRound: 66_126_840,
  };
  return {
    id: randomUUID(),
    label: "integration test",
    ...input,
    commit: computeCommit(input),
    createdAt: new Date().toISOString(),
    beacon: null,
    winnerIndexes: null,
    revealedAt: null,
    anchorTxId: null,
  };
}

describe("PostgresDrawRepository", { skip: DATABASE_URL ? false : "DATABASE_URL not set" }, () => {
  let repository: DrawRepository;

  before(async () => {
    const { PostgresDrawRepository } = await import("./postgres.js");
    repository = new PostgresDrawRepository(DATABASE_URL!);
    await repository.init();
  });

  after(async () => {
    await repository?.close();
  });

  it("creates its schema and reports healthy", async () => {
    assert.equal(await repository.healthy(), true);
  });

  it("round-trips a sealed record without mangling any field", async () => {
    const record = sealedRecord();
    await repository.save(record);

    const loaded = await repository.get(record.id);
    assert.ok(loaded, "record should exist");
    assert.deepEqual(loaded.participants, record.participants);
    assert.equal(loaded.commit, record.commit);
    assert.equal(loaded.nonce, record.nonce);
    // BIGINT comes back as a string from pg; the mapping has to restore a number
    // or every round comparison downstream silently breaks.
    assert.equal(loaded.targetRound, record.targetRound);
    assert.equal(typeof loaded.targetRound, "number");
    assert.equal(loaded.beacon, null);
    assert.equal(loaded.winnerIndexes, null);
  });

  it("updates a record in place when it is revealed", async () => {
    const record = sealedRecord();
    await repository.save(record);

    const winnerIndexes = deriveWinners(record.commit, BEACON, record.participants.length, record.winners);
    await repository.save({
      ...record,
      beacon: BEACON,
      winnerIndexes,
      revealedAt: new Date().toISOString(),
      anchorTxId: "TESTTXID",
    });

    const loaded = await repository.get(record.id);
    assert.ok(loaded);
    assert.equal(loaded.beacon, BEACON);
    assert.deepEqual(loaded.winnerIndexes, winnerIndexes);
    assert.equal(loaded.anchorTxId, "TESTTXID");
    assert.ok(loaded.revealedAt);
    // The sealed fields must survive the reveal untouched.
    assert.equal(loaded.commit, record.commit);
    assert.deepEqual(loaded.participants, record.participants);
  });

  it("returns null for an unknown id", async () => {
    assert.equal(await repository.get(randomUUID()), null);
  });

  it("survives init being called more than once", async () => {
    await repository.init();
    await repository.init();
    assert.equal(await repository.healthy(), true);
  });
});
