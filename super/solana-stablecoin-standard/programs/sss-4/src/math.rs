//! Math utilities for safe arithmetic and rounding.

use anchor_lang::prelude::*;

use crate::error::ConfidentialStablecoinV2Error;

// The virtual offset for inflation attack protection, similar to SVS.
pub const VIRTUAL_OFFSET: u64 = 1_000_000_000_000_000_000; // 1e18

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Rounding {
    Floor,
    Ceiling,
}

/// Safely performs (a * b) / c with specified rounding.
/// Returns None on overflow.
pub fn mul_div(a: u64, b: u64, c: u64, rounding: Rounding) -> Result<u64> {
    if c == 0 {
        return err!(ConfidentialStablecoinV2Error::MathOverflow);
    }

    let numerator = (a as u128)
        .checked_mul(b as u128)
        .ok_or(ConfidentialStablecoinV2Error::MathOverflow)?;

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
    .ok_or(ConfidentialStablecoinV2Error::MathOverflow)?;

    result
        .try_into()
        .map_err(|_| ConfidentialStablecoinV2Error::MathOverflow.into())
}
