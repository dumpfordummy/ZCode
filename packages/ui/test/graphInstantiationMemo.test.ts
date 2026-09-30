import assert from "node:assert/strict";
import test from "node:test";
import {
  forgetGraphInstantiations,
  graphInstantiationFingerprint,
  isRememberedGraphInstantiation,
  rememberGraphInstantiation,
} from "../src/graph-engineering/graphInstantiationMemo.js";

test("the fingerprint ignores key order but not values", () => {
  const a = graphInstantiationFingerprint({ id: "generic", parameters: { b: 1, a: "x" } });
  const b = graphInstantiationFingerprint({ parameters: { a: "x", b: 1 }, id: "generic" });
  assert.equal(a, b);
  assert.notEqual(
    a,
    graphInstantiationFingerprint({ id: "generic", parameters: { b: 2, a: "x" } }),
  );
});

test("an unchanged form and design is recognised; any change is not", () => {
  forgetGraphInstantiations();
  const fingerprint = graphInstantiationFingerprint({ id: "generic", request: "r" });
  assert.equal(isRememberedGraphInstantiation("w", fingerprint, "content"), false);
  rememberGraphInstantiation("w", fingerprint, "content");
  assert.equal(isRememberedGraphInstantiation("w", fingerprint, "content"), true);
  // 表单变了、设计内容变了、或者是另一个工作区：都必须重新创建，而不是复用。
  assert.equal(
    isRememberedGraphInstantiation(
      "w",
      graphInstantiationFingerprint({ id: "generic", request: "r2" }),
      "content",
    ),
    false,
  );
  assert.equal(isRememberedGraphInstantiation("w", fingerprint, "edited"), false);
  assert.equal(isRememberedGraphInstantiation("other", fingerprint, "content"), false);
  forgetGraphInstantiations();
  assert.equal(isRememberedGraphInstantiation("w", fingerprint, "content"), false);
});
