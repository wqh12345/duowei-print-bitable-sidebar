import { bitable } from "@lark-base-open/js-sdk";
import { createTemplateRepository } from "../core/template-repository.ts";
import { createTableTemplateStorage } from "./table-template-storage.ts";

// 方案 A：三端共享存储。模板持久化到 Base 内约定表「多维打印-模板数据」，
// 记录视图 / 数据表视图 / 侧边栏读写同一张表（key=duowei-print:templates:{baseId}:{tableId}）。
// 存储契约与 bridge 版一致，仓库逻辑零改动。
export const templateRepository = createTemplateRepository(createTableTemplateStorage(bitable.base));
