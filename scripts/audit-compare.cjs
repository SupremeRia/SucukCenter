const { spawnSync } = require('node:child_process');
const path = require('node:path');
const label = process.argv[2] || 'before';
for (const volume of ['small', 'medium', 'large']) {
  console.log('START', label, volume);
  const r = spawnSync(
    require('electron'),
    [path.resolve('dist-electron/tests/audit-comparison.js'), label, volume],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...(label === 'before'
          ? {
              SUCUKCENTER_AUDIT_MODULES: path.resolve(
                'artifacts/audit/legacy-1.6.0/dist-electron/electron',
              ),
            }
          : {}),
      },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  console.log(r.stdout, r.stderr);
  if (r.status !== 0) process.exit(r.status || 1);
}
