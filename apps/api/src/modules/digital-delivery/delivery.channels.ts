import type { DeliveryChannel } from "../../db/schema/digital-deliveries";
import { getConnectionByStoreId } from "../connections/connections.service";
import { runWpCommand } from "../wp-commands/wp-commands.service";

/**
 * Delivery channel handlers (Phase 18, plan2 §18). A handler attempts to deliver
 * and returns a normalized result; it NEVER throws and NEVER handles raw codes —
 * Phase 18 channels transmit a "codes ready" notice only.
 *
 * Channel maturity (plan2 §18 ordering):
 *  - dashboard       : real. Codes become available to staff in the SaaS; "sent".
 *  - woocommerce_note: real (safe note, no codes) when the store is connected.
 *  - email / whatsapp: placeholders — "skipped" (no infra/provider configured).
 */

export type ChannelOutcome = "sent" | "failed" | "skipped";

export interface ChannelResult {
  status: ChannelOutcome;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ChannelContext {
  storeId: string;
  orderId: string;
  /** WooCommerce order id (for the order-note channel); null when not linked. */
  wpOrderId: number | null;
  orderNumber: string | null;
  assignmentCount: number;
}

function sent(provider: string, providerMessageId: string | null = null): ChannelResult {
  return { status: "sent", provider, providerMessageId, errorCode: null, errorMessage: null };
}
function skipped(errorCode: string, errorMessage: string): ChannelResult {
  return { status: "skipped", provider: null, providerMessageId: null, errorCode, errorMessage };
}
function failed(errorCode: string, errorMessage: string): ChannelResult {
  return { status: "failed", provider: null, providerMessageId: null, errorCode, errorMessage };
}

/** dashboard: nothing is sent externally — codes are now revealable to staff. */
async function deliverDashboard(): Promise<ChannelResult> {
  return sent("dashboard");
}

/**
 * woocommerce_note: posts a SAFE "codes ready" note (NO codes) to the WooCommerce
 * order via the signed connector endpoint. Degrades to "skipped" when the store
 * is not connected, and "failed" when the connector call errors.
 */
async function deliverWooNote(ctx: ChannelContext): Promise<ChannelResult> {
  if (!ctx.wpOrderId) {
    return skipped("NOT_LINKED", "Order is not linked to a WooCommerce order.");
  }
  const connection = await getConnectionByStoreId(ctx.storeId);
  if (!connection || connection.status !== "connected" || !connection.siteUrl) {
    return skipped("NOT_CONNECTED", "Store is not connected to WooCommerce.");
  }

  // Note body carries NO codes — just a ready notice (plan2 §18). Phase 25:
  // routed through the command outbox (system-originated, so createdBy null);
  // channel semantics stay non-throwing — the command row carries the outcome.
  const note = `تم تجهيز ${ctx.assignmentCount} كود رقمي لهذا الطلب. الأكواد متاحة بأمان عبر لوحة التحكم/الدعم.`;
  let command;
  try {
    command = await runWpCommand({
      storeId: ctx.storeId,
      domain: "order",
      action: "add_digital_note",
      targetWpId: ctx.wpOrderId,
      payload: { status: "completed", note, codeCount: ctx.assignmentCount },
      createdBy: null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add WooCommerce note.";
    return failed("WC_NOTE_FAILED", message);
  }

  if (command.status === "succeeded") {
    const data = command.result as { noteId?: number } | null;
    return sent("woocommerce_note", data?.noteId ? String(data.noteId) : null);
  }
  return failed(
    "WC_NOTE_FAILED",
    command.lastError || "Failed to add WooCommerce note.",
  );
}

/** email: placeholder — no email infrastructure is configured yet. */
async function deliverEmailPlaceholder(): Promise<ChannelResult> {
  return skipped("EMAIL_NOT_CONFIGURED", "Email delivery is not configured.");
}

/** whatsapp: placeholder — no WhatsApp provider is configured yet. */
async function deliverWhatsappPlaceholder(): Promise<ChannelResult> {
  return skipped("WHATSAPP_NOT_CONFIGURED", "WhatsApp delivery is not configured.");
}

/** Dispatches to the channel handler. `manual` behaves like dashboard (staff-handled). */
export async function runChannel(
  channel: DeliveryChannel,
  ctx: ChannelContext,
): Promise<ChannelResult> {
  switch (channel) {
    case "woocommerce_note":
      return deliverWooNote(ctx);
    case "email":
      return deliverEmailPlaceholder();
    case "whatsapp":
      return deliverWhatsappPlaceholder();
    case "manual":
    case "dashboard":
    default:
      return deliverDashboard();
  }
}
