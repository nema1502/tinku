/**
 * Vercel entrypoint.
 *
 * The same Hono app that `src/index.ts` serves from a long-lived Node process,
 * exposed as a serverless function. Storage initialises lazily on the first
 * request an instance handles, so there is no boot phase to miss.
 *
 * `getRequestListener` rather than `hono/vercel`'s `handle`: on the Node
 * runtime that adapter hands Hono a raw Node request whose `headers` is a plain
 * object, so `c.req.header()` throws `this.raw.headers.get is not a function`
 * and every request hangs. This converts Node's req/res to a real Fetch
 * Request/Response pair, which is what Hono and the x402 middleware expect.
 */
import { getRequestListener } from "@hono/node-server";
import { createApp } from "../src/http/app.js";
import { createDrawRepository } from "../src/store/index.js";

// Module scope, so warm invocations reuse the connection pool.
const app = createApp(createDrawRepository());

export default getRequestListener(app.fetch);
