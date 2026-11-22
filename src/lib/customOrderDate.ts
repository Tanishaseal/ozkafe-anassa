export function customOrderTimestamp(value: unknown, now = Date.now()): number | null {
  if (value === undefined || value === null || value === '') return now;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) && timestamp <= now ? timestamp : null;
}
