# Solana Stablecoin Standard (SSS)

This repository implements the Solana Stablecoin Standard (SSS), providing two main stablecoin variants (SSS-1 and SSS-2) with Token-2022 extensions, alongside a modular transfer hook program for compliance features like blacklisting. It also includes a TypeScript SDK for easy interaction with the on-chain programs and a comprehensive test suite.

## Variants

### SSS-1: Fiat-Backed Stablecoin

A basic fiat-backed stablecoin model where the issuance and redemption are directly controlled by an authority.

**Features:**
- Authority-controlled minting and burning.
- Emergency pause functionality.
- Token-2022 extensions for:
    - On-chain Metadata (Name, Symbol, URI).
    - Permanent Delegate (for compliance and freezing capabilities).
    - Transfer Hook (for custom transfer validation, e.g., blacklisting).

### SSS-2: Interest-Bearing / Collateral-Backed Stablecoin

An interest-bearing stablecoin model similar to a vault (e.g., SVS-2), where the total assets are tracked, and yield can be recognized by a `sync` operation.

**Features:**
- Stored balance model, enabling calculation of share price based on collateral in a vault.
- `sync()` function, callable by the authority, to update the recorded total assets, reflecting yield accrual.
- Deposit and Redeem functionality with slippage protection and vault-favoring rounding.
- Emergency pause functionality.
- Token-2022 extensions for:
    - On-chain Metadata (Name, Symbol, URI).
    - Permanent Delegate (for compliance and freezing capabilities).
    - Transfer Hook (for custom transfer validation, e.g., blacklisting).

### SSS-Transfer-Hook: Modular Compliance (Blacklisting Example)

A separate Anchor program designed to act as a Transfer Hook for Token-2022 mints. This example implements a basic blacklisting mechanism.

**Features:**
- Initialize a `Blacklist` account.
- Add or remove addresses from the blacklist.
- The `transfer_hook` instruction (invoked automatically by Token-2022 transfers) prevents transfers to or from blacklisted addresses.

## Project Structure

```
.
├── programs/
│   ├── sss-1/                  # SSS-1 Program (Fiat-backed)
│   ├── sss-2/                  # SSS-2 Program (Interest-bearing)
│   └── sss-transfer-hook/      # Transfer Hook Program (Blacklisting)
├── sdk/                        # TypeScript SDK for interacting with the programs
│   └── index.ts                # SDK main file
├── tests/
│   └── test.ts                 # Comprehensive test suite
├── Anchor.toml                 # Anchor project configuration
├── Cargo.toml                  # Workspace Cargo file
└── tsconfig.json               # TypeScript configuration
```

## Setup and Installation

1.  **Install Solana & Anchor:**
    Ensure you have the latest stable versions of Solana and Anchor installed.
    ```bash
    solana-install update
    anchor install
    ```

2.  **Clone the repository:**
    ```bash
    git clone https://github.com/solanabr/solana-stablecoin-standard.git
    cd solana-stablecoin-standard
    ```

3.  **Install JavaScript dependencies:**
    ```bash
    yarn install
    ```

## Build and Deploy

1.  **Build the programs:**
    ```bash
    anchor build
    ```

2.  **Deploy the programs:**
    The `Anchor.toml` file contains placeholder program IDs. For local development, you can deploy them to your local validator.
    ```bash
    anchor deploy
    ```
    Note down the program IDs after deployment, as they might change if you're not using fixed IDs. Update the `SSS1_PROGRAM_ID`, `SSS2_PROGRAM_ID`, and `TRANSFER_HOOK_PROGRAM_ID` constants in `sdk/index.ts` and `tests/test.ts` if they differ from the `Anchor.toml` defaults.

## Running Tests

To run the comprehensive test suite:

1.  **Start a local Solana validator:**
    ```bash
    solana-test-validator
    ```
2.  **Run the tests:**
    ```bash
    anchor test
    ```

The tests cover:
- Initialization of the `Blacklist` program.
- Initialization of `SSS-1` and `SSS-2` with Token-2022 Metadata, Permanent Delegate, and Transfer Hook extensions.
- Setting the Transfer Hook Program ID for both SSS-1 and SSS-2 mints.
- Minting and burning `SSS-1` tokens.
- Pausing and unpausing `SSS-1`.
- Depositing, syncing, and redeeming `SSS-2` tokens.
- Pausing and unpausing `SSS-2`.
- Adding and removing addresses from the blacklist via the `sss-transfer-hook` program.
- Verifying that the transfer hook prevents transfers from/to blacklisted accounts.

## Usage (via SDK)

The `sdk/index.ts` provides a `SssSdk` class to easily interact with the deployed programs.

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SssSdk } from "./sdk"; // Adjust path as needed

// Example usage
async function main() {
    const connection = new Connection("http://127.00.1:8899", "confirmed");
    const payer = Keypair.fromSecretKey(...); // Your keypair
    
    // Replace with your deployed program IDs
    const SSS1_PROGRAM_ID = new PublicKey("8jBjnag7xWAnJkG5hFnjH7qZtwFp5ua57TjzwpHhhHpL");
    const SSS2_PROGRAM_ID = new PublicKey("3gam4baZf4JJFAZBQY7UEekJ7YgSL9GNDWYQrz1Qxe1T");
    const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("DJoWeytpBHbeXZHnLeT56YMTr71S9MEyiT2gZqf1YTv8");

    const sdk = new SssSdk(connection, payer, SSS1_PROGRAM_ID, SSS2_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID);

    // --- SSS-1 Example ---
    const { stablecoinPda: sss1Pda, mint: sss1Mint } = await sdk.initializeSss1(
        6, "MyUSD", "MUSD", "https://example.com/musd.json"
    );
    console.log("Initialized SSS-1:", sss1Pda.toBase58());

    // Update transfer hook
    await sdk.setSss1TransferHook(sss1Pda, sss1Mint, TRANSFER_HOOK_PROGRAM_ID);

    // --- SSS-2 Example ---
    const collateralMint = new PublicKey("..."); // Your collateral mint PublicKey
    const { stablecoinPda: sss2Pda, mint: sss2Mint } = await sdk.initializeSss2(
        6, "MyInterestUSD", "MiUSD", "https://example.com/miusd.json", collateralMint
    );
    console.log("Initialized SSS-2:", sss2Pda.toBase58());

    // --- Transfer Hook Example ---
    const { blacklistPda } = await sdk.initializeBlacklist();
    await sdk.addToBlacklist(blacklistPda, new PublicKey("SomeAddressToBlacklist"));
}

main();
```

## Contributing

Contributions are welcome! Please refer to the `.claude/commands/plan-feature.md` and `.claude/commands/test-and-fix.md` for guidelines.

## License

This project is licensed under the Apache 2.0 License.

## Disclaimer

This software is provided "as is" without warranty of any kind, express or implied. Use at your own risk. It has not been audited.
