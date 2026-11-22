//! Gion Taxi "Wrong Turn": an escrow for one trip's secret wagers. Devnet only.
//!
//! Trust model: the game server (the `authority`) decides who the imposter is and whether the crew won; Solana
//! holds the deposits, checks every commitment and pays out by fixed rules. The server commits to the imposter's
//! seat before the trip (so it cannot change it afterwards), and anyone can force full refunds if the server
//! never reports a result.
//!
//! Flow: create_game → join ×3..4 (equal stake + wager commitment) → lock (role commitment) → report (outcome +
//! imposter + role salt) → reveal ×n (wager + salt) → settle. Or refund at any point before a result.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

pub mod payout;
use payout::{payouts, Seat, MAX_PLAYERS};

declare_id!("4J4FopP5witLrMaxehCm54vGjnaGHmRSQYwiRzMRC7hG");

pub const GAME_SEED: &[u8] = b"game";
pub const WAGER_TAG: &[u8] = b"gion-wager";
pub const ROLE_TAG: &[u8] = b"gion-role";
pub const MIN_PLAYERS: u8 = 3;
pub const MIN_STAKE: u64 = 1_000_000; // 0.001 SOL
pub const MAX_STAKE: u64 = 1_000_000_000; // 1 SOL: test tokens only

#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Status { Open = 0, Locked = 1, Reported = 2, Settled = 3, Refunded = 4 }
pub const CREW_WINS: u8 = 1;
pub const IMPOSTER_WINS: u8 = 2;

#[program]
pub mod gion_escrow {
    use super::*;

    /// The server opens a game. Every player will deposit exactly `stake`; wagers are 10–100 % of it.
    pub fn create_game(ctx: Context<CreateGame>, game_id: u64, stake: u64, join_secs: i64, play_secs: i64, reveal_secs: i64) -> Result<()> {
        require!((MIN_STAKE..=MAX_STAKE).contains(&stake), EscrowError::BadStake);
        require!(join_secs > 0 && play_secs > 0 && reveal_secs > 0 && join_secs <= 3600 && play_secs <= 3600 && reveal_secs <= 3600, EscrowError::BadWindow);
        let now = Clock::get()?.unix_timestamp;
        let g = &mut ctx.accounts.game;
        g.authority = ctx.accounts.authority.key();
        g.game_id = game_id;
        g.stake = stake;
        g.min_wager = stake / 10;
        g.status = Status::Open as u8;
        g.join_deadline = now + join_secs;
        g.play_secs = play_secs;
        g.reveal_secs = reveal_secs;
        g.bump = ctx.bumps.game;
        Ok(())
    }

