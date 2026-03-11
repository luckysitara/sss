use anchor_lang::prelude::*;

#[error_code]
pub enum ConfidentialStablecoinV2Error {
    #[msg("Zero amount provided")]
    ZeroAmount,
    #[msg("Confidential stablecoin is paused")]
    Paused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid proof data")]
    InvalidProof,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Insufficient assets")]
    InsufficientAssets,
}
