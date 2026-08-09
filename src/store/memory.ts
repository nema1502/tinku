/**
 * In-memory storage for local development and tests.
 *
 * Records are lost on restart, which is why the configuration refuses to boot
 * in production without a DATABASE_URL.
 */
import type { DrawRecord } from "../domain/draw.js";
import type { DrawRepository } from "./types.js";

export class MemoryDrawRepository implements DrawRepository {
  private readonly draws = new Map<string, DrawRecord>();

  /** No preparation needed. */
  async init(): Promise<void> {}

  /**
   * Stores a record.
   *
   * @param record - The record to store.
   */
  async save(record: DrawRecord): Promise<void> {
    this.draws.set(record.id, record);
  }

  /**
   * Loads a record.
   *
   * @param id - Draw identifier.
   * @returns The record, or null when unknown.
   */
  async get(id: string): Promise<DrawRecord | null> {
    return this.draws.get(id) ?? null;
  }

  /**
   * Always reachable.
   *
   * @returns True.
   */
  async healthy(): Promise<boolean> {
    return true;
  }

  /** Nothing to release. */
  async close(): Promise<void> {}
}