    /// A player deposits the stake and commits sha256("gion-wager" ‖ game ‖ player ‖ wager_le ‖ salt).
    /// The deposit is the same for everyone, so the transaction reveals nothing about the wager.
    pub fn join(ctx: Context<Join>, commitment: [u8; 32]) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require!(g.status == Status::Open as u8, EscrowError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= g.join_deadline, EscrowError::TooLate);
        let me = ctx.accounts.player.key();
        let n = g.n_players as usize;
        require!(n < MAX_PLAYERS, EscrowError::Full);
        require!(!g.players[..n].contains(&me), EscrowError::AlreadyJoined);
        g.players[n] = me;
        g.commitments[n] = commitment;
        g.n_players += 1;
        let stake = g.stake;
        anchor_lang::system_program::transfer(
            CpiContext::new(anchor_lang::system_program::ID, anchor_lang::system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.game.to_account_info(),
            }),
            stake,
        )
    }

    /// The server starts the trip and commits sha256("gion-role" ‖ game ‖ imposter_seat ‖ salt).
    pub fn lock(ctx: Context<AuthorityOnly>, role_commitment: [u8; 32]) -> Result<()> {
        let g = &mut ctx.accounts.game;
        require!(g.status == Status::Open as u8, EscrowError::WrongStatus);
        require!(g.n_players >= MIN_PLAYERS, EscrowError::NotEnoughPlayers);
        g.role_commitment = role_commitment;
        g.result_deadline = Clock::get()?.unix_timestamp + g.play_secs;
        g.status = Status::Locked as u8;
        Ok(())
    }

    /// The server reports the result and opens the role commitment, proving the imposter was fixed before the trip.
    pub fn report(ctx: Context<AuthorityOnly>, outcome: u8, imposter: u8, role_salt: [u8; 32]) -> Result<()> {
        let key = ctx.accounts.game.key();
        let g = &mut ctx.accounts.game;
        require!(g.status == Status::Locked as u8, EscrowError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= g.result_deadline, EscrowError::TooLate);
        require!(outcome == CREW_WINS || outcome == IMPOSTER_WINS, EscrowError::BadOutcome);
        require!(imposter < g.n_players, EscrowError::BadSeat);
        let h = hashv(&[ROLE_TAG, key.as_ref(), &[imposter], &role_salt]).to_bytes();
        require!(h == g.role_commitment, EscrowError::BadReveal);
        g.outcome = outcome;
        g.imposter = imposter;
        g.reveal_deadline = Clock::get()?.unix_timestamp + g.reveal_secs;
        g.status = Status::Reported as u8;
        Ok(())
    }

    /// A player opens their wager commitment. Only after the result, so no wager is visible during the trip.
    pub fn reveal(ctx: Context<Reveal>, wager: u64, salt: [u8; 32]) -> Result<()> {
        let key = ctx.accounts.game.key();
        let g = &mut ctx.accounts.game;
        require!(g.status == Status::Reported as u8, EscrowError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= g.reveal_deadline, EscrowError::TooLate);
        let me = ctx.accounts.player.key();
        let i = g.players[..g.n_players as usize].iter().position(|p| *p == me).ok_or(EscrowError::NotAPlayer)?;
        require!(g.revealed & (1 << i) == 0, EscrowError::AlreadyRevealed);
        require!(wager >= g.min_wager && wager <= g.stake, EscrowError::BadWager);
        let h = hashv(&[WAGER_TAG, key.as_ref(), me.as_ref(), &wager.to_le_bytes(), &salt]).to_bytes();
        require!(h == g.commitments[i], EscrowError::BadReveal);
        g.wagers[i] = wager;
        g.revealed |= 1 << i;
        Ok(())
    }

    /// Anyone pays out once everyone revealed or the reveal window closed. remaining_accounts = players in seat order.
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        let g = &ctx.accounts.game;
        require!(g.status == Status::Reported as u8, EscrowError::WrongStatus);
        let n = g.n_players as usize;
        let all = g.revealed.count_ones() as usize == n;
        require!(all || Clock::get()?.unix_timestamp > g.reveal_deadline, EscrowError::TooEarly);
        let seats: Vec<Seat> = (0..n).map(|i| Seat {
            revealed: g.revealed & (1 << i) != 0,
            wager: g.wagers[i],
            winner: (i as u8 == g.imposter) == (g.outcome == IMPOSTER_WINS),
        }).collect();
        let out = payouts(g.stake, &seats);
        pay(&ctx.accounts.game, ctx.remaining_accounts, &out[..n])?;
        ctx.accounts.game.status = Status::Settled as u8;
        Ok(())
    }

    /// Full refunds: the server may abort any time before a result; anyone may once the join or result deadline passed.
    pub fn refund<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        let g = &ctx.accounts.game;
        let now = Clock::get()?.unix_timestamp;
        let by_server = ctx.accounts.caller.key() == g.authority;
        let ok = match g.status {
            s if s == Status::Open as u8 => by_server || now > g.join_deadline,
            s if s == Status::Locked as u8 => by_server || now > g.result_deadline,
            _ => false,
        };
        require!(ok, EscrowError::WrongStatus);
        let n = g.n_players as usize;
        let out = [g.stake; MAX_PLAYERS];
        pay(&ctx.accounts.game, ctx.remaining_accounts, &out[..n])?;
        ctx.accounts.game.status = Status::Refunded as u8;
        Ok(())
    }

    /// The server takes back the account's rent once the game is paid out.
    pub fn close_game(ctx: Context<CloseGame>) -> Result<()> {
        let s = ctx.accounts.game.status;
        require!(s == Status::Settled as u8 || s == Status::Refunded as u8, EscrowError::WrongStatus);
        Ok(())
    }
}

