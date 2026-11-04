// Supplied artwork is canonical; never redraw or overwrite it with generated artwork.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
fs.copyFileSync('public/brand/program.ico', 'build/icon.ico');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), ['scripts/brand-inspect-electron.cjs'], {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
