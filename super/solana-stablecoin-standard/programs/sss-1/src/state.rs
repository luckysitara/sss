use anchor_lang::prelude::*;

#[account]
pub struct Stablecoin {
    /// The authority allowed to mint/burn and manage extensions
    pub authority: Pubkey,
    /// The stablecoin mint address (Token-2022)
    pub mint: Pubkey,
    /// Decimals of the stablecoin
    pub decimals: u8,
    /// Emergency pause flag
    pub paused: bool,
    /// Bump for PDA
    pub bump: u8,
    /// Reserved for future upgrades
    pub _reserved: [u8; 64],
}

impl Stablecoin {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // mint
        1 +  // decimals
        1 +  // paused
        1 +  // bump
        64;  // _reserved
}
