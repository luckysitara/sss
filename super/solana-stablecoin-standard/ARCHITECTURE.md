# Solana Stablecoin Standard (SSS) Architecture

## Overview

The Solana Stablecoin Standard (SSS) provides a set of modular, production-ready Anchor programs and a TypeScript SDK for issuing and managing stablecoins on Solana using Token-2022 extensions. 

Inspired by the Solana Vault Standard (SVS), SSS offers four primary variants to accommodate various architectural needs, from basic fiat-backed models to complex, yield-bearing, and privacy-preserving configurations.

## Program Variants

### SSS-1: Fiat-Backed (Transparent)
- **Model:** Direct mint/burn by an authorized entity.
- **Extensions:** Metadata, Permanent Delegate, Transfer Hook, Transfer Fee.
- **Use Case:** Regulated stablecoins (e.g., USDC-like) with compliance controls and revenue mechanisms.

### SSS-2: Collateral-Backed (Stored Balance)
- **Model:** Share-based system with a "stored balance" of collateral. Share price is derived from `total_assets / total_supply`.
- **Extensions:** Metadata, Permanent Delegate, Transfer Hook, Transfer Fee, Interest-Bearing.
- **Use Case:** Interest-accruing stablecoins or yield-aggregating vaults where yield is recognized via `sync()`.

### SSS-3: Confidential Fiat-Backed
- **Model:** SSS-1 logic but using Token-2022 **Confidential Transfers**.
- **Extensions:** Confidential Transfer, Metadata, Permanent Delegate, Transfer Hook.
- **Use Case:** Privacy-focused stablecoins for institutional or personal use where transaction amounts are hidden.

### SSS-4: Confidential Collateral-Backed
- **Model:** The most advanced variant, combining the share-accounting of SSS-2 with the privacy of SSS-3.
- **Extensions:** Confidential Transfer, Metadata, Permanent Delegate, Transfer Hook.
- **Use Case:** Private, yield-bearing stablecoins.

## Key Architectural Components

### Token-2022 Extensions
SSS leverages the power of Token-2022 to provide native, high-performance features:
- **Transfer Hook:** Allows external programs (like our `sss-transfer-hook`) to validate every transfer (e.g., blacklisting, KYC).
- **Permanent Delegate:** Enables the issuer to manage or freeze tokens in compliance with regulatory requirements.
- **Interest-Bearing Config:** Standardizes how interest rates are set and recognized by wallets and explorers.
- **Confidential Transfer:** Uses ELGamal encryption and ZK-proofs to hide balances and transfer amounts.

### SSS-Transfer-Hook Program
A modular program that implements the `spl-transfer-hook-interface`. It provides a reference implementation for a global blacklist, ensuring that blacklisted addresses cannot send or receive tokens.

### Proofs Backend
A Rust-based service (`proofs-backend`) that facilitates the generation of Zero-Knowledge proofs required for confidential transfers. It provides an architectural hook for integrating production-grade ZK proving systems.

### TypeScript SDK
The `SssSdk` provides a unified interface for:
- Deploying and initializing all SSS variants.
- Performing core operations (mint, burn, deposit, redeem, sync).
- Managing administrative settings (pausing, fee updates, interest rates).
- Interacting with the transfer hook and proofs backend.

### Security and Precision
- **Safe Math:** All variants use safe arithmetic to prevent overflows.
- **Rounding:** Collateral-backed variants (SSS-2, SSS-4) use vault-favoring rounding (floor for minting shares, floor for redeeming assets) and virtual offsets to protect against inflation attacks.
- **Administrative Controls:** Robust authority checks ensure only authorized entities can perform sensitive operations.

## Testing Strategy
SSS includes a comprehensive test suite that validates:
- Deployment and initialization of all programs and extensions.
- Behavioral correctness of each variant's unique logic.
- Enforcement of compliance via the Transfer Hook.
- Integration between the SDK, on-chain programs, and backend components.
