export function isMenuImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const url = value.trim();
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return true;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}
