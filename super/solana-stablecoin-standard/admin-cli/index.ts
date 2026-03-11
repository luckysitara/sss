import { Command } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SssSdk } from "../sdk";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

program
  .name("sss-admin")
  .description("CLI for Solana Stablecoin Standard administration")
  .version("1.0.0");

// Helper to load keypair
function loadKeypair(keypairPath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// Global options
program.option("-k, --keypair <path>", "Path to authority keypair", "~/.config/solana/id.json");
program.option("-u, --url <url>", "Solana RPC URL", "http://localhost:8899");

const SSS1_ID = new PublicKey("8jBjnag7xWAnJkG5hFnjH7qZtwFp5ua57TjzwpHhhHpL");
const SSS2_ID = new PublicKey("3gam4baZf4JJFAZBQY7UEekJ7YgSL9GNDWYQrz1Qxe1T");
const SSS3_ID = new PublicKey("CJCdamLHnTNb9GJvDVEYieWxpAJB6FoWhSBXZ3s82dMM");
const SSS4_ID = new PublicKey("4JYKkuPyTGaRZeMuPR9HryYMiS8Bz2ozyaQz8jMWayd2");
const HOOK_ID = new PublicKey("DJoWeytpBHbeXZHnLeT56YMTr71S9MEyiT2gZqf1YTv8");

async function getSdk(options: any) {
  const connection = new Connection(options.url, "confirmed");
  const payer = loadKeypair(options.keypair.replace("~", process.env.HOME!));
  return new SssSdk(connection, payer, SSS1_ID, SSS2_ID, SSS3_ID, SSS4_ID, HOOK_ID);
}

// --- SSS-1 Commands ---
program
  .command("init-sss1")
  .requiredOption("-d, --decimals <number>", "Decimals")
  .requiredOption("-n, --name <string>", "Name")
  .requiredOption("-s, --symbol <string>", "Symbol")
  .requiredOption("-uri, --uri <string>", "Metadata URI")
  .option("-f, --fee <number>", "Transfer fee bps", "0")
  .option("-m, --max-fee <number>", "Max fee", "0")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const res = await sdk.initializeSss1(
        parseInt(options.decimals),
        options.name,
        options.symbol,
        options.uri,
        parseInt(options.fee),
        parseInt(options.maxFee)
    );
    console.log(`SSS-1 Initialized!\nMint: ${res.mint.toBase58()}\nStablecoin PDA: ${res.stablecoinPda.toBase58()}\nTx: ${res.tx}`);
  });

program
  .command("mint-sss1")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-dest, --destination <string>", "Destination Token Account")
  .requiredOption("-a, --amount <number>", "Amount")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.mintSss1(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.destination),
        parseInt(options.amount)
    );
    console.log(`SSS-1 Minted! Tx: ${tx}`);
  });

program
  .command("burn-sss1")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-s, --source <string>", "Source Token Account")
  .requiredOption("-a, --amount <number>", "Amount")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.burnSss1(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.source),
        parseInt(options.amount)
    );
    console.log(`SSS-1 Burned! Tx: ${tx}`);
  });

program
  .command("pause-sss1")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.pauseSss1(new PublicKey(options.pda));
    console.log(`SSS-1 Paused! Tx: ${tx}`);
  });

program
  .command("unpause-sss1")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.unpauseSss1(new PublicKey(options.pda));
    console.log(`SSS-1 Unpaused! Tx: ${tx}`);
  });

program
  .command("set-fee-config-sss1")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-f, --fee <number>", "Fee bps")
  .requiredOption("-max, --max-fee <number>", "Max fee")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.setSss1TransferFeeConfig(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        parseInt(options.fee),
        parseInt(options.maxFee)
    );
    console.log(`SSS-1 Fee Config Updated! Tx: ${tx}`);
  });

program
  .command("set-fee-auth-sss1")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .option("-fa, --fee-auth <string>", "New Fee Authority", "")
  .option("-wa, --withheld-auth <string>", "New Withdraw Withheld Authority", "")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const feeAuth = options.feeAuth ? new PublicKey(options.feeAuth) : null;
    const withheldAuth = options.withheldAuth ? new PublicKey(options.withheldAuth) : null;
    const tx = await sdk.setSss1TransferFeeAuthority(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        feeAuth,
        withheldAuth
    );
    console.log(`SSS-1 Fee Authority Updated! Tx: ${tx}`);
  });

// --- SSS-2 Commands ---
program
  .command("init-sss2")
  .requiredOption("-d, --decimals <number>", "Decimals")
  .requiredOption("-n, --name <string>", "Name")
  .requiredOption("-s, --symbol <string>", "Symbol")
  .requiredOption("-uri, --uri <string>", "Metadata URI")
  .requiredOption("-c, --collateral <string>", "Collateral Mint")
  .option("-f, --fee <number>", "Transfer fee bps", "0")
  .option("-m, --max-fee <number>", "Max fee", "0")
  .option("-i, --interest <number>", "Interest rate bps", "0")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const res = await sdk.initializeSss2(
        parseInt(options.decimals),
        options.name,
        options.symbol,
        options.uri,
        new PublicKey(options.collateral),
        parseInt(options.fee),
        parseInt(options.maxFee),
        parseInt(options.interest)
    );
    console.log(`SSS-2 Initialized!\nMint: ${res.mint.toBase58()}\nStablecoin PDA: ${res.stablecoinPda.toBase58()}\nCollateral Vault: ${res.collateralVault.toBase58()}\nTx: ${res.tx}`);
  });

