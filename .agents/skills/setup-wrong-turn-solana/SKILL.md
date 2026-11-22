---
name: setup-wrong-turn-solana
description: Get Gion Taxi's "Wrong Turn" mode (Solana devnet wagers) running on a fresh clone of this repo. Use when Wrong Turn is greyed out or unavailable in the lobby, the server logs Solana/wallet/faucet errors, someone "can't do the Solana part", or a teammate is setting up the crew server on their own machine for the first time.
---

# Set up Wrong Turn (Solana devnet) on a new machine

Wrong Turn is the deception mode in `gion-drive/`. The Node server (`gion-drive/server.js`) runs an escrow on
Solana **devnet** through `gion-drive/chain.js` and `gion-drive/wt-server.js`. Only test SOL is involved; nobody needs a
real wallet, a browser extension or real money.

## What you need to know first

- The escrow program is already deployed on devnet (`4J4FopP5witLrMaxehCm54vGjnaGHmRSQYwiRzMRC7hG`). **Do not build or
  deploy it.** You do not need Rust, Anchor or the Solana CLI to play.
- The server signs everything with its own wallet in `gion-drive/solana/.keys/server.json`. That folder is git-ignored,
  so a fresh clone has no wallet. The server makes one automatically on first start. The program accepts any wallet as a
  game's authority, so **nobody needs Harry's key**. Never commit `.keys/` or paste its contents anywhere.
- Players' phones never hold keys; the server keeps a throwaway "burner" wallet per player.

## Steps

1. Node 18 or newer: `node -v`.
2. Install the Solana library (only Wrong Turn needs it):
   ```bash
   cd gion-drive && npm install
   ```
3. Start the server once and read its log:
   ```bash
   node server.js
   ```
   Look for lines tagged `[wrong turn]`:
   - `made a new server wallet in solana/.keys/server.json` (first run only)
   - `server wallet <ADDRESS> has 0 devnet SOL`
   - `not enough SOL ... Fund the server wallet <ADDRESS> ...`
4. Fund that wallet. This step needs the human, because the faucet has a captcha / GitHub sign-in:
   - Give them the `<ADDRESS>` from the log and ask them to open https://faucet.solana.com, choose **Devnet**,
     paste the address and request SOL. About **0.05 SOL** covers a 4-player game with the default 0.01 SOL stake;
     ask for 1 SOL so it lasts. (The automatic RPC airdrop is shut off on public devnet, so it will fail; that's expected.)
   - If they have the Solana CLI they can instead run `solana airdrop 1 <ADDRESS> --url devnet`, which is usually rate-limited.
5. Restart `node server.js`. The log should now say the wallet has enough SOL. Open http://localhost:8090, press
   *Play with phones*, and Wrong Turn should be selectable in the lobby. With fewer than 3 phones, tick
   "Fill empty seats with bots".

## Troubleshooting

| Symptom | Fix |
|---|---|
| Lobby says "Run `npm install` in gion-drive first." | Step 2. |
| "The server wallet has X SOL, needs about Y" | Step 4, then start a new trip (no restart needed). |
| `could not reach Solana devnet` | Network issue or devnet is down. Campus Wi-Fi may block it; try a hotspot. A custom RPC can be set with `WT_RPC=<url> node server.js`. |
| Want cheaper games | `WT_STAKE=0.001 node server.js` lowers each player's stake. |
| A game crashed mid-way | Leftover burners are in `solana/.keys/burners.json`; the stakes come back via the program's refund after its deadlines. Don't delete that file while a game is running. |

## Don't

- Don't commit anything under `gion-drive/solana/.keys/` or `node_modules/`.
- Don't change `chain.js`'s program id or redeploy the program to "fix" setup problems; setup problems are almost always
  a missing `npm install` or an unfunded wallet.
- Don't ask the human for Harry's `server.json`; their own wallet is the intended setup.

More detail: `gion-drive/README.md` (how Wrong Turn plays) and `gion-drive/solana/README.md` (rules and trust model).
