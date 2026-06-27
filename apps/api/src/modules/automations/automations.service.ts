import { and, count, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  automations,
  type AutomationRow,
  type AutomationType,
} from "../../db/schema/automations";
import {
  automationLogs,
  type AutomationLogRow,
  type AutomationLogStatus,
} from "../../db/schema/automation-logs";
import { codeAssignments } from "../../db/schema/code-assignments";
import { customers } from "../../db/schema/customers";
import { digitalCodes } from "../../db/schema/digital-codes";
import { digitalDeliveries } from "../../db/schema/digital-deliveries";
import { digitalProductSettings } from "../../db/schema/digital-product-settings";
import { orderItems } from "../../db/schema/order-items";
import { orders } from "../../db/schema/orders";
import { products } from "../../db/schema/products";
import { NotFoundError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { enqueueWhatsappOrderMessage } from "../../queue/queues";
import { REVENUE_STATUSES } from "../dashboard/dashboard.service";
import { addUtcDays, startOfUtcDay } from "../dashboard/dashboard.range";
import { createNotification } from "../notifications/notifications.service";
import { assignCodesForOrder } from "../digital-delivery/digital-delivery.engine";
import { deliverCodesForOrder } from "../digital-delivery/delivery.service";
import {
  createCustomerLink,
  listCustomerLinks,
} from "../digital-delivery/customer-link.service";
import {
  AUTOMATION_DEFAULTS,
  ALL_AUTOMATION_TYPE_ORDER,
  isAutomationType,
  normalizeConfig,
  parseConfigForType,
  type AutoAssignCodesConfig,
  type AutoDeliverCodesConfig,
  type DigitalFailedDeliveryConfig,
  type DigitalLowStockConfig,
  type DigitalOutOfStockConfig,
  type DigitalReplacementRateConfig,
  type LowStockConfig,
  type WhatsappConfig,
} from "./automations.config";
import {
  computeReplacementRate,
  hasActiveCustomerLink,
  isOrderStatusEligible,
  isReplacementBreach,
  selectLowStockProducts,
  selectOutOfStockProducts,
  type ProductStockRow,
} from "./digital-automations.logic";
import type {
  ListAutomationLogsQuery,
  UpdateAutomationInput,
} from "./automations.schemas";

const PAID = [...REVENUE_STATUSES];
const TOP_PRODUCTS_LIMIT = 5;

/* ------------------------------- Provisioning ----------------------------- */

/**
 * Idempotently provisions every automation for a store (classic Phase 11 + Phase
 * 23 digital, defaults, disabled) and returns them in the canonical display
 * order. Safe to call on every read/run — `onConflictDoNothing` on
 * (store_id, type) makes re-runs a no-op, so existing stores gain the new
 * digital rows lazily on first read. Tenant-scoped: only the given store's rows
 * are touched/returned.
 */
export async function ensureAutomations(
  storeId: string,
): Promise<AutomationRow[]> {
  await db
    .insert(automations)
    .values(
      ALL_AUTOMATION_TYPE_ORDER.map((type) => ({
        storeId,
        type,
        enabled: false,
        config: AUTOMATION_DEFAULTS[type],
      })),
    )
    .onConflictDoNothing({
      target: [automations.storeId, automations.type],
    });

  const rows = await db
    .select()
    .from(automations)
    .where(eq(automations.storeId, storeId));

  const orderIndex = (type: string): number => {
    const idx = ALL_AUTOMATION_TYPE_ORDER.indexOf(type as AutomationType);
    return idx === -1 ? ALL_AUTOMATION_TYPE_ORDER.length : idx;
  };
  return [...rows].sort((a, b) => orderIndex(a.type) - orderIndex(b.type));
}

/** Lists a store's automations (lazily provisioning them on first read). */
export async function listAutomations(
  storeId: string,
): Promise<AutomationRow[]> {
  return ensureAutomations(storeId);
}

/** Fetches one automation by id, scoped to the store. Throws NotFound. */
export async function getAutomation(
  storeId: string,
  id: string,
): Promise<AutomationRow> {
  const [row] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.storeId, storeId), eq(automations.id, id)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Automation not found");
  }
  return row;
}

/** Returns the store's automation of a given type (provisioning if needed). */
async function getAutomationByType(
  storeId: string,
  type: AutomationType,
): Promise<AutomationRow> {
  const rows = await ensureAutomations(storeId);
  const row = rows.find((r) => r.type === type);
  if (!row) {
    throw new NotFoundError("Automation not found");
  }
  return row;
}

/**
 * Updates an automation's `enabled` and/or `config`. Config is merged onto the
 * current (normalized) config and validated against the type's schema, so a
 * partial update keeps the stored config complete and valid. Tenant-scoped.
 */
