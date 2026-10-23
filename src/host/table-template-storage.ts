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
 */

export const TEMPLATE_TABLE_NAME = "多维打印-模板数据";
export const TEMPLATE_KEY_FIELD = "duowei_key";
export const TEMPLATE_VALUE_FIELD = "duowei_value";
// 单元格文本安全长度，保守取值；超过则对该条值再做切片。
export const CHUNK_LIMIT = 10_000;

type FieldMetaLike = { id: string; name: string };
type TableLike = {
  getFieldMetaList(): Promise<FieldMetaLike[]>;
  getRecordIdList(): Promise<string[]>;
  getCellString(fieldId: string, recordId: string): Promise<string | null | undefined>;
  setCellValue(fieldId: string, recordId: string, cellValue: unknown): Promise<unknown>;
  addRecord(recordValue: { fields: Record<string, any> }): Promise<unknown>;
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
};

function textSegments(text: string): Array<{ type: IOpenSegmentType; text: string }> {
  return [{ type: IOpenSegmentType.Text, text }];
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

  // 每次操作扫描一遍 key 列，建立 逻辑键 -> recordId 映射（值列按需再读）。
  const snapshot = async (): Promise<Snapshot> => {
    const { table, keyFieldId, valueFieldId } = await ensureTable();
    const recordIds = await table.getRecordIdList();
    const index = new Map<string, string>();
    for (const recordId of recordIds) {
      const key = await table.getCellString(keyFieldId, recordId);
      if (key) index.set(key, recordId);
    }
    return { table, keyFieldId, valueFieldId, index };
  };

  const readRaw = async (snap: Snapshot, logicalKey: string): Promise<string | null> => {
    const recordId = snap.index.get(logicalKey);
    if (!recordId) return null;
    const raw = await snap.table.getCellString(snap.valueFieldId, recordId);
    return raw === null || raw === undefined || raw === "" ? null : raw;
  };

  const upsertRaw = async (snap: Snapshot, logicalKey: string, cellText: string): Promise<boolean> => {
    const recordId = snap.index.get(logicalKey);
    if (recordId) {
      const updated = await snap.table.setCellValue(snap.valueFieldId, recordId, textSegments(cellText));
      return updated !== false;
    }
    const added = await snap.table.addRecord({
      fields: {
        [snap.keyFieldId]: textSegments(logicalKey),
        [snap.valueFieldId]: textSegments(cellText),
      },
    });
    return added !== undefined && added !== null && added !== false;
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

  // 写一个逻辑键的完整对象（超限时切片；先写分片，最后写计数/主记录，降低读到半态的概率）。
  const writeLogical = async (snap: Snapshot, logicalKey: string, obj: unknown): Promise<boolean> => {
    const json = JSON.stringify(obj);
    if (json.length <= CHUNK_LIMIT) {
      return upsertRaw(snap, logicalKey, json);
    }
    const chunks = splitChunks(json);
    for (let i = 0; i < chunks.length; i += 1) {
      const ok = await upsertRaw(snap, `${logicalKey}#k${i}`, chunks[i]);
      if (!ok) return false;
    }
    return upsertRaw(snap, logicalKey, JSON.stringify({ __chunks: chunks.length }));
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

    async setData<T>(key: string, data: T): Promise<boolean> {
      const snap = await snapshot();
      const env = data as any;
      const isEnvelope = env && typeof env === "object" && Array.isArray(env.templates);
      if (!isEnvelope) {
        // 非信封（理论上不会出现）：整条按分片写入。
        return writeLogical(snap, key, data);
      }
      // 先写每个模板记录，最后写索引记录（索引存在即代表其引用的模板分片均已就位）。
      for (const item of env.templates) {
        const ok = await writeLogical(snap, `${key}#t#${item.id}`, { template: item.template });
        if (!ok) return false;
      }
      const { templates, ...rest } = env;
      const index = {
        ...rest,
        __storageSharded: 1,
        templates: templates.map(({ template: _omit, ...meta }: any) => meta),
      };
      return writeLogical(snap, key, index);
    },
  };
}
