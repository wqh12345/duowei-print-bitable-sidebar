/**
 * 气泡提示语的唯一文案来源。
 *
 * 只收「需要非默认 tone / 需要被测试断言 / 至少两处复用」的文案；按钮名、
 * 菜单名、纯进度文本不在此列，避免把整份 UI 文案搬进字典。
 * 文案规范见《需求-气泡提示语优化.md》§4：陈述式、失败说「没有…」、
 * 主提示 ≤60 字、tooltip ≤30 字、不得出现内部术语与英文 Token。
 */

export type FeedbackTone = "progress" | "info" | "success" | "warning" | "error";

export type FeedbackCopyEntry = {
  tone: FeedbackTone;
  text: string;
};

/** 主提示字数上限；超出即视为文案缺陷 */
export const MAX_MAIN_LENGTH = 60;
/** 次行（原因）字数上限 */
export const MAX_DETAIL_LENGTH = 40;
/** tooltip 字数上限 */
export const MAX_HINT_LENGTH = 30;
/** 弹窗标题字数上限 */
export const MAX_DIALOG_TITLE_LENGTH = 14;

export const FEEDBACK_COPY = {
  // —— 自动化连接 ——
  "status.automation.disconnected": {
    tone: "info",
    text: "自动化还没有连接；点「连接自动化」完成授权",
  },
  "status.automation.connecting": {
    tone: "progress",
    text: "正在连接自动化服务…",
  },
  "status.automation.waitWindow": {
    tone: "info",
    text: "在打开的窗口里完成飞书授权，完成后回到这里",
  },
  "status.automation.syncing": {
    tone: "progress",
    text: "已连接，正在同步模板…",
  },
  "status.automation.connected": {
    tone: "success",
    text: "自动化已连接，模板已同步",
  },
  "warn.automation.connectFailed": {
    tone: "warning",
    text: "连接没有生效，可以再试一次",
  },
  "warn.automation.syncFailed": {
    tone: "warning",
    text: "模板没有同步到自动化；当前打印不受影响",
  },
  "error.automation.windowBlocked": {
    tone: "error",
    text: "浏览器拦住了连接窗口；允许打开弹窗后再试",
  },
  "error.automation.oauth": {
    tone: "error",
    text: "飞书连接没有完成；回到插件后重试",
  },

  // —— 记录读取 ——
  "status.load.recordSwitched": {
    tone: "info",
    text: "记录已切换，正在重新读取",
  },
  "warn.load.invalidView": {
    tone: "warning",
    text: "这里不是记录视图；请从多维表格的记录详情打开多维打印",
  },
  "status.load.records": {
    tone: "success",
    text: "已加载 {count} 条记录",
  },
  "error.load.failed": {
    tone: "error",
    text: "记录没能读取，原来的内容仍保留；请重试",
  },
  "status.batch.selectionUnchanged": {
    tone: "info",
    text: "打印记录没有改变，仍是原来的选择",
  },
  "error.batch.readFailed": {
    tone: "error",
    text: "批量选择没有成功，原来的打印任务仍可用",
  },
  "warn.batch.retryTimeout": {
    tone: "warning",
    text: "读取超时，打印记录没有改变；点「重试批量读取」再试一次",
  },

  // —— 批量选择 ——
  "status.batch.selectionSaved": {
    tone: "success",
    text: "已保存 {count} 条记录，预览已生成",
  },
  "warn.batch.selectionUnsaved": {
    tone: "warning",
    text: "记录选择没有保存，原来的预览仍可用",
  },
  "status.batch.selectionCleared": {
    tone: "success",
    text: "已清除模板保存的记录，回到当前记录",
  },
  "warn.batch.kept": {
    tone: "warning",
    text: "原来的批次仍可用",
  },
  "warn.batch.returnFailed": {
    tone: "warning",
    text: "没能回到当前记录，原来的批次仍可用",
  },
  "warn.batch.conflict": {
    tone: "warning",
    text: "批量模板有冲突修改没有同步；撤销冲突的修改后再试",
  },
  "error.batch.sync": {
    tone: "error",
    text: "批量模板没有同步：{reason}",
  },
  "warn.batch.previewPending": {
    tone: "warning",
    text: "批量预览还在生成，完成后再操作",
  },
  "error.batch.restore": {
    tone: "error",
    text: "没能恢复到保存前的模板",
  },

  // —— 模板加载与保存 ——
  "warn.template.legacyReadOnly": {
    tone: "warning",
    text: "记录和数据源已加载；这个旧模板需要先迁移才能保存",
  },
  "status.load.templateReady": {
    tone: "success",
    text: "模板已加载，数据已绑定",
  },
  "status.load.templateGenerated": {
    tone: "success",
    text: "已自动生成模板",
  },
  "status.preview.generateFailed": {
    tone: "warning",
    text: "模板已加载，预览没能生成；点「重试预览」",
  },
  "error.template.load": {
    tone: "error",
    text: "模板没能加载，当前记录仍可预览；请重试",
  },
  "status.save.saved": {
    tone: "success",
    text: "模板已保存",
  },
  "status.save.partialFailed": {
    tone: "warning",
    text: "模板已保存；预览没刷新、自动化没同步，可分别重试",
  },
  "status.save.previewStale": {
    tone: "warning",
    text: "模板已保存，批量预览还是旧的；回到预览时会重新生成",
  },
  "status.save.batchRefreshed": {
    tone: "success",
    text: "模板已保存，已按 {count} 条记录刷新预览",
  },
  "status.save.syncFailed": {
    tone: "warning",
    text: "模板已保存，自动化同步没成功；当前打印不受影响",
  },
  "status.save.forAutomation": {
    tone: "success",
    text: "模板已保存，可用于自动化",
  },
  "status.save.batchForAutomation": {
    tone: "success",
    text: "模板已保存，已按 {count} 条记录刷新，可用于自动化",
  },
  "status.save.failed": {
    tone: "warning",
    text: "模板没有保存，原来的模板仍可用",
  },
  "status.template.createdFromBatch": {
    tone: "info",
    text: "已退出原来的批量；{result}",
  },
  "status.template.createDraftBlank": {
    tone: "info",
    text: "已创建未保存空白模板草稿",
  },
  "status.template.createDraftAuto": {
    tone: "info",
    text: "已创建未保存自动模板草稿",
  },
  "error.template.create": {
    tone: "error",
    text: "新模板没有建成，当前模板不受影响；点「重试创建」再试一次",
  },
  "error.template.createReason": {
    tone: "error",
    text: "新模板没有建成：{reason}",
  },
  "warn.template.saveFirst": {
    tone: "warning",
    text: "保存模板后才能设置批量排版",
  },
  "warn.template.saveFirstForSwitch": {
    tone: "warning",
    text: "先保存模板的修改，再切换批量排版",
  },
  "status.template.layoutChanged": {
    tone: "success",
    text: "已切换为{layout}",
  },
  "warn.template.layoutUnchanged": {
    tone: "warning",
    text: "排版没有切换，模板和预览保持原样",
  },
  "warn.template.recordsUnavailable": {
    tone: "warning",
    text: "模板已切换；保存的记录暂时读不到",
  },
  "status.template.recordsRestored": {
    tone: "success",
    text: "已恢复模板保存的 {count} 条记录",
  },
  "status.template.switched": {
    tone: "success",
    text: "模板已切换，预览已更新",
  },
  "warn.template.switchFailed": {
    tone: "warning",
    text: "模板没有切换，原来的预览仍可用",
  },
  "warn.template.unsavedBeforeSwitch": {
    tone: "warning",
    text: "模板还有未保存的修改，保存后再切换",
  },
  "warn.template.noneSelected": {
    tone: "warning",
    text: "先在模板目录里选一个模板",
  },
  "warn.template.draftKept": {
    tone: "info",
    text: "已保留当前模板草稿",
  },
  "warn.template.recordSwitched": {
    tone: "warning",
    text: "草稿已保留。记录已切换，请重新读取后再继续编辑",
  },
  "warn.template.recordSwitchedDirty": {
    tone: "warning",
    text: "记录已切换。模板还有未保存的修改，保存后再继续",
  },
  "warn.template.dataSyncFailed": {
    tone: "warning",
    text: "数据源内容没有同步，画布仍是上一次的结果",
  },
  "error.template.dataSync": {
    tone: "error",
    text: "数据源没有同步：{reason}",
  },
  "error.designer.load": {
    tone: "error",
    text: "打印设计器没能加载；检查网络后重新打开插件",
  },

  // —— 模板目录 ——
  "status.directory.syncFailed": {
    tone: "warning",
    text: "模板目录已更新，自动化同步没成功；当前打印不受影响",
  },
  "status.directory.renamed": {
    tone: "success",
    text: "模板已重命名",
  },
  "status.directory.removed": {
    tone: "success",
    text: "模板已删除",
  },
  "status.directory.defaultUpdated": {
    tone: "success",
    text: "默认模板已更新",
  },
  "error.directory.update": {
    tone: "error",
    text: "模板目录没有更新，原来的模板仍可用",
  },

  // —— 编辑与预览 ——
  "warn.edit.failed": {
    tone: "warning",
    text: "编辑没能打开，当前打印预览仍可用",
  },
  "status.edit.loadedBatch": {
    tone: "success",
    text: "已加载 {count} 条记录",
  },
  "status.edit.entered": {
    tone: "success",
    text: "已进入编辑模式",
  },
  "status.edit.discarded": {
    tone: "success",
    text: "已放弃修改，回到原来的批量预览",
  },
  "warn.edit.discardedStale": {
    tone: "warning",
    text: "修改已放弃，原来的预览仍可用；回到预览时会重新生成",
  },
  "status.preview.refreshed": {
    tone: "success",
    text: "预览已刷新",
  },
  "error.preview.refresh": {
    tone: "error",
    text: "预览没能刷新，原来的预览仍可用",
  },
  "status.preview.batchRefreshed": {
    tone: "success",
    text: "已按 {count} 条记录刷新预览",
  },
  "warn.preview.kept": {
    tone: "warning",
    text: "原来的预览仍可用；可以继续编辑，或再试一次",
  },
  "status.preview.returned": {
    tone: "success",
    text: "已回到批量预览",
  },

  // —— 权限 ——
  "status.permission.readonly": {
    tone: "info",
    text: "当前是阅读权限，模板暂时不能编辑；需要修改请联系文档所有者开通编辑权限",
  },
  "hint.permission.readonly": {
    tone: "info",
    text: "阅读权限下不能打印、导出或选择记录",
  },
  "hint.busy": {
    tone: "info",
    text: "正在处理上一步操作，完成后再试",
  },

  // —— 数据源与输出 ——
  "status.source.copiedCell": {
    tone: "success",
    text: "已复制「{name}」。在表格单元格上右键，选「粘贴」",
  },
  "status.source.copiedText": {
    tone: "success",
    text: "已复制「{name}」。在文本组件上右键，选「粘贴」",
  },
  "error.source.copy": {
    tone: "error",
    text: "数据源没有复制成功，可以再点一次",
  },
  "status.output.printStarted": {
    tone: "info",
    text: "已打开系统打印窗口，在对话框里确认或取消",
  },
  "warn.output.printIncomplete": {
    tone: "warning",
    text: "打印没有完成，可以重新点「打印」",
  },
  "status.output.pdfReady": {
    tone: "success",
    text: "PDF 已生成（{pages} 页，{size}），正在下载",
  },
  "warn.output.pdfIncomplete": {
    tone: "warning",
    text: "PDF 没有导出，可以重新点「导出 PDF」",
  },

  // —— 空状态 ——
  "empty.preview.generating": {
    tone: "progress",
    text: "正在生成预览…",
  },
  "empty.preview.failed": {
    tone: "warning",
    text: "预览没能生成",
  },
  "empty.preview.reading": {
    tone: "progress",
    text: "正在读取记录和模板…",
  },
  "empty.preview.paused": {
    tone: "info",
    text: "回到这个页面后，预览会自动继续",
  },

  // —— 弹窗 ——
  "dialog.rename.title": {
    tone: "info",
    text: "重命名模板",
  },
  "dialog.rename.body": {
    tone: "info",
    text: "起一个容易认出的名字。",
  },
  "dialog.remove.title": {
    tone: "info",
    text: "删除模板",
  },
  "dialog.remove.body": {
    tone: "info",
    text: "删除「{name}」后无法恢复，其他模板不受影响。",
  },
  "dialog.unsaved.leave.title": {
    tone: "warning",
    text: "返回预览前，要保存模板吗？",
  },
  "dialog.unsaved.leave.body": {
    tone: "warning",
    text: "当前草稿还没保存。保存后即可返回预览。",
  },
  "dialog.unsaved.reload.title": {
    tone: "warning",
    text: "重新加载会放弃当前修改",
  },
  "dialog.unsaved.reload.body": {
    tone: "warning",
    text: "当前草稿会被覆盖，且无法恢复。",
  },
  "dialog.unsaved.context.title": {
    tone: "warning",
    text: "切换记录前，要保存模板吗？",
  },
  "dialog.unsaved.context.body": {
    tone: "warning",
    text: "当前草稿还没保存。保存后可继续读取下一条记录。",
  },

  // —— 菜单与标签 ——
  "menu.template.auto.description": {
    tone: "info",
    text: "根据当前表的字段生成初始排版",
  },
  "label.template.fallback": {
    tone: "info",
    text: "只读副本",
  },
  "label.sync.canvas": {
    tone: "progress",
    text: "正在同步画布…",
  },
} as const satisfies Record<string, FeedbackCopyEntry>;

