use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinErrorV2 {
    #[msg("Zero amount provided")]
    ZeroAmount,
    #[msg("Stablecoin is paused")]
    Paused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Insufficient assets")]
    InsufficientAssets,
}
