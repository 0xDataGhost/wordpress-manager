import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIT_ACTIONS } from "../../db/schema/audit-logs";
import {
  buildAssignmentAuditEntry,
  deriveOrderDigitalStatus,
  type AssignEngineResult,
} from "./digital-delivery.engine";

function makeResult(
  overrides: Partial<AssignEngineResult> = {},
): AssignEngineResult {
  return {
    orderId: "11111111-1111-1111-1111-111111111111",
    status: "completed",
    requiredCodes: 3,
    assignedCodes: 3,
    newlyAssigned: 3,
    items: [
      {
        productId: "22222222-2222-2222-2222-222222222222",
        productName: "Netflix 1 Month",
        orderItemId: "33333333-3333-3333-3333-333333333333",
        required: 3,
        assigned: 3,
        missing: 0,
      },
    ],
    shortfall: false,
    notApplicable: false,
    ...overrides,
  };
}

test("deriveOrderDigitalStatus: not_required when nothing is needed", () => {
  assert.equal(deriveOrderDigitalStatus(0, 0, false), "not_required");
});

test("deriveOrderDigitalStatus: completed when fully assigned", () => {
  assert.equal(deriveOrderDigitalStatus(3, 3, true), "completed");
  assert.equal(deriveOrderDigitalStatus(3, 4, true), "completed");
});

test("deriveOrderDigitalStatus: partial when some but not all assigned", () => {
  assert.equal(deriveOrderDigitalStatus(3, 1, true), "partial");
});

test("deriveOrderDigitalStatus: manual_review when attempted but nothing assigned", () => {
  assert.equal(deriveOrderDigitalStatus(3, 0, true), "manual_review");
});

test("deriveOrderDigitalStatus: pending when needed but not yet attempted", () => {
  assert.equal(deriveOrderDigitalStatus(3, 0, false), "pending");
});

test("buildAssignmentAuditEntry: success → digital_codes_assigned", () => {
  const entry = buildAssignmentAuditEntry(makeResult());
  assert.ok(entry);
  assert.equal(entry.action, AUDIT_ACTIONS.DIGITAL_CODES_ASSIGNED);
});

test("buildAssignmentAuditEntry: partial → digital_assignment_partial", () => {
  const entry = buildAssignmentAuditEntry(
    makeResult({ status: "partial", assignedCodes: 1, newlyAssigned: 1, shortfall: true }),
  );
  assert.ok(entry);
  assert.equal(entry.action, AUDIT_ACTIONS.DIGITAL_ASSIGNMENT_PARTIAL);
});

test("buildAssignmentAuditEntry: nothing assigned → digital_assignment_failed", () => {
  const entry = buildAssignmentAuditEntry(
    makeResult({
      status: "manual_review",
      assignedCodes: 0,
      newlyAssigned: 0,
      shortfall: true,
    }),
  );
  assert.ok(entry);
  assert.equal(entry.action, AUDIT_ACTIONS.DIGITAL_ASSIGNMENT_FAILED);
});

test("buildAssignmentAuditEntry: not-applicable order → null (no audit)", () => {
  assert.equal(
    buildAssignmentAuditEntry(
      makeResult({ notApplicable: true, requiredCodes: 0, assignedCodes: 0 }),
    ),
    null,
  );
});

test("buildAssignmentAuditEntry metadata carries ids/counts only — no code material", () => {
  const entry = buildAssignmentAuditEntry(makeResult());
  assert.ok(entry);
  assert.deepEqual(Object.keys(entry.metadata).sort(), [
    "assignedCodes",
    "newlyAssigned",
    "orderId",
    "productIds",
    "requiredCodes",
  ]);
});
