use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, MintTo, Burn, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use spl_token_2022::extension::{
    ExtensionType,
    metadata_pointer::MetadataPointer,
    permanent_delegate::PermanentDelegate,
    transfer_hook::TransferHook,
    transfer_fee::TransferFeeConfig, // New import
};
use spl_token_metadata_interface::{
    state::TokenMetadata,
    instruction::initialize as initialize_metadata_instruction,
};

pub mod state;
pub mod constants;
pub mod error;

use state::*;
use error::*;
use constants::*;

declare_id!("8jBjnag7xWAnJkG5hFnjH7qZtwFp5ua57TjzwpHhhHpL");

#[program]
pub mod sss_1 {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        decimals: u8,
        name: String,
        symbol: String,
        uri: String,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        let stablecoin = &mut ctx.accounts.stablecoin;
        stablecoin.authority = ctx.accounts.authority.key();
        stablecoin.mint = ctx.accounts.mint.key();
        stablecoin.decimals = decimals;
        stablecoin.paused = false;
        stablecoin.bump = ctx.bumps.stablecoin;

        let stablecoin_key = stablecoin.key(); // The stablecoin PDA is the authority for the mint
        let seeds: &[&[&[u8]]] = &[&[
            STABLECOIN_SEED,
            ctx.accounts.mint.key().as_ref(), // Use the mint key for PDA derivation
            &[ctx.bumps.stablecoin],
        ]];
        let signer_seeds = &[&seeds[0][..]];

        // Initialize Transfer Fee Config (Explicitly via CPI)
        let transfer_fee_ix = spl_token_2022::instruction::initialize_transfer_fee_config(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.mint.key(),
            Some(&stablecoin_key),
            Some(&stablecoin_key),
            transfer_fee_basis_points,
            maximum_fee,
        )?;

        solana_program::program::invoke_signed(
            &transfer_fee_ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Initialize metadata for the mint
        let cpi_accounts = ctx.accounts.token_metadata_program.to_account_info();
        let mint_info = ctx.accounts.mint.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let rent_info = ctx.accounts.rent.to_account_info();

        // Instruction to initialize metadata
        let initialize_metadata_ix = initialize_metadata_instruction(
            &ctx.accounts.token_metadata_program.key(), // Token Metadata Program ID
            &mint_info.key(), // Mint Account
            &stablecoin_key, // Mint Authority
            &stablecoin_key, // Freeze Authority (can be same as mint authority)
            name,
            symbol,
            uri,
        );

        solana_program::program::invoke_signed(
            &initialize_metadata_ix,
            &[
                cpi_accounts.clone(),
                mint_info.clone(),
                ctx.accounts.stablecoin.to_account_info(), // Mint Authority
                ctx.accounts.stablecoin.to_account_info(), // Freeze Authority
                system_program_info.clone(), // System Program (needed for CPI)
                rent_info.clone(), // Rent Sysvar (needed for CPI)
            ],
            signer_seeds,
        )?;
        Ok(())
    }

    pub fn mint(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, StablecoinError::Paused);
        require!(amount > 0, StablecoinError::ZeroAmount);

        let mint_key = ctx.accounts.stablecoin.mint;
        let seeds: &[&[&[u8]]] = &[&[
            STABLECOIN_SEED,
            mint_key.as_ref(),
            &[ctx.accounts.stablecoin.bump],
        ]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.stablecoin.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds);

        token_2022::mint_to(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn burn(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, StablecoinError::Paused);
        require!(amount > 0, StablecoinError::ZeroAmount);

        let cpi_accounts = Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.source.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token_2022::burn(cpi_ctx, amount)?;
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
            STABLECOIN_SEED,
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

        solana_program::program::invoke_signed(
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
#[derive(Accounts)]
#[instruction(decimals: u8, name: String, symbol: String, uri: String, transfer_fee_basis_points: u16, maximum_fee: u64)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Stablecoin::LEN,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump
    )]
    pub stablecoin: Account<'info, Stablecoin>,

    #[account(
        init,
        payer = authority,
        mint::token_program = token_program,
        mint::authority = stablecoin, // The PDA is the mint authority
        mint::decimals = decimals,
        extensions::metadata_pointer::authority = stablecoin,
        extensions::metadata_pointer::metadata_address = mint,
        extensions::permanent_delegate::delegate = stablecoin, // Set stablecoin PDA as permanent delegate
        extensions::transfer_hook::authority = stablecoin, // Set stablecoin PDA as transfer hook authority
        extensions::transfer_hook::program_id = token_program, // Placeholder, will be set later
        extensions::transfer_fee::basis_points = transfer_fee_basis_points,
        extensions::transfer_fee::maximum_fee = maximum_fee,
        extensions::transfer_fee::fee_authority = stablecoin, // The PDA is the fee authority
        extensions::transfer_fee::withdraw_withheld_authority = stablecoin, // The PDA is the withdraw withheld authority
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
pub struct MintTokens<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,

    #[account(
        mut,
        address = stablecoin.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,

    #[account(
        mut,
        address = stablecoin.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
    )]
    pub source: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,
}

#[derive(Accounts)]
pub struct SetTransferHook<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, Stablecoin>,

    #[account(mut, address = stablecoin.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
}
