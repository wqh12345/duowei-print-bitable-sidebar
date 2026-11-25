import assert from "node:assert/strict";
import test from "node:test";
import {
  BATCH_WRITE_LIMIT,
  CHUNK_LIMIT,
  createTableTemplateStorage,
  TEMPLATE_TABLE_NAME,
} from "../src/host/table-template-storage.ts";
import type { TemplateStorage } from "../src/core/template-repository.ts";

// —— 内存版 TableLike：模拟飞书多维表格桥，统计批量/逐条调用次数 ——

function segmentsText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((segment) => (segment && typeof segment === "object" ? String((segment as any).text ?? "") : "")).join("");
  }
  return String(value ?? "");
}

type StoredRecord = { key: string; value: string };

function createMockBase(options: { batch?: boolean; pageSize?: number } = {}) {
  const batch = options.batch !== false;
  const pageSize = options.pageSize ?? 100;
  const records = new Map<string, StoredRecord>();
  const calls = {
    getRecords: 0, setRecords: 0, addRecords: 0,
    getRecordIdList: 0, getCellString: 0, setCellValue: 0, addRecord: 0,
  };
  let nextId = 1;
  const writeOrder: string[] = [];
  const table: any = {
    async getFieldMetaList() {
      return [{ id: "f_key", name: "duowei_key" }, { id: "f_val", name: "duowei_value" }];
    },
    async getRecordIdList() {
      calls.getRecordIdList += 1;
      return [...records.keys()];
    },
    async getCellString(fieldId: string, recordId: string) {
      calls.getCellString += 1;
      const record = records.get(recordId);
      if (!record) return null;
      return fieldId === "f_key" ? record.key : record.value;
    },
    async setCellValue(fieldId: string, recordId: string, value: unknown) {
      calls.setCellValue += 1;
      const record = records.get(recordId);
      if (!record) return false;
      if (fieldId === "f_val") record.value = segmentsText(value);
      writeOrder.push(record.key);
      return true;
    },
    async addRecord(recordValue: { fields: Record<string, any> }) {
      calls.addRecord += 1;
      const id = `r${nextId++}`;
      const key = segmentsText(recordValue.fields.f_key);
      records.set(id, { key, value: segmentsText(recordValue.fields.f_val) });
      writeOrder.push(key);
      return id;
    },
  };
  if (batch) {
    table.getRecords = async (param?: { pageSize?: number; pageToken?: string }) => {
      calls.getRecords += 1;
      // 强制小页：无论调用方传多大 pageSize，都以 mock 的 pageSize 为上限，模拟服务端分页
      const size = Math.min(param?.pageSize ?? pageSize, pageSize);
      const ids = [...records.keys()];
      const start = param?.pageToken ? ids.indexOf(param.pageToken) : 0;
      const slice = ids.slice(start, start + size);
      return {
        total: ids.length,
        hasMore: start + size < ids.length,
        records: slice.map((recordId) => ({
          recordId,
          fields: {
            f_key: [{ type: 1, text: records.get(recordId)!.key }],
            f_val: [{ type: 1, text: records.get(recordId)!.value }],
          },
        })),
        // pageToken = 下一页第一条记录的游标（与 js-sdk 语义一致）
        pageToken: start + size < ids.length ? ids[start + size] : undefined,
      };
    };
    table.setRecords = async (list: Array<{ recordId: string; fields: Record<string, any> }>) => {
      calls.setRecords += 1;
      for (const item of list) {
        const record = records.get(item.recordId);
        if (!record) throw new Error(`mock record missing: ${item.recordId}`);
        record.value = segmentsText(item.fields.f_val);
        writeOrder.push(record.key);
      }
      return list.map((item) => item.recordId);
    };
    table.addRecords = async (list: Array<{ fields: Record<string, any> }>) => {
      calls.addRecords += 1;
      const ids: string[] = [];
      for (const recordValue of list) {
        const id = `r${nextId++}`;
        const key = segmentsText(recordValue.fields.f_key);
        records.set(id, { key, value: segmentsText(recordValue.fields.f_val) });
        writeOrder.push(key);
        ids.push(id);
      }
      return ids;
    };
  }
  const base = {
    async getTableMetaList() { return [{ id: "tbl", name: TEMPLATE_TABLE_NAME }]; },
    async getTable() { return table; },
    async addTable() { /* 表已存在，不会走到 */ },
  };
  return { base, records, calls, writeOrder, storage: createTableTemplateStorage(base) as TemplateStorage };
}

