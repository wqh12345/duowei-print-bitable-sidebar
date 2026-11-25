import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 状态条（气泡）同时有「主行 + 次行」时的排版约束。
//
// 回归背景：次行 .status-detail 用 flex: 0 0 100% 想独占一行，但容器没有
// flex-wrap: wrap，于是次行与主行挤在同一条 flex 线上——次行的长文案把
// .status-primary（flex: 1 1 auto; min-width: 0）压到只剩一个字宽，气泡变成
// 「一字一行」的竖条，高度暴涨、次行还会溢出卡片右侧。改动前即红的
// changeBatchLayout 失败路径（同时设置 status 与 error）正好命中该组合。
//
// 同时必须显式 box-sizing: border-box：fixed + left:50% + max-width 场景下，
// content-box 会让「max-width + padding + border」超出视口 34px，窄面板横向溢出。

const statusLineBlock = () => {
  const source = readFileSync("src/App.vue", "utf8");
  const block = source.match(/\.status-line \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(block, ".status-line 样式块未找到，选择器可能被重命名");
  return block;
};

const statusDetailBlock = () => {
  const source = readFileSync("src/App.vue", "utf8");
  const block = source.match(/\.status-detail \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(block, ".status-detail 样式块未找到，选择器可能被重命名");
  return block;
};

test("B-STATUS-STYLE-01: 次行独占一行需要容器允许换行", () => {
  const block = statusLineBlock();
  assert.match(block, /flex-wrap:\s*wrap;/, "缺少 flex-wrap: wrap，次行的 100% 基宽会挤压主行");
  assert.match(block, /display:\s*flex;/);
});

test("B-STATUS-STYLE-02: 气泡宽度按内容收缩并受上限约束", () => {
  const block = statusLineBlock();
  assert.match(block, /width:\s*max-content;/, "缺少 width: max-content，缺省 auto 会让主行被次行挤成一字宽");
  assert.match(block, /max-width:\s*min\(620px, calc\(100vw - 24px\)\);/);
  assert.match(block, /box-sizing:\s*border-box;/, "content-box 会让气泡总宽超出视口");
});

test("B-STATUS-STYLE-03: 次行的 100% 基宽含内边距", () => {
  const block = statusDetailBlock();
  assert.match(block, /flex:\s*0 0 100%;/);
  assert.match(block, /box-sizing:\s*border-box;/, "次行 padding-left 需算在 100% 之内，否则溢出卡片右侧");
  assert.match(block, /white-space:\s*nowrap;/);
  assert.match(block, /text-overflow:\s*ellipsis;/);
});
