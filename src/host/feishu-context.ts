import { bitable } from "@lark-base-open/js-sdk";
import { DEFAULT_READ_TIMEOUT_MS, withReadTimeout } from "./read-timeout.ts";

export type FeishuSelection = {
  baseId: string;
  tableId: string;
  viewId: string;
  recordId: string | null;
};

// 侧边栏容器没有记录视图的「当前展开记录」宿主上下文，插件自行维护
// 「已选记录」状态；它只在选定时所在的数据表/视图内有效。
type PickedRecord = { tableId: string; viewId: string; recordId: string };
let pickedRecord: PickedRecord | null = null;

export function setPickedRecord(record: PickedRecord | null): void {
  pickedRecord = record;
}

export function getPickedRecord(): PickedRecord | null {
  return pickedRecord;
}

export function sameContext(
  left: FeishuSelection,
  right: {
    baseId: string | null;
    tableId: string | null;
    viewId: string | null;
    recordId?: string | null;
  },
): boolean {
  return left.baseId === right.baseId
    && left.tableId === right.tableId
    && left.viewId === right.viewId
    && (right.recordId === undefined || left.recordId === right.recordId);
}

export async function getActiveSelection(
  timeoutMs = DEFAULT_READ_TIMEOUT_MS,
  readSelection: () => PromiseLike<{
    baseId?: string | null;
    tableId?: string | null;
    viewId?: string | null;
    recordId?: string | null;
  }> = () => bitable.base.getSelection(),
): Promise<FeishuSelection> {
  const selection = await withReadTimeout(
    "获取当前多维表格选择",
    readSelection(),
    timeoutMs,
  );
  if (!selection.baseId || !selection.tableId || !selection.viewId) {
    throw new Error("无法识别当前多维表格、数据表或视图");
  }
  // 宿主若提供了 recordId（例如未来复用同一 host 事件结构）优先宿主，
  // 否则回退到插件内通过官方选择器选定的记录。
  const picked = pickedRecord
    && pickedRecord.tableId === selection.tableId
    && pickedRecord.viewId === selection.viewId
    ? pickedRecord.recordId
    : null;
  return {
    baseId: selection.baseId,
    tableId: selection.tableId,
    viewId: selection.viewId,
    recordId: selection.recordId ?? picked,
  };
}

/**
 * 读取当前数据表的首条记录 id（侧边栏初始化时未显式选记录的默认来源）。
 * 空表返回 null；读取失败按 withReadTimeout 抛出，交由调用方既有 catch 处理。
 */
export async function getFirstRecordId(
  tableId: string,
  timeoutMs = DEFAULT_READ_TIMEOUT_MS,
  openTable: (
    id: string,
  ) => PromiseLike<{ getRecordIdList: () => PromiseLike<string[]> }> = (id) =>
    bitable.base.getTable(id),
): Promise<string | null> {
  const table = await withReadTimeout("获取数据表", openTable(tableId), timeoutMs);
  const recordIds = await withReadTimeout("获取记录列表", table.getRecordIdList(), timeoutMs);
  return recordIds.filter(Boolean)[0] ?? null;
}

export function getCurrentRecordIds(selection: FeishuSelection): string[] {
  return selection.recordId ? [selection.recordId] : [];
}

/**
 * 单条打印入口：打开官方记录选择器并取第一条作为当前打印记录。
 * 用户取消选择时清空已选记录并返回 null。
 */
export async function pickSingleRecord(
  selection: FeishuSelection,
  openPicker: (
    tableId: string,
    viewId: string,
  ) => PromiseLike<string[]> = (tableId, viewId) =>
    bitable.ui.selectRecordIdList(tableId, viewId),
): Promise<string | null> {
  const ids = await openPicker(selection.tableId, selection.viewId);
  const recordId = Array.from(new Set(ids.filter(Boolean)))[0] ?? null;
  pickedRecord = recordId
    ? { tableId: selection.tableId, viewId: selection.viewId, recordId }
    : null;
  return recordId;
}

export async function selectRecordIds(
  selection: FeishuSelection,
  openPicker: (
    tableId: string,
    viewId: string,
  ) => PromiseLike<string[]> = (tableId, viewId) =>
    bitable.ui.selectRecordIdList(tableId, viewId),
): Promise<string[]> {
  const ids = await openPicker(selection.tableId, selection.viewId);
  return Array.from(new Set(ids.filter(Boolean)));
}
