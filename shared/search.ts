export function documentMatches(party: string, id: number, prefix: 'S' | 'G', query: string) {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q || party.toLocaleLowerCase('tr').includes(q)) return true;
  const number = q.replace(/^#?([sg])-?/i, '');
  if (/^#?[sg]/i.test(q) && !q.replace('#', '').startsWith(prefix.toLowerCase())) return false;
  return /^\d+$/.test(number) && BigInt(number) === BigInt(id);
}