export async function updateAutomation(
  storeId: string,
  id: string,
  input: UpdateAutomationInput,
): Promise<AutomationRow> {
  const existing = await getAutomation(storeId, id);

  const set: Partial<typeof automations.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.enabled !== undefined) {
    set.enabled = input.enabled;
  }

  if (input.config !== undefined) {
    if (!isAutomationType(existing.type)) {
      throw new NotFoundError("Unknown automation type");
    }
    const merged = {
      ...normalizeConfig(existing.type, existing.config),
      ...input.config,
    };
    set.config = parseConfigForType(existing.type, merged);
  }

  const [updated] = await db
    .update(automations)
    .set(set)
    .where(and(eq(automations.storeId, storeId), eq(automations.id, id)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Automation not found");
  }
  return updated;
}

/* --------------------------------- Logs ----------------------------------- */

export interface ListAutomationLogsResult {
  /** The owning automation (fetched once, for the caller's context). */
  automation: AutomationRow;
  items: AutomationLogRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Lists an automation's run logs, newest first, paginated. Verifies the
 * automation belongs to the store first (NotFound otherwise) and returns it so
 * the caller does not need a second fetch. Tenant-scoped.
 */
export async function listAutomationLogs(
  storeId: string,
  automationId: string,
  query: ListAutomationLogsQuery,
): Promise<ListAutomationLogsResult> {
  const automation = await getAutomation(storeId, automationId);

  const where = and(
    eq(automationLogs.storeId, storeId),
    eq(automationLogs.automationId, automationId),
  );
  const offset = (query.page - 1) * query.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(automationLogs)
      .where(where)
      .orderBy(desc(automationLogs.createdAt), desc(automationLogs.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(automationLogs).where(where),
  ]);

  return {
    automation,
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

interface WriteLogInput {
  storeId: string;
  automation: AutomationRow;
  status: AutomationLogStatus;
  message: string;
  metadata?: unknown;
}

/** Appends an automation run log. Returns the created row. */
async function writeAutomationLog(
  input: WriteLogInput,
): Promise<AutomationLogRow> {
  const [row] = await db
    .insert(automationLogs)
    .values({
      storeId: input.storeId,
      automationId: input.automation.id,
      type: input.automation.type,
      status: input.status,
      message: input.message,
      metadata: input.metadata ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to write automation log");
  }
  return row;
}

/* ------------------------------ Run helpers ------------------------------- */
/**
 * The Phase 11 manual-execution helpers. Each is the body a BullMQ worker would
 * run; the queue/job foundation exists (queue/queues.ts) but no worker consumes
 * it yet, so these run synchronously and are invoked manually (scripts/run-
 * automation.ts). Disabled automations are skipped unless `force` is set.
 */

export interface RunOptions {
  /** Run even when the automation is disabled (used by manual test runs). */
  force?: boolean;
}

export interface RunResult {
  type: AutomationType;
  status: AutomationLogStatus;
  message: string;
  metadata: Record<string, unknown>;
  notificationId?: string;
}

/** Most recent order currency for the store, else SAR. */
async function storeCurrency(storeId: string): Promise<string> {
  const [row] = await db
    .select({ currency: orders.currency })
    .from(orders)
    .where(eq(orders.storeId, storeId))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(1);
  return row?.currency ?? "SAR";
}

function formatAmount(value: string | number, currency: string): string {
  const num = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe.toFixed(2)} ${currency}`;
}

/** Renders {{placeholder}} tokens in a template from a variables map. */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value ?? "";
  });
}

/**
 * When an automation is disabled and not forced: log a skip and short-circuit.
 * Returns the skip RunResult, or null when the run should proceed.
 */
async function skipIfDisabled(
  storeId: string,
  automation: AutomationRow,
  options: RunOptions,
): Promise<RunResult | null> {
  if (automation.enabled || options.force) {
    return null;
  }
  const message = "تم التخطّي: الأتمتة غير مفعّلة";
  await writeAutomationLog({
    storeId,
    automation,
    status: "skipped",
    message,
    metadata: { reason: "disabled" },
  });
  return {
    type: automation.type as AutomationType,
    status: "skipped",
    message,
    metadata: { reason: "disabled" },
  };
}

/**
 * On failure: log it and raise a `failed_automation` notification so it surfaces
 * in the notifications center (Phase 10). Rethrows for the caller.
 */
async function recordFailure(
  storeId: string,
  automation: AutomationRow,
  err: unknown,
): Promise<never> {
  const detail = err instanceof Error ? err.message : "Unexpected error";
  logger.error({ err, automationId: automation.id }, "Automation run failed");
  await writeAutomationLog({
    storeId,
    automation,
    status: "failed",
    message: `فشل تنفيذ الأتمتة: ${detail}`,
    metadata: { error: detail },
  });
  await createNotification({
    storeId,
    type: "failed_automation",
    severity: "error",
    title: "فشل تنفيذ أتمتة",
    message: `تعذّر تنفيذ الأتمتة (${automation.type}). ${detail}`,
    metadata: { automationId: automation.id, type: automation.type },
  });
  throw err;
}

/**
 * Low Stock Alert: find active products at/under the configured threshold; when
 * any exist, raise a `low_stock` notification. Always writes a log.
 */
export async function runLowStockCheck(
  storeId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(storeId, "low_stock_alert");
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "low_stock_alert",
      automation.config,
    ) as LowStockConfig;
    const threshold = config.threshold;

    const lowStock = await db
      .select({
        id: products.id,
        name: products.name,
        stockQuantity: products.stockQuantity,
      })
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          eq(products.status, "active"),
          lt(products.stockQuantity, threshold + 1),
        ),
      )
      .orderBy(products.stockQuantity, products.name);

    if (lowStock.length === 0) {
      const message = `لا توجد منتجات منخفضة المخزون (الحد ${threshold}).`;
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata: { threshold, count: 0 },
      });
      return {
        type: "low_stock_alert",
        status: "skipped",
        message,
        metadata: { threshold, count: 0 },
      };
    }

    const metadata = {
      threshold,
      count: lowStock.length,
      products: lowStock.map((p) => ({
        id: p.id,
        name: p.name,
        stockQuantity: p.stockQuantity,
      })),
    };

    const notification = await createNotification({
      storeId,
      type: "low_stock",
      severity: "warning",
      title: "تنبيه: مخزون منخفض",
      message: `يوجد ${lowStock.length} منتج عند أو تحت حد المخزون (${threshold}).`,
      metadata,
    });

    const message = `تم إنشاء تنبيه لـ ${lowStock.length} منتج منخفض المخزون.`;
    await writeAutomationLog({
      storeId,
      automation,
      status: "success",
      message,
      metadata: { ...metadata, notificationId: notification.id },
    });

    return {
      type: "low_stock_alert",
      status: "success",
      message,
      metadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/**
 * Daily Sales Report: compute today's (UTC) sales total + order count, today's
 * top products, and the current low-stock count, then raise a `daily_report`
 * notification. Always writes a log when it runs.
 */
export async function runDailySalesReport(
  storeId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  // Provision once and read both the report automation and the sibling
  // low-stock automation (for its threshold) from the same result.
  const all = await ensureAutomations(storeId);
  const automation = all.find((a) => a.type === "daily_sales_report");
  if (!automation) {
    throw new NotFoundError("Automation not found");
  }
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const tomorrowStart = addUtcDays(todayStart, 1);
    const orderDate = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`;
    const inToday = and(gte(orderDate, todayStart), lt(orderDate, tomorrowStart));
    const currency = await storeCurrency(storeId);

    // Low-stock threshold from the sibling automation (defaults if absent).
    const lowStockRow = all.find((a) => a.type === "low_stock_alert");
    const lowStockThreshold = (
      normalizeConfig(
        "low_stock_alert",
        lowStockRow?.config ?? {},
      ) as LowStockConfig
    ).threshold;

    const [salesAgg, topProductsRows, lowStockAgg] = await Promise.all([
      db
        .select({
          ordersCount: count(),
          salesTotal: sql<string>`coalesce(sum(${orders.total}) filter (where ${inArray(
            orders.status,
            PAID,
          )}), 0)`,
        })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), inToday)),
      db
        .select({
          productId: orderItems.productId,
          name: orderItems.name,
          quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
          revenue: sql<string>`coalesce(sum(${orderItems.total}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orderItems.storeId, storeId),
            inArray(orders.status, PAID),
            inToday,
          ),
        )
        .groupBy(orderItems.productId, orderItems.name)
        .orderBy(
          desc(sql`coalesce(sum(${orderItems.total}), 0)`),
          desc(sql`coalesce(sum(${orderItems.quantity}), 0)`),
        )
        .limit(TOP_PRODUCTS_LIMIT),
      db
        .select({ value: count() })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.status, "active"),
            lt(products.stockQuantity, lowStockThreshold + 1),
          ),
        ),
    ]);

    const salesTotal = salesAgg[0]?.salesTotal ?? "0";
    const ordersCount = Number(salesAgg[0]?.ordersCount ?? 0);
    const lowStockCount = Number(lowStockAgg[0]?.value ?? 0);
    const topProducts = topProductsRows.map((r) => ({
      productId: r.productId,
      name: r.name,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue).toFixed(2),
    }));

    const metadata = {
      date: todayStart.toISOString().slice(0, 10),
      currency,
      salesTotal: Number(salesTotal).toFixed(2),
      ordersCount,
      lowStockCount,
      topProducts,
    };

    const topProduct = topProducts[0];
    const topLine = topProduct ? ` أفضل منتج: ${topProduct.name}.` : "";
    const message =
      `تقرير اليوم: المبيعات ${formatAmount(salesTotal, currency)}، ` +
      `الطلبات ${ordersCount}، منتجات منخفضة المخزون ${lowStockCount}.${topLine}`;

    const notification = await createNotification({
      storeId,
      type: "daily_report",
      severity: "info",
      title: "التقرير اليومي للمبيعات",
      message,
      metadata,
    });

    await writeAutomationLog({
      storeId,
      automation,
      status: "success",
      message,
      metadata: { ...metadata, notificationId: notification.id },
    });

    return {
      type: "daily_sales_report",
      status: "success",
      message,
      metadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

export interface WhatsappRunOptions extends RunOptions {
  /** Target a specific order; defaults to the store's most recent order. */
  orderId?: string;
}

/**
 * WhatsApp Order Message (FOUNDATION ONLY): render the configured template for
 * an order and enqueue a placeholder job — NO real WhatsApp message is sent.
 * Writes a `queued` log and a notification stating a message WOULD be sent.
 */
export async function runWhatsappOrderMessage(
  storeId: string,
  options: WhatsappRunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(
    storeId,
    "whatsapp_order_message",
  );
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    // Resolve the target order (explicit id, else most recent) + its customer.
    const orderWhere = options.orderId
      ? and(eq(orders.storeId, storeId), eq(orders.id, options.orderId))
      : eq(orders.storeId, storeId);

    const [order] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        wpOrderId: orders.wpOrderId,
        total: orders.total,
        currency: orders.currency,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(orderWhere)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(1);

    if (!order) {
      const message = "تم التخطّي: لا يوجد طلب لإرسال رسالة له.";
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata: { reason: "no_order" },
      });
      return {
        type: "whatsapp_order_message",
        status: "skipped",
        message,
        metadata: { reason: "no_order" },
      };
    }

    const config = normalizeConfig(
      "whatsapp_order_message",
      automation.config,
    ) as WhatsappConfig;
    const currency = order.currency ?? (await storeCurrency(storeId));
    const orderLabel =
      order.orderNumber ?? (order.wpOrderId ? `#${order.wpOrderId}` : order.id);

    const rendered = renderTemplate(config.message_template, {
      customer_name: order.customerName ?? "عميلنا العزيز",
      order_number: orderLabel,
      order_total: formatAmount(order.total, currency),
      order_id: order.id,
    });

    // Foundation: enqueue a placeholder job (no consumer, no real send). Degrade
    // gracefully if the queue is unavailable — the log still records the intent.
    let queued = false;
    try {
      await enqueueWhatsappOrderMessage({
        storeId,
        automationId: automation.id,
        orderId: order.id,
        message: rendered,
      });
      queued = true;
    } catch (queueErr) {
      logger.warn(
        { err: queueErr, storeId },
        "WhatsApp placeholder enqueue failed; logged only",
      );
    }

    const metadata = {
      orderId: order.id,
      orderNumber: orderLabel,
      hasPhone: Boolean(order.customerPhone),
      renderedMessage: rendered,
      delivered: false,
      queued,
      placeholder: true,
    };

    const notification = await createNotification({
      storeId,
      type: "whatsapp_order_message",
      severity: "info",
      title: "رسالة واتساب (محاكاة)",
      message: `كان سيتم إرسال رسالة واتساب للطلب ${orderLabel} (لم تُرسل فعلياً).`,
      metadata,
    });

    const message = `تم تجهيز رسالة واتساب للطلب ${orderLabel} (محاكاة — لم تُرسل).`;
    await writeAutomationLog({
      storeId,
      automation,
      status: "queued",
      message,
      metadata: { ...metadata, notificationId: notification.id },
    });

    return {
      type: "whatsapp_order_message",
      status: "queued",
      message,
      metadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/* ----------------------- Phase 23 digital automations --------------------- */
/**
 * Manual-execution helpers for the Phase 23 digital automations. Like the
 * Phase 11 helpers they run SYNCHRONOUSLY (no worker drains the queues yet) and
 * are invoked manually (scripts/run-automation.ts). They REUSE the existing
 * engines — `assignCodesForOrder` (Phase 17), `deliverCodesForOrder` (Phase 18),
 * and `createCustomerLink` (Phase 22) — so no assignment/delivery/link logic is
 * duplicated. Disabled automations are skipped + logged; failures write a failed
 * log + a `failed_automation` notification (recordFailure).
 *
 * SECURITY: no helper ever logs or notifies a raw code, cipher, or customer
 * token — metadata is ids/counts/status only.
 */

const DAY_MS = 86_400_000;
/** Safety bound on how many orders an auto-assign/deliver sweep processes. */
const AUTO_RUN_ORDER_LIMIT = 100;

/** Optional targeting for the auto-assign / auto-deliver helpers. */
export interface AutoRunOptions extends RunOptions {
  /** Act on a single order; otherwise sweep eligible orders for the store. */
  orderId?: string;
  /** Override the sweep cap (defaults to AUTO_RUN_ORDER_LIMIT). */
  limit?: number;
}

/** Per-digital-product available-pool snapshot for the stock alerts. */
async function digitalProductStockRows(
  storeId: string,
): Promise<ProductStockRow[]> {
  const rows = await db
    .select({
      productId: digitalProductSettings.productId,
      productName: sql<string | null>`max(${products.name})`,
      threshold: digitalProductSettings.lowStockThreshold,
      available: sql<number>`count(${digitalCodes.id}) filter (where ${digitalCodes.status} = 'available')`,
    })
    .from(digitalProductSettings)
    .innerJoin(products, eq(products.id, digitalProductSettings.productId))
    .leftJoin(
      digitalCodes,
      and(
        eq(digitalCodes.productId, digitalProductSettings.productId),
        eq(digitalCodes.storeId, digitalProductSettings.storeId),
      ),
    )
    .where(
      and(
        eq(digitalProductSettings.storeId, storeId),
        eq(digitalProductSettings.isEnabled, true),
      ),
    )
    .groupBy(
      digitalProductSettings.productId,
      digitalProductSettings.lowStockThreshold,
    );

  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    available: Number(r.available),
    threshold: r.threshold,
  }));
}

/** Timestamp of this automation's most recent run log, or null. */
async function previousRunAt(
  storeId: string,
  automationId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: automationLogs.createdAt })
    .from(automationLogs)
    .where(
      and(
        eq(automationLogs.storeId, storeId),
        eq(automationLogs.automationId, automationId),
      ),
    )
    .orderBy(desc(automationLogs.createdAt), desc(automationLogs.id))
    .limit(1);
  return row?.createdAt ?? null;
}

/** Timestamp of this automation's most recent SUCCESS log, or null. */
async function lastSuccessLogAt(
  storeId: string,
  automationId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: automationLogs.createdAt })
    .from(automationLogs)
    .where(
      and(
        eq(automationLogs.storeId, storeId),
        eq(automationLogs.automationId, automationId),
        eq(automationLogs.status, "success"),
      ),
    )
    .orderBy(desc(automationLogs.createdAt), desc(automationLogs.id))
    .limit(1);
  return row?.createdAt ?? null;
}

