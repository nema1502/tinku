/**
 * Configuration, validated once at startup.
 *
 * A misconfigured payment endpoint fails in the worst possible way: it looks
 * healthy, serves traffic, and quietly settles nothing. So everything is
 * checked here and the process refuses to start rather than limp.
 */
import { isValidAddress, mnemonicToSecretKey } from "algosdk";
import {
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
} from "@x402/avm";

export type NetworkName = "testnet" | "mainnet";

class ConfigError extends Error {}

const problems: string[] = [];

/**
 * Reads an environment variable, recording a problem when it is required and absent.
 *
 * @param name - Variable name.
 * @param fallback - Value to use when unset. Omit to make the variable required.
 * @returns The resolved value, or an empty string when a required value is missing.
 */
function env(name: string, fallback?: string): string {
  const raw = process.env[name]?.trim();
  if (raw) return raw;
  if (fallback === undefined) {
    problems.push(`${name} is required`);
    return "";
  }
  return fallback;
}

/**
 * Reads an environment variable as a positive integer.
 *
 * @param name - Variable name.
 * @param fallback - Default value when unset.
 * @returns The parsed integer.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${name} must be a positive integer, got "${raw}"`);
    return fallback;
  }
  return parsed;
}

/**
 * Reads a boolean-ish environment variable.
 *
 * @param name - Variable name.
 * @param fallback - Default value when unset.
 * @returns True when the value is one of 1/true/yes/on.
 */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

export const NODE_ENV = env("NODE_ENV", "development");
export const IS_PRODUCTION = NODE_ENV === "production";

const rawNetwork = env("ALGORAND_NETWORK", "testnet");
if (rawNetwork !== "testnet" && rawNetwork !== "mainnet") {
  problems.push(`ALGORAND_NETWORK must be "testnet" or "mainnet", got "${rawNetwork}"`);
}
export const NETWORK_NAME: NetworkName = rawNetwork === "mainnet" ? "mainnet" : "testnet";
const IS_MAINNET = NETWORK_NAME === "mainnet";

/**
 * CAIP-2 identifier the x402 middleware negotiates payments on.
 *
 * Note the full genesis hash rather than the SDK's truncated `ALGORAND_*_CAIP2`
 * constants. The GoPlausible facilitator advertises its Algorand support under
 * the full-hash form, and the resource server matches the advertised string
 * literally — using the truncated constant makes startup fail with
 * "Facilitator does not support scheme exact on network ...".
 *
 * Verify with: curl https://facilitator.goplausible.xyz/supported
 */
const rawX402Network = env(
  "X402_NETWORK",
  `algorand:${IS_MAINNET ? ALGORAND_MAINNET_GENESIS_HASH : ALGORAND_TESTNET_GENESIS_HASH}`,
);
if (!rawX402Network.includes(":")) {
  problems.push('X402_NETWORK must be a CAIP-2 identifier of the form "namespace:reference"');
}
export const NETWORK = rawX402Network as `${string}:${string}`;

/** USDC asset id: 31566704 on MainNet, 10458941 on TestNet. */
export const USDC_ASA_ID = IS_MAINNET ? USDC_MAINNET_ASA_ID : USDC_TESTNET_ASA_ID;

export const ALGOD_URL = env(
  "ALGOD_URL",
  IS_MAINNET ? "https://mainnet-api.algonode.cloud" : "https://testnet-api.algonode.cloud",
);
export const ALGOD_TOKEN = env("ALGOD_TOKEN", "");

export const INDEXER_URL = env(
  "INDEXER_URL",
  IS_MAINNET ? "https://mainnet-idx.algonode.cloud" : "https://testnet-idx.algonode.cloud",
);

/**
 * Algorand randomness beacon.
 *
 * These are the Algorand Foundation deployments. The beacon publishes a VRF
 * output for every round that is a multiple of 8.
 */
export const BEACON_APP_ID = envInt("BEACON_APP_ID", IS_MAINNET ? 1615566206 : 600011887);

/**
 * Sender used for read-only `simulate` calls against the beacon.
 *
 * Nothing is ever submitted, but simulate still applies balance and fee checks,
 * so this has to be an account that exists on chain. It defaults to the beacon
 * deployer, which is funded on both networks by definition.
 */
export const BEACON_READER_ADDRESS = env(
  "BEACON_READER_ADDRESS",
  IS_MAINNET
    ? "BO65GIBYYYUPK4KTQ32IRO5BE2H3VEFTK65GKI2GNHZYPNUMJKGJOFJWSY"
    : "PEW65C77CTTOHDBM2M4LUYXSG6HWJNPOAGPSD5C33IVWILS46PI6SVN4BM",
);