program
  .command("sync-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.syncSss2(new PublicKey(options.pda));
    console.log(`SSS-2 Synced! Tx: ${tx}`);
  });

program
  .command("deposit-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-c, --collateral <string>", "Collateral Mint")
  .requiredOption("-a, --amount <number>", "Amount")
  .option("-min, --min-shares <number>", "Minimum shares out", "0")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.depositSss2(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.collateral),
        parseInt(options.amount),
        parseInt(options.minShares)
    );
    console.log(`SSS-2 Deposited! Tx: ${tx}`);
  });

program
  .command("redeem-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-c, --collateral <string>", "Collateral Mint")
  .requiredOption("-s, --shares <number>", "Shares")
  .option("-min, --min-assets <number>", "Minimum assets out", "0")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.redeemSss2(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.collateral),
        parseInt(options.shares),
        parseInt(options.minAssets)
    );
    console.log(`SSS-2 Redeemed! Tx: ${tx}`);
  });

program
  .command("pause-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.pauseSss2(new PublicKey(options.pda));
    console.log(`SSS-2 Paused! Tx: ${tx}`);
  });

program
  .command("unpause-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.unpauseSss2(new PublicKey(options.pda));
    console.log(`SSS-2 Unpaused! Tx: ${tx}`);
  });

program
  .command("set-interest-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-i, --interest <number>", "New Interest rate bps")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.setSss2InterestRate(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        parseInt(options.interest)
    );
    console.log(`SSS-2 Interest rate updated! Tx: ${tx}`);
  });

program
  .command("set-fee-config-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-f, --fee <number>", "Fee bps")
  .requiredOption("-max, --max-fee <number>", "Max fee")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.setSss2TransferFeeConfig(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        parseInt(options.fee),
        parseInt(options.maxFee)
    );
    console.log(`SSS-2 Fee Config Updated! Tx: ${tx}`);
  });

program
  .command("set-fee-auth-sss2")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .option("-fa, --fee-auth <string>", "New Fee Authority", "")
  .option("-wa, --withheld-auth <string>", "New Withdraw Withheld Authority", "")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const feeAuth = options.feeAuth ? new PublicKey(options.feeAuth) : null;
    const withheldAuth = options.withheldAuth ? new PublicKey(options.withheldAuth) : null;
    const tx = await sdk.setSss2TransferFeeAuthority(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        feeAuth,
        withheldAuth
    );
    console.log(`SSS-2 Fee Authority Updated! Tx: ${tx}`);
  });

// --- SSS-3 Commands ---
program
  .command("init-sss3")
  .requiredOption("-d, --decimals <number>", "Decimals")
  .requiredOption("-n, --name <string>", "Name")
  .requiredOption("-s, --symbol <string>", "Symbol")
  .requiredOption("-uri, --uri <string>", "Metadata URI")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const res = await sdk.initializeSss3(
        parseInt(options.decimals),
        options.name,
        options.symbol,
        options.uri
    );
    console.log(`SSS-3 Initialized!\nMint: ${res.mint.toBase58()}\nStablecoin PDA: ${res.stablecoinPda.toBase58()}\nTx: ${res.tx}`);
  });

program
  .command("mint-conf-sss3")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-dest, --destination <string>", "Destination Token Account")
  .requiredOption("-a, --amount <number>", "Amount")
  .requiredOption("-sp, --source-pubkey <string>", "Source Pubkey")
  .requiredOption("-dp, --dest-pubkey <string>", "Destination Pubkey")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const proofCtx = await sdk.getTransferProof(
        new PublicKey(options.sourcePubkey),
        new PublicKey(options.destPubkey),
        parseInt(options.amount),
        "" // default dummy key
    );
    // As a mock for tests/cli - proofContext usually needs to be initialized. 
    // We assume for testing we pass PublicKey.default if real zk is not configured, or a dummy.
    const mockContext = PublicKey.default;
    const tx = await sdk.mintConfidentialSss3(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.destination),
        parseInt(options.amount),
        mockContext
    );
    console.log(`SSS-3 Confidential Minted! Tx: ${tx}`);
  });

program
  .command("apply-pending-sss3")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-acc, --account <string>", "Token Account")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.applyPendingBalanceSss3(
        new PublicKey(options.pda),
        new PublicKey(options.account)
    );
    console.log(`SSS-3 Pending Balance Applied! Tx: ${tx}`);
  });

