import assert from "node:assert/strict";
import test from "node:test";
import { orderTemplatesWithFirstDefault } from "../src/components/template-management.ts";

const T = (id: string) => ({ id });

test("SPEC-TPL-LIST-01: the default template is hoisted to the first position", () => {
  const ordered = orderTemplatesWithFirstDefault([T("a"), T("b"), T("c")], "c");
  assert.deepEqual(ordered.map((item) => item.id), ["c", "a", "b"]);
});

test("SPEC-TPL-LIST-01: the remaining templates keep their stored order (stable)", () => {
  const ordered = orderTemplatesWithFirstDefault([T("a"), T("b"), T("c"), T("d")], "b");
  assert.deepEqual(ordered.map((item) => item.id), ["b", "a", "c", "d"]);
});

test("SPEC-TPL-LIST-01: no default keeps the list untouched", () => {
  const ordered = orderTemplatesWithFirstDefault([T("a"), T("b")], null);
  assert.deepEqual(ordered.map((item) => item.id), ["a", "b"]);
});

test("SPEC-TPL-LIST-01: a default already first or missing is a no-op", () => {
  assert.deepEqual(orderTemplatesWithFirstDefault([T("a"), T("b")], "a").map((i) => i.id), ["a", "b"]);
  assert.deepEqual(orderTemplatesWithFirstDefault([T("a"), T("b")], "zzz").map((i) => i.id), ["a", "b"]);
});

test("SPEC-TPL-LIST-01: ordering does not mutate the input array", () => {
  const source = [T("a"), T("b"), T("c")];
  orderTemplatesWithFirstDefault(source, "c");
  assert.deepEqual(source.map((item) => item.id), ["a", "b", "c"]);
});
