const fs = require('fs'),
  path = require('path'),
  ts = require('typescript');
const files = fs.readdirSync('src/components/ui').filter((f) => f.endsWith('.tsx'));
let all = '';
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.[tj]sx?$/.test(p)) all += '\n' + fs.readFileSync(p, 'utf8');
  }
}
walk('src');
let rows = [];
for (const f of files) {
  const p = path.join('src/components/ui', f);
  const text = fs.readFileSync(p, 'utf8'),
    source = ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const statement of source.statements)
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      const count = (all.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
      if (count === 2) rows.push({ file: p, name });
    }
}
fs.mkdirSync('artifacts/audit', { recursive: true });
fs.writeFileSync('artifacts/audit/unused-ui-candidates.json', JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows));
