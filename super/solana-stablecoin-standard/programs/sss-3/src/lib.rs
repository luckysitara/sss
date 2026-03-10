use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::Mint;
use spl_token_2022::extension::{
    ExtensionType,
    metadata_pointer::MetadataPointer,
    permanent_delegate::PermanentDelegate,
    transfer_hook::TransferHook,
    confidential_transfer::ConfidentialTransfer,
};
use spl_token_metadata_interface::{
    instruction::initialize as initialize_metadata_instruction,
};
use spl_token_2022::solana_program::program::invoke_signed;
use spl_token_2022::solana_program::system_program;
use spl_token_2022::solana_program::sysvar::rent;
use spl_token_2022::solana_program::instruction::{Instruction, AccountMeta};
use spl_token_2022::solana_program::entrypoint::ProgramResult;


pub mod state;
pub mod constants;
pub mod error;

use state::*;
use error::*;
use constants::*;

declare_id!("CJCdamLHnTNb9GJvDVEYieWxpAJB6FoWhSBXZ3s82dMM");

#[program]
pub mod sss_3 {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        decimals: u8,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin;
        stablecoin.authority = ctx.accounts.authority.key();
        stablecoin.mint = ctx.accounts.mint.key();
        stablecoin.decimals = decimals;
        stablecoin.paused = false;
        stablecoin.bump = ctx.bumps.stablecoin;

        let stablecoin_key = stablecoin.key();
        let seeds: &[&[&[u8]]] = &[&[
            CONFIDENTIAL_STABLECOIN_SEED,
            ctx.accounts.mint.key().as_ref(),
            &[ctx.bumps.stablecoin],
        ]];
        let signer_seeds = &[&seeds[0][..]];

        // Initialize metadata for the mint
        let initialize_metadata_ix = initialize_metadata_instruction(
            &ctx.accounts.token_metadata_program.key(),
            &ctx.accounts.mint.key(),
            &stablecoin_key,
            &stablecoin_key,
            name,
            symbol,
            uri,
        );

        invoke_signed(
            &initialize_metadata_ix,
            &[
                ctx.accounts.token_metadata_program.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.stablecoin.to_account_info(),
                ctx.accounts.stablecoin.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
            signer_seeds,
        )?;
        Ok(())
    }

    pub fn mint_confidential(
        ctx: Context<MintConfidential>,
        amount_u64: u64,
        proof_context: Pubkey,
    ) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, ConfidentialStablecoinError::Paused);
        require!(amount_u64 > 0, ConfidentialStablecoinError::ZeroAmount);

        // CPI to spl-token program's confidential transfer extension's mint_to_checked instruction
        let mint_to_checked_ix = spl_token_2022::instruction::confidential_transfer::mint_to_checked(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.destination_account.key(),
            &ctx.accounts.stablecoin.key(), // Mint authority
            &[], // No signers needed if PDA is authority
            amount_u64, // Amount in u64
            proof_context, // Proof context account
        )?;

        let stablecoin = &ctx.accounts.stablecoin;
        let seeds: &[&[&[u8]]] = &[&[
            CONFIDENTIAL_STABLECOIN_SEED,
            stablecoin.mint.as_ref(),
            &[stablecoin.bump],
        ]];
        let signer_seeds = &[&seeds[0][..]];

        invoke_signed(
            &mint_to_checked_ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.destination_account.to_account_info(),
                ctx.accounts.stablecoin.to_account_info(), // Mint authority
            ],
            signer_seeds,
        )?;

        Ok(())
    }

    pub fn apply_pending_balance(ctx: Context<ApplyPendingBalance>) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, ConfidentialStablecoinError::Paused);

        let apply_pending_balance_ix = spl_token_2022::instruction::confidential_transfer::apply_pending_balance(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.account.key(),
            &ctx.accounts.owner.key(),
            &[],
        )?;

        invoke_signed(
            &apply_pending_balance_ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.account.to_account_info(),
                ctx.accounts.owner.to_account_info(),
            ],
            &[&[]], // No program signers for this instruction
        )?;
        Ok(())
    }


    pub fn transfer_confidential(
        ctx: Context<TransferConfidential>,
        proof_context: Pubkey,
    ) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, ConfidentialStablecoinError::Paused);

        let transfer_ix = spl_token_2022::instruction::confidential_transfer::transfer_checked(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.source_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.destination_account.key(),
            &ctx.accounts.owner.key(), // Source owner
            &[], // No additional signers
            proof_context, // Proof context account
        )?;
        
        invoke_signed(
            &transfer_ix,
            &[
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.source_account.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.destination_account.to_account_info(),
                ctx.accounts.owner.to_account_info(),
            ],
            &[&[]], // No program signers for this instruction
        )?;
        Ok(())
    }

    pub fn pause(ctx: Context<UpdateAdmin>) -> Result<()> {
        ctx.accounts.stablecoin.paused = true;
        Ok(())
    }

    pub fn unpause(ctx: Context<UpdateAdmin>) -> Result<()> {
        ctx.accounts.stablecoin.paused = false;
        Ok(())
    }

    pub fn set_transfer_hook(ctx: Context<SetTransferHook>, new_transfer_hook_program_id: Pubkey) -> Result<()> {
        let stablecoin = &ctx.accounts.stablecoin;
        let mint_info = ctx.accounts.mint.to_account_info();

        let stablecoin_key = stablecoin.key();
        let seeds: &[&[&[u8]]] = &[&[
            CONFIDENTIAL_STABLECOIN_SEED,
            stablecoin.mint.as_ref(),
            &[stablecoin.bump],
        ]];
        let signer_seeds = &[&seeds[0][..]];

        let cpi_accounts = ctx.accounts.token_program.to_account_info();

        let set_transfer_hook_ix = spl_token_2022::instruction::set_transfer_hook(
            &ctx.accounts.token_program.key(),
            &mint_info.key(),
            &stablecoin_key, // Authority
            Some(new_transfer_hook_program_id),
        )?;

        invoke_signed(
            &set_transfer_hook_ix,
            &[
                cpi_accounts.clone(),
                mint_info.clone(),
                ctx.accounts.stablecoin.to_account_info(), // Authority
            ],
            signer_seeds,
        )?;
        Ok(())
    }
}

