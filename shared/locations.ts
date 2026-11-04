export function isOneDrivePath(value: string) {
  return value
    .replaceAll(String.fromCharCode(92), '/')
    .split('/')
    .some((part) => /^OneDrive(?: - .+)?$/i.test(part));
}
