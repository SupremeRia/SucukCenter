const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const folder = path.join(os.tmpdir(), 'SucukCenter-Development');
fs.mkdirSync(folder, { recursive: true });
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: folder };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.resolve('.')], {
  env,
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code) => process.exit(code ?? 1));
