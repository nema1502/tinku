/**
 * x402 payment configuration.
 *
 * Every route points at the same `payTo` address on purpose: the facilitator
 * groups routes that share a receiving address under one merchant, which is
 * what turns several endpoints into a single Composite entry on the challenge
 * leaderboard instead of several competing rows.
 */
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { HTTPFacilitatorClient, type RouteConfig, type RoutesConfig } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { declareDiscoveryExtension, withBazaar } from "@x402/extensions/bazaar";
import type { MiddlewareHandler } from "hono";

import {
  CHALLENGE_TAG,
  FACILITATOR_URL,
  NETWORK,
  PAY_TO,
  PUBLIC_BASE_URL,
  USDC_ASA_ID,
  priceForEntries,
} from "../config.js";

/** One payment option, as the route config expects it. */
type PaymentOption = Exclude<RouteConfig["accepts"], readonly unknown[]>;

/**
 * Prices a draw from the `entries` query parameter.
 *
 * The count is declared up front because the price is quoted before the body is
 * read: the client states how many entries it is paying for, and the handler
 * refuses to seal more than that. Paying for more than you use is allowed;
 * paying for fewer is not.
 *
 * @param context - The x402 request context.
 * @returns The price string for this request.
 */
const drawPrice: PaymentOption["price"] = context => {
  const raw = context.adapter.getQueryParam?.("entries");
  const declared = Number(Array.isArray(raw) ? raw[0] : raw);
  return priceForEntries(Number.isFinite(declared) && declared > 0 ? Math.floor(declared) : 1);
};

/**
 * Payment terms shared by every paid route.
 *
 * @param price - A fixed price string, or a function of the request.
 * @returns A payment option for the Algorand exact scheme.
 */
function accepts(price: PaymentOption["price"]): PaymentOption {
  return {
    scheme: "exact",
    network: NETWORK,
    payTo: PAY_TO,
    price,
    // The challenge tag lives in `extra` so the facilitator attributes our
    // settlements to the competition.
    extra: { asset: USDC_ASA_ID, tag: CHALLENGE_TAG },
  };
}

export const routes: RoutesConfig = {
  "POST /v1/draws": {
    accepts: accepts(drawPrice),
    /**
     * Declared rather than derived.
     *
     * Behind a TLS-terminating proxy the Node request arrives as plain http, so
     * the middleware would catalogue this endpoint in the Bazaar as
     * `http://…` — which is both wrong and a competition requirement violated,
     * since entries must be reachable over HTTPS.
     */
    resource: `${PUBLIC_BASE_URL}/v1/draws`,
    description:
      "Run a provably fair draw: seals the entry list against a future Algorand randomness beacon round, returns the winners, and writes a permanent on-chain record anyone can recheck.",
    serviceName: "Tinku",
    tags: [CHALLENGE_TAG, "randomness", "fair-selection", "verifiable", "raffle"],
    extensions: declareDiscoveryExtension({
      bodyType: "json",
      input: {
        participants: ["ana@example.com", "beto@example.com", "carla@example.com"],
        winners: 1,
        label: "GDG Santa Cruz — workshop seats",
      },
      inputSchema: {
        type: "object",
        properties: {
          participants: {
            type: "array",
            items: { type: "string" },
            description:
              "Entries in submission order. Repeating an entry gives it proportionally more chances.",
          },
          winners: { type: "integer", minimum: 1, description: "How many entries to select." },
          label: { type: "string", description: "Human-readable name for the draw." },
        },
        required: ["participants", "winners"],
      },
      output: {
        example: {
          id: "6f2b1c4e-6c1d-4f0a-9a4b-1d2e3f4a5b6c",
          status: "sealed",
          commit: "2e2a288b5c7ce1e7098996c1cc6e38d655f0d6b996464f374028a364c7fae2be",
          targetRound: 66126840,
          resultUrl: `${PUBLIC_BASE_URL}/v1/draws/6f2b1c4e-6c1d-4f0a-9a4b-1d2e3f4a5b6c`,
          verifyUrl: `${PUBLIC_BASE_URL}/v1/draws/6f2b1c4e-6c1d-4f0a-9a4b-1d2e3f4a5b6c/verify`,
        },
      },
    }),
  },
};

/**
 * Builds the x402 middleware backed by the GoPlausible facilitator.
 *
 * @returns A Hono middleware that enforces payment on the configured routes.
 */
export function createPaymentMiddleware(): MiddlewareHandler {
  const facilitator = withBazaar(new HTTPFacilitatorClient({ url: FACILITATOR_URL }));
  return paymentMiddlewareFromConfig(routes, facilitator, [
    { network: NETWORK, server: new ExactAvmScheme() },
  ]);
}
