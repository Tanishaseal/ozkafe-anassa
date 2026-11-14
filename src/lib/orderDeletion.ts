import { NextResponse } from 'next/server';
import { deleteOrder } from '@/lib/store';

// Shared by the order endpoint and legacy admin action endpoints.
export async function deleteOrderResponse(orderId: unknown, permanent = false) {
  if (typeof orderId !== 'string' || !orderId.trim()) {
    return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
  }
  const success = await deleteOrder(orderId, 'admin', permanent);
  if (!success) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, message: permanent ? 'Order permanently purged' : 'Order deleted by admin' });
}