program
  .command("transfer-conf-sss3")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-s, --source <string>", "Source Token Account")
  .requiredOption("-dest, --destination <string>", "Destination Token Account")
  .requiredOption("-sp, --source-pubkey <string>", "Source Pubkey")
  .requiredOption("-dp, --dest-pubkey <string>", "Destination Pubkey")
  .requiredOption("-a, --amount <number>", "Amount")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    // In a real env, derive the actual proof context.
    const mockContext = PublicKey.default;
    const tx = await sdk.transferConfidentialSss3(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.source),
        new PublicKey(options.destination),
        mockContext
    );
    console.log(`SSS-3 Confidential Transferred! Tx: ${tx}`);
  });

program
  .command("pause-sss3")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.pauseSss3(new PublicKey(options.pda));
    console.log(`SSS-3 Paused! Tx: ${tx}`);
  });

program
  .command("unpause-sss3")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.unpauseSss3(new PublicKey(options.pda));
    console.log(`SSS-3 Unpaused! Tx: ${tx}`);
  });

program
  .command("set-hook-sss3")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-hook, --hook <string>", "Hook Program ID")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.setSss3TransferHook(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.hook)
    );
    console.log(`SSS-3 Hook updated! Tx: ${tx}`);
  });

// --- Transfer Hook Commands ---
program
  .command("init-hook")
  .action(async () => {
    const sdk = await getSdk(program.opts());
    const res = await sdk.initializeBlacklist();
    console.log(`Transfer Hook Initialized!\nBlacklist PDA: ${res.blacklistPda.toBase58()}\nTx: ${res.tx}`);
  });

program
  .command("blacklist-add")
  .requiredOption("-b, --blacklist <string>", "Blacklist PDA")
  .requiredOption("-a, --address <string>", "Address to blacklist")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.addToBlacklist(new PublicKey(options.blacklist), new PublicKey(options.address));
    console.log(`Address blacklisted! Tx: ${tx}`);
  });

// --- SSS-4 Commands ---
program
  .command("init-sss4")
  .requiredOption("-d, --decimals <number>", "Decimals")
  .requiredOption("-n, --name <string>", "Name")
  .requiredOption("-s, --symbol <string>", "Symbol")
  .requiredOption("-uri, --uri <string>", "Metadata URI")
  .requiredOption("-c, --collateral <string>", "Collateral Mint")
  .requiredOption("-hook, --hook <string>", "Transfer Hook Program")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const res = await sdk.initializeSss4(
        parseInt(options.decimals),
        options.name,
        options.symbol,
        options.uri,
        new PublicKey(options.collateral),
        new PublicKey(options.hook)
    );
    console.log(`SSS-4 Initialized!\nMint: ${res.mint.toBase58()}\nStablecoin PDA: ${res.stablecoinPda.toBase58()}\nCollateral Vault: ${res.collateralVault.toBase58()}\nTx: ${res.tx}`);
  });

program
  .command("sync-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-cv, --vault <string>", "Collateral Vault")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.syncSss4(new PublicKey(options.pda), new PublicKey(options.vault));
    console.log(`SSS-4 Synced! Tx: ${tx}`);
  });

program
  .command("mint-conf-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-dest, --destination <string>", "Destination Token Account")
  .requiredOption("-a, --amount <number>", "Amount")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const mockContext = PublicKey.default;
    const tx = await sdk.mintConfidentialSss4(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.destination),
        parseInt(options.amount),
        mockContext
    );
    console.log(`SSS-4 Confidential Minted! Tx: ${tx}`);
  });

program
  .command("apply-pending-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-acc, --account <string>", "Token Account")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.applyPendingBalanceSss4(
        new PublicKey(options.pda),
        new PublicKey(options.account)
    );
    console.log(`SSS-4 Pending Balance Applied! Tx: ${tx}`);
  });

program
  .command("transfer-conf-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-s, --source <string>", "Source Token Account")
  .requiredOption("-dest, --destination <string>", "Destination Token Account")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const mockContext = PublicKey.default;
    const tx = await sdk.transferConfidentialSss4(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.source),
        new PublicKey(options.destination),
        mockContext
    );
    console.log(`SSS-4 Confidential Transferred! Tx: ${tx}`);
  });

program
  .command("pause-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.pauseSss4(new PublicKey(options.pda));
    console.log(`SSS-4 Paused! Tx: ${tx}`);
  });

program
  .command("unpause-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.unpauseSss4(new PublicKey(options.pda));
    console.log(`SSS-4 Unpaused! Tx: ${tx}`);
  });

program
  .command("set-hook-sss4")
  .requiredOption("-p, --pda <string>", "Stablecoin PDA")
  .requiredOption("-m, --mint <string>", "Mint Address")
  .requiredOption("-hook, --hook <string>", "Hook Program ID")
  .action(async (options) => {
    const sdk = await getSdk(program.opts());
    const tx = await sdk.setSss4TransferHook(
        new PublicKey(options.pda),
        new PublicKey(options.mint),
        new PublicKey(options.hook)
    );
    console.log(`SSS-4 Hook updated! Tx: ${tx}`);
  });

program.parse(process.argv);
