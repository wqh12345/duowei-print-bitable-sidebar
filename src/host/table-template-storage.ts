import { bitable, IOpenSegmentType } from "@lark-base-open/js-sdk";
import type { TemplateStorage } from "../core/template-repository.ts";

/**
 * 方案 A：Base 内共享表 + 分片存储。
 * 三种插件形态（记录视图 / 数据表视图 / 侧边栏）读写同一张约定表：
 *   列：duowei_key（逻辑键）/ duowei_value（分片内容），均为文本字段。
 *
 * 单个逻辑键的完整值不再塞进一个单元格（否则整包模板会撑爆飞书单文本单元格上限，
 * 表现为保存到第 8 个模板时 setCellValue 报 code 25），而是：
 *   1) 集合信封拆成「索引记录」(key) + 「每个模板一条记录」(key#t#<id>)；
 *      索引只保留元数据（id/name/时间/批量记录 id），把体积大的 template 设计器 JSON 外置；
 *   2) 任何单条值若仍超过单元格安全长度，再按 CHUNK_LIMIT 切片（key#k<i> + 分片计数）。
 * 读取时逐层还原，返回给上层仓库的仍是完整、未变更结构的 TemplateEnvelopeV2。
 * 上层 core/template-repository.ts 的乐观锁 / checksum / sanitize 契约零改动。
 *
 * 性能（2026-11-17）：带图片的模板 base64 动辄数 MB，按 10k 切片后有数百个分片，
 * 旧的「逐分片串行 setCellValue」每次都要过一次宿主桥（实测单次 0.5~1.6s），
 * 保存一张 2MB 图片的模板耗时 3~4 分钟。现在读写优先走 js-sdk 批量接口：
 *   - 读：getRecords 按 BATCH_READ_PAGE_SIZE 分页一次拉全表 key+value（替代逐条 getCellString）；
 *   - 写：分片按原顺序聚成 BATCH_WRITE_LIMIT 条/批，setRecords（已有记录）/
 *     addRecords（新记录）批量提交（替代逐条 setCellValue/addRecord）。
 * 写入顺序语义保持「先写全部分片，最后写主记录计数」；表对象缺少批量方法
 * （旧 mock / 旧 js-sdk）时自动降级为原逐条路径，行为不变。
 */

export const TEMPLATE_TABLE_NAME = "多维打印-模板数据";
export const TEMPLATE_KEY_FIELD = "duowei_key";
export const TEMPLATE_VALUE_FIELD = "duowei_value";
// 单元格文本安全长度，保守取值；超过则对该条值再做切片。
export const CHUNK_LIMIT = 10_000;
// 批量写每批条数上限（保守取值，低于飞书单次批量接口上限）。
export const BATCH_WRITE_LIMIT = 50;
// 批量读每页条数。
export const BATCH_READ_PAGE_SIZE = 100;

type FieldMetaLike = { id: string; name: string };
// js-sdk 单元格值：文本字段为 [{type, text}] 段数组；宽松兼容纯字符串（内存 mock）。
type RecordLike = { recordId: string; fields: Record<string, unknown> };

type TableLike = {
  getFieldMetaList(): Promise<FieldMetaLike[]>;
  getRecordIdList(): Promise<string[]>;
  getCellString(fieldId: string, recordId: string): Promise<string | null | undefined>;
  setCellValue(fieldId: string, recordId: string, cellValue: unknown): Promise<unknown>;
  addRecord(recordValue: { fields: Record<string, any> }): Promise<unknown>;
  // 批量接口（可选）：缺少时自动降级为逐条读写，行为与旧版一致。
  getRecords?(param?: { pageSize?: number; pageToken?: string }):
    Promise<{ total: number; hasMore: boolean; records: RecordLike[]; pageToken?: string }>;
  setRecords?(records: Array<{ recordId: string; fields: Record<string, any> }>): Promise<unknown>;
  addRecords?(recordValueList: Array<{ fields: Record<string, any> }>): Promise<unknown>;
};
type BaseLike = {
  getTableMetaList(): Promise<Array<{ id: string; name: string }>>;
  getTable(idOrName: string): Promise<TableLike>;
  addTable(config: unknown): Promise<{ tableId?: string } | void>;
};

type Snapshot = {
  table: TableLike;
  keyFieldId: string;
  valueFieldId: string;
  index: Map<string, string>; // 逻辑键 -> recordId
  // 批量读模式下顺带缓存 逻辑键 -> value 文本，避免读分片时再逐条往返。
  values: Map<string, string>;
};

// 一条待写单元格：recordId 存在表示更新已有记录，否则新增记录。
type PendingWrite = { key: string; recordId?: string; text: string };

function textSegments(text: string): Array<{ type: IOpenSegmentType; text: string }> {
  return [{ type: IOpenSegmentType.Text, text }];
}

