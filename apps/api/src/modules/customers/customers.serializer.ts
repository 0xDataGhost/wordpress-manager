import type { CustomerRow } from "../../db/schema/customers";
import type { OrderRow } from "../../db/schema/orders";

/**
 * Public API shape of a customer. `totalSpent` stays a decimal string (exact
 * money). The aggregate fields (`totalSpent`, `ordersCount`, `lastOrderAt`)
 * mirror WooCommerce's synced customer summary; the details endpoint also
 * returns freshly computed `metrics` from the locally synced orders.
 */
export interface CustomerDto {
  id: string;
  storeId: string;
  wpCustomerId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  totalSpent: string;
  ordersCount: number;
  lastOrderAt: Date | null;
  billing: Record<string, unknown> | null;
  shipping: Record<string, unknown> | null;
  internalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A read-only linked order shown on the customer details page. */
export interface CustomerOrderDto {
  id: string;
  wpOrderId: number | null;
  orderNumber: string | null;
  status: string;
  total: string;
  currency: string;
  /** Effective order date: placed-at, falling back to created-at. */
  orderDate: Date | null;
  createdAt: Date;
}

/** Metrics computed from the customer's locally synced orders. */
export interface CustomerMetricsDto {
  totalOrders: number;
  /** Decimal string (exact money). */
  totalSpent: string;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

/** Customer with computed metrics and recent linked orders (details endpoint). */
export interface CustomerDetailsDto extends CustomerDto {
  metrics: CustomerMetricsDto;
  recentOrders: CustomerOrderDto[];
}

export function toCustomerDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    storeId: row.storeId,
    wpCustomerId: row.wpCustomerId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    totalSpent: row.totalSpent,
    ordersCount: row.ordersCount,
    lastOrderAt: row.lastOrderAt,
    billing:
      row.billing && typeof row.billing === "object"
        ? (row.billing as Record<string, unknown>)
        : null,
    shipping:
      row.shipping && typeof row.shipping === "object"
        ? (row.shipping as Record<string, unknown>)
        : null,
    internalNotes: row.internalNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toCustomerOrderDto(row: OrderRow): CustomerOrderDto {
  return {
    id: row.id,
    wpOrderId: row.wpOrderId,
    orderNumber: row.orderNumber,
    status: row.status,
    total: row.total,
    currency: row.currency,
    orderDate: row.placedAt ?? row.createdAt,
    createdAt: row.createdAt,
  };
}

export function toCustomerDetailsDto(
  row: CustomerRow,
  metrics: CustomerMetricsDto,
  recentOrders: OrderRow[],
): CustomerDetailsDto {
  return {
    ...toCustomerDto(row),
    metrics,
    recentOrders: recentOrders.map(toCustomerOrderDto),
  };
}
