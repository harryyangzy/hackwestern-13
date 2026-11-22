//! Payout rules, kept free of Solana types so they can be unit-tested on their own.
//!
//! Every player deposits the same stake S, so deposits on-chain say nothing about wagers. Each player privately
//! committed a wager w (min_wager ≤ w ≤ S). After the result:
//!   * the unwagered part S − w always comes back to a player who revealed;
//!   * a player who did not reveal forfeits the whole S;
//!   * winners get their own w back plus a share of the "losing pool" in proportion to w. The losing pool is the
//!     revealed losers' wagers plus every non-revealer's forfeited stake;
//!   * if no winner revealed, revealed players get S back and the forfeits are split equally among them;
//!   * if nobody revealed, everyone gets S back (there is nobody to pay instead).
//! Totals always equal n × S: lamports never stay stuck in the game account or appear from nowhere.

pub const MAX_PLAYERS: usize = 4;

#[derive(Clone, Copy, Debug, Default)]
pub struct Seat {
    pub revealed: bool,
    pub wager: u64,
    pub winner: bool,
}

pub fn payouts(stake: u64, seats: &[Seat]) -> [u64; MAX_PLAYERS] {
    let mut out = [0u64; MAX_PLAYERS];
    let n = seats.len().min(MAX_PLAYERS);
    let seats = &seats[..n];
    let revealed: Vec<usize> = (0..n).filter(|&i| seats[i].revealed).collect();
    if revealed.is_empty() {
        for o in out.iter_mut().take(n) { *o = stake }
        return out;
    }
    let mut pool: u128 = 0; // what the winners split
    let mut win_sum: u128 = 0;
    for (i, s) in seats.iter().enumerate() {
        if !s.revealed { pool += stake as u128; continue }
        out[i] = stake - s.wager; // unwagered part always comes back
        if s.winner { win_sum += s.wager as u128 } else { pool += s.wager as u128 }
    }
    let first;
    if win_sum > 0 {
        let winners: Vec<usize> = revealed.iter().copied().filter(|&i| seats[i].winner && seats[i].wager > 0).collect();
        first = winners[0];
        let mut paid: u128 = 0;
        for &i in &winners {
            let share = pool * seats[i].wager as u128 / win_sum;
            out[i] += seats[i].wager + share as u64;
            paid += share;
        }
        out[first] += (pool - paid) as u64; // rounding dust
    } else {
        // nobody on the winning side revealed: revealed players keep their whole stake and split the forfeits
        first = revealed[0];
        let forfeits: u128 = seats.iter().filter(|s| !s.revealed).count() as u128 * stake as u128;
        let each = forfeits / revealed.len() as u128;
        for &i in &revealed { out[i] = stake + each as u64 }
        out[first] += (forfeits - each * revealed.len() as u128) as u64;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    const S: u64 = 100_000_000; // 0.1 SOL
    fn seat(revealed: bool, wager: u64, winner: bool) -> Seat { Seat { revealed, wager, winner } }
    fn total(o: &[u64]) -> u64 { o.iter().sum() }

    #[test]
    fn crew_wins_splits_imposter_wager_pro_rata() {
        // seat 0 is the imposter and loses 60; crew wagered 10, 30, 60
        let s = [seat(true, 60_000_000, false), seat(true, 10_000_000, true), seat(true, 30_000_000, true), seat(true, 60_000_000, true)];
        let o = payouts(S, &s);
        assert_eq!(o[0], 40_000_000);
        assert_eq!(o[1], S + 6_000_000);
        assert_eq!(o[2], S + 18_000_000);
        assert_eq!(o[3], S + 36_000_000);
        assert_eq!(total(&o), 4 * S);
    }

    #[test]
    fn imposter_wins_takes_crew_wagers() {
        let s = [seat(true, 50_000_000, true), seat(true, 10_000_000, false), seat(true, 20_000_000, false)];
        let o = payouts(S, &s);
        assert_eq!(o, [S + 30_000_000, 90_000_000, 80_000_000, 0]);
        assert_eq!(total(&o), 3 * S);
    }

    #[test]
    fn non_revealer_forfeits_whole_stake_to_winners() {
        let s = [seat(true, 20_000_000, false), seat(false, 0, true), seat(true, 10_000_000, true)];
        let o = payouts(S, &s);
        assert_eq!(o[1], 0);
        assert_eq!(o[0], 80_000_000);
        assert_eq!(o[2], S + 20_000_000 + S);
        assert_eq!(total(&o), 3 * S);
    }

    #[test]
    fn no_winner_revealed_forfeits_split_among_revealed() {
        let s = [seat(false, 0, true), seat(true, 30_000_000, false), seat(true, 70_000_000, false)];
        let o = payouts(S, &s);
        assert_eq!(o, [0, S + S / 2, S + S / 2, 0]);
    }

    #[test]
    fn nobody_revealed_refunds_everyone() {
        let s = [seat(false, 0, true), seat(false, 0, false), seat(false, 0, false)];
        assert_eq!(payouts(S, &s), [S, S, S, 0]);
    }

    #[test]
    fn rounding_dust_goes_to_first_winner_and_totals_hold() {
        let s = [seat(true, 33_333_333, false), seat(true, 10_000_001, true), seat(true, 10_000_003, true), seat(true, 10_000_007, true)];
        let o = payouts(S, &s);
        assert_eq!(total(&o), 4 * S);
    }
}
