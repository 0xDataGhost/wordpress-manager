import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listWpCommandsQuerySchema,
  wpCommandParamsSchema,
} from "./wp-commands.schemas";

test("listWpCommandsQuerySchema applies defaults and bounds", () => {
  const parsed = listWpCommandsQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);

  const bounded = listWpCommandsQuerySchema.safeParse({ limit: "500" });
  assert.equal(bounded.success, false);
});

test("listWpCommandsQuerySchema accepts known status/domain filters only", () => {
  const ok = listWpCommandsQuerySchema.parse({
    status: "failed",
    domain: "product",
    page: "2",
    limit: "50",
  });
  assert.equal(ok.status, "failed");
  assert.equal(ok.domain, "product");
  assert.equal(ok.page, 2);
  assert.equal(ok.limit, 50);

  assert.equal(
    listWpCommandsQuerySchema.safeParse({ status: "exploded" }).success,
    false,
  );
  assert.equal(
    listWpCommandsQuerySchema.safeParse({ domain: "plugins" }).success,
    false,
  );
});

test("wpCommandParamsSchema requires a uuid", () => {
  assert.equal(wpCommandParamsSchema.safeParse({ id: "nope" }).success, false);
  assert.equal(
    wpCommandParamsSchema.safeParse({
      id: "0b0e8f6a-1111-4222-8333-444455556666",
    }).success,
    true,
  );
});