/**
 * Digital Low Stock Alert: digital products whose available pool is low (but not
 * empty) under the configured threshold mode → one `digital_low_stock` warning.
 */
export async function runDigitalLowStockAlert(
  storeId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(storeId, "digital_low_stock_alert");
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "digital_low_stock_alert",
      automation.config,
    ) as DigitalLowStockConfig;

    const rows = await digitalProductStockRows(storeId);
    const low = selectLowStockProducts(
      rows,
      config.thresholdMode,
      config.globalThreshold,
    );

    if (low.length === 0) {
      const message = "لا توجد منتجات رقمية منخفضة المخزون.";
      const metadata = { thresholdMode: config.thresholdMode, count: 0 };
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata,
      });
      return {
        type: "digital_low_stock_alert",
        status: "skipped",
        message,
        metadata,
      };
    }

    const metadata = {
      thresholdMode: config.thresholdMode,
      count: low.length,
      products: low.map((p) => ({
        id: p.productId,
        name: p.productName,
        available: p.available,
        threshold: p.threshold,
      })),
    };

    const notification = await createNotification({
      storeId,
      type: "digital_low_stock",
      severity: "warning",
      title: "تنبيه: مخزون أكواد منخفض",
      message: `يوجد ${low.length} منتج رقمي عند أو تحت حد المخزون المنخفض.`,
      metadata,
    });

    const message = `تم إنشاء تنبيه لـ ${low.length} منتج رقمي منخفض المخزون.`;
    await writeAutomationLog({
      storeId,
      automation,
      status: "success",
      message,
      metadata: { ...metadata, notificationId: notification.id },
    });

    return {
      type: "digital_low_stock_alert",
      status: "success",
      message,
      metadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/**
 * Digital Out Of Stock Alert: digital products whose available pool is empty →
 * one `digital_out_of_stock` error notification. `notifyRoles` is advisory and
 * carried in the metadata only (notifications are store-scoped).
 */
export async function runDigitalOutOfStockAlert(
  storeId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(
    storeId,
    "digital_out_of_stock_alert",
  );
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "digital_out_of_stock_alert",
      automation.config,
    ) as DigitalOutOfStockConfig;

    const rows = await digitalProductStockRows(storeId);
    const out = selectOutOfStockProducts(rows);

    if (out.length === 0) {
      const message = "لا توجد منتجات رقمية نفد مخزونها.";
      const metadata = { count: 0 };
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata,
      });
      return {
        type: "digital_out_of_stock_alert",
        status: "skipped",
        message,
        metadata,
      };
    }

    const metadata = {
      count: out.length,
      notifyRoles: config.notifyRoles ?? [],
      products: out.map((p) => ({ id: p.productId, name: p.productName })),
    };

    const notification = await createNotification({
      storeId,
      type: "digital_out_of_stock",
      severity: "error",
      title: "تنبيه: نفاد أكواد",
      message: `نفد مخزون الأكواد لـ ${out.length} منتج رقمي.`,
      metadata,
    });

    const message = `تم إنشاء تنبيه لنفاد مخزون ${out.length} منتج رقمي.`;
    await writeAutomationLog({
      storeId,
      automation,
      status: "success",
      message,
      metadata: { ...metadata, notificationId: notification.id },
    });

    return {
      type: "digital_out_of_stock_alert",
      status: "success",
      message,
      metadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/**
 * Digital Failed Delivery Alert: deliveries that have failed at least
 * `maxAttempts` times SINCE the previous run → one `digital_delivery_failed`
 * error notification. Scoping to "since the previous run" stops repeated runs
 * from re-alerting the same historical failures (no spam).
 */
export async function runDigitalFailedDeliveryAlert(
  storeId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(
    storeId,
    "digital_failed_delivery_alert",
  );
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "digital_failed_delivery_alert",
      automation.config,
    ) as DigitalFailedDeliveryConfig;

    const since = await previousRunAt(storeId, automation.id);
    const conditions = [
      eq(digitalDeliveries.storeId, storeId),
      eq(digitalDeliveries.status, "failed"),
      gte(digitalDeliveries.attemptCount, config.maxAttempts),
    ];
    if (since) conditions.push(gt(digitalDeliveries.updatedAt, since));

    const failed = await db
      .select({
        id: digitalDeliveries.id,
        orderId: digitalDeliveries.orderId,
      })
      .from(digitalDeliveries)
      .where(and(...conditions))
      .orderBy(desc(digitalDeliveries.updatedAt), desc(digitalDeliveries.id))
      .limit(50);

    if (failed.length === 0) {
      const message = "لا توجد عمليات تسليم فاشلة جديدة.";
      const metadata = { maxAttempts: config.maxAttempts, count: 0 };
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata,
      });
      return {
        type: "digital_failed_delivery_alert",
        status: "skipped",
        message,
        metadata,
      };
    }

    const metadata = {
      maxAttempts: config.maxAttempts,
      count: failed.length,
      orderIds: failed.map((f) => f.orderId),
      since: since ? since.toISOString() : null,
    };

    const notification = await createNotification({
      storeId,
      type: "digital_delivery_failed",
      severity: "error",
      title: "تنبيه: فشل تسليم أكواد",
      message: `يوجد ${failed.length} عملية تسليم رقمية فاشلة تحتاج مراجعة.`,
      metadata,
    });

    const message = `تم إنشاء تنبيه لـ ${failed.length} عملية تسليم فاشلة.`;
    await writeAutomationLog({
      storeId,
      automation,
      status: "success",
      message,
      metadata: { ...metadata, notificationId: notification.id },
    });

    return {
      type: "digital_failed_delivery_alert",
      status: "success",
      message,
      metadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/**
 * Digital Replacement Rate Alert: when the replacement rate over the last
 * `windowDays` exceeds `maxReplacementRate` → one `digital_replacement_rate`
 * warning. Debounced: once it alerts it stays quiet for the rest of the window
 * (a prior success log inside the window short-circuits), so repeated runs do
 * not spam the same breach.
 */
export async function runDigitalReplacementRateAlert(
  storeId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(
    storeId,
    "digital_replacement_rate_alert",
  );
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "digital_replacement_rate_alert",
      automation.config,
    ) as DigitalReplacementRateConfig;

    const since = new Date(Date.now() - config.windowDays * DAY_MS);
    const [agg] = await db
      .select({
        total: count(),
        replacement: sql<number>`count(*) filter (where ${codeAssignments.assignmentType} = 'replacement')`,
      })
      .from(codeAssignments)
      .where(
        and(
          eq(codeAssignments.storeId, storeId),
          gte(codeAssignments.assignedAt, since),
        ),
      );

    const total = Number(agg?.total ?? 0);
    const replacements = Number(agg?.replacement ?? 0);
    const rate = computeReplacementRate(total, replacements);
    const baseMetadata = {
      windowDays: config.windowDays,
      total,
      replacements,
      rate,
      threshold: config.maxReplacementRate,
    };

    if (!isReplacementBreach(total, replacements, config.maxReplacementRate)) {
      const message = `نسبة الاستبدال ضمن الحد (${rate}).`;
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata: baseMetadata,
      });
      return {
        type: "digital_replacement_rate_alert",
        status: "skipped",
        message,
        metadata: baseMetadata,
      };
    }

    // Debounce: already alerted within this window → stay quiet (no spam).
    const alertedAt = await lastSuccessLogAt(storeId, automation.id);
    if (alertedAt && alertedAt >= since) {
      const message = "تم التنبيه مسبقاً لارتفاع الاستبدال خلال هذه الفترة.";
      await writeAutomationLog({
        storeId,
        automation,
        status: "skipped",
        message,
        metadata: { ...baseMetadata, debounced: true },
      });
      return {
        type: "digital_replacement_rate_alert",
        status: "skipped",
        message,
        metadata: baseMetadata,
      };
    }

    const notification = await createNotification({
      storeId,
      type: "digital_replacement_rate",
      severity: "warning",
      title: "تنبيه: ارتفاع نسبة الاستبدال",
      message: `نسبة استبدال الأكواد (${rate}) تجاوزت الحد (${config.maxReplacementRate}).`,
      metadata: baseMetadata,
    });

    const message = `تم إنشاء تنبيه لارتفاع نسبة الاستبدال إلى ${rate}.`;
    await writeAutomationLog({
      storeId,
      automation,
      status: "success",
      message,
      metadata: { ...baseMetadata, notificationId: notification.id },
    });

    return {
      type: "digital_replacement_rate_alert",
      status: "success",
      message,
      metadata: baseMetadata,
      notificationId: notification.id,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/** Resolves the orders an auto-assign run should process (explicit id or sweep). */
async function resolveAutoAssignTargets(
  storeId: string,
  statuses: string[],
  orderId: string | undefined,
  limit: number,
): Promise<string[]> {
  if (orderId) {
    const [order] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
      .limit(1);
    if (!order) return [];
    return isOrderStatusEligible(order.status, statuses) ? [order.id] : [];
  }

  // Sweep: orders in an eligible status with a digital-enabled item that are not
  // already fully delivered. assignCodesForOrder is idempotent, so re-runs are safe.
  const rows = await db
    .selectDistinct({ id: orders.id, createdAt: orders.createdAt })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(
      digitalProductSettings,
      and(
        eq(digitalProductSettings.storeId, orderItems.storeId),
        eq(digitalProductSettings.productId, orderItems.productId),
        eq(digitalProductSettings.isEnabled, true),
      ),
    )
    .where(
      and(
        eq(orders.storeId, storeId),
        inArray(orders.status, statuses),
        ne(orders.digitalDeliveryStatus, "completed"),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Auto Assign Codes On Paid Order: reserve/assign codes for eligible paid orders
 * by REUSING the Phase 17 assignment engine (idempotent — re-running never
 * double-assigns). Acts on one order (`options.orderId`) or sweeps the store.
 */
export async function runAutoAssignCodesOnPaidOrder(
  storeId: string,
  options: AutoRunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(
    storeId,
    "auto_assign_codes_on_paid_order",
  );
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "auto_assign_codes_on_paid_order",
      automation.config,
    ) as AutoAssignCodesConfig;
    const limit = options.limit ?? AUTO_RUN_ORDER_LIMIT;

    const targets = await resolveAutoAssignTargets(
      storeId,
      config.statuses,
      options.orderId,
      limit,
    );

    let processed = 0;
    let newlyAssigned = 0;
    let fullyAssigned = 0;
    let shortfalls = 0;
    let errors = 0;

    for (const targetOrderId of targets) {
      try {
        const result = await assignCodesForOrder(storeId, targetOrderId, {
          allowPartial: config.allowPartial,
          actorUserId: null,
          respectReserveStatus: false,
          reason: "أتمتة: تعيين تلقائي بعد الدفع",
        });
        if (result.notApplicable) continue;
        processed++;
        newlyAssigned += result.newlyAssigned;
        if (result.shortfall) shortfalls++;
        else fullyAssigned++;
      } catch (orderErr) {
        errors++;
        logger.warn(
          { err: orderErr, storeId, orderId: targetOrderId },
          "Auto-assign skipped one order",
        );
      }
    }

    const metadata = {
      statuses: config.statuses,
      allowPartial: config.allowPartial,
      candidates: targets.length,
      processed,
      newlyAssigned,
      fullyAssigned,
      shortfalls,
      errors,
    };
    const status: AutomationLogStatus = processed === 0 ? "skipped" : "success";
    const message =
      processed === 0
        ? "لا توجد طلبات مؤهلة لتعيين الأكواد تلقائياً."
        : `تم تعيين ${newlyAssigned} كود عبر ${processed} طلب.`;

    await writeAutomationLog({ storeId, automation, status, message, metadata });
    return {
      type: "auto_assign_codes_on_paid_order",
      status,
      message,
      metadata,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}

/** Resolves the orders an auto-deliver run should process (explicit id or sweep). */
async function resolveAutoDeliverTargets(
  storeId: string,
  statuses: string[],
  orderId: string | undefined,
  limit: number,
): Promise<string[]> {
  if (orderId) {
    const [order] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
      .limit(1);
    if (!order) return [];
    return isOrderStatusEligible(order.status, statuses) ? [order.id] : [];
  }

  // Sweep: orders in an eligible status that have assigned-but-undelivered codes.
  // deliverCodesForOrder is idempotent (no-op once delivered), so re-runs are safe.
  const rows = await db
    .selectDistinct({ id: orders.id, createdAt: orders.createdAt })
    .from(orders)
    .innerJoin(
      codeAssignments,
      and(
        eq(codeAssignments.storeId, orders.storeId),
        eq(codeAssignments.orderId, orders.id),
        eq(codeAssignments.status, "assigned"),
      ),
    )
    .where(
      and(eq(orders.storeId, storeId), inArray(orders.status, statuses)),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Ensures an order has exactly one active customer self-service link. Returns
 * true when a NEW link was created, false when one already existed or creation
 * was not possible (degrades gracefully — never throws, never logs the token).
 */
async function ensureCustomerLink(
  storeId: string,
  orderId: string,
): Promise<boolean> {
  try {
    const links = await listCustomerLinks(storeId, orderId);
    if (hasActiveCustomerLink(links, new Date())) return false;
    // The raw token is intentionally discarded here — never captured or logged.
    await createCustomerLink(storeId, orderId, {}, null);
    return true;
  } catch (err) {
    logger.warn(
      { err, storeId, orderId },
      "Auto customer-link creation skipped",
    );
    return false;
  }
}

/**
 * Auto Deliver Codes On Paid Order: deliver assigned codes for eligible paid
 * orders by REUSING the Phase 18 delivery engine via the safe `dashboard`
 * channel (idempotent — a delivered order is a no-op, so no duplicate notices).
 * When the channel is `customer_link`, additionally ensures a customer link
 * exists for the order — without creating a duplicate when one is still active.
 */
export async function runAutoDeliverCodesOnPaidOrder(
  storeId: string,
  options: AutoRunOptions = {},
): Promise<RunResult> {
  const automation = await getAutomationByType(
    storeId,
    "auto_deliver_codes_on_paid_order",
  );
  const skipped = await skipIfDisabled(storeId, automation, options);
  if (skipped) return skipped;

  try {
    const config = normalizeConfig(
      "auto_deliver_codes_on_paid_order",
      automation.config,
    ) as AutoDeliverCodesConfig;
    const limit = options.limit ?? AUTO_RUN_ORDER_LIMIT;

    const targets = await resolveAutoDeliverTargets(
      storeId,
      config.statuses,
      options.orderId,
      limit,
    );

    let processed = 0;
    let delivered = 0;
    let linksCreated = 0;
    let errors = 0;

    for (const targetOrderId of targets) {
      try {
        const result = await deliverCodesForOrder(storeId, targetOrderId, {
          channel: "dashboard",
          force: false,
          actorUserId: null,
          isRetry: false,
        });
        processed++;
        if (result.delivered && !result.idempotentNoop) delivered++;

        const deliveredOk = result.delivered || result.idempotentNoop;
        if (deliveredOk && config.channel === "customer_link") {
          const created = await ensureCustomerLink(storeId, targetOrderId);
          if (created) linksCreated++;
        }
      } catch (orderErr) {
        errors++;
        logger.warn(
          { err: orderErr, storeId, orderId: targetOrderId },
          "Auto-deliver skipped one order",
        );
      }
    }

    const metadata = {
      statuses: config.statuses,
      channel: config.channel,
      candidates: targets.length,
      processed,
      delivered,
      linksCreated,
      errors,
    };
    const status: AutomationLogStatus = processed === 0 ? "skipped" : "success";
    const message =
      processed === 0
        ? "لا توجد طلبات مؤهلة لتسليم الأكواد تلقائياً."
        : `تم تسليم أكواد ${delivered} طلب جديد (${processed} طلب معالَج).`;

    await writeAutomationLog({ storeId, automation, status, message, metadata });
    return {
      type: "auto_deliver_codes_on_paid_order",
      status,
      message,
      metadata,
    };
  } catch (err) {
    return recordFailure(storeId, automation, err);
  }
}
