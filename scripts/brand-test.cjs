const fs = require('node:fs'),
  assert = require('node:assert/strict');
const ico = fs.readFileSync('build/icon.ico'),
  canonical = fs.readFileSync('public/brand/program.ico');
assert.ok(ico.equals(canonical));
assert.equal(ico.readUInt16LE(2), 1);
assert.equal(ico.readUInt16LE(4), 7);
const sizes = [16, 24, 32, 48, 64, 128, 256];
for (let i = 0; i < 7; i++) {
  const a = 6 + i * 16,
    n = ico.readUInt32LE(a + 8),
    at = ico.readUInt32LE(a + 12),
    b = ico.subarray(at, at + n);
  assert.equal(ico[a] || 256, sizes[i]);
  assert.equal(ico[a + 1] || 256, sizes[i]);
  assert.equal(ico.readUInt16LE(a + 6), 32);
  assert.equal(b.toString('ascii', 1, 4), 'PNG');
  assert.equal(b.readUInt32BE(16), sizes[i]);
  assert.equal(b.readUInt32BE(20), sizes[i]);
  assert.equal(b[25], 6);
}
const metadata = JSON.parse(fs.readFileSync('public/brand/metadata.json', 'utf8'));
for (const key of ['program', 'splash']) {
  assert.ok(metadata[key].zeroAlpha > 0);
  assert.ok(metadata[key].partialAlpha > 0);
  assert.ok(metadata[key].bounds.width > 0);
}
assert.equal(
  fs.readdirSync('public/brand').length,
  4,
  'Eski marka varlıkları çalışma paketine taşınmamalı',
);
console.log(
  'PASS supplied PNG alpha/antialias bounds; canonical ICO seven RGBA PNG frames 16,24,32,48,64,128,256; old symbols removed',
);
