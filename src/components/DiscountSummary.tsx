import type { Order } from '@/lib/types';
import { roundMoney } from '@/lib/pricing';

export default function DiscountSummary({ order }: { order: Pick<Order, 'subtotal' | 'discountPercent'> }) {
  if (!order.discountPercent) return null;
  const amount = roundMoney(order.subtotal * order.discountPercent / 100);
  return <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 12px', margin: '6px 0', fontSize: 12, color: 'var(--veg-green, #15803D)' }}>
    <span>Discount ({order.discountPercent}%, before tax)</span>
    <strong>−₹{amount.toFixed(2)}</strong>
  </div>;
}