/** GoPlausible facilitator — required by the challenge, same URL on both networks. */
export const FACILITATOR_URL = env("FACILITATOR_URL", "https://facilitator.goplausible.xyz");

/**
 * Receiving address for every paid route.
 *
 * The leaderboard keys a Composite entry off this address, so all routes must
 * share it and it must not change for the duration of the competition.
 */
export const PAY_TO = env("PAY_TO");
if (PAY_TO && !isValidAddress(PAY_TO)) {
  problems.push("PAY_TO is not a valid Algorand address");
}

/**
 * Account that writes anchor transactions.
 *
 * The beacon only retains a value for ~1512 rounds. Anchoring the revealed
 * proof in a transaction note turns a result that expires into a permanent,
 * timestamped record any indexer can serve years later.
 */
export const ANCHOR_ENABLED = envBool("ANCHOR_ENABLED", true);
const anchorMnemonic = process.env.ANCHOR_MNEMONIC?.trim() ?? "";
export const ANCHOR_ACCOUNT = (() => {
  if (!ANCHOR_ENABLED) return null;
  if (!anchorMnemonic) {
    problems.push("ANCHOR_MNEMONIC is required when ANCHOR_ENABLED is true");
    return null;
  }
  try {
    return mnemonicToSecretKey(anchorMnemonic);
  } catch {
    problems.push("ANCHOR_MNEMONIC is not a valid 25-word Algorand mnemonic");
    return null;
  }
})();

export const DATABASE_URL = env("DATABASE_URL", "");
export const DATABASE_SSL = envBool("DATABASE_SSL", IS_MAINNET);
if (IS_PRODUCTION && !DATABASE_URL) {
  problems.push("DATABASE_URL is required in production — in-memory storage loses proofs");
}

export const PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", "http://localhost:8402").replace(/\/+$/, "");
export const PORT = envInt("PORT", 8402);
export const LOG_LEVEL = env("LOG_LEVEL", IS_PRODUCTION ? "info" : "debug");

/** Required by the challenge so the facilitator attributes our activity. */
export const CHALLENGE_TAG = "x402-global-challenge";

/**
 * Minimum number of rounds between sealing a draw and the round that decides it.
 *
 * This is the security parameter of the whole product: the target round must be
 * far enough ahead that its VRF output cannot be known while entries are still
 * being fixed. It is then rounded up to the next multiple of 8, because those
 * are the only rounds the beacon publishes.
 */
export const COMMIT_LEAD_ROUNDS = envInt("COMMIT_LEAD_ROUNDS", 16);

/**
 * Rounds to wait past the target round before querying the beacon.
 *
 * The beacon oracle submits its VRF proof in a transaction shortly *after* the
 * round it covers, so asking at exactly the target round reliably fails with
 * "did not log a return value". Waiting a couple of rounds turns a guaranteed
 * first-attempt error into a clean read.
 */
export const BEACON_SETTLE_ROUNDS = envInt("BEACON_SETTLE_ROUNDS", 3);

/** Upper bound on entries per draw, to keep request handling predictable. */
export const MAX_PARTICIPANTS = envInt("MAX_PARTICIPANTS", 10_000);

/**
 * Pricing.
 *
 * A draw costs a small base plus a per-entry amount, because sealing 500
 * entries genuinely is more work than sealing five — and because a flat fee
 * would price a community raffle the same as a national promotion.
 *
 * For reference, the incumbents charge a monthly subscription: Gleam from
 * $19/mo, Easypromos from $49/mo, SweepWidget from $25/mo. A 300-entry draw
 * here costs about $0.61, with nothing to cancel afterwards.
 */
export const PRICE_DRAW_BASE = Number(env("PRICE_DRAW_BASE", "0.01"));
export const PRICE_PER_ENTRY = Number(env("PRICE_PER_ENTRY", "0.002"));
if (!Number.isFinite(PRICE_DRAW_BASE) || PRICE_DRAW_BASE < 0) {
  problems.push("PRICE_DRAW_BASE must be a non-negative number");
}
if (!Number.isFinite(PRICE_PER_ENTRY) || PRICE_PER_ENTRY < 0) {
  problems.push("PRICE_PER_ENTRY must be a non-negative number");
}

/**
 * Computes what a draw of a given size costs.
 *
 * @param entries - Number of entries the caller declared.
 * @returns A price string such as "$0.61".
 */
export function priceForEntries(entries: number): string {
  const clamped = Math.min(Math.max(entries, 1), MAX_PARTICIPANTS);
  const total = PRICE_DRAW_BASE + PRICE_PER_ENTRY * clamped;
  return `$${total.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

if (problems.length > 0) {
  throw new ConfigError(
    `Invalid configuration:\n${problems.map(p => `  - ${p}`).join("\n")}\n` +
      `See .env.example for the full list of settings.`,
  );
}
