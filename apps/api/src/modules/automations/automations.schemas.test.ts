import assert from "node:assert/strict";
import { test } from "node:test";
import {
  automationParamsSchema,
  listAutomationLogsQuerySchema,
  updateAutomationSchema,
} from "./automations.schemas";

test("automationParamsSchema accepts a uuid and rejects other strings", () => {
  assert.equal(
    automationParamsSchema.safeParse({
      id: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    }).success,
    true,
  );
  assert.equal(automationParamsSchema.safeParse({ id: "42" }).success, false);
});

test("updateAutomationSchema accepts enabled only", () => {
  const parsed = updateAutomationSchema.parse({ enabled: true });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.config, undefined);
});

test("updateAutomationSchema accepts config only", () => {
  const parsed = updateAutomationSchema.parse({ config: { threshold: 3 } });
  assert.deepEqual(parsed.config, { threshold: 3 });
});

test("updateAutomationSchema rejects an empty body", () => {
  assert.equal(updateAutomationSchema.safeParse({}).success, false);
});

test("updateAutomationSchema rejects a non-boolean enabled", () => {
  assert.equal(
    updateAutomationSchema.safeParse({ enabled: "yes" }).success,
    false,
  );
});

test("listAutomationLogsQuerySchema defaults and coerces pagination", () => {
  const parsed = listAutomationLogsQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);

  const coerced = listAutomationLogsQuerySchema.parse({
    page: "3",
    limit: "50",
  });
  assert.equal(coerced.page, 3);
  assert.equal(coerced.limit, 50);
});

test("listAutomationLogsQuerySchema caps limit and rejects page below 1", () => {
  assert.equal(
    listAutomationLogsQuerySchema.safeParse({ limit: "101" }).success,
    false,
  );
  assert.equal(
    listAutomationLogsQuerySchema.safeParse({ page: "0" }).success,
    false,
  );
});
