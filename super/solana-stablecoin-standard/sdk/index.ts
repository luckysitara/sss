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
    createInitializeConfidentialTransferInstruction,
    createInitializeInterestBearingMintInstruction, // New import
    createInitializeTransferFeeConfigInstruction, // New import
} from "@solana/spl-token";
import {
    createInitializeMetadataPointerInstruction,
    createInitializePermanentDelegateInstruction,
    createInitializeTransferHookInstruction,
    TOKEN_METADATA_PROGRAM_ID,
} from "@solana/spl-token-metadata";
import axios from "axios"; // For backend communication

import { Sss1 } from "../target/types/sss_1";
import { Sss2 } from "../target/types/sss_2";
import { Sss3 } from "../target/types/sss_3";
import { Sss4 } from "../target/types/sss_4"; // New import
import { SssTransferHook } from "../target/types/sss_transfer_hook";

export class SssSdk {
    connection: Connection;
    provider: anchor.AnchorProvider;
    sss1Program: Program<Sss1>;
    sss2Program: Program<Sss2>;
    sss3Program: Program<Sss3>;
    sss4Program: Program<Sss4>; // New
    transferHookProgram: Program<SssTransferHook>;
    payer: Keypair;
    backendUrl: string; // New

    constructor(
        connection: Connection,
        payer: Keypair,
        sss1ProgramId: PublicKey,
        sss2ProgramId: PublicKey,
        sss3ProgramId: PublicKey,
        sss4ProgramId: PublicKey, // New
        transferHookProgramId: PublicKey,
        backendUrl: string = "http://localhost:3000" // New
    ) {
        this.connection = connection;
        this.payer = payer;
        this.backendUrl = backendUrl;
        this.provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
            commitment: "confirmed",
        });
        this.sss1Program = new Program<Sss1>(require("../target/idl/sss_1.json"), sss1ProgramId, this.provider);
        this.sss2Program = new Program<Sss2>(require("../target/idl/sss_2.json"), sss2ProgramId, this.provider);
        this.sss3Program = new Program<Sss3>(require("../target/idl/sss_3.json"), sss3ProgramId, this.provider);
        this.sss4Program = new Program<Sss4>(require("../target/idl/sss_4.json"), sss4ProgramId, this.provider); // New
        this.transferHookProgram = new Program<SssTransferHook>(
            require("../target/idl/sss_transfer_hook.json"),
            transferHookProgramId,
            this.provider
        );
    }

    // --- SSS-1 Functions ---
    async initializeSss1(
        decimals: number,
        name: string,
        symbol: string,
        uri: string,
        transferFeeBasisPoints: number,
        maximumFee: number,
        mintKeypair?: Keypair,
    ): Promise<{ stablecoinPda: PublicKey; mint: PublicKey; tx: string }> {
        const mint = mintKeypair || Keypair.generate();

        const [stablecoinPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stablecoin"), mint.publicKey.toBuffer()],
            this.sss1Program.programId
        );

        const extensions = [
            ExtensionType.MetadataPointer,
            ExtensionType.PermanentDelegate,
            ExtensionType.TransferHook,
            ExtensionType.TransferFeeConfig,
        ];
        const mintLen = getMintLen(extensions);
        const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);

        const transaction = new anchor.web3.Transaction();

        // Create the mint account
        transaction.add(
            SystemProgram.createAccount({
                fromPubkey: this.payer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            })
        );

        // Initialize Metadata Pointer Extension
        transaction.add(
            createInitializeMetadataPointerInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                mint.publicKey, // Metadata Address
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Permanent Delegate Extension
        transaction.add(
            createInitializePermanentDelegateInstruction(
                mint.publicKey,
                stablecoinPda, // Delegate
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Transfer Hook Extension
        transaction.add(
            createInitializeTransferHookInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                this.transferHookProgram.programId, 
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Transfer Fee Extension
        transaction.add(
            createInitializeTransferFeeConfigInstruction(
                mint.publicKey,
                stablecoinPda, // Fee authority
                stablecoinPda, // Withdraw withheld authority
                transferFeeBasisPoints,
                new anchor.BN(maximumFee),
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize the mint
        transaction.add(
            createInitializeMintInstruction2022(
                mint.publicKey,
                decimals,
                stablecoinPda, // Mint Authority (PDA)
                stablecoinPda, // Freeze Authority (PDA)
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        // Initialize Metadata itself (spl-token-metadata program)
        const metadataInstruction = await this.sss1Program.methods
            .initialize(decimals, name, symbol, uri, transferFeeBasisPoints, new anchor.BN(maximumFee))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint.publicKey,
                tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();
        transaction.add(metadataInstruction);

        const tx = await this.provider.sendAndConfirm(transaction, [this.payer, mint]);

        return { stablecoinPda, mint: mint.publicKey, tx };
    }

    async mintSss1(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        destination: PublicKey,
        amount: number,
    ): Promise<string> {
        return await this.sss1Program.methods
            .mint(new anchor.BN(amount))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                destination: destination,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async burnSss1(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        source: PublicKey,
        amount: number,
    ): Promise<string> {
        return await this.sss1Program.methods
            .burn(new anchor.BN(amount))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                source: source,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async pauseSss1(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss1Program.methods
            .pause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async unpauseSss1(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss1Program.methods
            .unpause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async setSss1TransferHook(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newTransferHookProgramId: PublicKey
    ): Promise<string> {
        return await this.sss1Program.methods
            .setTransferHook(newTransferHookProgramId)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    // --- SSS-2 Functions ---
    async initializeSss2(
        decimals: number,
        name: string,
        symbol: string,
        uri: string,
        collateralMint: PublicKey,
        transferFeeBasisPoints: number,
        maximumFee: number,
        interestRateBps: number,
        mintKeypair?: Keypair,
    ): Promise<{ stablecoinPda: PublicKey; mint: PublicKey; collateralVault: PublicKey; tx: string }> {
        const mint = mintKeypair || Keypair.generate();

        const [stablecoinPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stablecoin_v2"), mint.publicKey.toBuffer()],
            this.sss2Program.programId
        );

        const collateralVault = getAssociatedTokenAddressSync(collateralMint, stablecoinPda, true, TOKEN_2022_PROGRAM_ID);

        const extensions = [
            ExtensionType.MetadataPointer,
            ExtensionType.PermanentDelegate,
            ExtensionType.TransferHook,
            ExtensionType.TransferFeeConfig,
            ExtensionType.InterestBearingConfig,
        ];
        const mintLen = getMintLen(extensions);
        const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);

        const transaction = new anchor.web3.Transaction();

        // Create the mint account
        transaction.add(
            SystemProgram.createAccount({
                fromPubkey: this.payer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            })
        );

        // Initialize Metadata Pointer Extension
        transaction.add(
            createInitializeMetadataPointerInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                mint.publicKey, // Metadata Address
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Permanent Delegate Extension
        transaction.add(
            createInitializePermanentDelegateInstruction(
                mint.publicKey,
                stablecoinPda, // Delegate
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Transfer Hook Extension
        transaction.add(
            createInitializeTransferHookInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                this.transferHookProgram.programId,
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Transfer Fee Extension
        transaction.add(
            createInitializeTransferFeeConfigInstruction(
                mint.publicKey,
                stablecoinPda, // Fee authority
                stablecoinPda, // Withdraw withheld authority
                transferFeeBasisPoints,
                new anchor.BN(maximumFee),
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Interest Bearing Extension
        transaction.add(
            createInitializeInterestBearingMintInstruction(
                mint.publicKey,
                stablecoinPda, // Rate authority
                interestRateBps,
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize the mint
        transaction.add(
            createInitializeMintInstruction2022(
                mint.publicKey,
                decimals,
                stablecoinPda, // Mint Authority (PDA)
                stablecoinPda, // Freeze Authority (PDA)
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Metadata and SSS-2 state
        const initializeInstruction = await this.sss2Program.methods
            .initialize(decimals, name, symbol, uri, transferFeeBasisPoints, new anchor.BN(maximumFee), interestRateBps)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint.publicKey,
                collateralVault: collateralVault,
                collateralMint: collateralMint,
                tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();
        transaction.add(initializeInstruction);

        const tx = await this.provider.sendAndConfirm(transaction, [this.payer, mint]);

        return { stablecoinPda, mint: mint.publicKey, collateralVault, tx };
    }

    async syncSss2(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss2Program.methods
            .sync()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                collateralVault: (await this.sss2Program.account.stablecoinV2.fetch(stablecoinPda)).collateralVault,
            })
            .signers([this.payer])
            .rpc();
    }

    async depositSss2(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        collateralMint: PublicKey,
        amount: number,
        minSharesOut: number,
    ): Promise<string> {
        const stablecoinAccount = await this.sss2Program.account.stablecoinV2.fetch(stablecoinPda);
        const collateralVault = stablecoinAccount.collateralVault;
        const userCollateralAta = getAssociatedTokenAddressSync(collateralMint, this.payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const userSharesAta = getAssociatedTokenAddressSync(mint, this.payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

        // Ensure user's ATAs exist or create them
        const transaction = new anchor.web3.Transaction();
        if (!(await this.connection.getAccountInfo(userCollateralAta))) {
            transaction.add(createATA2022(this.payer.publicKey, this.payer.publicKey, collateralMint, TOKEN_2022_PROGRAM_ID));
        }
        if (!(await this.connection.getAccountInfo(userSharesAta))) {
            transaction.add(createATA2022(this.payer.publicKey, this.payer.publicKey, mint, TOKEN_2022_PROGRAM_ID));
        }
        if (transaction.instructions.length > 0) {
            await this.provider.sendAndConfirm(transaction, [this.payer]);
        }

        return await this.sss2Program.methods
            .deposit(new anchor.BN(amount), new anchor.BN(minSharesOut))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                collateralVault: collateralVault,
                userCollateralAta: userCollateralAta,
                userSharesAta: userSharesAta,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async redeemSss2(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        collateralMint: PublicKey,
        shares: number,
        minAssetsOut: number,
    ): Promise<string> {
        const stablecoinAccount = await this.sss2Program.account.stablecoinV2.fetch(stablecoinPda);
        const collateralVault = stablecoinAccount.collateralVault;
        const userCollateralAta = getAssociatedTokenAddressSync(collateralMint, this.payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const userSharesAta = getAssociatedTokenAddressSync(mint, this.payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

        return await this.sss2Program.methods
            .redeem(new anchor.BN(shares), new anchor.BN(minAssetsOut))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                collateralVault: collateralVault,
                userCollateralAta: userCollateralAta,
                userSharesAta: userSharesAta,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async pauseSss2(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss2Program.methods
            .pause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async unpauseSss2(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss2Program.methods
            .unpause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async setSss2TransferHook(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newTransferHookProgramId: PublicKey
    ): Promise<string> {
        return await this.sss2Program.methods
            .setTransferHook(newTransferHookProgramId)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    // --- SSS-3 Functions ---
    async initializeSss3(
        decimals: number,
        name: string,
        symbol: string,
        uri: string,
        mintKeypair?: Keypair,
    ): Promise<{ stablecoinPda: PublicKey; mint: PublicKey; tx: string }> {
        const mint = mintKeypair || Keypair.generate();

        const [stablecoinPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("confidential_stablecoin"), mint.publicKey.toBuffer()],
            this.sss3Program.programId
        );

        const extensions = [
            ExtensionType.ConfidentialTransfer,
            ExtensionType.MetadataPointer,
            ExtensionType.PermanentDelegate,
            ExtensionType.TransferHook,
        ];
        const mintLen = getMintLen(extensions);
        const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);

        const transaction = new anchor.web3.Transaction();

        // Create the mint account
        transaction.add(
            SystemProgram.createAccount({
                fromPubkey: this.payer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            })
        );

        // Initialize Metadata Pointer Extension
        transaction.add(
            createInitializeMetadataPointerInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                mint.publicKey, // Metadata Address
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Permanent Delegate Extension
        transaction.add(
            createInitializePermanentDelegateInstruction(
                mint.publicKey,
                stablecoinPda, // Delegate
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Transfer Hook Extension (with a placeholder program ID for now)
        transaction.add(
            createInitializeTransferHookInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                this.transferHookProgram.programId, // Placeholder program ID
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Initialize Confidential Transfer Extension
        transaction.add(
            createInitializeConfidentialTransferInstruction(
                mint.publicKey,
                stablecoinPda, // Authority
                false, // supply_decoded_on_initialize
                0, // maximum_incoming_transfers
                0, // maximum_outgoing_transfers
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        // Initialize the mint
        transaction.add(
            createInitializeMintInstruction2022(
                mint.publicKey,
                decimals,
                stablecoinPda, // Mint Authority (PDA)
                stablecoinPda, // Freeze Authority (PDA)
                TOKEN_2022_PROGRAM_ID
            )
        );
        
        // Initialize Metadata itself and SSS-3 state
        const initializeInstruction = await this.sss3Program.methods
            .initialize(decimals, name, symbol, uri)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint.publicKey,
                tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();
        transaction.add(initializeInstruction);

        const tx = await this.provider.sendAndConfirm(transaction, [this.payer, mint]);

        return { stablecoinPda, mint: mint.publicKey, tx };
    }

    async mintConfidentialSss3(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        destinationAccount: PublicKey,
        amount: number,
        proofContext: PublicKey, // Need a ProofContext account
    ): Promise<string> {
        return await this.sss3Program.methods
            .mintConfidential(new anchor.BN(amount), proofContext)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                destinationAccount: destinationAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async applyPendingBalanceSss3(
        stablecoinPda: PublicKey,
        tokenAccount: PublicKey,
    ): Promise<string> {
        return await this.sss3Program.methods
            .applyPendingBalance()
            .accounts({
                owner: this.payer.publicKey,
                stablecoin: stablecoinPda,
                account: tokenAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async transferConfidentialSss3(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        sourceAccount: PublicKey,
        destinationAccount: PublicKey,
        proofContext: PublicKey, // Need a ProofContext account
    ): Promise<string> {
        return await this.sss3Program.methods
            .transferConfidential(proofContext)
            .accounts({
                owner: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                sourceAccount: sourceAccount,
                destinationAccount: destinationAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async pauseSss3(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss3Program.methods
            .pause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async unpauseSss3(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss3Program.methods
            .unpause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async setSss3TransferHook(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newTransferHookProgramId: PublicKey
    ): Promise<string> {
        return await this.sss3Program.methods
            .setTransferHook(newTransferHookProgramId)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    // --- SSS-4 Functions ---
    async initializeSss4(
        decimals: number,
        name: string,
        symbol: string,
        uri: string,
        collateralMint: PublicKey,
        transferHookProgramId: PublicKey,
        mintKeypair?: Keypair,
    ): Promise<{ stablecoinPda: PublicKey; mint: PublicKey; collateralVault: PublicKey; tx: string }> {
        const mint = mintKeypair || Keypair.generate();

        const [stablecoinPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("confidential_stablecoin_v2"), mint.publicKey.toBuffer()],
            this.sss4Program.programId
        );

        const collateralVault = getAssociatedTokenAddressSync(collateralMint, stablecoinPda, true, TOKEN_2022_PROGRAM_ID);

        const extensions = [
            ExtensionType.ConfidentialTransfer,
            ExtensionType.MetadataPointer,
            ExtensionType.PermanentDelegate,
            ExtensionType.TransferHook,
        ];
        const mintLen = getMintLen(extensions);
        const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);

        const transaction = new anchor.web3.Transaction();

        transaction.add(
            SystemProgram.createAccount({
                fromPubkey: this.payer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            })
        );

        transaction.add(
            createInitializeMetadataPointerInstruction(
                mint.publicKey,
                stablecoinPda,
                mint.publicKey,
                TOKEN_2022_PROGRAM_ID
            )
        );

        transaction.add(
            createInitializePermanentDelegateInstruction(
                mint.publicKey,
                stablecoinPda,
                TOKEN_2022_PROGRAM_ID
            )
        );

        transaction.add(
            createInitializeTransferHookInstruction(
                mint.publicKey,
                stablecoinPda,
                transferHookProgramId,
                TOKEN_2022_PROGRAM_ID
            )
        );

        transaction.add(
            createInitializeConfidentialTransferInstruction(
                mint.publicKey,
                stablecoinPda,
                false,
                0,
                0,
                TOKEN_2022_PROGRAM_ID
            )
        );

        transaction.add(
            createInitializeMintInstruction2022(
                mint.publicKey,
                decimals,
                stablecoinPda,
                stablecoinPda,
                TOKEN_2022_PROGRAM_ID
            )
        );

        const initializeInstruction = await this.sss4Program.methods
            .initialize(decimals, name, symbol, uri, transferHookProgramId)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint.publicKey,
                collateralVault: collateralVault,
                collateralMint: collateralMint,
                tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();
        transaction.add(initializeInstruction);

        const tx = await this.provider.sendAndConfirm(transaction, [this.payer, mint]);

        return { stablecoinPda, mint: mint.publicKey, collateralVault, tx };
    }

    async syncSss4(stablecoinPda: PublicKey, collateralVault: PublicKey): Promise<string> {
        return await this.sss4Program.methods
            .sync()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                collateralVault: collateralVault,
            })
            .signers([this.payer])
            .rpc();
    }

    async mintConfidentialSss4(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        destinationAccount: PublicKey,
        amount: number,
        proofContext: PublicKey,
    ): Promise<string> {
        return await this.sss4Program.methods
            .mintConfidential(new anchor.BN(amount), proofContext)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                destinationAccount: destinationAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async transferConfidentialSss4(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        sourceAccount: PublicKey,
        destinationAccount: PublicKey,
        proofContext: PublicKey,
    ): Promise<string> {
        return await this.sss4Program.methods
            .transferConfidential(proofContext)
            .accounts({
                owner: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                sourceAccount: sourceAccount,
                destinationAccount: destinationAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    // --- Backend Helpers ---
    async getTransferProof(
        sourcePubkey: PublicKey,
        destinationPubkey: PublicKey,
        amount: number,
        decryptKey: string,
    ): Promise<Buffer> {
        const response = await axios.post(`${this.backendUrl}/generate-transfer-proof`, {
            source_pubkey: sourcePubkey.toBase58(),
            destination_pubkey: destinationPubkey.toBase58(),
            amount,
            decrypt_key: decryptKey,
        });
        return Buffer.from(response.data.proof_data, "base64");
    }

    // --- SSS-1 & SSS-2 Admin Setters ---
    async setSss1TransferFeeConfig(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        basisPoints: number,
        maximumFee: number
    ): Promise<string> {
        return await this.sss1Program.methods
            .setTransferFeeConfig(basisPoints, new anchor.BN(maximumFee))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();
    }

    async setSss1TransferFeeAuthority(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newFeeAuthority: PublicKey | null,
        newWithdrawWithheldAuthority: PublicKey | null
    ): Promise<string> {
        return await this.sss1Program.methods
            .setTransferFeeAuthority(newFeeAuthority, newWithdrawWithheldAuthority)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();
    }

    async setSss2TransferFeeConfig(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        basisPoints: number,
        maximumFee: number
    ): Promise<string> {
        return await this.sss2Program.methods
            .setTransferFeeConfig(basisPoints, new anchor.BN(maximumFee))
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();
    }

    async setSss2TransferFeeAuthority(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newFeeAuthority: PublicKey | null,
        newWithdrawWithheldAuthority: PublicKey | null
    ): Promise<string> {
        return await this.sss2Program.methods
            .setTransferFeeAuthority(newFeeAuthority, newWithdrawWithheldAuthority)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();
    }

    async setSss2InterestRate(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newRateBps: number
    ): Promise<string> {
        return await this.sss2Program.methods
            .setInterestRate(newRateBps)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();
    }

    // --- SSS-4 Missing Methods ---
    async applyPendingBalanceSss4(
        stablecoinPda: PublicKey,
        tokenAccount: PublicKey,
    ): Promise<string> {
        return await this.sss4Program.methods
            .applyPendingBalance()
            .accounts({
                owner: this.payer.publicKey,
                stablecoin: stablecoinPda,
                account: tokenAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async pauseSss4(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss4Program.methods
            .pause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async unpauseSss4(stablecoinPda: PublicKey): Promise<string> {
        return await this.sss4Program.methods
            .unpause()
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async setSss4TransferHook(
        stablecoinPda: PublicKey,
        mint: PublicKey,
        newTransferHookProgramId: PublicKey
    ): Promise<string> {
        return await this.sss4Program.methods
            .setTransferHook(newTransferHookProgramId)
            .accounts({
                authority: this.payer.publicKey,
                stablecoin: stablecoinPda,
                mint: mint,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    // --- Transfer Hook Functions ---
    async initializeBlacklist(): Promise<{ blacklistPda: PublicKey; tx: string }> {
        const [blacklistPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("blacklist")],
            this.transferHookProgram.programId
        );

        const tx = await this.transferHookProgram.methods
            .initializeBlacklist()
            .accounts({
                authority: this.payer.publicKey,
                blacklistAccount: blacklistPda,
                systemProgram: SystemProgram.programId,
            })
            .signers([this.payer])
            .rpc();
        
        return { blacklistPda, tx };
    }

    async addToBlacklist(blacklistPda: PublicKey, address: PublicKey): Promise<string> {
        return await this.transferHookProgram.methods
            .addToBlacklist(address)
            .accounts({
                authority: this.payer.publicKey,
                blacklistAccount: blacklistPda,
            })
            .signers([this.payer])
            .rpc();
    }

    async removeFromBlacklist(blacklistPda: PublicKey, address: PublicKey): Promise<string> {
        return await this.transferHookProgram.methods
            .removeFromBlacklist(address)
            .accounts({
                authority: this.payer.publicKey,
                blacklistAccount: blacklistPda,
            })
            .signers([this.payer])
            .rpc();
    }
}
