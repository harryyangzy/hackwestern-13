# Gion Taxi "Wrong Turn": wager escrow (Solana Devnet, test SOL only)

One player in the crew is secretly the imposter. Before the trip, every player deposits the same stake and
privately commits a wager; the game server reports who won; the program pays out by fixed rules.

## Trust model
- **The game server** picks the imposter, checks the trip result the laptop sends, and signs `report`. You trust it
  to report honestly. It also holds each player's devnet burner key (keys never reach a browser).
- **Solana** holds the deposits and enforces everything else: equal deposits, wager commitments, deadlines,
  payout math, and refunds. The server commits to the imposter's seat at `lock` and must open that commitment at
  `report`, so it can't pick the imposter after seeing the result. If it never reports, anyone can refund.

## Rules
- Stake S is the same for everyone (deposits are public, so equal deposits hide wager sizes). A wager is 10–100 % of S.
- Wager commitment: `sha256("gion-wager" ‖ game ‖ player ‖ wager_u64_le ‖ salt32)`, computed and kept on the phone.
- Role commitment: `sha256("gion-role" ‖ game ‖ imposter_seat_u8 ‖ salt32)`, made by the server at `lock`.
- Crew wins if the trip succeeds or they vote out the imposter; otherwise the imposter wins.
- Payout: everyone who revealed gets back `S − w`. Winners also get `w` plus a share of the losing pool in proportion
  to `w`. The losing pool is the revealed losers' wagers plus the full stake of anyone who didn't reveal.
  Rounding dust goes to the first winner. Total paid always equals `n × S` (`src/payout.rs`).
- Edge cases: no winner revealed → revealed players get S back and split the forfeits; nobody revealed → everyone
  gets S back. Server abort before the result, join deadline passed, or no result by the result deadline → full refunds.
  A player who disconnects mid-trip can still reveal afterwards (the salt is kept on their phone).

## Flow
`create_game` → `join` ×3–4 → `lock` → (trip, off-chain) → `report` → `reveal` ×n → `settle`
(or `refund`), then `close_game` returns the account rent to the server.

## Build, test, deploy
```bash
cd gion-drive/solana
export PATH="$(brew --prefix rustup)/bin:$HOME/.cargo/bin:$PATH"   # cargo-build-sbf needs rustup (keg-only)
anchor build                       # → target/deploy/gion_escrow.so, target/idl/gion_escrow.json
cargo test                         # payout unit tests + the full loop on a local SVM (LiteSVM)
solana balance                     # server wallet; fund it at https://faucet.solana.com (Devnet)
anchor deploy --provider.cluster devnet
```
Keys live in `.keys/` (git-ignored): `server.json` (authority and fee payer) and `program.json` (program id
`4J4FopP5witLrMaxehCm54vGjnaGHmRSQYwiRzMRC7hG`). Losing `program.json` means the program can't be upgraded.
