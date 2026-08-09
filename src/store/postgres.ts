/**
 * PostgreSQL storage — the production backend (RDS or Aurora Serverless on AWS).
 *
 * The schema is created on startup so a fresh environment boots without a
 * separate migration step. Draws are append-mostly: written when sealed,
 * updated once when revealed, then read forever.
 */
import { Pool } from "pg";
import { DATABASE_SSL, DATABASE_URL } from "../config.js";
import type { DrawRecord } from "../domain/draw.js";
import { log } from "../logger.js";
import type { DrawRepository } from "./types.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS draws (
    id             UUID PRIMARY KEY,
    label          TEXT,
    participants   JSONB       NOT NULL,
    winners        INTEGER     NOT NULL,
    nonce          TEXT        NOT NULL,
    target_round   BIGINT      NOT NULL,
    commitment     TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    beacon         TEXT,
    winner_indexes JSONB,
    revealed_at    TIMESTAMPTZ,
    anchor_tx_id   TEXT
  );
  CREATE INDEX IF NOT EXISTS draws_pending_reveal
    ON draws (target_round) WHERE beacon IS NULL;
`;

interface DrawRow {
  id: string;
  label: string | null;
  participants: string[];
  winners: number;
  nonce: string;
  target_round: string;
  commitment: string;
  created_at: Date;
  beacon: string | null;
  winner_indexes: number[] | null;
  revealed_at: Date | null;
  anchor_tx_id: string | null;
}

/**
 * Maps a database row to a domain record.
 *
 * @param row - The row as returned by pg.
 * @returns The domain record.
 */
function toRecord(row: DrawRow): DrawRecord {
  return {
    id: row.id,
    label: row.label,
    participants: row.participants,
    winners: row.winners,
    nonce: row.nonce,
    targetRound: Number(row.target_round),
    commit: row.commitment,
    createdAt: row.created_at.toISOString(),
    beacon: row.beacon,
    winnerIndexes: row.winner_indexes,
    revealedAt: row.revealed_at?.toISOString() ?? null,
    anchorTxId: row.anchor_tx_id,
  };
}

export class PostgresDrawRepository implements DrawRepository {
  private readonly pool: Pool;
  private initPromise: Promise<void> | null = null;

  constructor(connectionString: string = DATABASE_URL) {
    this.pool = new Pool({
      connectionString,
      ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      // Serverless runs many short-lived instances, so each one keeps a single
      // connection and leans on the provider's pooler instead of holding ten.
      max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 1 : 10)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on("error", error => log.error("postgres pool error", { error }));
  }

  /**
   * Creates the schema if it does not exist yet.
   *
   * Memoised, because on serverless this is called per request rather than once
   * at boot, and concurrent callers must not race to create the same table.
   */
  async init(): Promise<void> {
    this.initPromise ??= this.pool.query(SCHEMA).then(() => {
      log.info("postgres schema ready");
    });
    return this.initPromise;
  }

  /**
   * Inserts a draw, or updates it in place when it is being revealed.
   *
   * @param record - The record to persist.
   */
  async save(record: DrawRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO draws (
         id, label, participants, winners, nonce, target_round, commitment,
         created_at, beacon, winner_indexes, revealed_at, anchor_tx_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         beacon         = EXCLUDED.beacon,
         winner_indexes = EXCLUDED.winner_indexes,
         revealed_at    = EXCLUDED.revealed_at,
         anchor_tx_id   = EXCLUDED.anchor_tx_id`,
      [
        record.id,
        record.label,
        JSON.stringify(record.participants),
        record.winners,
        record.nonce,
        record.targetRound,
        record.commit,
        record.createdAt,
        record.beacon,
        record.winnerIndexes ? JSON.stringify(record.winnerIndexes) : null,
        record.revealedAt,
        record.anchorTxId,
      ],
    );
  }

  /**
   * Loads a draw by id.
   *
   * @param id - Draw identifier.
   * @returns The record, or null when unknown.
   */
  async get(id: string): Promise<DrawRecord | null> {
    const { rows } = await this.pool.query<DrawRow>("SELECT * FROM draws WHERE id = $1", [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Checks database reachability.
   *
   * @returns True when a trivial query succeeds.
   */
  async healthy(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch (error) {
      log.error("postgres health check failed", { error });
      return false;
    }
  }

  /** Drains the connection pool. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
