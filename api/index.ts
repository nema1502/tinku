/**
 * Vercel entrypoint.
 *
 * The same Hono app that `src/index.ts` serves from a long-lived Node process,
 * exposed as a serverless function. Storage initialises lazily on the first
 * request an instance handles, so there is no boot phase to miss.
 */
import { handle } from "hono/vercel";
import { createApp } from "../src/http/app.js";
import { createDrawRepository } from "../src/store/index.js";

// Module scope, so warm invocations reuse the connection pool.
const app = createApp(createDrawRepository());

export default handle(app);
