// Gion Taxi "Wrong Turn" (deception mode), the server side. The secrets live here, never on the laptop:
// the server picks the imposter, tells only that phone, passes the imposter's sabotage to the laptop without saying who
// sent it, counts the vote, and runs the wager escrow on Solana devnet through chain.js.
//
// Message flow (all `dx-*`; the server handles them itself and never relays them):
//   laptop dx-setup {seats, goal}   → escrow opened, burners funded, each phone gets dx-role (its own role only)
//   phone  dx-commit {c}            → join tx (equal stake + wager hash); when all joined: lock tx (role hash) → dx-locked
//   laptop dx-start                 → the trip is on;  phone dx-sab {kind} → laptop dx-glitch {kind} (no sender)
//   laptop dx-result {yen, fares}   → vote (dx-vote); phone dx-vote-for {seat}; tally → report tx → dx-reveal
//   phone  dx-reveal-v {wager,salt} → reveal tx; all revealed or window over → settle tx → dx-final to everyone
//   laptop dx-abort                 → refund tx (full stakes back) → dx-final {aborted}
// Driving input never touches the chain.

const crypto = require('crypto');
let chainMod = null, chain = null, chainErr = null;
try { chainMod = require('./chain.js'); chain = new chainMod.Chain() }
catch (e) { chainErr = /Cannot find module '@solana/.test(e.message) ? 'Run `npm install` in gion-drive first.' : e.message }

const STAKE = Math.round((+process.env.WT_STAKE || 0.01) * 1e9);   // lamports each player deposits (test SOL)
const SAB_CHARGES = 3, SAB_COOLDOWN_MS = 12000, VOTE_MS = 25000, REVEAL_MS = 45000;
const KINDS = { steer: 'drift', pedals: 'stall', nav: 'decoy', ops: 'jam', shoot: 'drift', wipe: 'jam' };   // main replaced the navigator with shoot + wipe
const DEFAULT_GOAL = 3000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[wrong turn]', ...a);
const hex = b => Buffer.from(b).toString('hex');

function available() { return chain ? null : chainErr || 'Solana is not set up' }
const FAUCET = 'https://faucet.solana.com';
const needFor = n => n * (STAKE + chainMod.BURNER_RENT) + 5_000_000;   // stakes + burner rent + game account rent and fees
const fundHint = () => `Fund the server wallet ${chain.server.publicKey.toBase58()} with devnet SOL at ${FAUCET} (choose Devnet).`;

// on start: say which wallet this server uses, and top it up from the devnet faucet if it can't cover a 4-player game
if (chain) (async () => {
  try {
    if (chain.createdWallet) log('made a new server wallet in solana/.keys/server.json (git-ignored, keep it)');
    let bal = await chain.balance(chain.server.publicKey);
    log(`server wallet ${chain.server.publicKey.toBase58()} has ${bal / 1e9} devnet SOL`);
    if (bal >= needFor(4)) return;
    try { await chain.airdrop(1e9); bal = await chain.balance(chain.server.publicKey); log(`airdropped 1 devnet SOL, now ${bal / 1e9}`) }
    catch { log('not enough SOL for Wrong Turn and the RPC airdrop is unavailable. ' + fundHint()) }
  } catch (e) { log('could not reach Solana devnet: ' + e.message) }
})();

// helpers given by server.js: toHost(room, msg), toPhone(room, pid, msg), toPhones(room, msg)
function create(io) {
  const H = (room, m) => io.toHost(room, m);
  const P = (room, pid, m) => io.toPhone(room, pid, m);
  const ALL = (room, m) => { io.toPhones(room, m); io.toHost(room, m) };
  const status = (room, extra = {}) => {
    const w = room.wt; if (!w) return;
    ALL(room, { t: 'dx-status', phase: w.phase, n: w.seats.length, committed: Object.keys(w.commits).length,
      revealed: Object.keys(w.reveals).length, voted: Object.keys(w.votes).length, stakeSol: w.stake / 1e9, ...extra });
  };
  const fail = (room, why) => {
    log(`room ${room.code}: ${why}`);
    H(room, { t: 'dx-error', why }); io.toPhones(room, { t: 'dx-error', why });
  };

  async function setup(room, m) {
    const why = available();
    if (why) return H(room, { t: 'dx-error', why });
    if (room.wt && !['done', 'error'].includes(room.wt.phase)) return H(room, { t: 'dx-error', why: 'A Wrong Turn trip is already running.' });
    const seats = (Array.isArray(m.seats) ? m.seats : []).filter(s => s && room.phones.get(s.pid)?.client).slice(0, 4)
      .map(s => ({ pid: s.pid, name: String(s.name || 'Player').slice(0, 20), color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#888888',
        roles: (Array.isArray(s.roles) ? s.roles : []).filter(r => KINDS[r]) }));
    // test mode: bots fill the empty seats up to three (the program needs three players on-chain)
    if (m.bots && seats.length >= 1) {
      const used = new Set(seats.map(s => s.color)), palette = ['#c8513a', '#36594b', '#c9932c', '#4f6d8a'];
      for (let i = 0; seats.length < 3; i++) seats.push({ pid: 'bot' + i, name: 'Bot ' + 'ABC'[i], color: palette.find(c => !used.has(c) && used.add(c)) || '#888888', roles: [], bot: true });
    }
    if (seats.length < 3) return H(room, { t: 'dx-error', why: 'Wrong Turn needs three or four connected phones.' });
    try {
      const bal = await chain.balance(chain.server.publicKey);
      if (bal < needFor(seats.length)) return H(room, { t: 'dx-error', why: `The server wallet has ${bal / 1e9} SOL, needs about ${needFor(seats.length) / 1e9}. ` + fundHint() });
    } catch (e) { return H(room, { t: 'dx-error', why: 'Could not reach Solana devnet: ' + e.message }) }
    if (room.wt && !['done', 'error'].includes(room.wt.phase)) return;   // a second setup landed while we checked the balance
    const gameId = Date.now(), imposterPid = seats[crypto.randomInt(seats.length)].pid;
    const w = room.wt = { phase: 'setup', gameId, game: null, stake: STAKE, goal: Math.max(500, Math.min(20000, +m.goal || DEFAULT_GOAL)),
      seats, imposterPid, roleSalt: crypto.randomBytes(32), burners: {}, commits: {}, chainSeat: {}, sab: { left: SAB_CHARGES, last: 0 },
      votes: {}, reveals: {}, txs: {}, result: null, timer: null };
    for (const s of seats) w.burners[s.pid] = chain.newBurner(gameId, s.pid);
    status(room, { msg: 'Opening the escrow on Solana devnet…' });
    log(`room ${room.code}: game ${gameId}, ${seats.length} players, stake ${STAKE / 1e9} SOL`);
    try {
      const r = await chain.createGame(gameId, STAKE, { join: 300, play: 900, reveal: Math.ceil(REVEAL_MS / 1000) + 5 }, Object.values(w.burners));
      w.game = r.game; w.txs.create = r.sig;
    } catch (e) { w.phase = 'error'; return fail(room, 'Could not open the escrow: ' + e.message) }
    w.phase = 'commit';
    for (const s of seats) if (!s.bot) sendRole(room, s.pid);
    status(room);
    for (const s of seats) if (s.bot) {   // a bot picks a random wager and locks it in like a phone would
      const wager = Math.round(w.stake * (1 + crypto.randomInt(10)) / 10), salt = crypto.randomBytes(32);
      (w.botSecrets = w.botSecrets || {})[s.pid] = { wager, salt: salt.toString('hex') };
      commit(room, s.pid, { c: hex(chainMod.wagerCommitment(w.game, w.burners[s.pid].publicKey, wager, salt)) });
    }
  }
  const bots = w => w.seats.filter(s => s.bot);
  // a bot imposter sabotages at random moments during the trip
  function botSabotage(room) {
    const w = room.wt, imp = w.seats.find(s => s.pid === w.imposterPid);
    if (!imp || !imp.bot) return;
    const next = () => {
      if (w.phase !== 'driving' || w.sab.left <= 0) return;
      w.sab.left--; w.sab.last = Date.now();
      H(room, { t: 'dx-glitch', kind: ['drift', 'stall', 'jam'][crypto.randomInt(3)] });
      w.botTimer = setTimeout(next, 14000 + crypto.randomInt(12000));
    };
    w.botTimer = setTimeout(next, 8000 + crypto.randomInt(10000));
  }
  function sendRole(room, pid) {
    const w = room.wt, s = w.seats.find(x => x.pid === pid); if (!s || !w.game) return;
    const imp = pid === w.imposterPid;
    P(room, pid, { t: 'dx-role', imposter: imp, game: hex(w.game.toBuffer()), me: hex(w.burners[pid].publicKey.toBuffer()),
      gameId: w.gameId, stake: w.stake, minWager: Math.floor(w.stake / 10), goal: w.goal, committed: !!w.commits[pid],
      kinds: imp ? [...new Set(s.roles.map(r => KINDS[r]))] : [], charges: imp ? w.sab.left : 0, quiet: w.phase !== 'commit',
      seats: w.seats.map(x => ({ pid: x.pid, name: x.name, color: x.color })) });
  }
  async function commit(room, pid, m) {
    const w = room.wt;
    if (!w || w.phase !== 'commit' || w.commits[pid] !== undefined || !w.burners[pid]) return;
    if (typeof m.c !== 'string' || !/^[0-9a-f]{64}$/.test(m.c)) return;
    w.commits[pid] = null;   // in flight
    try { await chain.join(w.game, w.burners[pid], Buffer.from(m.c, 'hex')); w.commits[pid] = m.c }
    catch (e) { delete w.commits[pid]; P(room, pid, { t: 'dx-error', why: 'Could not lock in your wager: ' + e.message }); return }
    P(room, pid, { t: 'dx-committed' });
    status(room);
    if (w.seats.every(s => w.commits[s.pid])) lock(room);
  }
  async function lock(room) {
    const w = room.wt; w.phase = 'locking'; status(room, { msg: 'Sealing the imposter on-chain…' });
    try {
      // seats on-chain are in the order the joins landed; the role commitment uses that seat number
      const g = await chain.readGame(w.game);
      for (const s of w.seats) w.chainSeat[s.pid] = g.players.findIndex(p => p.equals(w.burners[s.pid].publicKey));
      w.txs.lock = await chain.lock(w.game, chainMod.roleCommitment(w.game, w.chainSeat[w.imposterPid], w.roleSalt));
    } catch (e) { w.phase = 'error'; return fail(room, 'Could not seal the game: ' + e.message) }
    w.phase = 'locked';
    ALL(room, { t: 'dx-locked', tx: chainMod.explorer(w.txs.lock) });
    status(room);
  }
  function sabotage(room, pid, m) {
    const w = room.wt;
    if (!w || w.phase !== 'driving' || pid !== w.imposterPid) return;
    const s = w.seats.find(x => x.pid === pid), kinds = [...new Set(s.roles.map(r => KINDS[r]))];
    const kind = kinds.includes(m.kind) ? m.kind : kinds[0];
    const now = Date.now();
    if (!kind || w.sab.left <= 0 || now - w.sab.last < SAB_COOLDOWN_MS) return P(room, pid, { t: 'dx-sab-ack', ok: false, left: w.sab.left, wait: Math.max(0, SAB_COOLDOWN_MS - (now - w.sab.last)) });
    w.sab.left--; w.sab.last = now;
    H(room, { t: 'dx-glitch', kind });   // no sender: the laptop can't tell who did it
    P(room, pid, { t: 'dx-sab-ack', ok: true, kind, left: w.sab.left, wait: SAB_COOLDOWN_MS });
  }
  function result(room, m) {
    const w = room.wt;
    if (!w || w.phase !== 'driving') return;
    const yen = Math.max(0, Math.min(1e6, Math.round(+m.yen || 0))), fares = Math.max(0, Math.min(100, Math.round(+m.fares || 0)));
    // the laptop runs the physics; the server checks the summary is plausible before it signs anything
    const shift = (Date.now() - w.startedAt) / 1000;
    const plausible = yen <= fares * 4000 && shift >= 20 && shift <= 900;
    w.result = { yen, fares, success: plausible && yen >= w.goal, plausible };
    w.phase = 'vote'; w.votes = {};
    ALL(room, { t: 'dx-vote', secs: VOTE_MS / 1000, success: w.result.success, yen, goal: w.goal,
      seats: w.seats.map(s => ({ pid: s.pid, name: s.name, color: s.color })) });
    w.timer = setTimeout(() => tally(room), VOTE_MS);
    for (const b of bots(w)) setTimeout(() => {   // bots vote for someone at random (never themselves)
      const others = w.seats.filter(s => s.pid !== b.pid);
      vote(room, b.pid, { pid: others[crypto.randomInt(others.length)].pid });
    }, 2000 + crypto.randomInt(4000));
  }
  function vote(room, pid, m) {
    const w = room.wt;
    if (!w || w.phase !== 'vote' || w.votes[pid] !== undefined || !w.seats.some(s => s.pid === pid)) return;
    w.votes[pid] = w.seats.some(s => s.pid === m.pid) && m.pid !== pid ? m.pid : null;   // null = not sure
    status(room);
    if (Object.keys(w.votes).length === w.seats.length) { clearTimeout(w.timer); tally(room) }
  }
  async function tally(room) {
    const w = room.wt; if (!w || w.phase !== 'vote') return;
    w.phase = 'reporting';
    const against = Object.values(w.votes).filter(v => v === w.imposterPid).length;
    w.caught = against * 2 > w.seats.length;   // a strict majority of the whole crew
    w.crewWins = w.result.success || w.caught;
    status(room, { msg: 'Reporting the result to Solana…' });
    try { w.txs.report = await chain.report(w.game, w.crewWins ? 1 : 2, w.chainSeat[w.imposterPid], w.roleSalt) }
    catch (e) { w.phase = 'error'; return fail(room, 'Could not report the result: ' + e.message + '. Stakes can be refunded once the result deadline passes.') }
    w.phase = 'reveal';
    io.toPhones(room, { t: 'dx-reveal' });
    status(room);
    for (const b of bots(w)) reveal(room, b.pid, w.botSecrets[b.pid]);
    w.timer = setTimeout(() => settle(room), REVEAL_MS);
  }
  async function reveal(room, pid, m) {
    const w = room.wt;
    if (!w || w.phase !== 'reveal' || w.reveals[pid] !== undefined || !w.burners[pid]) return;
    const wager = Math.round(+m.wager), salt = typeof m.salt === 'string' && /^[0-9a-f]{64}$/.test(m.salt) ? Buffer.from(m.salt, 'hex') : null;
    if (!salt || !(wager >= Math.floor(w.stake / 10) && wager <= w.stake)) return P(room, pid, { t: 'dx-error', why: 'That reveal is not valid.' });
    // check locally first: a mismatch would only waste a transaction
    if (hex(chainMod.wagerCommitment(w.game, w.burners[pid].publicKey, wager, salt)) !== w.commits[pid]) return P(room, pid, { t: 'dx-error', why: 'That wager does not match what you locked in.' });
    w.reveals[pid] = null;
    try { await chain.reveal(w.game, w.burners[pid], wager, salt); w.reveals[pid] = wager }
    catch (e) { delete w.reveals[pid]; return P(room, pid, { t: 'dx-error', why: 'Reveal failed: ' + e.message }) }
    status(room);
    if (w.seats.every(s => w.reveals[s.pid] != null)) { clearTimeout(w.timer); settle(room) }
  }
  async function settle(room) {
    const w = room.wt; if (!w || w.phase !== 'reveal') return;
    w.phase = 'settling'; status(room, { msg: 'Paying out…' });
    let g;
    try {
      g = await chain.readGame(w.game);
      const before = await Promise.all(g.players.map(p => chain.balance(p)));
      if (g.revealed !== (1 << g.n) - 1) {   // someone missed the reveal: the program only settles after its window closes
        const wait = async () => { for (;;) { try { return await chain.settle(w.game, g.players) } catch (e) { if (!/still open/.test(e.message)) throw e; await new Promise(r => setTimeout(r, 5000)) } } };
        w.txs.settle = await wait();
      } else w.txs.settle = await chain.settle(w.game, g.players);
      const after = await Promise.all(g.players.map(p => chain.balance(p)));
      w.payouts = {};
      for (const s of w.seats) { const i = w.chainSeat[s.pid]; w.payouts[s.pid] = after[i] - before[i] }
    } catch (e) { w.phase = 'error'; return fail(room, 'Could not settle: ' + e.message) }
    finish(room, false);
  }
  async function abort(room, why) {
    const w = room.wt; if (!w || !['commit', 'locking', 'locked', 'driving'].includes(w.phase) || !w.game) return;
    clearTimeout(w.timer); w.phase = 'refunding'; status(room, { msg: 'Refunding every stake…' });
    try {
      const g = await chain.readGame(w.game);
      if (g && g.n) w.txs.refund = await chain.refund(w.game, g.players);
      w.payouts = {}; for (const s of w.seats) w.payouts[s.pid] = w.commits[s.pid] ? w.stake : 0;
    } catch (e) { w.phase = 'error'; return fail(room, 'Refund failed: ' + e.message) }
    log(`room ${room.code}: aborted (${why})`);
    finish(room, true, why);
  }
  function finish(room, aborted, why) {
    const w = room.wt; w.phase = 'done';
    const tx = {}; for (const [k, v] of Object.entries(w.txs)) tx[k] = chainMod.explorer(v);
    const final = { t: 'dx-final', aborted, why, stake: w.stake, goal: w.goal, result: w.result, caught: !!w.caught, crewWins: !!w.crewWins, tx,
      players: w.seats.map(s => ({ pid: s.pid, name: s.name, color: s.color, imposter: !aborted && s.pid === w.imposterPid,   // a cancelled trip keeps its secret
        wager: w.reveals[s.pid] ?? null, payout: (w.payouts || {})[s.pid] ?? 0,
        votedFor: w.votes[s.pid] ?? null, votesAgainst: Object.values(w.votes).filter(v => v === s.pid).length })) };
    w.final = final;
    ALL(room, final);
    log(`room ${room.code}: ${aborted ? 'refunded' : (w.crewWins ? 'crew wins' : 'imposter wins')}`);
    // recycle the test SOL: burners back to the server, then the game account's rent
    (async () => {
      try { await chain.sweep(Object.values(w.burners)); await chain.closeGame(w.game); chain.forgetBurners(w.gameId) }
      catch (e) { log('cleanup failed (burners are kept in solana/.keys/burners.json):', e.message) }
    })();
  }

  return {
    // returns true if the message was a Wrong Turn message (handled here, never relayed)
    fromHost(room, m) {
      if (!m.t.startsWith('dx-')) return false;
      if (m.t === 'dx-setup') setup(room, m);
      else if (m.t === 'dx-start' && room.wt?.phase === 'locked') { room.wt.phase = 'driving'; room.wt.startedAt = Date.now(); botSabotage(room) }
      else if (m.t === 'dx-result') result(room, m);
      else if (m.t === 'dx-abort') abort(room, 'the laptop cancelled');
      else if (m.t === 'dx-check') H(room, { t: 'dx-avail', why: available(), stakeSol: STAKE / 1e9 });
      return true;
    },
    fromPhone(room, pid, m) {
      if (!m.t.startsWith('dx-')) return false;
      if (m.t === 'dx-commit') commit(room, pid, m);
      else if (m.t === 'dx-sab') sabotage(room, pid, m);
      else if (m.t === 'dx-vote-for') vote(room, pid, m);
      else if (m.t === 'dx-reveal-v') reveal(room, pid, m);
      else if (m.t === 'dx-hello' && room.wt) {   // a reloaded phone gets its own secret back, and where the trip is
        if (room.wt.phase !== 'done' && room.wt.burners[pid]) sendRole(room, pid);
        if (room.wt.phase === 'reveal') P(room, pid, { t: 'dx-reveal' });
        if (room.wt.final) P(room, pid, room.wt.final);
      }
      return true;
    },
    roomClosed(room) { if (room.wt) abort(room, 'the room closed') },
  };
}

module.exports = { create, available };
