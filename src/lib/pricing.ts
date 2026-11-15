import type { MenuItem } from './types';

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function menuPrice(item: MenuItem, size?: string): number {
  const multiplier = item.sizePriceMultiplier?.[size || item.sizes[0]] ?? 1;
  return Number((item.price * multiplier).toFixed(2));
}

export function billTotals(items: { price: number; quantity: number }[], gstPercent: number, discountPercent = 0) {
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError('Discount must be between 0 and 100 percent.');
  }
  if (!Number.isFinite(gstPercent) || gstPercent < 0 || items.some(item => !Number.isFinite(item.price) || item.price < 0 || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Invalid bill amounts.');
  }
  const round = roundMoney;
  const percent = round(discountPercent);
  const subtotal = round(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const discountAmount = round(subtotal * percent / 100);
  const taxableAmount = round(subtotal - discountAmount);
  const taxAmount = round(taxableAmount * gstPercent / 100);
  return { subtotal, discountPercent: percent, discountAmount, taxableAmount, taxAmount, total: round(taxableAmount + taxAmount) };
}
