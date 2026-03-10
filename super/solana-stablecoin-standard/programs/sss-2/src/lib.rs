use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, MintTo, Burn, Transfer, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use spl_token_2022::extension::{
    ExtensionType,
    metadata_pointer::MetadataPointer,
    permanent_delegate::PermanentDelegate,
    transfer_hook::TransferHook,
};
use spl_token_metadata_interface::{
    state::TokenMetadata,
    instruction::initialize as initialize_metadata_instruction,
};

pub mod state;
pub mod constants;
pub mod error;
pub mod math; // For mul_div and rounding

use state::*;
use error::*;
use constants::*;
use math::*; // Import math functions

declare_id!("3gam4baZf4JJFAZBQY7UEekJ7YgSL9GNDWYQrz1Qxe1T");

#[program]
pub mod sss_2 {
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
        stablecoin.collateral_vault = ctx.accounts.collateral_vault.key();
        stablecoin.total_assets = 0; // Starts at zero
        stablecoin.decimals = decimals;
        stablecoin.paused = false;
        stablecoin.bump = ctx.bumps.stablecoin;

        stablecoin.bump = ctx.bumps.stablecoin;

        let stablecoin_key = stablecoin.key(); // The stablecoin PDA is the authority for the mint
        let seeds: &[&[&[u8]]] = &[&[
            STABLECOIN_SEED,
            ctx.accounts.mint.key().as_ref(), // Use the mint key for PDA derivation
            &[ctx.bumps.stablecoin],
        ]];
        let signer_seeds = &[&seeds[0][..]];

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

    }

    pub fn sync(ctx: Context<Sync>) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, StablecoinErrorV2::Paused);
        ctx.accounts.stablecoin.total_assets = ctx.accounts.collateral_vault.amount;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, assets: u64, min_shares_out: u64) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, StablecoinErrorV2::Paused);
        require!(assets > 0, StablecoinErrorV2::ZeroAmount);

        let stablecoin = &mut ctx.accounts.stablecoin;
        let mint = &ctx.accounts.mint;
        let collateral_vault = &ctx.accounts.collateral_vault;

        let total_supply = mint.supply;
        let total_assets = stablecoin.total_assets;

        let shares_out = if total_supply == 0 || total_assets == 0 {
            assets
        } else {
            // Apply virtual offset and vault-favoring rounding (floor)
            mul_div(
                assets,
                total_supply.checked_add(VIRTUAL_OFFSET).ok_or(StablecoinErrorV2::MathOverflow)?,
                total_assets.checked_add(1).ok_or(StablecoinErrorV2::MathOverflow)?,
                Rounding::Floor,
            ).ok_or(StablecoinErrorV2::MathOverflow)?
        };

        require!(shares_out >= min_shares_out, StablecoinErrorV2::SlippageExceeded);
        require!(shares_out > 0, StablecoinErrorV2::ZeroAmount);

        // Transfer assets to collateral vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_collateral_ata.to_account_info(),
            to: collateral_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::transfer(cpi_ctx, assets)?;

        // Update total assets in stablecoin state
        stablecoin.total_assets = stablecoin.total_assets.checked_add(assets).ok_or(StablecoinErrorV2::MathOverflow)?;

        // Mint shares to user
        let mint_key = stablecoin.mint;
        let stablecoin_seeds: &[&[&[u8]]] = &[&[
            STABLECOIN_SEED,
            mint_key.as_ref(),
            &[stablecoin.bump],
        ]];

        let cpi_accounts = MintTo {
            mint: mint.to_account_info(),
            to: ctx.accounts.user_shares_ata.to_account_info(),
            authority: stablecoin.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, stablecoin_seeds);
        token_2022::mint_to(cpi_ctx, shares_out)?;

        Ok(())
    }

    pub fn redeem(ctx: Context<Redeem>, shares: u64, min_assets_out: u64) -> Result<()> {
        require!(!ctx.accounts.stablecoin.paused, StablecoinErrorV2::Paused);
        require!(shares > 0, StablecoinErrorV2::ZeroAmount);

        let stablecoin = &mut ctx.accounts.stablecoin;
        let mint = &ctx.accounts.mint;
        let collateral_vault = &ctx.accounts.collateral_vault;

        let total_supply = mint.supply;
        let total_assets = stablecoin.total_assets;

        require!(shares <= total_supply, StablecoinErrorV2::InsufficientShares);
        require!(total_assets > 0, StablecoinErrorV2::InsufficientAssets);

        let assets_out = mul_div(
            shares,
            total_assets.checked_add(1).ok_or(StablecoinErrorV2::MathOverflow)?,
            total_supply.checked_add(VIRTUAL_OFFSET).ok_or(StablecoinErrorV2::MathOverflow)?,
            Rounding::Floor, // Vault-favoring rounding
        ).ok_or(StablecoinErrorV2::MathOverflow)?;
        
        require!(assets_out >= min_assets_out, StablecoinErrorV2::SlippageExceeded);
        require!(assets_out > 0, StablecoinErrorV2::ZeroAmount);

        // Burn shares from user
        let cpi_accounts = Burn {
            mint: mint.to_account_info(),
            from: ctx.accounts.user_shares_ata.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_2022::burn(cpi_ctx, shares)?;

        // Transfer assets from collateral vault to user
        let mint_key = stablecoin.mint;
        let stablecoin_seeds: &[&[&[u8]]] = &[&[
            STABLECOIN_SEED,
            mint_key.as_ref(),
            &[stablecoin.bump],
        ]];

        let cpi_accounts = Transfer {
            from: collateral_vault.to_account_info(),
            to: ctx.accounts.user_collateral_ata.to_account_info(),
            authority: stablecoin.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, stablecoin_seeds);
        token_2022::transfer(cpi_ctx, assets_out)?;

        // Update total assets in stablecoin state
        stablecoin.total_assets = stablecoin.total_assets.checked_sub(assets_out).ok_or(StablecoinErrorV2::MathOverflow)?;

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
}

#[derive(Accounts)]
#[instruction(decimals: u8, name: String, symbol: String, uri: String)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinV2::LEN,
        seeds = [STABLECOIN_SEED, mint.key().as_ref()],
        bump
    )]
    pub stablecoin: Account<'info, StablecoinV2>,

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
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = collateral_mint,
        associated_token::authority = stablecoin,
        associated_token::token_program = token_program,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: This is the mint of the collateral token.
    pub collateral_mint: UncheckedAccount<'info>,

    /// CHECK: The Token Metadata Program ID for CPI
    #[account(address = spl_token_metadata_interface::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Sync<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, StablecoinV2>,

    #[account(
        address = stablecoin.collateral_vault,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, StablecoinV2>,

    #[account(
        mut,
        address = stablecoin.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = stablecoin.collateral_vault,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_collateral_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_shares_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, StablecoinV2>,

    #[account(
        mut,
        address = stablecoin.mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        address = stablecoin.collateral_vault,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_collateral_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub user_shares_ata: InterfaceAccount<'info, TokenAccount>,

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
    pub stablecoin: Account<'info, StablecoinV2>,
}

#[derive(Accounts)]
pub struct SetTransferHook<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [STABLECOIN_SEED, stablecoin.mint.as_ref()],
        bump = stablecoin.bump,
        has_one = authority
    )]
    pub stablecoin: Account<'info, StablecoinV2>,

    #[account(mut, address = stablecoin.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
}
