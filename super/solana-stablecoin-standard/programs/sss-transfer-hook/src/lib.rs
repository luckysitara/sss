use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use spl_transfer_hook_interface::{
    instruction::{TransferHookInstruction, transfer_hook_execute},
    ID as SPL_TRANSFER_HOOK_INTERFACE_ID,
};
use spl_token_2022::spl_token::native_mint; // Use native_mint for a dummy mint in the test

declare_id!("DJoWeytpBHbeXZHnLeT56YMTr71S9MEyiT2gZqf1YTv8");

#[program]
pub mod sss_transfer_hook {
    use super::*;

    /// Initializes the blacklist account.
    pub fn initialize_blacklist(ctx: Context<InitializeBlacklist>) -> Result<()> {
        let blacklist = &mut ctx.accounts.blacklist_account;
        blacklist.authority = ctx.accounts.authority.key();
        blacklist.bump = ctx.bumps.blacklist_account;
        blacklist.blacklisted_addresses = Vec::new(); // Initialize empty vector
        Ok(())
    }

    /// Adds an address to the blacklist.
    pub fn add_to_blacklist(ctx: Context<UpdateBlacklist>, address: Pubkey) -> Result<()> {
        let blacklist = &mut ctx.accounts.blacklist_account;
        // Check if the address is already blacklisted
        if !blacklist.blacklisted_addresses.contains(&address) {
            blacklist.blacklisted_addresses.push(address);
        }
        Ok(())
    }

    /// Removes an address from the blacklist.
    pub fn remove_from_blacklist(ctx: Context<UpdateBlacklist>, address: Pubkey) -> Result<()> {
        let blacklist = &mut ctx.accounts.blacklist_account;
        blacklist.blacklisted_addresses.retain(|&x| x != address);
        Ok(())
    }

    /// The transfer hook logic. This instruction is invoked by the token program.
    /// It checks if the sender or receiver is blacklisted.
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        // Here, implement your custom transfer logic.
        // For example, check if sender or receiver is blacklisted.
        let blacklist = &ctx.accounts.blacklist_account;

        if blacklist.blacklisted_addresses.contains(&ctx.accounts.source_account.owner) {
            return err!(TransferHookError::SourceBlacklisted);
        }

        if blacklist.blacklisted_addresses.contains(&ctx.accounts.destination_account.owner) {
            return err!(TransferHookError::DestinationBlacklisted);
        }

        // You can add more complex checks here (e.g., amount limits, KYC checks)

        msg!("Transfer of {} tokens approved by hook.", amount);
        Ok(())
    }
}

// =============================================================================
// Accounts
// =============================================================================

/// Accounts for initializing the blacklist.
#[derive(Accounts)]
pub struct InitializeBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Blacklist::MAX_LEN,
        seeds = [b"blacklist"],
        bump
    )]
    pub blacklist_account: Account<'info, Blacklist>,

    pub system_program: Program<'info, System>,
}

/// Accounts for updating the blacklist (add/remove).
#[derive(Accounts)]
pub struct UpdateBlacklist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"blacklist"],
        bump = blacklist_account.bump,
        has_one = authority,
    )]
    pub blacklist_account: Account<'info, Blacklist>,
}

/// Accounts for the transfer hook instruction.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: The mint account for the token.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: The source account of the transfer.
    pub source_account: UncheckedAccount<'info>,
    /// CHECK: The owner of the source account.
    pub source_authority: UncheckedAccount<'info>,
    /// CHECK: The destination account of the transfer.
    pub destination_account: UncheckedAccount<'info>,
    /// CHECK: The transfer hook program's extra account.
    #[account(
        seeds = [b"blacklist"],
        bump = blacklist_account.bump,
    )]
    pub blacklist_account: Account<'info, Blacklist>,
    /// CHECK: The token program.
    pub token_program: Program<'info, Token2022>,
    /// CHECK: The associated token program.
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: The system program.
    pub system_program: Program<'info, System>,
    /// CHECK: The rent sysvar.
    pub rent: Sysvar<'info, Rent>,
}

// =============================================================================
// State
// =============================================================================

#[account]
pub struct Blacklist {
    pub authority: Pubkey,
    pub blacklisted_addresses: Vec<Pubkey>,
    pub bump: u8,
}

impl Blacklist {
    pub const MAX_LEN: usize = 8 + // Discriminator
        32 + // Authority
        4 + (32 * 100) + // Max 100 blacklisted addresses (adjust as needed)
        1; // Bump
}

// =============================================================================
// Errors
// =============================================================================

#[error_code]
pub enum TransferHookError {
    #[msg("Source account is blacklisted")]
    SourceBlacklisted,
    #[msg("Destination account is blacklisted")]
    DestinationBlacklisted,
}
