// Gion Taxi "Wrong Turn": the server's client for the gion_escrow program on Solana devnet (solana/).
// Only the server uses this file; no key ever goes to a browser. The server's keypair (solana/.keys/server.json) is the
// game authority (it reports results) and pays every fee. Each player gets a burner keypair, kept here, that holds
// only that game's stake plus a little rent, and is swept back to the server when the game is paid out.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');

const KEYS = path.join(__dirname, 'solana', '.keys');
const PROGRAM_ID = new PublicKey(process.env.WT_PROGRAM || '4J4FopP5witLrMaxehCm54vGjnaGHmRSQYwiRzMRC7hG');
const RPC = process.env.WT_RPC || 'https://api.devnet.solana.com';
const BURNER_RENT = 1_000_000;   // lamports kept in each burner so tiny payouts never leave it below rent-exempt
const sha256 = (...parts) => crypto.createHash('sha256').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest();
const disc = name => sha256(Buffer.from('global:' + name)).subarray(0, 8);
const u8 = v => Buffer.from([v]);
const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b };
const i64 = v => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b };
const explorer = sig => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function loadKeypair(file) { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, 'utf8')))) }

class Chain {
  constructor() {
    this.server = loadKeypair(path.join(KEYS, 'server.json'));
    this.conn = new Connection(RPC, 'confirmed');
    this.burnerFile = path.join(KEYS, 'burners.json');
  }
  gamePda(gameId) { return PublicKey.findProgramAddressSync([Buffer.from('game'), this.server.publicKey.toBuffer(), u64(gameId)], PROGRAM_ID)[0] }
  ix(name, keys, data = Buffer.alloc(0)) { return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: Buffer.concat([disc(name), data]) }) }
  async send(ixs, extra = []) {
    const tx = new Transaction().add(...[].concat(ixs));
    tx.feePayer = this.server.publicKey;
    const signers = [this.server, ...extra.filter(k => !k.publicKey.equals(this.server.publicKey))];
    try { return await sendAndConfirmTransaction(this.conn, tx, signers, { commitment: 'confirmed', maxRetries: 5 }) }
    catch (e) {
      const logs = e.logs || e.transactionLogs || [];
      const why = logs.find(l => /Error Message:/.test(l)) || e.message;
      throw new Error(why.replace(/.*Error Message: /, '').trim());
    }
  }
  balance(pk) { return this.conn.getBalance(pk, 'confirmed') }
  // the game account as the program stores it (seat order is the order the joins landed, not the order they were sent)
  async readGame(game) {
    const a = await this.conn.getAccountInfo(game, 'confirmed'); if (!a) return null;
    const d = a.data; let o = 8 + 32 + 8;
    const stake = Number(d.readBigUInt64LE(o)); o += 16;
    const [status, outcome, imposter, n, revealed] = [d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4]]; o += 6;
    const players = []; for (let i = 0; i < n; i++) players.push(new PublicKey(d.subarray(o + i * 32, o + i * 32 + 32)));
    return { stake, status, outcome, imposter, n, revealed, players };
  }

  // burners: one per player per game, saved so a restarted server can still refund or sweep them
  newBurner(gameId, pid) {
    const k = Keypair.generate();
    let all = {}; try { all = JSON.parse(fs.readFileSync(this.burnerFile, 'utf8')) } catch {}
    (all[gameId] = all[gameId] || {})[pid] = Array.from(k.secretKey);
    fs.writeFileSync(this.burnerFile, JSON.stringify(all), { mode: 0o600 });
    return k;
  }
  forgetBurners(gameId) {
    try { const all = JSON.parse(fs.readFileSync(this.burnerFile, 'utf8')); delete all[gameId]; fs.writeFileSync(this.burnerFile, JSON.stringify(all), { mode: 0o600 }) } catch {}
  }

  async createGame(gameId, stake, { join = 300, play = 900, reveal = 120 } = {}, burners = []) {
    const game = this.gamePda(gameId);
    const ixs = [this.ix('create_game', [
      { pubkey: this.server.publicKey, isSigner: true, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], Buffer.concat([u64(gameId), u64(stake), i64(join), i64(play), i64(reveal)]))];
    for (const b of burners) ixs.push(SystemProgram.transfer({ fromPubkey: this.server.publicKey, toPubkey: b.publicKey, lamports: stake + BURNER_RENT }));
    return { game, sig: await this.send(ixs) };
  }
  join(game, burner, commitment) {
    return this.send(this.ix('join', [
      { pubkey: burner.publicKey, isSigner: true, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], Buffer.from(commitment)), [burner]);
  }
  authority(name, game, data) {
    return this.send(this.ix(name, [{ pubkey: this.server.publicKey, isSigner: true, isWritable: false }, { pubkey: game, isSigner: false, isWritable: true }], data));
  }
  lock(game, roleCommitment) { return this.authority('lock', game, Buffer.from(roleCommitment)) }
  report(game, outcome, imposter, roleSalt) { return this.authority('report', game, Buffer.concat([u8(outcome), u8(imposter), Buffer.from(roleSalt)])) }
  reveal(game, burner, wager, salt) {
    return this.send(this.ix('reveal', [{ pubkey: burner.publicKey, isSigner: true, isWritable: false }, { pubkey: game, isSigner: false, isWritable: true }],
      Buffer.concat([u64(wager), Buffer.from(salt)])), [burner]);
  }
  payout(name, game, players) {
    return this.send(this.ix(name, [
      { pubkey: this.server.publicKey, isSigner: true, isWritable: false },
      { pubkey: game, isSigner: false, isWritable: true },
      ...players.map(pk => ({ pubkey: pk, isSigner: false, isWritable: true })),
    ]));
  }
  settle(game, players) { return this.payout('settle', game, players) }
  refund(game, players) { return this.payout('refund', game, players) }
  closeGame(game) {
    return this.send(this.ix('close_game', [{ pubkey: this.server.publicKey, isSigner: true, isWritable: true }, { pubkey: game, isSigner: false, isWritable: true }]));
  }
  // return everything in the burners to the server (test SOL is recycled for the next game)
  async sweep(burners) {
    const ixs = [];
    for (const b of burners) { const bal = await this.balance(b.publicKey); if (bal > 0) ixs.push(SystemProgram.transfer({ fromPubkey: b.publicKey, toPubkey: this.server.publicKey, lamports: bal })) }
    return ixs.length ? this.send(ixs, burners) : null;
  }
}

// the commitments, byte for byte as the program checks them
const wagerCommitment = (game, player, wager, salt) => sha256(Buffer.from('gion-wager'), game.toBuffer(), player.toBuffer(), u64(wager), salt);
const roleCommitment = (game, imposter, salt) => sha256(Buffer.from('gion-role'), game.toBuffer(), u8(imposter), salt);

module.exports = { Chain, PROGRAM_ID, BURNER_RENT, wagerCommitment, roleCommitment, explorer };
