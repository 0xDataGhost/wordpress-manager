import type { CodeAssignmentRow } from "../../db/schema/code-assignments";

/**
 * Public DTOs for the assignment engine. SECURITY: an assignment links to a code
 * but these mappers expose only the masked `codePreview` — never the cipher,
 * fingerprint, or raw code. The full code is reachable only via the Phase 16
 * reveal endpoint, not here.
 */

export interface AssignmentDto {
  id: string;
  codeId: string;
  codePreview: string | null;
  productId: string;
  productName: string | null;
  orderId: string;
  orderItemId: string | null;
  customerId: string | null;
  assignmentType: string;
  status: string;
  assignedAt: Date;
  deliveredAt: Date | null;
}

/** An assignment row joined with its code preview + product name. */
export interface AssignmentRowWithNames {
  assignment: CodeAssignmentRow;
  codePreview: string | null;
  productName: string | null;
}

export function toAssignmentDto(row: AssignmentRowWithNames): AssignmentDto {
  return {
    id: row.assignment.id,
    codeId: row.assignment.codeId,
    codePreview: row.codePreview,
    productId: row.assignment.productId,
    productName: row.productName,
    orderId: row.assignment.orderId,
    orderItemId: row.assignment.orderItemId,
    customerId: row.assignment.customerId,
    assignmentType: row.assignment.assignmentType,
    status: row.assignment.status,
    assignedAt: row.assignment.assignedAt,
    deliveredAt: row.assignment.deliveredAt,
  };
}

/** One product line's assignment progress, returned by the assign endpoint. */
export interface AssignItemDto {
  productId: string;
  productName: string | null;
  orderItemId: string | null;
  required: number;
  assigned: number;
  missing: number;
}

/** A queue row (live-computed digital fulfillment state for an order). */
export interface QueueItemDto {
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  orderStatus: string;
  digitalDeliveryStatus: string;
  requiredCodes: number;
  assignedCodes: number;
  createdAt: Date;
}
