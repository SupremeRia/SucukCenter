const { setTimeout, setInterval, clearInterval } = require('node:timers');
// Capture our own generated uninstaller for read-only signature/icon verification, before NSIS cleanup.
const fs = require('node:fs'),
  path = require('node:path');
const version = require('../package.json').version;
const file = path.resolve(
    'review-builds/signed/SucukCenter-' + version + '-RiaCoding-Kurulum.__uninstaller.exe',
  ),
  out = path.resolve('artifacts/desktop/generated-uninstaller.exe');
fs.mkdirSync(path.dirname(out), { recursive: true });
let copies = 0;
const timer = setInterval(() => {
  if (fs.existsSync(path.resolve('artifacts/desktop/stop-uninstaller-capture'))) return finish();
  try {
    if (fs.existsSync(file)) {
      const b = fs.readFileSync(file);
      if (b.length > 1024) {
        fs.writeFileSync(out, b);
        copies++;
      }
    }
  } catch {
    /* Signing may temporarily lock the file; next read retries only this evidence copy. */
  }
}, 150);
const finish = () => {
  clearInterval(timer);
  console.log('Captured uninstaller samples ' + copies);
  process.exit(0);
};
setTimeout(finish, 360000);
process.on('SIGINT', finish);
