use anchor_lang::prelude::*;

use crate::constants::CONFIDENTIAL_STABLECOIN_V2_SEED;

#[account]
pub struct ConfidentialStablecoinV2 {
    /// The authority allowed to sync and manage the stablecoin
    pub authority: Pubkey,
    /// The stablecoin mint address (Token-2022 with Confidential Transfer Extension)
    pub mint: Pubkey,
    /// The vault holding the underlying collateral
    pub collateral_vault: Pubkey,
    /// Stored total assets (used for share price calculation)
    pub total_assets: u64,
    /// Decimals of the stablecoin
    pub decimals: u8,
    /// Emergency pause flag
    pub paused: bool,
    /// Bump for PDA
    pub bump: u8,
    /// Reserved for future upgrades
    pub _reserved: [u8; 64],
}

impl ConfidentialStablecoinV2 {
    pub const LEN: usize = 8 +  // discriminator
        32 +  // authority
        32 +  // mint
        32 +  // collateral_vault
        8 +   // total_assets
        1 +   // decimals
        1 +   // paused
        1 +   // bump
        64;   // _reserved

    pub const SEED_PREFIX: &'static [u8] = CONFIDENTIAL_STABLECOIN_V2_SEED;
}