function envelopeWithTemplate(id: string, fillerLength: number) {
  const filler = "图".repeat(fillerLength);
  return {
    schemaVersion: 2, engine: "vue-print-designer", engineVersion: "1.7.39",
    baseId: "base-1", tableId: "table-1", defaultId: id, revision: "rev-1",
    templates: [{
      id, name: `模板-${id}`, updatedAt: "2026-11-17T00:00:00.000Z", checksum: `sum-${id}`,
      template: { pages: [{ id: "p", elements: [{ id: "img", type: "image", content: `data:image/jpeg;base64,${filler}` }] }] },
    }],
  };
}

const COLLECTION_KEY = "duowei-print:templates:base-1:table-1";

test("B-STORAGE-01: chunked template writes go through batch addRecords, not per-chunk bridge calls", async () => {
  const mock = createMockBase();
  // 3 分片（30000 > 2*CHUNK_LIMIT）+ 主记录 + 索引 = 5 条写入
  const env = envelopeWithTemplate("t1", CHUNK_LIMIT * 3);

  const ok = await mock.storage.setData(COLLECTION_KEY, env);
  assert.equal(ok, true);
  // 全部为新记录：一次 addRecords 批量（5 条 < BATCH_WRITE_LIMIT）
  assert.equal(mock.calls.addRecords, 1);
  assert.equal(mock.calls.setRecords, 0);
  assert.equal(mock.calls.setCellValue, 0);
  assert.equal(mock.calls.addRecord, 0);
  // 逐条桥调用次数为 0：写入全部走批量
  assert.equal(mock.calls.setCellValue + mock.calls.addRecord, 0);

  // 读取还原一致（走批量 getRecords 缓存）
  const restored = await mock.storage.getData<any>(COLLECTION_KEY);
  assert.deepEqual(restored, env);
});

test("B-STORAGE-02: second save updates existing chunk records via setRecords batches", async () => {
  const mock = createMockBase();
  await mock.storage.setData(COLLECTION_KEY, envelopeWithTemplate("t1", CHUNK_LIMIT));

  mock.writeOrder.length = 0;
  mock.calls.addRecords = 0;
  // 相同分片数的改写（内容变化、体量不变）：所有分片记录均已存在
  await mock.storage.setData(COLLECTION_KEY, envelopeWithTemplate("t1", CHUNK_LIMIT));

  // 索引已建立：改写全部走 setRecords，不再新增记录
  assert.ok(mock.calls.setRecords >= 1, "第二次保存必须走 setRecords 批量更新");
  assert.equal(mock.calls.addRecords, 0);
  const restored = await mock.storage.getData<any>(COLLECTION_KEY);
  assert.equal(restored.templates[0].template.pages[0].elements[0].content.length,
    CHUNK_LIMIT + "data:image/jpeg;base64,".length);
});

test("B-STORAGE-03: tables without batch APIs degrade to the original per-record path", async () => {
  const mock = createMockBase({ batch: false });
  const env = envelopeWithTemplate("t1", CHUNK_LIMIT * 2);

  const ok = await mock.storage.setData(COLLECTION_KEY, env);
  assert.equal(ok, true);
  // 降级路径：逐条 addRecord（模板 JSON 3 分片 + 主记录 + 索引 = 5 条）
  assert.equal(mock.calls.addRecord, 5);
  assert.equal(mock.calls.addRecords, 0);
  assert.equal(mock.calls.setRecords, 0);
  assert.equal(mock.calls.getRecordIdList, 1);

  const restored = await mock.storage.getData<any>(COLLECTION_KEY);
  assert.deepEqual(restored, env);
  // 读取路径同样是降级版：全表逐条 getCellString 扫 key（旧行为）
  assert.ok(mock.calls.getCellString >= 1, "降级读取必须逐条 getCellString");
});

test("B-STORAGE-04: write progress reports batch counts in order", async () => {
  const mock = createMockBase();
  // 60 分片 + 主记录 + 索引 = 62 条写入 > BATCH_WRITE_LIMIT(50) → 2 批
  const env = envelopeWithTemplate("t1", CHUNK_LIMIT * 60);
  const progress: Array<[number, number]> = [];

  const ok = await mock.storage.setData(COLLECTION_KEY, env, (done, total) => progress.push([done, total]));
  assert.equal(ok, true);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.equal(mock.calls.addRecords, 2);
  const restored = await mock.storage.getData<any>(COLLECTION_KEY);
  assert.equal(restored.templates.length, 1);
});

