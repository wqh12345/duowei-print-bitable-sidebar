import assert from "node:assert/strict";
import test from "node:test";
import {
  getBatchReadFailureFeedback,
  shouldShowBatchReadRetry,
} from "../src/components/batch-read-feedback.ts";
import { BitableReadTimeoutError } from "../src/host/read-timeout.ts";
import { feedbackText } from "../src/core/feedback-copy.ts";

test("CT-BATCH-07-UI: a timed-out batch read exposes retry without claiming the batch changed", () => {
  const feedback = getBatchReadFailureFeedback(
    new BitableReadTimeoutError("读取记录", 15_000),
  );

  // 断言 code 渲染出的文案，而不是散落的中文字面量
  assert.equal(feedback.status, feedbackText("warn.batch.retryTimeout"));
  assert.match(feedback.status, /打印记录没有改变/);
  assert.match(feedback.status, /重试批量读取/);
  // 超时时主行已说明全部信息，次行不再重复技术细节
  assert.equal(feedback.error, "");
  assert.equal(feedback.tone, "warning");
  assert.equal(feedback.retryAvailable, true);
  assert.equal(shouldShowBatchReadRetry(feedback.retryAvailable, false), true);
});

test("CT-BATCH-07-UI: retry stays hidden while another operation is busy", () => {
  const feedback = getBatchReadFailureFeedback(
    new BitableReadTimeoutError("获取当前多维表格选择", 15_000),
  );

  assert.equal(shouldShowBatchReadRetry(feedback.retryAvailable, true), false);
});

test("CT-BATCH-07-UI: ordinary failures do not offer a misleading timeout retry", () => {
  const feedback = getBatchReadFailureFeedback(new Error("记录无权访问"));

  assert.deepEqual(feedback, {
    status: feedbackText("error.batch.readFailed"),
    tone: "error",
    error: "记录无权访问",
    retryAvailable: false,
  });
  assert.equal(shouldShowBatchReadRetry(feedback.retryAvailable, false), false);
});

test("CT-BATCH-07-UI: a failure carrying technical detail is cleaned before it reaches the bubble", () => {
  const feedback = getBatchReadFailureFeedback(new Error("读取失败（traceId: abc-123）"));

  assert.doesNotMatch(feedback.error, /traceId/);
  assert.match(feedback.error, /读取失败/);
});
