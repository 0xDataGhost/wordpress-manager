import assert from "node:assert/strict";
import { test } from "node:test";
import { toPublicOrderView, type PublicCodeRow } from "./customer-access.serializer";

const rows: PublicCodeRow[] = [
  {
    codeId: "c1",
    codePreview: "ABCD••••WXYZ",
    productId: "p1",
    productName: "Netflix 1 Month",
    instructions: "فعّل عبر الموقع",
  },
  {
    codeId: "c2",
    codePreview: "EFGH••••7890",
    productId: "p1",
    productName: "Netflix 1 Month",
    instructions: "فعّل عبر الموقع",
  },
  {
    codeId: "c3",
    codePreview: "ZZZZ••••0000",
    productId: "p2",
    productName: "Spotify",
    instructions: null,
  },
];

test("toPublicOrderView groups codes by product", () => {
  const view = toPublicOrderView("1025", "Sho9", rows);
  assert.equal(view.orderNumber, "1025");
  assert.equal(view.storeName, "Sho9");
  assert.equal(view.items.length, 2);
  const netflix = view.items.find((i) => i.productName === "Netflix 1 Month");
  assert.equal(netflix?.codes.length, 2);
  assert.deepEqual(
    netflix?.codes.map((c) => c.id),
    ["c1", "c2"],
  );
});

test("public order view NEVER exposes cipher/iv/tag/hash or a raw code", () => {
  const view = toPublicOrderView("1025", "Sho9", rows);
  const serialized = JSON.stringify(view);
  for (const forbidden of ["cipher", "codeIv", '"iv"', '"tag"', "hash", "codeCipher", "codeTag"]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `serialized view must not contain ${forbidden}`,
    );
  }
  // Only masked previews + ids are present.
  for (const item of view.items) {
    for (const code of item.codes) {
      assert.ok(code.codePreview === null || code.codePreview.includes("••••"));
    }
  }
});

test("empty delivered set yields an empty items array", () => {
  const view = toPublicOrderView("1025", "Sho9", []);
  assert.deepEqual(view.items, []);
});
