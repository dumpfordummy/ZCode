import assert from "node:assert/strict";
import test from "node:test";
import { assertArtifactRedaction, fixtureTrxRedactionExpectation } from "./pre-z8-u2-proof.mjs";

test("generated TRX classification includes native user-directory assembly metadata", () => {
  assert.equal(
    fixtureTrxRedactionExpectation(
      '<TestMethod codeBase="C:\\Users\\Fixture\\work\\bin\\Fixture.Tests.dll" />',
    ),
    "sensitive",
  );
  assert.equal(
    fixtureTrxRedactionExpectation(
      '<TestMethod codeBase="/home/fixture/work/bin/Fixture.Tests.dll" />',
    ),
    "sensitive",
  );
  assert.equal(
    fixtureTrxRedactionExpectation('<TestMethod codeBase="/tmp/fixture/bin/Fixture.Tests.dll" />'),
    "clean",
  );
});

// 预定的工件收据与预览。内容敏感性由测试作者根据产品声明的脱敏规则独立判定
// （feedbackPrivacy.ts:4 的 sensitiveKey 含 password/secret/token 等），不调用被测
// redactFeedbackText 生成预期答案。proof 据此预期拒绝标志/digest 不一致的中间态，
// 而不是按产品返回的 redacted 选择一条总能接受当前输出的分支。
const ORIGINAL_DIGEST = "original-sha256";
const SCRUBBED_DIGEST = "scrubbed-sha256";

function receipt(originalDigest = ORIGINAL_DIGEST) {
  return { original: { digest: originalDigest, bytes: 64, modifiedAt: 1 } };
}

function preview({ redacted, validation, digest }) {
  return { digest, validation, ...(redacted ? { redacted: true } : {}) };
}

test("clean content: known-clean fixture TRX is preserved unredacted", () => {
  // 已知干净内容（合成 Cases.cs 生成的 TRX，无敏感字段）→ 产品须保留原字节。
  assertArtifactRedaction(
    preview({ redacted: false, validation: "valid", digest: ORIGINAL_DIGEST }),
    receipt(),
    "clean",
  );
});

test("sensitive content: known-sensitive fixture is redacted with digest drift", () => {
  // 已知敏感内容（含 password 字段）→ 产品须脱敏、标记 incomplete、digest 漂移。
  assertArtifactRedaction(
    preview({ redacted: true, validation: "incomplete", digest: SCRUBBED_DIGEST }),
    receipt(),
    "sensitive",
  );
});

test("clean content rejects over-redaction (product must not redact clean fixture)", () => {
  // 干净内容被误标 redacted → proof 拒绝，不接受 sensitive 分支。
  assert.throws(
    () =>
      assertArtifactRedaction(
        preview({ redacted: true, validation: "incomplete", digest: SCRUBBED_DIGEST }),
        receipt(),
        "clean",
      ),
    /must not be marked redacted/,
  );
});

test("clean content rejects digest drift without redaction flag", () => {
  assert.throws(
    () =>
      assertArtifactRedaction(
        preview({ redacted: false, validation: "valid", digest: "different-sha256" }),
        receipt(),
        "clean",
      ),
    /must match original/,
  );
});

test("sensitive content rejects under-redaction (security hole: secret retained)", () => {
  // 敏感内容未被脱敏 → proof 拒绝，不接受 clean 分支。
  // 这是 proof 不能仅按产品输出选分支的关键：漏脱敏不能伪装成干净通过。
  assert.throws(
    () =>
      assertArtifactRedaction(
        preview({ redacted: false, validation: "valid", digest: ORIGINAL_DIGEST }),
        receipt(),
        "sensitive",
      ),
    /must be marked redacted/,
  );
});

test("sensitive content rejects inconsistent validation flag", () => {
  // redacted=true 但 validation=valid → 标志不一致，proof 拒绝。
  assert.throws(
    () =>
      assertArtifactRedaction(
        preview({ redacted: true, validation: "valid", digest: SCRUBBED_DIGEST }),
        receipt(),
        "sensitive",
      ),
    /must be incomplete/,
  );
});

test("sensitive content rejects non-drifting digest", () => {
  // redacted=true/incomplete 但 digest 未漂移 → 不一致，proof 拒绝。
  assert.throws(
    () =>
      assertArtifactRedaction(
        preview({ redacted: true, validation: "incomplete", digest: ORIGINAL_DIGEST }),
        receipt(),
        "sensitive",
      ),
    /must drift/,
  );
});