test("B-STORAGE-05: the count/index record is always written after all of its chunks", async () => {
  const mock = createMockBase();
  const env = envelopeWithTemplate("t1", CHUNK_LIMIT * 3);
  await mock.storage.setData(COLLECTION_KEY, env);

  // 写入顺序里，模板主记录（含 __chunks）必须排在其全部分片之后、集合索引之前
  const chunkKeys = mock.writeOrder.filter((key) => key.startsWith(`${COLLECTION_KEY}#t#t1#k`));
  const mainIndex = mock.writeOrder.indexOf(`${COLLECTION_KEY}#t#t1`);
  const collectionIndex = mock.writeOrder.indexOf(COLLECTION_KEY);
  assert.ok(mainIndex > 0, "必须写入模板主记录");
  assert.ok(collectionIndex > mainIndex, "集合索引必须最后写入");
  for (const chunkKey of chunkKeys) {
    assert.ok(mock.writeOrder.indexOf(chunkKey) < mainIndex, `分片 ${chunkKey} 必须先于主记录`);
  }
});

test("B-STORAGE-06: multi-template envelopes shard, restore, and strip storage markers", async () => {
  const mock = createMockBase();
  const env = {
    schemaVersion: 2, engine: "vue-print-designer", engineVersion: "1.7.39",
    baseId: "base-1", tableId: "table-1", defaultId: "a", revision: "rev-2",
    templates: [
      { id: "a", name: "A", updatedAt: "2026-11-17T00:00:00.000Z", checksum: "s-a", template: { pages: [{ id: "p", elements: [] }], canvasSize: { width: 794, height: 1123 } } },
      { id: "b", name: "B", updatedAt: "2026-11-17T00:00:00.000Z", checksum: "s-b", template: { pages: [{ id: "p", elements: [{ id: "img", type: "image", content: `data:image/png;base64,${"x".repeat(CHUNK_LIMIT + 5)}` }] }] } },
    ],
  };
  await mock.storage.setData(COLLECTION_KEY, env);

  const restored = await mock.storage.getData<any>(COLLECTION_KEY);
  assert.deepEqual(restored, env);
  assert.equal(restored.__storageSharded, undefined, "存储内部标记必须剥离");
  // 索引记录只保留元数据
  const storedIndex = [...mock.records.values()].find((record) => record.key === COLLECTION_KEY)!;
  const parsedIndex = JSON.parse(storedIndex.value);
  assert.equal(parsedIndex.__storageSharded, 1);
  assert.ok(!("template" in parsedIndex.templates[1]));
});

test("B-STORAGE-07: paginated getRecords reads the whole table without per-record calls", async () => {
  const mock = createMockBase({ pageSize: 2 });
  const env = envelopeWithTemplate("t1", CHUNK_LIMIT * 3); // 5 条记录
  await mock.storage.setData(COLLECTION_KEY, env);
  mock.calls.getRecords = 0;
  mock.calls.getCellString = 0;

  const restored = await mock.storage.getData<any>(COLLECTION_KEY);
  assert.deepEqual(restored, env);
  // 5 条记录 / 每页 2 条 = 3 次分页；分片内容全部来自批量缓存，逐条读取为 0
  assert.equal(mock.calls.getRecords, 3);
  assert.equal(mock.calls.getCellString, 0);
});

test("B-STORAGE-08: repository upsert forwards the storage progress callback", async () => {
  const { createTemplateRepository } = await import("../src/core/template-repository.ts");
  const seen: Array<[number, number]> = [];
  const storage: TemplateStorage = {
    async getData() { return null; },
    async setData(_key: string, _value: unknown, onProgress?: (done: number, total: number) => void) {
      onProgress?.(1, 2);
      onProgress?.(2, 2);
      return true;
    },
  };
  const repository = createTemplateRepository(storage);
  const updated = await repository.upsert(
    { baseId: "base-1", tableId: "table-1" },
    { pages: [{ id: "p", elements: [] }], canvasSize: { width: 794, height: 1123 } },
    { id: "t1", name: "模板", expectedRevision: null, onProgress: (done, total) => seen.push([done, total]) },
  );
  assert.equal(updated.templates.length, 1);
  assert.deepEqual(seen, [[1, 2], [2, 2]]);
});

test("B-STORAGE-09: BATCH_WRITE_LIMIT batches stay within the documented cap", async () => {
  const mock = createMockBase();
  const maxBatchSize = { add: 0 };
  const originalAddRecords = (mock.base as any).getTable
    ? undefined : undefined;
  // 包一层监听每批条数
  const table = await (mock.base as any).getTable();
  const rawAddRecords = table.addRecords.bind(table);
  table.addRecords = async (list: unknown[]) => {
    maxBatchSize.add = Math.max(maxBatchSize.add, list.length);
    return rawAddRecords(list);
  };
  const env = envelopeWithTemplate("t1", CHUNK_LIMIT * 130); // 132 条写入 → 3 批
  await mock.storage.setData(COLLECTION_KEY, env);
  assert.ok(maxBatchSize.add <= BATCH_WRITE_LIMIT, `单批 ${maxBatchSize.add} 超过上限 ${BATCH_WRITE_LIMIT}`);
  assert.equal(mock.calls.addRecords, 3);
});
