import type { CustomerRow } from "../../db/schema/customers";
import type { OrderItemRow } from "../../db/schema/order-items";
import type { OrderRow } from "../../db/schema/orders";
import type { OrderRefundRow } from "../../db/schema/order-refunds";

/**
 * Compact customer summary attached to an order. Mirrors the customer aggregate
 * fields WooCommerce maintains; `null` on guest orders or when the buyer has not
 * been synced yet. Money stays a decimal string (exact).
 */
export interface CustomerSummaryDto {
  id: string;
  wpCustomerId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  totalSpent: string;
  ordersCount: number;
  lastOrderAt: Date | null;
}

/** A single order line item. `price`/`total` stay decimal strings (exact money). */
export interface OrderItemDto {
  id: string;
  orderId: string;
  productId: string | null;
  wpProductId: number | null;
  name: string;
  sku: string | null;
  quantity: number;
  price: string;
  total: string;
}

/** Public API shape of an order (list row). `total` stays a decimal string. */
export interface OrderDto {
  id: string;
  storeId: string;
  wpOrderId: number | null;
  customerId: string | null;
  orderNumber: string | null;
  status: string;
  total: string;
  totalRefunded: string;
  currency: string;
  paymentMethod: string | null;
  internalNotes: string | null;
  placedAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: CustomerSummaryDto | null;
}

/** Order with its line items, returned by the details endpoint. */
export interface OrderDetailsDto extends OrderDto {
  items: OrderItemDto[];
}

export function toCustomerSummaryDto(
  row: CustomerRow | null,
): CustomerSummaryDto | null {
  if (!row) return null;
  return {
    id: row.id,
    wpCustomerId: row.wpCustomerId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    totalSpent: row.totalSpent,
    ordersCount: row.ordersCount,
    lastOrderAt: row.lastOrderAt,
  };
}

export function toOrderItemDto(row: OrderItemRow): OrderItemDto {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    wpProductId: row.wpProductId,
    name: row.name,
    sku: row.sku,
    quantity: row.quantity,
    price: row.price,
    total: row.total,
  };
}

export function toOrderDto(
  row: OrderRow,
  customer: CustomerRow | null = null,
): OrderDto {
  return {
    id: row.id,
    storeId: row.storeId,
    wpOrderId: row.wpOrderId,
    customerId: row.customerId,
    orderNumber: row.orderNumber,
    status: row.status,
    total: row.total,
    totalRefunded: row.totalRefunded,
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    internalNotes: row.internalNotes,
    placedAt: row.placedAt,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customer: toCustomerSummaryDto(customer),
  };
}

export function toOrderDetailsDto(
  row: OrderRow,
  customer: CustomerRow | null,
  items: OrderItemRow[],
): OrderDetailsDto {
  return {
    ...toOrderDto(row, customer),
    items: items.map(toOrderItemDto),
  };
}

/** Public API shape of an order refund (Phase 27). Money stays a string. */
export interface OrderRefundDto {
  id: string;
  orderId: string;
  wpRefundId: number | null;
  amount: string;
  currency: string;
  reason: string | null;
  refundedPayment: boolean;
  initiatedBy: string;
  createdBy: string | null;
  wpDateCreated: Date | null;
  createdAt: Date;
}

export function toOrderRefundDto(row: OrderRefundRow): OrderRefundDto {
  return {
    id: row.id,
    orderId: row.orderId,
    wpRefundId: row.wpRefundId,
    amount: row.amount,
    currency: row.currency,
    reason: row.reason,
    refundedPayment: row.refundedPayment,
    initiatedBy: row.initiatedBy,
    createdBy: row.createdBy,
    wpDateCreated: row.wpDateCreated,
    createdAt: row.createdAt,
  };
}
