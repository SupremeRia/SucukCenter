// better-sqlite3 v13 ships Node-API binaries, shared by Node and Electron.
// Rebuilding it with electron-builder would unnecessarily require C++ tools.
const { spawnSync } = require('node:child_process');
const result = spawnSync(
  require('electron'),
  [
    '-e',
    "const D=require('better-sqlite3');const db=new D(':memory:');console.log('Electron '+process.versions.electron+' / Node '+process.versions.node+' / SQLite '+db.prepare('select sqlite_version() v').get().v);db.close()",
  ],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true },
);
process.exit(result.status ?? 1);
