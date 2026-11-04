// Read PE resources directly: this avoids confusing Explorer's icon cache with packaged bytes.
const fs = require('node:fs');
module.exports = function icons(file) {
  const b = fs.readFileSync(file),
    pe = b.readUInt32LE(60),
    optional = pe + 24,
    plus = b.readUInt16LE(optional) === 0x20b,
    resourceRva = b.readUInt32LE(optional + (plus ? 112 : 96) + 16),
    sectionTable = optional + b.readUInt16LE(pe + 20),
    count = b.readUInt16LE(pe + 6);
  const sections = Array.from({ length: count }, (_, i) => {
    const s = sectionTable + i * 40;
    return {
      va: b.readUInt32LE(s + 12),
      size: Math.max(b.readUInt32LE(s + 8), b.readUInt32LE(s + 16)),
      offset: b.readUInt32LE(s + 20),
    };
  });
  const offset = (rva) => {
    const s = sections.find((s) => rva >= s.va && rva < s.va + s.size);
    if (!s) throw Error('PE resource RVA bulunamadı');
    return s.offset + rva - s.va;
  };
  const root = offset(resourceRva),
    result = [];
  function walk(rel, keys) {
    const at = root + rel,
      n = b.readUInt16LE(at + 12) + b.readUInt16LE(at + 14);
    for (let i = 0; i < n; i++) {
      const entry = at + 16 + i * 8,
        key = b.readUInt32LE(entry),
        target = b.readUInt32LE(entry + 4);
      if (target & 0x80000000) walk(target & 0x7fffffff, [...keys, key]);
      else if (keys[0] === 3) {
        const p = root + target;
        result.push(
          b.subarray(offset(b.readUInt32LE(p)), offset(b.readUInt32LE(p)) + b.readUInt32LE(p + 4)),
        );
      }
    }
  }
  walk(0, []);
  return result;
};
