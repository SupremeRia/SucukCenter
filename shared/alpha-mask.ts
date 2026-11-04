export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
// BGRA alpha threshold 24/255; transparent counters and letter gaps remain holes.
// Merge identical spans vertically so native regions stay bounded and built once.
export function alphaRegions(
  bytes: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 24,
): Region[] {
  if (width < 1 || height < 1 || bytes.length !== width * height * 4)
    throw new Error('Geçersiz alfa görüntüsü.');
  const result: Region[] = [];
  let previous = new Map<string, Region>();
  for (let y = 0; y < height; y++) {
    const current = new Map<string, Region>();
    let x = 0;
    while (x < width) {
      while (x < width && bytes[(y * width + x) * 4 + 3] < threshold) x++;
      const start = x;
      while (x < width && bytes[(y * width + x) * 4 + 3] >= threshold) x++;
      if (start === x) continue;
      const key = start + ':' + (x - start);
      let r = previous.get(key);
      if (r) r.height++;
      else {
        r = { x: start, y, width: x - start, height: 1 };
        result.push(r);
      }
      current.set(key, r);
    }
    previous = current;
  }
  if (result.length === 0 || result.length > 20000) throw new Error('Logo bölgesi oluşturulamadı.');
  return result;
}
