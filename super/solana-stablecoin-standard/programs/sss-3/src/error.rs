use anchor_lang::prelude::*;

#[error_code]
pub enum ConfidentialStablecoinError {
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
}
