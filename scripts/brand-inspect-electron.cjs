const { app, nativeImage } = require('electron');
const fs = require('fs');
app.disableHardwareAcceleration();
app
  .whenReady()
  .then(() => {
    const results = {};
    for (const name of ['program', 'splash']) {
      const b = fs.readFileSync('public/brand/' + name + '.png');
      const im = nativeImage.createFromBuffer(b),
        { width, height } = im.getSize(),
        pixels = im.toBitmap();
      let x0 = width,
        y0 = height,
        x1 = 0,
        y1 = 0,
        zero = 0,
        partial = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const a = pixels[(y * width + x) * 4 + 3];
          if (a === 0) zero++;
          if (a > 0 && a < 255) partial++;
          if (a >= 24) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
        }
      results[name] = {
        width,
        height,
        zeroAlpha: zero,
        partialAlpha: partial,
        bounds: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
      };
      if (!zero) throw new Error('Gerçek alfa kanalı bulunamadı: ' + name);
    }
    const ico = fs.readFileSync('build/icon.ico');
    if (ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== 7)
      throw Error('7 boyutlu ICO gerekli');
    results.ico = Array.from({ length: 7 }, (_, i) => {
      const k = 6 + i * 16;
      return {
        width: ico[k] || 256,
        height: ico[k + 1] || 256,
        bpp: ico.readUInt16LE(k + 6),
        bytes: ico.readUInt32LE(k + 8),
      };
    });
    fs.writeFileSync('public/brand/metadata.json', JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results));
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
