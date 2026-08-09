/**
 * Structured logging.
 *
 * One JSON object per line, which is what CloudWatch, Loki and friends expect.
 * No dependency needed for something this small.
 */
import { LOG_LEVEL } from "./config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Level = keyof typeof LEVELS;

const threshold = LEVELS[(LOG_LEVEL as Level) in LEVELS ? (LOG_LEVEL as Level) : "info"];

/**
 * Emits a structured log line.
 *
 * @param level - Severity.
 * @param message - Short, stable description of the event.
 * @param fields - Additional structured context.
 */
function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold) return;

  const line: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  };

  if (fields.error instanceof Error) {
    line.error = { name: fields.error.name, message: fields.error.message, stack: fields.error.stack };
  }

  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(`${serialized}\n`);
  else process.stdout.write(`${serialized}\n`);
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
