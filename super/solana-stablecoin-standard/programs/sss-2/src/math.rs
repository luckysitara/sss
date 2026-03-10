//! Math utilities for safe arithmetic and rounding.

use anchor_lang::prelude::*;

use crate::error::StablecoinErrorV2;

// The virtual offset for inflation attack protection, similar to SVS.
// For stablecoins with 6 decimals, this could be 1_000_000.
// For SSS, we assume 6 decimals for the stablecoin and collateral,
// so 10^6. For simplicity, we'll start with 1 here and adjust if needed
// based on desired precision and asset decimals.
// A typical ERC-4626 implementation often uses 10^(decimals) or 1.
// Given that a stablecoin often has 6 decimals, a large offset is important.
pub const VIRTUAL_OFFSET: u64 = 1_000_000_000_000_000_000; // 1e18 for sufficient precision

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Rounding {
    Floor,
    Ceiling,
}

/// Safely performs (a * b) / c with specified rounding.
/// Returns None on overflow.
pub fn mul_div(a: u64, b: u64, c: u64, rounding: Rounding) -> Result<u64> {
    if c == 0 {
        return err!(StablecoinErrorV2::MathOverflow); // Division by zero
    }

    let numerator = (a as u128)
        .checked_mul(b as u128)
        .ok_or(StablecoinErrorV2::MathOverflow)?;

    let result = match rounding {
        Rounding::Floor => numerator.checked_div(c as u128),
        Rounding::Ceiling => {
            let (quotient, remainder) = (numerator / (c as u128), numerator % (c as u128));
            if remainder > 0 {
                quotient.checked_add(1)
            } else {
                Some(quotient)
            }
        }
    }
    .ok_or(StablecoinErrorV2::MathOverflow)?;

    result
        .try_into()
        .map_err(|_| StablecoinErrorV2::MathOverflow.into())
}
