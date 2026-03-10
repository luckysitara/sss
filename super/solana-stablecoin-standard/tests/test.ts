import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createInitializeMintInstruction,
    MINT_SIZE,
} from "@solana/spl-token";
import {
    TOKEN_2022_PROGRAM_ID,
    getMintLen,
    ExtensionType,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction as createATA2022,
    createInitializeMintInstruction as createInitializeMintInstruction2022,
    getAccount,
    getMint,
    transferChecked,
    mintToChecked,
    burnChecked,
} from "@solana/spl-token";
import {
    createInitializeMetadataPointerInstruction,
    createInitializePermanentDelegateInstruction,
    createInitializeTransferHookInstruction,
    TOKEN_METADATA_PROGRAM_ID,
} from "@solana/spl-token-metadata";
import { SssSdk } from "../sdk/index";
import { Sss1 } from "../target/types/sss_1";
import { Sss2 } from "../target/types/sss_2";
import { SssTransferHook } from "../target/types/sss_transfer_hook";
import { assert } from "chai";

describe("solana-stablecoin-standard", () => {
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");
    const payer = Keypair.generate();
    const mintAuthority = Keypair.generate();

    let sss1Program: Program<Sss1>;
    let sss2Program: Program<Sss2>;
    let transferHookProgram: Program<SssTransferHook>;
    let sdk: SssSdk;

    let sss1StablecoinPda: PublicKey;
    let sss1Mint: PublicKey;

    let sss2StablecoinPda: PublicKey;
    let sss2Mint: PublicKey;
    let sss2CollateralMint: PublicKey;
    let sss2CollateralVault: PublicKey;

    let blacklistPda: PublicKey;

    const SSS1_PROGRAM_ID = new PublicKey("8jBjnag7xWAnJkG5hFnjH7qZtwFp5ua57TjzwpHhhHpL");
    const SSS2_PROGRAM_ID = new PublicKey("3gam4baZf4JJFAZBQY7UEekJ7YgSL9GNDWYQrz1Qxe1T");
    const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("DJoWeytpBHbeXZHnLeT56YMTr71S9MEyiT2gZqf1YTv8");

    const decimals = 6;
    const name = "USD Stablecoin";
    const symbol = "USDS";
    const uri = "https://example.com/usds.json";

    before(async () => {
        const airdropSig = await connection.requestAirdrop(payer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropSig);

        const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
            commitment: "confirmed",
        });
        sss1Program = new Program<Sss1>(require("../target/idl/sss_1.json"), SSS1_PROGRAM_ID, provider);
        sss2Program = new Program<Sss2>(require("../target/idl/sss_2.json"), SSS2_PROGRAM_ID, provider);
        transferHookProgram = new Program<SssTransferHook>(require("../target/idl/sss_transfer_hook.json"), TRANSFER_HOOK_PROGRAM_ID, provider);
        sdk = new SssSdk(connection, payer, SSS1_PROGRAM_ID, SSS2_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID);
        
        // Build and deploy programs
        // This would typically be done outside the test, but for local testing, we might do it here.
        // For now, assuming programs are already deployed to the specified IDs.
    });

    it("Initializes the Blacklist program", async () => {
        const { blacklistPda: pda, tx } = await sdk.initializeBlacklist();
        blacklistPda = pda;
        console.log("Blacklist PDA:", blacklistPda.toBase58());
        console.log("Initialize Blacklist Tx:", tx);

        const blacklistAccount = await transferHookProgram.account.blacklist.fetch(blacklistPda);
        assert.isTrue(blacklistAccount.authority.equals(payer.publicKey));
        assert.isEmpty(blacklistAccount.blacklistedAddresses);
    });

    it("Initializes SSS-1 Stablecoin with Token-2022 extensions", async () => {
        const { stablecoinPda, mint, tx } = await sdk.initializeSss1(decimals, name, symbol, uri);
        sss1StablecoinPda = stablecoinPda;
        sss1Mint = mint;
        console.log("SSS-1 Stablecoin PDA:", sss1StablecoinPda.toBase58());
        console.log("SSS-1 Mint:", sss1Mint.toBase58());
        console.log("Initialize SSS-1 Tx:", tx);

        const stablecoinAccount = await sss1Program.account.stablecoin.fetch(sss1StablecoinPda);
        assert.isTrue(stablecoinAccount.authority.equals(payer.publicKey));
        assert.isTrue(stablecoinAccount.mint.equals(sss1Mint));
        assert.equal(stablecoinAccount.decimals, decimals);
        assert.isFalse(stablecoinAccount.paused);

        const mintAccount = await getMint(connection, sss1Mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.isTrue(mintAccount.mintAuthority.equals(sss1StablecoinPda));
        assert.isTrue(mintAccount.freezeAuthority.equals(sss1StablecoinPda));
        assert.equal(mintAccount.decimals, decimals);
    });

    it("Sets the SSS-1 Transfer Hook Program ID", async () => {
        const tx = await sdk.setSss1TransferHook(sss1StablecoinPda, sss1Mint, TRANSFER_HOOK_PROGRAM_ID);
        console.log("Set SSS-1 Transfer Hook Tx:", tx);

        // Verify the transfer hook program ID is set on the mint
        const mintAccount = await getMint(connection, sss1Mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        const transferHookExtension = mintAccount.tlvData.find(
            (data) => data.extension === ExtensionType.TransferHook
        );
        assert.isDefined(transferHookExtension);
        // Additional check to parse and verify the program ID if needed
    });

    it("Mints SSS-1 tokens", async () => {
        const destination = getAssociatedTokenAddressSync(sss1Mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

        // Create ATA if it doesn't exist
        if (!(await connection.getAccountInfo(destination))) {
            const createAtaTx = new anchor.web3.Transaction().add(
                createATA2022(payer.publicKey, payer.publicKey, sss1Mint, TOKEN_2022_PROGRAM_ID)
            );
            await sdk.provider.sendAndConfirm(createAtaTx, [payer]);
        }

        const amount = 100 * (10 ** decimals);
        const tx = await sdk.mintSss1(sss1StablecoinPda, sss1Mint, destination, amount);
        console.log("Mint SSS-1 Tx:", tx);

        const userAta = await getAccount(connection, destination, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.equal(Number(userAta.amount), amount);
    });

    it("Burns SSS-1 tokens", async () => {
        const source = getAssociatedTokenAddressSync(sss1Mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const amount = 50 * (10 ** decimals);
        const initialBalance = (await getAccount(connection, source, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;

        const tx = await sdk.burnSss1(sss1StablecoinPda, sss1Mint, source, amount);
        console.log("Burn SSS-1 Tx:", tx);

        const finalBalance = (await getAccount(connection, source, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
        assert.equal(Number(finalBalance), Number(initialBalance) - amount);
    });

    it("Pauses and unpauses SSS-1", async () => {
        await sdk.pauseSss1(sss1StablecoinPda);
        const pausedAccount = await sss1Program.account.stablecoin.fetch(sss1StablecoinPda);
        assert.isTrue(pausedAccount.paused);

        await sdk.unpauseSss1(sss1StablecoinPda);
        const unpausedAccount = await sss1Program.account.stablecoin.fetch(sss1StablecoinPda);
        assert.isFalse(unpausedAccount.paused);
    });

    it("Initializes SSS-2 Stablecoin with Token-2022 extensions and collateral", async () => {
        // Create a collateral mint for SSS-2 (e.g., USDC)
        sss2CollateralMint = Keypair.generate().publicKey; // Dummy for now, ideally create a real one
        const collateralMintLamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
        const createCollateralMintTx = new anchor.web3.Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: payer.publicKey,
                newAccountPubkey: sss2CollateralMint,
                space: MINT_SIZE,
                lamports: collateralMintLamports,
                programId: TOKEN_PROGRAM_ID, // Using SPL Token for collateral
            }),
            createInitializeMintInstruction(
                sss2CollateralMint,
                decimals,
                mintAuthority.publicKey,
                null,
                TOKEN_PROGRAM_ID
            )
        );
        await sdk.provider.sendAndConfirm(createCollateralMintTx, [payer, mintAuthority]);

        const { stablecoinPda, mint, collateralVault, tx } = await sdk.initializeSss2(
            decimals,
            "Interest-Bearing USD",
            "ibUSDS",
            "https://example.com/ibusds.json",
            sss2CollateralMint
        );
        sss2StablecoinPda = stablecoinPda;
        sss2Mint = mint;
        sss2CollateralVault = collateralVault;
        console.log("SSS-2 Stablecoin PDA:", sss2StablecoinPda.toBase58());
        console.log("SSS-2 Mint:", sss2Mint.toBase58());
        console.log("SSS-2 Collateral Vault:", sss2CollateralVault.toBase58());
        console.log("Initialize SSS-2 Tx:", tx);

        const stablecoinAccount = await sss2Program.account.stablecoinV2.fetch(sss2StablecoinPda);
        assert.isTrue(stablecoinAccount.authority.equals(payer.publicKey));
        assert.isTrue(stablecoinAccount.mint.equals(sss2Mint));
        assert.isTrue(stablecoinAccount.collateralVault.equals(sss2CollateralVault));
        assert.equal(stablecoinAccount.totalAssets.toNumber(), 0);
        assert.equal(stablecoinAccount.decimals, decimals);
        assert.isFalse(stablecoinAccount.paused);

        const mintAccount = await getMint(connection, sss2Mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.isTrue(mintAccount.mintAuthority.equals(sss2StablecoinPda));
        assert.isTrue(mintAccount.freezeAuthority.equals(sss2StablecoinPda));
        assert.equal(mintAccount.decimals, decimals);
    });

    it("Sets the SSS-2 Transfer Hook Program ID", async () => {
        const tx = await sdk.setSss2TransferHook(sss2StablecoinPda, sss2Mint, TRANSFER_HOOK_PROGRAM_ID);
        console.log("Set SSS-2 Transfer Hook Tx:", tx);

        const mintAccount = await getMint(connection, sss2Mint, "confirmed", TOKEN_2022_PROGRAM_ID);
        const transferHookExtension = mintAccount.tlvData.find(
            (data) => data.extension === ExtensionType.TransferHook
        );
        assert.isDefined(transferHookExtension);
    });

    it("Deposits into SSS-2", async () => {
        const amount = 100 * (10 ** decimals);
        const minSharesOut = 99 * (10 ** decimals); // With slippage

        // Mint some collateral tokens to the payer
        const userCollateralAta = getAssociatedTokenAddressSync(sss2CollateralMint, payer.publicKey, false, TOKEN_PROGRAM_ID);
        if (!(await connection.getAccountInfo(userCollateralAta))) {
            const createAtaTx = new anchor.web3.Transaction().add(
                createAssociatedTokenAccountInstruction(payer.publicKey, userCollateralAta, payer.publicKey, sss2CollateralMint, TOKEN_PROGRAM_ID)
            );
            await sdk.provider.sendAndConfirm(createAtaTx, [payer]);
        }
        await mintToChecked(
            connection,
            payer,
            sss2CollateralMint,
            userCollateralAta,
            mintAuthority,
            amount * 2, // Mint double the amount for testing
            decimals,
            [],
            TOKEN_PROGRAM_ID
        );

        const tx = await sdk.depositSss2(sss2StablecoinPda, sss2Mint, sss2CollateralMint, amount, minSharesOut);
        console.log("Deposit SSS-2 Tx:", tx);

        const stablecoinAccount = await sss2Program.account.stablecoinV2.fetch(sss2StablecoinPda);
        assert.equal(stablecoinAccount.totalAssets.toNumber(), amount);
        
        const userSharesAta = getAssociatedTokenAddressSync(sss2Mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const userShares = await getAccount(connection, userSharesAta, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.closeTo(Number(userShares.amount), amount, 1); // Close to because of rounding
    });

    it("Syncs SSS-2 total assets", async () => {
        // Simulate external yield by directly minting to collateral vault (normally from another program)
        await mintToChecked(
            connection,
            payer,
            sss2CollateralMint,
            sss2CollateralVault,
            mintAuthority,
            10 * (10 ** decimals),
            decimals,
            [],
            TOKEN_PROGRAM_ID
        );

        const initialTotalAssets = (await sss2Program.account.stablecoinV2.fetch(sss2StablecoinPda)).totalAssets.toNumber();
        const collateralVaultAmount = (await getAccount(connection, sss2CollateralVault, "confirmed", TOKEN_PROGRAM_ID)).amount;
        assert.notEqual(initialTotalAssets, Number(collateralVaultAmount)); // Should be different before sync

        const tx = await sdk.syncSss2(sss2StablecoinPda);
        console.log("Sync SSS-2 Tx:", tx);

        const finalStablecoinAccount = await sss2Program.account.stablecoinV2.fetch(sss2StablecoinPda);
        assert.equal(finalStablecoinAccount.totalAssets.toNumber(), Number(collateralVaultAmount));
    });

    it("Redeems from SSS-2", async () => {
        const userSharesAta = getAssociatedTokenAddressSync(sss2Mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const userSharesBalance = (await getAccount(connection, userSharesAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
        const sharesToRedeem = userSharesBalance.divn(2).toNumber(); // Redeem half
        const minAssetsOut = sharesToRedeem - 100; // With slippage

        const initialUserCollateralBalance = (await getAccount(connection, userCollateralAta, "confirmed", TOKEN_PROGRAM_ID)).amount;
        const initialUserSharesBalance = (await getAccount(connection, userSharesAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
        
        const tx = await sdk.redeemSss2(sss2StablecoinPda, sss2Mint, sss2CollateralMint, sharesToRedeem, minAssetsOut);
        console.log("Redeem SSS-2 Tx:", tx);

        const finalUserSharesBalance = (await getAccount(connection, userSharesAta, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
        assert.equal(Number(finalUserSharesBalance), Number(initialUserSharesBalance) - sharesToRedeem);

        const finalUserCollateralBalance = (await getAccount(connection, userCollateralAta, "confirmed", TOKEN_PROGRAM_ID)).amount;
        assert.isAtLeast(Number(finalUserCollateralBalance), Number(initialUserCollateralBalance) + minAssetsOut);
    });

    it("Pauses and unpauses SSS-2", async () => {
        await sdk.pauseSss2(sss2StablecoinPda);
        const pausedAccount = await sss2Program.account.stablecoinV2.fetch(sss2StablecoinPda);
        assert.isTrue(pausedAccount.paused);

        await sdk.unpauseSss2(sss2StablecoinPda);
        const unpausedAccount = await sss2Program.account.stablecoinV2.fetch(sss2StablecoinPda);
        assert.isFalse(unpausedAccount.paused);
    });

    it("Adds and removes addresses from blacklist", async () => {
        const testAddress = Keypair.generate().publicKey;

        await sdk.addToBlacklist(blacklistPda, testAddress);
        let blacklistAccount = await transferHookProgram.account.blacklist.fetch(blacklistPda);
        assert.include(blacklistAccount.blacklistedAddresses.map(pk => pk.toBase58()), testAddress.toBase58());

        await sdk.removeFromBlacklist(blacklistPda, testAddress);
        blacklistAccount = await transferHookProgram.account.blacklist.fetch(blacklistPda);
        assert.notInclude(blacklistAccount.blacklistedAddresses.map(pk => pk.toBase58()), testAddress.toBase58());
    });

    it("Transfer hook prevents transfer for blacklisted sender", async () => {
        const blacklistedUser = Keypair.generate();
        await connection.requestAirdrop(blacklistedUser.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await sdk.addToBlacklist(blacklistPda, blacklistedUser.publicKey);

        // Try to mint SSS-1 tokens to blacklisted user's ATA and then transfer
        const blacklistedUserAta = getAssociatedTokenAddressSync(sss1Mint, blacklistedUser.publicKey, false, TOKEN_2022_PROGRAM_ID);
        if (!(await connection.getAccountInfo(blacklistedUserAta))) {
            const createAtaTx = new anchor.web3.Transaction().add(
                createATA2022(payer.publicKey, blacklistedUser.publicKey, sss1Mint, TOKEN_2022_PROGRAM_ID)
            );
            await sdk.provider.sendAndConfirm(createAtaTx, [payer]);
        }

        const mintAmount = 10 * (10 ** decimals);
        await sdk.mintSss1(sss1StablecoinPda, sss1Mint, blacklistedUserAta, mintAmount);

        // Attempt transfer from blacklisted user
        let caughtError = false;
        try {
            await transferChecked(
                connection,
                blacklistedUser, // Blacklisted sender
                blacklistedUserAta,
                sss1Mint,
                getAssociatedTokenAddressSync(sss1Mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID),
                blacklistedUser,
                mintAmount,
                decimals,
                [],
                TOKEN_2022_PROGRAM_ID,
            );
        } catch (e) {
            console.log("Caught expected error for blacklisted sender:", e);
            caughtError = true;
        }
        assert.isTrue(caughtError, "Transfer should have been prevented for blacklisted sender.");

        // Remove from blacklist to clean up
        await sdk.removeFromBlacklist(blacklistPda, blacklistedUser.publicKey);
    });

    it("Transfer hook prevents transfer for blacklisted receiver", async () => {
        const blacklistedReceiver = Keypair.generate();
        await connection.requestAirdrop(blacklistedReceiver.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await sdk.addToBlacklist(blacklistPda, blacklistedReceiver.publicKey);

        // Create ATA for blacklisted receiver
        const blacklistedReceiverAta = getAssociatedTokenAddressSync(sss1Mint, blacklistedReceiver.publicKey, false, TOKEN_2022_PROGRAM_ID);
        if (!(await connection.getAccountInfo(blacklistedReceiverAta))) {
            const createAtaTx = new anchor.web3.Transaction().add(
                createATA2022(payer.publicKey, blacklistedReceiver.publicKey, sss1Mint, TOKEN_2022_PROGRAM_ID)
            );
            await sdk.provider.sendAndConfirm(createAtaTx, [payer]);
        }

        // Mint SSS-1 tokens to payer's ATA
        const payerAta = getAssociatedTokenAddressSync(sss1Mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const mintAmount = 10 * (10 ** decimals);
        await sdk.mintSss1(sss1StablecoinPda, sss1Mint, payerAta, mintAmount);

        // Attempt transfer to blacklisted receiver
        let caughtError = false;
        try {
            await transferChecked(
                connection,
                payer, // Sender
                payerAta,
                sss1Mint,
                blacklistedReceiverAta,
                payer,
                mintAmount,
                decimals,
                [],
                TOKEN_2022_PROGRAM_ID,
            );
        } catch (e) {
            console.log("Caught expected error for blacklisted receiver:", e);
            caughtError = true;
        }
        assert.isTrue(caughtError, "Transfer should have been prevented for blacklisted receiver.");

        // Remove from blacklist to clean up
        await sdk.removeFromBlacklist(blacklistPda, blacklistedReceiver.publicKey);
    });
});
