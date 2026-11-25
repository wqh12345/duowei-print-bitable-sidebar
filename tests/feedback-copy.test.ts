import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_COPY,
  FORBIDDEN_TOKENS,
  MAX_DIALOG_TITLE_LENGTH,
  MAX_HINT_LENGTH,
  MAX_MAIN_LENGTH,
  describeError,
  feedbackText,
  feedbackTone,
  findForbiddenTokens,
  sanitizeForUser,
  type FeedbackCode,
} from "../src/core/feedback-copy.ts";
import {
  MAX_DURATION,
  TONE_PRIORITY,
  composeStatusLine,
  createFeedbackGate,
  durationFor,
} from "../src/components/status-feedback.ts";

const codes = Object.keys(FEEDBACK_COPY) as FeedbackCode[];
const entries = codes.map((code) => [code, FEEDBACK_COPY[code]] as const);
/** 弹窗标题与 tooltip 另有更短的上限 */
const isHint = (code: string) => code.startsWith("hint.");
const isDialogTitle = (code: string) => code.endsWith(".title");

test("SPEC-UX-16: every copy entry uses a known tone and a readable text", () => {
  for (const [code, entry] of entries) {
    assert.ok(Object.hasOwn(TONE_PRIORITY, entry.tone), `${code} 的 tone 非法：${entry.tone}`);
    assert.ok(entry.text.trim().length > 0, `${code} 文案为空`);
    assert.equal(entry.text, entry.text.trim(), `${code} 文案含首尾空白`);
  }
});

test("SPEC-UX-16: no copy entry leaks internal terminology or english tokens", () => {
  for (const [code, entry] of entries) {
    assert.deepEqual(findForbiddenTokens(entry.text), [], `${code} 上屏文案含禁止词`);
    assert.deepEqual(findForbiddenTokens(feedbackText(code)), []);
  }
  // 禁止词表本身必须覆盖已知的历史缺陷
  for (const token of ["宿主", "上下文", "traceId", "HTTP_", "registry"]) {
    assert.ok(FORBIDDEN_TOKENS.includes(token as never), `禁止词表缺少 ${token}`);
  }
});

test("SPEC-UX-16: copy length stays inside the agreed limits", () => {
  for (const [code, entry] of entries) {
    if (isHint(code)) {
      assert.ok(entry.text.length <= MAX_HINT_LENGTH, `${code} tooltip 超过 ${MAX_HINT_LENGTH} 字`);
      continue;
    }
    if (isDialogTitle(code)) {
      assert.ok(entry.text.length <= MAX_DIALOG_TITLE_LENGTH,
        `${code} 弹窗标题超过 ${MAX_DIALOG_TITLE_LENGTH} 字：${entry.text}`);
      continue;
    }
    if (code.startsWith("dialog.")) continue;
    assert.ok(entry.text.length <= MAX_MAIN_LENGTH,
      `${code} 主提示超过 ${MAX_MAIN_LENGTH} 字：${entry.text}`);
  }
});

test("SPEC-UX-16: dialog bodies stay within 50 characters", () => {
  for (const [code, entry] of entries) {
    if (!code.startsWith("dialog.") || code.endsWith(".title")) continue;
    assert.ok(entry.text.length <= 50, `${code} 弹窗正文超过 50 字：${entry.text}`);
  }
});

test("SPEC-UX-16: codes are grouped by domain and never collide", () => {
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.match(code, /^[a-z]+(\.[a-z][A-Za-z0-9]*)+$/, `${code} 不符合 域.子域.动作 的命名`);
  }
});

test("SPEC-UX-16: read-only copy is informational and offers a way out", () => {
  assert.equal(feedbackTone("status.permission.readonly"), "info");
  const text = feedbackText("status.permission.readonly");
  assert.match(text, /阅读权限/);
  assert.match(text, /编辑权限/);
  assert.doesNotMatch(text, /失败|错误|异常/);
  assert.equal(feedbackTone("hint.permission.readonly"), "info");
});

test("SPEC-UX-16: placeholders are filled from params and left intact when missing", () => {
  assert.equal(feedbackText("status.load.records", { count: 3 }), "已加载 3 条记录");
  assert.equal(feedbackText("status.save.batchRefreshed", { count: 5 }), "模板已保存，已按 5 条记录刷新预览");
  assert.equal(feedbackText("status.source.copiedCell", { name: "订单号" }),
    "已复制「订单号」。在表格单元格上右键，选「粘贴」");
  assert.equal(feedbackText("status.load.records"), "已加载 {count} 条记录");
});

test("SPEC-UX-16: sanitizeForUser strips technical detail before it reaches the bubble", () => {
  assert.equal(sanitizeForUser("[object Event]"), "未知错误");
  assert.doesNotMatch(sanitizeForUser("模板保存失败（traceId: abc-123）"), /traceId/);
  assert.doesNotMatch(sanitizeForUser("模板同步授权服务 HTTP_500"), /HTTP_/);
  assert.match(sanitizeForUser("模板同步授权服务 HTTP_500"), /服务暂时不可用/);
  assert.doesNotMatch(sanitizeForUser("读取超时：获取字段元数据（15000ms）"), /ms|15000/);
  assert.equal(sanitizeForUser("已保留当前模板草稿；宿主记录已切换"), "已保留当前模板草稿；文档记录已切换");
  assert.equal(sanitizeForUser("读取其他记录或上下文前"), "读取其他记录或记录前");
  assert.equal(sanitizeForUser("automation failed: registry unavailable"),
    "automation failed: 自动化服务暂时不可用");
  assert.equal(sanitizeForUser(""), "");
  assert.equal(sanitizeForUser(undefined), "");
});

