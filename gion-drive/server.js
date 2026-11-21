// Gion Taxi crew server: zero dependencies, Node 18+.
//   node gion-drive/server.js            (PORT=8090 by default; HOST_IP=… to force the address in the QR code)
//   node gion-drive/server.js --tunnel   also opens a public https tunnel (ssh to localhost.run, no install or account),
//                                        so phones can join from any network, even when campus Wi-Fi isolates devices.
//   PUBLIC_URL=https://… node …          use a tunnel/host you run yourself (ngrok, cloudflared…) for the QR code
// Laptop (the game, the host) opens http://localhost:8090. Phones scan the QR code in the crew lobby, which points at
// http://<laptop LAN address>:8090/join?r=ROOM. Phones only use touch, so plain HTTP is enough (no certificate).
//
// The server is a relay with rooms. The laptop page is the authority: it runs the taxi, assigns roles and decides
// who is ready. The server only creates rooms, admits up to four phones per room, remembers each phone by a
// random id (so a reloaded phone gets its seat back) and passes messages between the phones and their laptop.
// The WebSocket framing is adapted from shooter/server.js (Laptop Shooter, branch laptop-shooter).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const PORT = +process.env.PORT || 8090;
const MAX_PHONES = 4;
const HOST_GRACE_MS = 120000;     // a room survives this long without its laptop (page reload, Wi-Fi blip)
const IDLE_MS = 15000;            // a socket that says nothing for this long is closed (clients heartbeat every 2 s)
const MAX_MSG = 4096, MAX_HOST_MSG = 256 * 1024;   // phones send small inputs; the laptop also sends the map (~20 KB)

// ---------- addresses ----------
// The QR code must never say localhost. List every non-internal IPv4 address, the likely Wi-Fi/hotspot one first.
// Looked up on every request, so switching the laptop to a phone's hotspot doesn't leave a stale link.
function lanIPs() {
  const preferred = ['en0', 'en1', 'wlan0', 'wlp2s0', 'eth0', 'bridge100'];
  const ifs = os.networkInterfaces(), names = [...preferred.filter(n => ifs[n]), ...Object.keys(ifs).filter(n => !preferred.includes(n))];
  const out = [];
  if (process.env.HOST_IP) out.push(process.env.HOST_IP);
  for (const n of names) for (const a of ifs[n] || [])
    if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.') && !out.includes(a.address)) out.push(a.address);
  return out;
}

// ---------- public tunnel (optional) ----------
// Campus networks often stop phones from reaching a laptop directly. A tunnel gives the laptop a public https address,
// so phones only need internet access. The QR code switches to it as soon as it's up and back to the LAN if it drops.
let publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '') || null, tunnelProc = null;
function startTunnel() {
  const args = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes', '-T', '-R', `80:localhost:${PORT}`, 'nokey@localhost.run'];
  console.log('  Opening a public tunnel through localhost.run…');
  const p = tunnelProc = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const read = buf => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.lhr\.life\b/i);   // the tunnel's address; ignore the banner's admin.localhost.run link
    if (m && m[0] !== publicUrl) { publicUrl = m[0]; console.log(`  Tunnel up. Phones can join from any network at ${publicUrl}/join\n`) }
  };
  p.stdout.on('data', read); p.stderr.on('data', read);
  p.on('exit', code => {
    if (tunnelProc !== p) return;
    publicUrl = process.env.PUBLIC_URL || null; tunnelProc = null;
    console.log(`  Tunnel closed (ssh exit ${code}). Retrying in 5 s; phones on the same Wi-Fi can still use the LAN address.`);
    setTimeout(startTunnel, 5000);
  });
}
process.on('exit', () => { if (tunnelProc) tunnelProc.kill() });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

// ---------- static files ----------
const FILES = { '/': 'gion-taxi.html', '/index.html': 'gion-taxi.html', '/join': 'pad.html', '/pad.html': 'pad.html' };
function handler(req, res) {
  const url = req.url.split('?')[0];
  if (url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ips: lanIPs(), port: PORT, publicUrl }));
  }
  const file = FILES[url];
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found. The game is at / and phones join at /join'); }
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Could not read ' + file); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

