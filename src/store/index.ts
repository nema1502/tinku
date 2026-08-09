/**
 * Storage selection.
 *
 * Postgres whenever a DATABASE_URL is present, in-memory otherwise. Production
 * cannot reach the in-memory branch because the configuration refuses to boot
 * without a database.
 */
import { DATABASE_URL } from "../config.js";
import { log } from "../logger.js";
import { MemoryDrawRepository } from "./memory.js";
import { PostgresDrawRepository } from "./postgres.js";
import type { DrawRepository } from "./types.js";

export type { DrawRepository } from "./types.js";

/**
 * Builds the repository this process should use.
 *
 * @returns An uninitialised repository — call `init()` before serving traffic.
 */
export function createDrawRepository(): DrawRepository {
  if (DATABASE_URL) {
    log.info("using postgres storage");
    return new PostgresDrawRepository();
  }
  log.warn("using in-memory storage — draws are lost on restart");
  return new MemoryDrawRepository();
}