test("SPEC-UX-16: describeError falls back when the cause carries no usable text", () => {
  assert.equal(describeError(new Error("存储写入失败"), "模板没有保存"), "存储写入失败");
  assert.equal(describeError(new Error("[object Event]"), "模板没有保存"), "未知错误");
  assert.equal(describeError(null, "模板没有保存"), "模板没有保存");
  assert.equal(describeError(new Error("   "), "模板没有保存"), "模板没有保存");
});

test("SPEC-UX-16: duration grows with tone and length but never exceeds the cap", () => {
  assert.equal(durationFor("success", "模板已保存"), 2600);
  assert.equal(durationFor("warning", "模板已保存"), 3600);
  assert.equal(durationFor("error", "模板没有保存"), 4000);
  assert.equal(durationFor("error", "模板没有保存".repeat(12)), MAX_DURATION);
  assert.ok(durationFor("error", "模板没有保存".repeat(5)) > 4000);
  assert.equal(durationFor("progress", "正在保存模板 1/3"), 2600);
});

test("SPEC-UX-16: the status line shows one primary conclusion plus an optional reason", () => {
  const model = composeStatusLine({
    status: "模板没有保存，原来的模板仍可用",
    statusTone: "warning",
    error: "存储写入失败",
    templateWarning: "",
    previewError: "",
    readOnly: "",
    busy: false,
    retryVisible: false,
    toastVisible: true,
  });
  assert.equal(model.primary, "模板没有保存，原来的模板仍可用");
  assert.equal(model.detail, "存储写入失败");
  assert.equal(model.tone, "error");
  assert.equal(model.visible, true);
});

test("SPEC-UX-16: a template warning never shares the primary slot with the save result", () => {
  const model = composeStatusLine({
    status: "模板已保存，批量预览还是旧的；回到预览时会重新生成",
    statusTone: "warning",
    error: "",
    templateWarning: "编辑画布没有和已保存的模板一致",
    previewError: "",
    readOnly: "",
    busy: false,
    retryVisible: false,
    toastVisible: true,
  });
  assert.equal(model.primary, "模板已保存，批量预览还是旧的；回到预览时会重新生成");
  assert.equal(model.detail, "");
  assert.equal(model.tone, "warning");
});

test("SPEC-UX-16: read-only notice renders as information, not as a failure", () => {
  const model = composeStatusLine({
    status: feedbackText("status.permission.readonly"),
    statusTone: "info",
    error: "",
    templateWarning: "",
    previewError: "",
    readOnly: feedbackText("status.permission.readonly"),
    busy: false,
    retryVisible: false,
    toastVisible: true,
  });
  assert.equal(model.tone, "info");
  assert.equal(model.detail, "");
});

test("SPEC-UX-16: an empty status still surfaces the reason and stays visible while busy", () => {
  const failure = composeStatusLine({
    status: "",
    statusTone: "progress",
    error: "记录无权访问",
    templateWarning: "",
    previewError: "",
    readOnly: "",
    busy: false,
    retryVisible: false,
    toastVisible: true,
  });
  assert.equal(failure.primary, "记录无权访问");
  assert.equal(failure.tone, "error");

  const busy = composeStatusLine({
    status: "",
    statusTone: "progress",
    error: "",
    templateWarning: "",
    previewError: "",
    readOnly: "",
    busy: true,
    retryVisible: false,
    toastVisible: true,
  });
  assert.equal(busy.visible, true);
  assert.equal(busy.primary, "");
  assert.equal(busy.tone, "progress");
});

test("SPEC-UX-16: long reasons are clipped before they reach the second line", () => {
  const model = composeStatusLine({
    status: "模板没有保存，原来的模板仍可用",
    statusTone: "warning",
    error: "读".repeat(120),
    templateWarning: "",
    previewError: "",
    readOnly: "",
    busy: false,
    retryVisible: false,
    toastVisible: true,
  });
  assert.ok(model.detail.length <= 40, `次行 ${model.detail.length} 字`);
  assert.ok(model.detail.endsWith("…"));
});

test("SPEC-UX-16: a failure is not replaced by the progress that follows it", () => {
  const gate = createFeedbackGate();
  assert.equal(gate.accept("success"), true);
  assert.equal(gate.accept("error"), true);
  assert.equal(gate.locked, "error");
  assert.equal(gate.accept("progress"), false);
  assert.equal(gate.accept("success"), false);
  assert.equal(gate.accept("warning"), false);
  assert.equal(gate.accept("error"), true);
  gate.release();
  assert.equal(gate.locked, null);
  assert.equal(gate.accept("progress"), true);
});

test("SPEC-UX-16: informational notices never lock the status line", () => {
  const gate = createFeedbackGate();
  assert.equal(gate.accept("info"), true);
  assert.equal(gate.locked, null);
  assert.equal(gate.accept("warning"), true);
  assert.equal(gate.locked, "warning");
  assert.equal(gate.accept("info"), false);
});
