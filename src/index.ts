/**
 * Process entrypoint.
 *
 * Configuration is validated at import time and throws on anything wrong, so
 * the whole bootstrap is loaded dynamically — that way a misconfiguration
 * prints one clear message instead of an unhandled module-evaluation stack.
 */
import { serve } from "@hono/node-server";

/** Boots the service and wires up graceful shutdown. */
async function main(): Promise<void> {
  const config = await import("./config.js");
  const { log } = await import("./logger.js");
  const { createApp } = await import("./http/app.js");
  const { createDrawRepository } = await import("./store/index.js");

  const repository = createDrawRepository();
  await repository.init();

  const app = createApp(repository);
  const server = serve({ fetch: app.fetch, port: config.PORT });

  log.info("tinku started", {
    port: config.PORT,
    network: config.NETWORK_NAME,
    usdcAsaId: config.USDC_ASA_ID,
    beaconAppId: config.BEACON_APP_ID,
    facilitator: config.FACILITATOR_URL,
    payTo: config.PAY_TO,
    anchoring: config.ANCHOR_ENABLED,
    publicBaseUrl: config.PUBLIC_BASE_URL,
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });

    server.close(async () => {
      try {
        await repository.close();
      } catch (error) {
        log.error("error closing storage", { error });
      }
      process.exit(0);
    });

    // Do not let a stuck connection hold the container hostage.
    setTimeout(() => {
      log.warn("forcing shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", reason => {
    log.error("unhandled rejection", { error: reason });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\nTinku failed to start.\n\n${message}\n\n`);
  process.exit(1);
});