// ---------- minimal WebSocket (RFC 6455, text frames, from shooter/server.js) ----------
function encodeFrame(payload, opcode = 1) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (p.length < 126) header = Buffer.from([0x80 | opcode, p.length]);
  else if (p.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(p.length, 2) }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(p.length), 2) }
  return Buffer.concat([header, p]);
}
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f, masked = buf[1] & 0x80;
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4 }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10 }
  if (len > 1 << 20) return { opcode: 8, payload: Buffer.alloc(0), used: buf.length };   // absurd frame: close
  const maskOff = off;
  if (masked) off += 4;
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskOff + (i & 3)];
  return { opcode, payload, used: off + len };
}

// ---------- rooms ----------
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: room codes are read aloud and typed
const rooms = new Map();                        // code → { code, key, host, hostTimer, phones: Map pid → { pid, client } }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
function newCode() {
  for (let n = 0; n < 1000; n++) {
    const c = Array.from(crypto.randomBytes(4), b => LETTERS[b % LETTERS.length]).join('');
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free room codes');
}
function closeRoom(room, why) {
  for (const p of room.phones.values()) if (p.client) { p.client.send({ t: 'err', code: 'closed', why }); p.client.room = null; p.client.close() }
  clearTimeout(room.hostTimer); rooms.delete(room.code); log(`room ${room.code} closed (${why})`);
}
const toHost = (room, msg) => room.host && room.host.send(msg);
const isPid = v => typeof v === 'string' && /^[a-z0-9]{8,32}$/.test(v);

function onMessage(client, text) {
  if (text.length > (client.role === 'host' ? MAX_HOST_MSG : MAX_MSG)) return;
  let msg;
  try { msg = JSON.parse(text) } catch { return }
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
  if (msg.t === 'hb') return;   // heartbeat

  if ((msg.t === 'host' && client.role === 'phone') || (msg.t === 'join' && client.role === 'host')) return;   // a socket keeps its role

  // --- the laptop: create a room, or take back its room after a reload ---
  if (msg.t === 'host') {
    let room = typeof msg.room === 'string' && rooms.get(msg.room);
    if (room && room.key === msg.key) {
      if (room.host && room.host !== client) { room.host.role = null; room.host.close() }
      clearTimeout(room.hostTimer);
    } else {
      room = { code: newCode(), key: crypto.randomBytes(12).toString('hex'), host: null, hostTimer: null, phones: new Map() };
      rooms.set(room.code, room); log(`room ${room.code} opened`);
    }
    room.host = client; client.role = 'host'; client.room = room;
    client.send({ t: 'room', room: room.code, key: room.key, ips: lanIPs(), port: PORT, publicUrl, max: MAX_PHONES });
    for (const p of room.phones.values()) client.send({ t: 'peer', pid: p.pid, on: !!p.client });
    for (const p of room.phones.values()) if (p.client) p.client.send({ t: 'host', on: true });
    return;
  }

  // --- a phone joins (or rejoins) a room ---
  if (msg.t === 'join') {
    const code = String(msg.room || '').toUpperCase();
    if (!/^[A-Z]{4}$/.test(code) || !isPid(msg.pid)) return client.send({ t: 'err', code: 'bad' });
    const room = rooms.get(code);
    if (!room) return client.send({ t: 'err', code: 'room' });
    let p = room.phones.get(msg.pid);
    if (!p) {
      if (room.phones.size >= MAX_PHONES) return client.send({ t: 'err', code: 'full' });
      p = { pid: msg.pid, client: null }; room.phones.set(p.pid, p);
    } else if (p.client && p.client !== client) { p.client.room = null; p.client.send({ t: 'err', code: 'replaced' }); p.client.close() }
    p.client = client; client.role = 'phone'; client.room = room; client.pid = p.pid;
    client.send({ t: 'joined', room: room.code, pid: p.pid, host: !!room.host });
    toHost(room, { t: 'peer', pid: p.pid, on: true });
    log(`room ${room.code}: phone ${p.pid.slice(0, 6)} joined (${room.phones.size}/${MAX_PHONES})`);
    return;
  }

  const room = client.room;
  if (!room || !rooms.has(room.code)) return;

  // --- laptop → phones ---
  if (client.role === 'host' && room.host === client) {
    if (msg.t === 'to' && msg.m && typeof msg.m === 'object') {
      for (const p of room.phones.values()) if (p.client && (msg.to === '*' || msg.to === p.pid)) p.client.send(msg.m);
    } else if (msg.t === 'drop' && isPid(msg.pid)) {
      const p = room.phones.get(msg.pid);
      if (p) { room.phones.delete(p.pid); if (p.client) { p.client.room = null; p.client.send({ t: 'err', code: 'kicked' }); p.client.close() } }
    } else if (msg.t === 'close') closeRoom(room, 'host closed the room');
    return;
  }

  // --- phone → laptop (the laptop validates the content) ---
  if (client.role === 'phone' && room.phones.get(client.pid)?.client === client) toHost(room, { t: 'from', pid: client.pid, m: msg });
}

function onClose(client) {
  const room = client.room;
  if (!room || !rooms.has(room.code)) return;
  if (client.role === 'host' && room.host === client) {
    room.host = null;
    for (const p of room.phones.values()) if (p.client) p.client.send({ t: 'host', on: false });
    room.hostTimer = setTimeout(() => closeRoom(room, 'the laptop left'), HOST_GRACE_MS);
    log(`room ${room.code}: laptop disconnected, keeping the room for ${HOST_GRACE_MS / 1000} s`);
  } else if (client.role === 'phone') {
    const p = room.phones.get(client.pid);
    if (p && p.client === client) { p.client = null; toHost(room, { t: 'peer', pid: p.pid, on: false }); log(`room ${room.code}: phone ${p.pid.slice(0, 6)} disconnected`) }
  }
}

function onUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || !req.url.startsWith('/ws')) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let closed = false, idle;
  const client = {
    role: null, room: null, pid: null,
    send(obj) { if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(obj))) },
    close() { if (!socket.destroyed) { socket.end(encodeFrame(Buffer.alloc(0), 8)); setTimeout(() => socket.destroy(), 500) } },
  };
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => socket.destroy(), IDLE_MS) };
  touch();
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    touch();
    buf = Buffer.concat([buf, chunk]);
    let f;
    while ((f = decodeFrame(buf))) {
      buf = buf.subarray(f.used);
      if (f.opcode === 1) onMessage(client, f.payload.toString());
      else if (f.opcode === 9) socket.write(encodeFrame(f.payload, 10));
      else if (f.opcode === 8) { client.close(); return }
    }
  });
  const cleanup = () => { if (closed) return; closed = true; clearTimeout(idle); onClose(client) };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

// ---------- start ----------
const server = http.createServer(handler);
server.on('upgrade', onUpgrade);
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Is the server already running? Try PORT=8091 node gion-drive/server.js`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  GION TAXI · crew server');
  console.log(`  Laptop (the game):  http://localhost:${PORT}`);
  console.log(`  Phones join at:     ${ips.length ? ips.map(ip => `http://${ip}:${PORT}/join`).join('  or  ') : '(no network found: connect to Wi-Fi or a hotspot)'}`);
  console.log('  Open the game, press "Play with phones" and scan the QR code.');
  if (process.argv.includes('--tunnel')) return startTunnel();
  if (publicUrl) return console.log(`  Public address for phones: ${publicUrl}/join\n`);
  console.log('  Phones must be on the same network as this laptop. If they can\'t connect (campus Wi-Fi often blocks');
  console.log('  phone-to-laptop traffic), turn on a phone\'s Personal Hotspot and join it with the laptop and the other phones.\n');
});
