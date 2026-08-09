/**
 * Storage contract.
 *
 * Verification links must keep resolving forever, so storage is a first-class
 * concern rather than an implementation detail. The interface is deliberately
 * small: draws are written once, revealed once, and read many times.
 */
import type { DrawRecord } from "../domain/draw.js";

export interface DrawRepository {
  /** Prepares the backing store (connections, schema). Called once at startup. */
  init(): Promise<void>;
  /** Inserts or replaces a record. */
  save(record: DrawRecord): Promise<void>;
  /** Loads a record, or null when unknown. */
  get(id: string): Promise<DrawRecord | null>;
  /** Reports whether the store is reachable, for readiness checks. */
  healthy(): Promise<boolean>;
  /** Releases resources on shutdown. */
  close(): Promise<void>;
}
