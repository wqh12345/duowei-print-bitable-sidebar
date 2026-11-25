import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = () => readFileSync("src/App.vue", "utf8");

test("B-SAVE-VIEW-01: 批量保存期间不重载可见画布", () => {
  const source = appSource();
  const save = source.slice(source.indexOf("async function saveTemplate"), source.indexOf("function templateLayoutLabel"));
  assert.doesNotMatch(save, /await flushBatchProjectionSync\(\)/);
  const beforePersist = save.slice(0, save.indexOf("const persist = async"));
  assert.doesNotMatch(beforePersist, /canvasRebinding\.value = true/);
  assert.match(save, /const editedTemplate = restoreImplicitSelectionLayering\(\s*getPersistentTemplateData\(designerRef\.value\)/);
});

test("B-SAVE-VIEW-02: 保存成功后先隐藏画布，再逐条渲染批量预览", () => {
  const source = appSource();
  const block = source.match(/render: async \(\) => \{[\s\S]*?renderPrintJobPages[\s\S]*?\n          \},/)?.[0] ?? "";
  assert.ok(block, "commitBatchTemplateEdit 的 render 回调未找到");
  const hidden = block.indexOf('workspaceMode.value = "preview";');
  const tick = block.indexOf("await nextTick();");
  const render = block.indexOf("return renderPrintJobPages");
  assert.ok(hidden !== -1 && hidden < tick && tick < render, "预览层必须先上屏，再重载画布");
  assert.match(source, /v-if="previewHtml && !batchSavePreviewPending"/);
  assert.match(source, /batchSavePreviewPending \? '正在生成批量预览'/);
});

test("B-SAVE-VIEW-03: 保存按钮有独立 loading 与重复提交保护", () => {
  const source = appSource();
  assert.match(source, /\|\| busy\.value \|\| \(workspaceMode\.value !== "edit"/);
  assert.match(source, /:aria-busy="savingTemplate" @click="saveTemplate\(\)"/);
  assert.match(source, /savingTemplate \? '保存中…' : '保存模板'/);
  assert.match(source, /\.save-button-spinner\s*\{/);
  assert.match(source, /batchSavePreviewPending\.value = false;\s*savingTemplate\.value = false;\s*busy\.value = false;/);
});
