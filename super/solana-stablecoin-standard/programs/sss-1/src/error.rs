use anchor_lang::prelude::*;

#[error_code]
pub enum StablecoinError {
    #[msg("Zero amount provided")]
    ZeroAmount,
    #[msg("Stablecoin is paused")]
    Paused,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
