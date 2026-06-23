import assert from "node:assert/strict";
import { test } from "node:test";
import type { NotificationRow } from "../../db/schema/notifications";
import { toNotificationDto } from "./notifications.serializer";

function makeNotification(
  overrides: Partial<NotificationRow> = {},
): NotificationRow {
  return {
    id: "55555555-5555-5555-5555-555555555555",
    storeId: "11111111-1111-1111-1111-111111111111",
    type: "new_order",
    title: "طلب جديد",
    message: "تم استلام طلب جديد رقم ‎#1024",
    severity: "info",
    readAt: null,
    metadata: { orderId: "1024" },
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    ...overrides,
  };
}

test("toNotificationDto maps every column and derives isRead=false when unread", () => {
  const dto = toNotificationDto(makeNotification());
  assert.equal(dto.id, "55555555-5555-5555-5555-555555555555");
  assert.equal(dto.storeId, "11111111-1111-1111-1111-111111111111");
  assert.equal(dto.type, "new_order");
  assert.equal(dto.title, "طلب جديد");
  assert.equal(dto.severity, "info");
  assert.equal(dto.isRead, false);
  assert.equal(dto.readAt, null);
  assert.deepEqual(dto.metadata, { orderId: "1024" });
});

test("toNotificationDto derives isRead=true when read_at is set", () => {
  const readAt = new Date("2026-06-02T08:00:00.000Z");
  const dto = toNotificationDto(makeNotification({ readAt }));
  assert.equal(dto.isRead, true);
  assert.deepEqual(dto.readAt, readAt);
});

test("toNotificationDto normalises absent metadata to null", () => {
  const dto = toNotificationDto(makeNotification({ metadata: null }));
  assert.equal(dto.metadata, null);
});
