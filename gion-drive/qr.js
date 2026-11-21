/* Gion Taxi: a small QR code encoder for the crew lobby (byte mode, error correction level M, versions 1–6,
   i.e. up to 106 bytes, which is plenty for a join URL). Follows ISO/IEC 18004; the structure mirrors
   Project Nayuki's reference encoder (MIT). Usage: GTQR.svg(text, {dark, light}) → an <svg> string. */
const GTQR = (() => {
  const ECC = [-1, 10, 16, 26, 18, 24, 16];     // ECC codewords per block, level M
  const BLOCKS = [-1, 1, 1, 1, 2, 2, 4];        // number of blocks, level M
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55 } return r };
  const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC[v] * BLOCKS[v];
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x } return z };
  function divisor(degree) {
    const r = Array(degree).fill(0); r[degree - 1] = 1; let root = 1;
    for (let i = 0; i < degree; i++) { for (let j = 0; j < degree; j++) { r[j] = mul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1] } root = mul(root, 2) }
    return r;
  }
  function remainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f) }) }
    return r;
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];

  function matrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    while (ver <= 6 && 12 + bytes.length * 8 > dataCodewords(ver) * 8) ver++;
    if (ver > 6) throw new Error('QR text too long: ' + bytes.length + ' bytes');
    // data bits: byte mode, 8-bit count, payload, terminator, padding
    const cap = dataCodewords(ver) * 8, bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1) };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
    // error correction, split into blocks and interleaved
    const nb = BLOCKS[ver], ecl = ECC[ver], raw = Math.floor(rawModules(ver) / 8);
    const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = divisor(ecl), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length;
      const ecc = remainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) all.push(b[i]) });
    // function patterns
    const size = ver * 4 + 17, mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(Array(size).fill(false)); fn.push(Array(size).fill(false)) }
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4) } } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver >= 2) { const p = size - 7; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(p + dx, p + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1) }
    const format = mask => {
      const d = mask; let rem = d;   // level M = 00
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const f = ((d << 10) | rem) ^ 0x5412, g = i => ((f >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, g(i));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
      set(8, size - 8, true);
    };
    format(0);
    // codewords in the zigzag
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && i < all.length * 8) { mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++ }
      }
    }
    // pick the mask with the lowest penalty (runs, 2×2 blocks, finder look-alikes, balance)
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x] };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = get => { let run = 1, s = 0, str = '';
        for (let k = 0; k < size; k++) { const v = get(k); str += v ? '1' : '0'; if (k && v === get(k - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++ } else run = 1 }
        return s + 40 * ((str.match(/(?=1011101(0000))|(?=(0000)1011101)/g) || []).length) };
      for (let k = 0; k < size; k++) { p += line(x => mod[k][x]) + line(y => mod[y][k]) }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3 }
      for (const row of mod) for (const v of row) if (v) dark++;
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); format(m); const p = penalty(); if (p < bestP) { bestP = p; best = m } apply(m) }
    apply(best); format(best);
    return mod;
  }

  function svg(text, { dark = '#263c35', light = '#fffcf3', margin = 4 } = {}) {
    const m = matrix(text), n = m.length + margin * 2;
    let d = '';
    m.forEach((row, y) => row.forEach((v, x) => { if (v) d += `M${x + margin} ${y + margin}h1v1h-1z` }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${text.replace(/[&<>"]/g, '')}"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
  return { matrix, svg };
})();
if (typeof module === 'object') module.exports = GTQR;
else window.GTQR = GTQR;
