// This entry is included ONLY by electron-builder.review.cjs, never the production package.
import { app } from 'electron';
app.setName('SucukCenterReview');
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync } from 'node:fs';
const root = path.resolve(process.env.SUCUKCENTER_REVIEW_ROOT || '');
if (
  !root.startsWith(path.resolve(tmpdir()) + path.sep) ||
  !path.basename(root).startsWith('sucukcenter-review-')
)
  throw new Error('İzole inceleme veri klasörü gerekli.');
mkdirSync(path.join(root, 'profile'), { recursive: true });
app.setPath('documents', root);
app.setPath('userData', path.join(root, 'profile'));
if (process.env.SUCUKCENTER_REVIEW_SPLASH_PROBE === '1') void import('./splash-probe');
else void import('../electron/main');