fn pay<'info>(game: &Account<'info, Game>, accounts: &[AccountInfo<'info>], amounts: &[u64]) -> Result<()> {
    require!(accounts.len() == amounts.len(), EscrowError::BadAccounts);
    let gi = game.to_account_info();
    for (i, (acc, &amt)) in accounts.iter().zip(amounts).enumerate() {
        require_keys_eq!(acc.key(), game.players[i], EscrowError::BadAccounts);
        require!(acc.is_writable, EscrowError::BadAccounts);
        if amt == 0 { continue }
        **gi.try_borrow_mut_lamports()? = gi.lamports().checked_sub(amt).ok_or(EscrowError::Insolvent)?;
        **acc.try_borrow_mut_lamports()? = acc.lamports().checked_add(amt).ok_or(EscrowError::Insolvent)?;
    }
    // the game account must still hold its rent after paying out
    let rent = Rent::get()?.minimum_balance(gi.data_len());
    require!(gi.lamports() >= rent, EscrowError::Insolvent);
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub authority: Pubkey,
    pub game_id: u64,
    pub stake: u64,
    pub min_wager: u64,
    pub status: u8,
    pub outcome: u8,
    pub imposter: u8,
    pub n_players: u8,
    pub revealed: u8, // bitmask by seat
    pub bump: u8,
    pub players: [Pubkey; 4],
    pub commitments: [[u8; 32]; 4],
    pub wagers: [u64; 4],
    pub role_commitment: [u8; 32],
    pub join_deadline: i64,
    pub result_deadline: i64,
    pub reveal_deadline: i64,
    pub play_secs: i64,
    pub reveal_secs: i64,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Game::INIT_SPACE,
              seeds = [GAME_SEED, authority.key().as_ref(), &game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, game.authority.as_ref(), &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuthorityOnly<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority, seeds = [GAME_SEED, game.authority.as_ref(), &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct Reveal<'info> {
    pub player: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, game.authority.as_ref(), &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [GAME_SEED, game.authority.as_ref(), &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Account<'info, Game>,
}

#[derive(Accounts)]
pub struct CloseGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority, close = authority,
              seeds = [GAME_SEED, game.authority.as_ref(), &game.game_id.to_le_bytes()], bump = game.bump)]
    pub game: Account<'info, Game>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Stake must be between 0.001 and 1 SOL")] BadStake,
    #[msg("Time windows must be 1 s to 1 h")] BadWindow,
    #[msg("Not allowed in the game's current state")] WrongStatus,
    #[msg("The deadline for this step has passed")] TooLate,
    #[msg("The reveal window is still open")] TooEarly,
    #[msg("The game is full")] Full,
    #[msg("Already joined")] AlreadyJoined,
    #[msg("At least three players are needed")] NotEnoughPlayers,
    #[msg("Outcome must be crew (1) or imposter (2)")] BadOutcome,
    #[msg("No such seat")] BadSeat,
    #[msg("The revealed values don't match the commitment")] BadReveal,
    #[msg("Not a player in this game")] NotAPlayer,
    #[msg("Already revealed")] AlreadyRevealed,
    #[msg("Wager must be 10-100 % of the stake")] BadWager,
    #[msg("Player accounts missing or out of order")] BadAccounts,
    #[msg("Payout exceeds the escrow")] Insolvent,
}
