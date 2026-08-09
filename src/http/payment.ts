/**
 * x402 payment configuration.
 *
 * Every route points at the same `payTo` address on purpose: the facilitator
 * groups routes that share a receiving address under one merchant, which is
 * what turns several endpoints into a single Composite entry on the challenge
 * leaderboard instead of several competing rows.
 */
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { HTTPFacilitatorClient, type RoutesConfig } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { declareDiscoveryExtension, withBazaar } from "@x402/extensions/bazaar";
import type { MiddlewareHandler } from "hono";

import { CHALLENGE_TAG, FACILITATOR_URL, NETWORK, PAY_TO, PRICES, USDC_ASA_ID } from "../config.js";

/**
 * Payment terms shared by every paid route.
 *
 * @param price - Price string, e.g. "$0.01".
 * @returns A payment option for the Algorand exact scheme.
 */
function accepts(price: string) {
  return {
    scheme: "exact",
    network: NETWORK,
    payTo: PAY_TO,
    price,
    // The challenge tag lives in `extra` so the facilitator attributes our
    // settlements to the competition.
    extra: { asset: USDC_ASA_ID, tag: CHALLENGE_TAG },
  } as const;
}

export const routes: RoutesConfig = {
  "POST /v1/draws": {
    accepts: accepts(PRICES.draw),
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
          verifyUrl: "https://tinku.app/v1/draws/6f2b1c4e/verify",
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
