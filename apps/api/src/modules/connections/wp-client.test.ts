import assert from "node:assert/strict";
import { test } from "node:test";
import { isOutboundUrlAllowed } from "./wp-client";

test("allows public http(s) site URLs", () => {
  assert.equal(isOutboundUrlAllowed("https://shop.example.com"), true);
  assert.equal(isOutboundUrlAllowed("http://store.example.sa/blog"), true);
});

test("blocks loopback and localhost", () => {
  assert.equal(isOutboundUrlAllowed("http://127.0.0.1/"), false);
  assert.equal(isOutboundUrlAllowed("http://localhost/"), false);
  assert.equal(isOutboundUrlAllowed("https://api.localhost/"), false);
  assert.equal(isOutboundUrlAllowed("http://[::1]/"), false);
});

test("blocks private and link-local IPv4 ranges + cloud metadata", () => {
  assert.equal(isOutboundUrlAllowed("http://10.0.0.5/"), false);
  assert.equal(isOutboundUrlAllowed("http://192.168.1.1/"), false);
  assert.equal(isOutboundUrlAllowed("http://172.16.0.1/"), false);
  assert.equal(isOutboundUrlAllowed("http://172.31.255.255/"), false);
  assert.equal(isOutboundUrlAllowed("http://169.254.169.254/latest/meta-data/"), false);
  assert.equal(isOutboundUrlAllowed("http://100.64.0.1/"), false);
});

test("allows public IPv4 just outside private ranges", () => {
  assert.equal(isOutboundUrlAllowed("http://172.32.0.1/"), true);
  assert.equal(isOutboundUrlAllowed("http://8.8.8.8/"), true);
});

test("blocks unique-local and link-local IPv6 + IPv4-mapped", () => {
  assert.equal(isOutboundUrlAllowed("http://[fd00::1]/"), false);
  assert.equal(isOutboundUrlAllowed("http://[fe80::1]/"), false);
  assert.equal(isOutboundUrlAllowed("http://[::ffff:127.0.0.1]/"), false);
});

test("blocks non-http(s) schemes and invalid URLs", () => {
  assert.equal(isOutboundUrlAllowed("file:///etc/passwd"), false);
  assert.equal(isOutboundUrlAllowed("ftp://example.com/"), false);
  assert.equal(isOutboundUrlAllowed("not a url"), false);
});