// 从批量读回的单元格值里还原纯文本；无法解析时返回 null（读方按需走 getCellString 兜底）。
function cellValueToText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    let text = "";
    for (const segment of value) {
      if (segment && typeof segment === "object" && typeof (segment as any).text === "string") {
        text += (segment as any).text as string;
      }
    }
    return text;
  }
  return null;
}

function splitChunks(json: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK_LIMIT) {
    chunks.push(json.slice(i, i + CHUNK_LIMIT));
  }
  return chunks;
}

export function createTableTemplateStorage(
  base: BaseLike = bitable.base,
  tableName: string = TEMPLATE_TABLE_NAME,
): TemplateStorage {
  let tablePromise: Promise<{ table: TableLike; keyFieldId: string; valueFieldId: string }> | null = null;

  const openTable = async () => {
    const metas = await base.getTableMetaList();
    let meta = metas.find((item) => item.name === tableName);
    if (!meta) {
      await base.addTable({
        name: tableName,
        fields: [
          { type: 1, name: TEMPLATE_KEY_FIELD },
          { type: 1, name: TEMPLATE_VALUE_FIELD },
        ],
      });
      meta = (await base.getTableMetaList()).find((item) => item.name === tableName);
      if (!meta) throw new Error(`无法创建模板数据表「${tableName}」`);
    }
    const table = await base.getTable(meta.id);
    const fields = await table.getFieldMetaList();
    const keyField = fields.find((field) => field.name === TEMPLATE_KEY_FIELD);
    const valueField = fields.find((field) => field.name === TEMPLATE_VALUE_FIELD);
    if (!keyField || !valueField) {
      throw new Error(`模板数据表缺少 ${TEMPLATE_KEY_FIELD}/${TEMPLATE_VALUE_FIELD} 字段，请勿删除或改名`);
    }
    return { table, keyFieldId: keyField.id, valueFieldId: valueField.id };
  };

  const ensureTable = () => {
    if (!tablePromise) {
      tablePromise = openTable().catch((cause) => {
        tablePromise = null; // 失败不缓存：表可能被删除/修复，下次重新探测
        throw cause;
      });
    }
    return tablePromise;
  };

  // 建立索引：批量模式下用 getRecords 分页一次拉全表 key+value；
  // 否则降级为 getRecordIdList + 逐条 getCellString（旧路径）。
  const snapshot = async (): Promise<Snapshot> => {
    const { table, keyFieldId, valueFieldId } = await ensureTable();
    const index = new Map<string, string>();
    const values = new Map<string, string>();
    if (typeof table.getRecords === "function") {
      let pageToken: string | undefined;
      do {
        const page = await table.getRecords({ pageSize: BATCH_READ_PAGE_SIZE, pageToken });
        for (const record of page.records ?? []) {
          const key = cellValueToText(record.fields?.[keyFieldId]);
          if (!key) continue;
          index.set(key, record.recordId);
          const value = cellValueToText(record.fields?.[valueFieldId]);
          if (value !== null) values.set(key, value);
        }
        pageToken = page.hasMore && page.pageToken ? page.pageToken : undefined;
      } while (pageToken);
      return { table, keyFieldId, valueFieldId, index, values };
    }
    const recordIds = await table.getRecordIdList();
    for (const recordId of recordIds) {
      const key = await table.getCellString(keyFieldId, recordId);
      if (key) index.set(key, recordId);
    }
    return { table, keyFieldId, valueFieldId, index, values };
  };

  const readRaw = async (snap: Snapshot, logicalKey: string): Promise<string | null> => {
    const recordId = snap.index.get(logicalKey);
    if (!recordId) return null;
    const cached = snap.values.get(logicalKey);
    if (cached !== undefined) return cached === "" ? null : cached;
    const raw = await snap.table.getCellString(snap.valueFieldId, recordId);
    return raw === null || raw === undefined || raw === "" ? null : raw;
  };

  // 按原「先分片、后主记录」顺序把一个逻辑键的写入展开到待写列表。
  const collectLogicalWrites = (snap: Snapshot, logicalKey: string, obj: unknown, out: PendingWrite[]) => {
    const json = JSON.stringify(obj);
    if (json.length <= CHUNK_LIMIT) {
      out.push({ key: logicalKey, recordId: snap.index.get(logicalKey), text: json });
      return;
    }
    const chunks = splitChunks(json);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkKey = `${logicalKey}#k${i}`;
      out.push({ key: chunkKey, recordId: snap.index.get(chunkKey), text: chunks[i] });
    }
    out.push({ key: logicalKey, recordId: snap.index.get(logicalKey), text: JSON.stringify({ __chunks: chunks.length }) });
  };

  // 批量提交：按待写顺序切「连续同类型」批（已有记录 -> setRecords；新记录 -> addRecords），
  // 批间串行、批内保序，主记录（计数/索引）天然落在其全部分片之后。
  const flushWrites = async (
    snap: Snapshot,
    writes: PendingWrite[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<boolean> => {
    const canBatch = typeof snap.table.setRecords === "function" && typeof snap.table.addRecords === "function";
    if (!canBatch) {
      // 降级：与旧版逐条写入语义一致（含 falsy 返回判定）。
      for (const write of writes) {
        if (write.recordId) {
          const updated = await snap.table.setCellValue(snap.valueFieldId, write.recordId, textSegments(write.text));
          if (updated === false) return false;
        } else {
          const added = await snap.table.addRecord({
            fields: {
              [snap.keyFieldId]: textSegments(write.key),
              [snap.valueFieldId]: textSegments(write.text),
            },
          });
          if (added === undefined || added === null || added === false) return false;
        }
      }
      return true;
    }
    type Batch = { type: "set" | "add"; items: PendingWrite[] };
    const batches: Batch[] = [];
    for (const write of writes) {
      const type = write.recordId ? "set" : "add";
      const last = batches[batches.length - 1];
      if (last && last.type === type && last.items.length < BATCH_WRITE_LIMIT) last.items.push(write);
      else batches.push({ type, items: [write] });
    }
    let done = 0;
    for (const batch of batches) {
      if (batch.type === "set") {
        await snap.table.setRecords!(batch.items.map((write) => ({
          recordId: write.recordId!,
          fields: { [snap.valueFieldId]: textSegments(write.text) },
        })));
      } else {
        const added = await snap.table.addRecords!(batch.items.map((write) => ({
          fields: {
            [snap.keyFieldId]: textSegments(write.key),
            [snap.valueFieldId]: textSegments(write.text),
          },
        })));
        // addRecords 返回 recordId 数组；同步索引，后续写入即可走 setRecords 批。
        const ids = Array.isArray(added) ? added : [];
        batch.items.forEach((write, i) => {
          if (typeof ids[i] === "string" && ids[i]) snap.index.set(write.key, ids[i] as string);
        });
      }
      done += 1;
      onProgress?.(done, batches.length);
    }
    return true;
  };

  // 读一个逻辑键的完整对象（自动处理分片标记 {__chunks:n}）。
  const readLogical = async (snap: Snapshot, logicalKey: string): Promise<unknown | null> => {
    const base = await readRaw(snap, logicalKey);
    if (base === null) return null;
    let value: any;
    try {
      value = JSON.parse(base);
    } catch {
      throw new Error(`模板数据表中的记录「${logicalKey}」不是有效 JSON，可能已被手工编辑`);
    }
    if (value && typeof value === "object" && typeof value.__chunks === "number") {
      let text = "";
      for (let i = 0; i < value.__chunks; i += 1) {
        const part = await readRaw(snap, `${logicalKey}#k${i}`);
        if (part === null) throw new Error(`模板数据分片缺失：${logicalKey}#${i}`);
        text += part;
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`模板数据分片拼接后不是有效 JSON：${logicalKey}`);
      }
    }
    return value;
  };

  return {
    async getData<T>(key: string): Promise<T | null> {
      const snap = await snapshot();
      const value = await readLogical(snap, key);
      if (value === null) return null;
      // 兼容旧的「整包存一格」数据：无 __storageSharded 标记时原样返回。
      if (!value || typeof value !== "object" || (value as any).__storageSharded !== 1) {
        return value as T;
      }
      const env = value as any;
      const metas: any[] = Array.isArray(env.templates) ? env.templates : [];
      const templates = await Promise.all(metas.map(async (meta) => {
        const { template: _omit, ...rest } = meta;
        const part = await readLogical(snap, `${key}#t#${meta.id}`);
        const template = part && typeof part === "object" && "template" in part
          ? (part as any).template
          : {};
        return { ...rest, template };
      }));
      const { __storageSharded: _s, templates: _ts, ...envelopeRest } = env;
      // 还原为与原始信封完全一致的字段集合（剥离存储内部标记），保证上层 checksum 校验通过。
      return { ...envelopeRest, templates } as T;
    },

    async setData<T>(
      key: string,
      data: T,
      onProgress?: (done: number, total: number) => void,
    ): Promise<boolean> {
      const snap = await snapshot();
      const env = data as any;
      const isEnvelope = env && typeof env === "object" && Array.isArray(env.templates);
      const writes: PendingWrite[] = [];
      if (!isEnvelope) {
        // 非信封（理论上不会出现）：整条按分片写入。
        collectLogicalWrites(snap, key, data, writes);
        return flushWrites(snap, writes, onProgress);
      }
      // 集合信封：逐个模板写外置分片，最后写只含元数据的索引记录。
      for (const item of env.templates) {
        collectLogicalWrites(snap, `${key}#t#${item.id}`, { template: item.template }, writes);
      }
      const { templates, ...rest } = env;
      const index = {
        ...rest,
        __storageSharded: 1,
        templates: templates.map(({ template: _omit, ...meta }: any) => meta),
      };
      collectLogicalWrites(snap, key, index, writes);
      return flushWrites(snap, writes, onProgress);
    },
  };
}
