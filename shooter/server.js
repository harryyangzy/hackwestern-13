// Laptop Shooter server — zero dependencies.
//   Laptop (the target) opens  http://localhost:8080
//   Phone  (the gun)    opens  https://<laptop-ip>:8443/gun
// The phone needs HTTPS because iOS/Android only expose motion sensors to
// secure pages, so we generate a self-signed cert on first run.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

const HTTP_PORT = +process.env.PORT || 8080;
const HTTPS_PORT = +process.env.HTTPS_PORT || 8443;
const PUB = path.join(__dirname, 'public');
const CERT_DIR = path.join(__dirname, '.cert');

function lanIP() {
  const preferred = ['en0', 'en1', 'wlan0', 'eth0'];
  const ifs = os.networkInterfaces();
  const names = [...preferred.filter(n => ifs[n]), ...Object.keys(ifs)];
  for (const n of names)
    for (const a of ifs[n] || [])
      if (a.family === 'IPv4' && !a.internal) return a.address;
  return 'localhost';
}

function ensureCert() {
  const key = path.join(CERT_DIR, 'key.pem');
  const cert = path.join(CERT_DIR, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    console.log('Generating self-signed certificate...');
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${key}" -out "${cert}" ` +
        `-days 365 -subj "/CN=laptop-shooter"`,
      { stdio: 'ignore' }
    );
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}


const gunUrl = () => `https://${lanIP()}:${HTTPS_PORT}/gun`;

// ---------- static files ----------
const ROUTES = {
  '/': ['screen.html', 'text/html'],
  '/gun': ['gun.html', 'text/html'],
};

function handler(req, res) {
  const url = req.url.split('?')[0];
  if (url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ gunUrl: gunUrl() }));
  }
  const route = ROUTES[url];
  if (!route) {
    res.writeHead(404);
    return res.end('not found');
  }
  fs.readFile(path.join(PUB, route[0]), (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end('error');
    }
    res.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

// ---------- minimal WebSocket implementation ----------
function encodeFrame(payload, opcode = 1) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (p.length < 126) {
    header = Buffer.from([0x80 | opcode, p.length]);
  } else if (p.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(p.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(p.length), 2);
  }
  return Buffer.concat([header, p]);
}

function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = buf[1] & 0x80;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  const maskOff = off;
  if (masked) off += 4;
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (masked) for (let i = 0; i < len; i++) payload[i] ^= buf[maskOff + (i & 3)];
  return { opcode, payload, used: off + len };
}

// ---------- game relay ----------
const COLORS = ['#ff4d4d', '#4dc3ff', '#7dff4d', '#ffd84d', '#d44dff', '#ff9f4d', '#4dffd2', '#ff4da6'];
let nextId = 1;
const clients = new Set();

const screens = () => [...clients].filter(c => c.role === 'screen');
const guns = () => [...clients].filter(c => c.role === 'gun');
const toScreens = msg => screens().forEach(s => s.send(msg));

function onMessage(client, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }

  if (msg.t === 'hello') {
    if (msg.role === 'screen') {
      client.role = 'screen';
      client.send({ t: 'info', gunUrl: gunUrl() });
      for (const g of guns()) client.send({ t: 'join', id: g.id, name: g.name, color: g.color });
    } else if (msg.role === 'gun') {
      client.role = 'gun';
      client.name = String(msg.name || 'Player').slice(0, 14);
      const used = new Set(guns().map(g => g.color));
      client.color = COLORS.find(c => !used.has(c)) || COLORS[client.id % COLORS.length];
      client.send({ t: 'welcome', id: client.id, color: client.color, screens: screens().length });
      toScreens({ t: 'join', id: client.id, name: client.name, color: client.color });
      console.log(`+ ${client.name} joined`);
    }
    return;
  }

  if (client.role === 'gun') {
    // aim / fire / reload — forward to every screen, tagged with the shooter
    toScreens({ ...msg, id: client.id });
  } else if (client.role === 'screen' && msg.to != null) {
    const target = guns().find(g => g.id === msg.to);
    if (target) target.send(msg);
  }
}

function onUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') return socket.destroy();
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const client = {
    id: nextId++,
    role: null,
    send(obj) {
      if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(obj)));
    },
  };
  clients.add(client);

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    let f;
    while ((f = decodeFrame(buf))) {
      buf = buf.subarray(f.used);
      if (f.opcode === 1) onMessage(client, f.payload.toString());
      else if (f.opcode === 9) socket.write(encodeFrame(f.payload, 10));
      else if (f.opcode === 8) {
        socket.end(encodeFrame(Buffer.alloc(0), 8));
        return;
      }
    }
  });

  const cleanup = () => {
    if (!clients.delete(client)) return;
    if (client.role === 'gun') {
      toScreens({ t: 'leave', id: client.id });
      console.log(`- ${client.name} left`);
    }
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

// ---------- start ----------
const httpServer = http.createServer(handler);
httpServer.on('upgrade', onUpgrade);
httpServer.listen(HTTP_PORT, () => {
  const httpsServer = https.createServer(ensureCert(), handler);
  httpsServer.on('upgrade', onUpgrade);
  httpsServer.listen(HTTPS_PORT, () => {
    console.log('\n  LAPTOP SHOOTER');
    console.log(`  Laptop (target): http://localhost:${HTTP_PORT}`);
    console.log(`  Phone  (gun):    ${gunUrl()}`);
    console.log('  (phone must be on the same Wi-Fi; accept the certificate warning)\n');
  });
});