export type FeedbackCode = keyof typeof FEEDBACK_COPY;

export function feedbackTone(code: FeedbackCode): FeedbackTone {
  return FEEDBACK_COPY[code].tone;
}

/** 渲染文案；`{name}` 形式占位符由 params 填充，缺参时原样保留以便暴露问题 */
export function feedbackText(
  code: FeedbackCode,
  params?: Record<string, string | number>,
): string {
  const template = FEEDBACK_COPY[code].text as string;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => (
    key in params ? String(params[key]) : placeholder
  ));
}

/** 上屏即缺陷的内部术语与英文 Token */
export const FORBIDDEN_TOKENS = [
  "宿主",
  "上下文",
  "traceId",
  "HTTP_",
  "Internal Server Error",
  "AUTH_SCOPE_INVALID",
  "registry",
  "Bearer",
  "recordId",
  "undefined",
  "null",
  "[object",
] as const;

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\[object [A-Za-z]+\]/g, "未知错误"],
  [/[（(]\s*traceId\s*[:：]\s*[A-Za-z0-9_-]+\s*[)）]/gi, ""],
  [/traceId\s*[:：]\s*[A-Za-z0-9_-]+/gi, ""],
  [/\bHTTP[_-]?5\d{2}\b/g, "服务暂时不可用"],
  [/\bHTTP[_-]?\d{3}\b/g, "服务异常"],
  [/Internal Server Error/gi, "服务暂时不可用"],
  [/AUTH_SCOPE_INVALID\s*[:：]?\s*/g, "自动化授权已失效"],
  [/\bregistry unavailable\b/gi, "自动化服务暂时不可用"],
  [/\bsecure random unavailable\b/gi, "当前环境无法生成安全随机数"],
  [/\bBearer\s+[A-Za-z0-9._-]+/gi, "授权凭证"],
  [/\brecordId\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "记录"],
  [/(\d{3,})\s*ms\b/gi, "几秒"],
  [/\bms\b/gi, ""],
  [/宿主/g, "文档"],
  [/上下文/g, "记录"],
  // 「服务 HTTP_500」替换后会在中文之间留下空格，读起来断句
  [/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, ""],
  [/[ \t]{2,}/g, " "],
];

/** 截断到指定长度，保留一个省略号；用于次行与 tooltip */
export function clipText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * 展示层清洗：去除内部术语、英文 Token、traceId 与毫秒数。
 * 只用于要上屏的文案，原始 cause 应留在 console。
 */
export function sanitizeForUser(input: unknown): string {
  const raw = typeof input === "string"
    ? input
    : input instanceof Error ? input.message : "";
  if (!raw) return "";
  let text = raw;
  for (const [pattern, replacement] of REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/^[；;，,、\s]+|[；;，,、\s]+$/g, "").trim();
}

/** 生成「原因」片段：清洗后为空则用兜底文案 */
export function describeError(cause: unknown, fallback: string): string {
  return sanitizeForUser(cause) || fallback;
}

/** 供测试与自查：返回入表文案中出现的禁止词 */
export function findForbiddenTokens(text: string): string[] {
  return FORBIDDEN_TOKENS.filter((token) => text.includes(token));
}
