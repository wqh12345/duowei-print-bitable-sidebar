import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// B-IMAGE-EVENT-01
// 引擎 stitchImages 把 `img.onerror` 的裸 DOM Event 交给 reject()，reason 没有 stack，
// dev 下 webpack-dev-server 会把它当未知异常弹全屏浮层（只显示 "[object Event]"），
// 生产下则是一条无人处理的 unhandledrejection。宿主兜底必须满足三个条件：
// 捕获阶段注册（先于 dev-server 的冒泡监听）、只拦资源加载类、卸载时对称移除。

const appSource = () => readFileSync("src/App.vue", "utf8");

test("B-IMAGE-EVENT-01: the host swallows only resource-load rejections in the capture phase", () => {
  const source = appSource();
  const handler = source.match(/function handleUnhandledResourceRejection[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(handler, /event\.preventDefault\(\);/);
  assert.match(handler, /event\.stopImmediatePropagation\(\);/);
  assert.match(handler, /if \(source === null\) return;/);
  // 只认 Event + type=error，或引擎补丁注入的可读前缀；普通 Error 必须原样放行。
  assert.match(source, /reason instanceof Event && reason\.type === "error"/);
  assert.match(source, /const STITCHED_IMAGE_ERROR_PREFIX = "\[duowei\] print page image failed to load";/);
  assert.match(source, /reason instanceof Error && reason\.message\.startsWith\(STITCHED_IMAGE_ERROR_PREFIX\)/);
  // 捕获阶段注册是关键：dev-server 的 overlay 用默认（冒泡）监听，先注册但后执行。
  assert.match(
    source,
    /window\.addEventListener\("unhandledrejection", handleUnhandledResourceRejection, true\);/,
  );
  assert.match(
    source,
    /window\.removeEventListener\("unhandledrejection", handleUnhandledResourceRejection, true\);/,
  );
});
