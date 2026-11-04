const { spawnSync } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const cases = [
  ['small', 200, 50, 20, 10],
  ['medium', 5000, 500, 100, 100],
  ['large', 50000, 2000, 300, 500],
];
fs.mkdirSync('artifacts/audit', { recursive: true });
for (const [name, sales, customers, products, orders] of cases) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-perf-'));
  console.log('START', name, root);
  const r = spawnSync(
    require('electron'),
    [path.resolve('dist-electron/tests/audit-performance.js'), root],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SUCUKCENTER_PERF_SALES: String(sales),
        SUCUKCENTER_PERF_CUSTOMERS: String(customers),
        SUCUKCENTER_PERF_PRODUCTS: String(products),
        SUCUKCENTER_PERF_ORDERS: String(orders),
        SUCUKCENTER_PERF_OUTPUT: path.resolve('artifacts/audit/' + name + '-before.json'),
      },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  console.log(r.stdout, r.stderr);
  if (r.status !== 0) process.exit(r.status || 1);
  fs.copyFileSync(
    path.join(root, 'SucukCenter', 'sucukcenter.db'),
    path.resolve('artifacts/audit/' + name + '-after-measurement.db'),
  );
  fs.writeFileSync('artifacts/audit/' + name + '-root.txt', root);
}
