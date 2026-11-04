const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(require('electron'), [path.resolve('dist-electron/tests/all.js')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
