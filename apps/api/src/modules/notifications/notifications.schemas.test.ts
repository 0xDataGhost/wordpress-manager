import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listNotificationsQuerySchema,
  notificationParamsSchema,
} from "./notifications.schemas";

test("listNotificationsQuerySchema defaults and coerces pagination", () => {
  const parsed = listNotificationsQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.status, undefined);

  const coerced = listNotificationsQuerySchema.parse({ page: "2", limit: "50" });
  assert.equal(coerced.page, 2);
  assert.equal(coerced.limit, 50);
});

test("listNotificationsQuerySchema accepts read/unread and rejects other status", () => {
  assert.equal(
    listNotificationsQuerySchema.parse({ status: "unread" }).status,
    "unread",
  );
  assert.equal(
    listNotificationsQuerySchema.parse({ status: "read" }).status,
    "read",
  );
  assert.equal(
    listNotificationsQuerySchema.safeParse({ status: "archived" }).success,
    false,
  );
});

test("listNotificationsQuerySchema caps limit and rejects page below 1", () => {
  assert.equal(
    listNotificationsQuerySchema.safeParse({ limit: "101" }).success,
    false,
  );
  assert.equal(
    listNotificationsQuerySchema.safeParse({ page: "0" }).success,
    false,
  );
});

test("notificationParamsSchema accepts a uuid and rejects other strings", () => {
  assert.equal(
    notificationParamsSchema.safeParse({
      id: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    }).success,
    true,
  );
  assert.equal(notificationParamsSchema.safeParse({ id: "42" }).success, false);
});
