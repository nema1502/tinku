/**
 * Opts the receiving account into USDC.
 *
 * On Algorand an account cannot hold an asset it has not opted into, and a
 * transfer to an account that has not opted in simply fails. So this has to run
 * once per network before the endpoint can be paid — including on MainNet,
 * where forgetting it means the competition's required first payment bounces.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/optin-usdc.ts
 */
import {
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  waitForConfirmation,
} from "algosdk";
import { algod } from "../algorand/client.js";
import { ANCHOR_ACCOUNT, NETWORK_NAME, PAY_TO, USDC_ASA_ID } from "../config.js";

if (!ANCHOR_ACCOUNT) {
  throw new Error("ANCHOR_MNEMONIC must be set (with ANCHOR_ENABLED=true) to sign the opt-in");
}

const address = ANCHOR_ACCOUNT.addr.toString();
if (address !== PAY_TO) {
  throw new Error(
    `ANCHOR_MNEMONIC controls ${address} but PAY_TO is ${PAY_TO} — ` +
      `the account that receives payments is the one that must opt in`,
  );
}

const assetId = Number(USDC_ASA_ID);
console.log(`network  ${NETWORK_NAME}`);
console.log(`account  ${address}`);
console.log(`asset    ${assetId} (USDC)`);

const info = await algod.accountInformation(address).do();
if (info.assets?.some(a => Number(a.assetId) === assetId)) {
  console.log("\nalready opted in — nothing to do");
  process.exit(0);
}

console.log(`\nbalance  ${Number(info.amount) / 1e6} ALGO`);

// An opt-in is just a zero-amount transfer of the asset to yourself.
const suggestedParams = await algod.getTransactionParams().do();
const txn = makeAssetTransferTxnWithSuggestedParamsFromObject({
  sender: address,
  receiver: address,
  amount: 0,
  assetIndex: assetId,
  suggestedParams,
});

const { txid } = await algod.sendRawTransaction(txn.signTxn(ANCHOR_ACCOUNT.sk)).do();
console.log(`\nsubmitted ${txid}`);
await waitForConfirmation(algod, txid, 6);

const after = await algod.accountInformation(address).do();
const holding = after.assets?.find(a => Number(a.assetId) === assetId);
console.log(`confirmed — USDC balance ${Number(holding?.amount ?? 0) / 1e6}`);
console.log("\nthis account can now receive USDC");
