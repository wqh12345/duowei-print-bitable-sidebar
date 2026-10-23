import type { BatchPrintSession, BatchRecordSummary } from "../core/batch-print-session.ts";
import type { WorkspaceMode } from "../core/workspace.ts";
import { shouldShowBatchReadRetry } from "./batch-read-feedback.ts";

export type BatchWorkspaceActionInput = {
  busy: boolean;
  retryAvailable: boolean;
  workspaceMode: WorkspaceMode;
  templateLoaded: boolean;
  hasRenderedPages: boolean;
  session: BatchPrintSession;
  /** 多维表格是否为可编辑权限；false（阅读权限）时输出与记录选择一律置灰 */
  canEdit: boolean;
};

export type BatchWorkspaceActionState = {
  isBatchMode: boolean;
  recordIds: string[];
  summaries: BatchRecordSummary[];
  retryVisible: boolean;
  outputDisabled: boolean;
  recordPickerDisabled: boolean;
  outputBlockReason: string;
  selectLabel: string;
  printLabel: string;
  exportPdfLabel: string;
};

/**
 * Produces the complete batch action/view state from the last committed
 * session. Candidate reads never enter this model until they have loaded and
 * rendered successfully, so a timeout can disable actions temporarily without
 * erasing the printable batch already on screen.
 */
export function getBatchWorkspaceActionState(
  input: BatchWorkspaceActionInput,
): BatchWorkspaceActionState {
  const isBatchMode = input.session.mode === "batch";
  const recordIds = [...input.session.committedRecordIds];
  const summaries = input.session.summaries.map((item) => ({ ...item }));
  const count = recordIds.length;

  return {
    isBatchMode,
    recordIds,
    summaries,
    retryVisible: shouldShowBatchReadRetry(input.retryAvailable, input.busy),
    // 只读用户改不了「多维打印-模板数据」表（记录选择会写表），
    // 导出 PDF／打印按产品要求一并禁用。
    outputDisabled: input.busy
      || input.workspaceMode !== "preview"
      || !input.templateLoaded
      || !input.hasRenderedPages
      || !input.canEdit,
    recordPickerDisabled: input.busy || !input.canEdit,
    outputBlockReason: input.canEdit
      ? ""
      : "当前文档为阅读权限，模板编辑与打印输出均不可用",
    selectLabel: isBatchMode ? "重新选择" : "选择打印记录",
    printLabel: isBatchMode ? `打印 ${count} 条` : "打印",
    exportPdfLabel: isBatchMode ? `导出 ${count} 条 PDF` : "导出 PDF",
  };
}
