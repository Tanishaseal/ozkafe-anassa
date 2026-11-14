import type { MenuItem } from './types';

export function menuPrice(item: MenuItem, size?: string): number {
  const multiplier = item.sizePriceMultiplier?.[size || item.sizes[0]] ?? 1;
  return Number((item.price * multiplier).toFixed(2));
}