// =============================================================================
// Accounts
// =============================================================================

#[derive(Accounts)]
#[instruction(decimals: u8, name: String, symbol: String, uri: String)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = ConfidentialStablecoin::LEN,
        seeds = [CONFIDENTIAL_STABLECOIN_SEED, mint.key().as_ref()],
        bump
    )]
    pub stablecoin: Account<'info, ConfidentialStablecoin>,

    #[account(
        init,
        payer = authority,
        mint::token_program = token_program,
        mint::authority = stablecoin, // The PDA is the mint authority
        mint::decimals = decimals,
        extensions::confidential_transfer::auditor_elgamal_pubkey = None, // No auditor for now
        extensions::confidential_transfer::auto_approve_new_accounts = true, // Auto-approve
        extensions::metadata_pointer::authority = stablecoin,
        extensions::metadata_pointer::metadata_address = mint,
        extensions::permanent_delegate::delegate = stablecoin,
        extensions::transfer_hook::authority = stablecoin,
        extensions::transfer_hook::program_id = system_program::ID, // Placeholder for now
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    
    /// CHECK: The Token Metadata Program ID for CPI
    #[account(address = spl_token_metadata_interface::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintConfidential<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [CONFIDENTIAL_STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, ConfidentialStablecoin>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Destination confidential token account
    #[account(mut)]
    pub destination_account: UncheckedAccount<'info>,

    /// CHECK: The SPL Token Confidential Transfer Extension Program
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ApplyPendingBalance<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        // CHECK: The token account to apply pending balance to
        constraint = account.owner == owner.key() @ ConfidentialStablecoinError::Unauthorized
    )]
    pub account: UncheckedAccount<'info>,
    /// CHECK: The SPL Token Confidential Transfer Extension Program
    pub token_program: Program<'info, Token2022>,
    pub stablecoin: Account<'info, ConfidentialStablecoin>,
}

#[derive(Accounts)]
pub struct TransferConfidential<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        // CHECK: Source confidential token account
        constraint = source_account.owner == owner.key() @ ConfidentialStablecoinError::Unauthorized
    )]
    pub source_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Destination confidential token account
    #[account(mut)]
    pub destination_account: UncheckedAccount<'info>,

    /// CHECK: The SPL Token Confidential Transfer Extension Program
    pub token_program: Program<'info, Token2022>,
    pub stablecoin: Account<'info, ConfidentialStablecoin>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIDENTIAL_STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, ConfidentialStablecoin>,
}

#[derive(Accounts)]
pub struct SetTransferHook<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [CONFIDENTIAL_STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, ConfidentialStablecoin>,

    #[account(mut, address = stablecoin.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
}