import { bitable, OperationType, PermissionEntity } from "@lark-base-open/js-sdk";
import { withReadTimeout } from "./read-timeout.ts";

/**
 * 权限探测是轻量旁路信息，不能让 host 抖动堵住主流程，
 * 因此比通用读取超时更短；失败按 Q3-A 视为「可编辑」放行。
 */
const PERMISSION_PROBE_TIMEOUT_MS = 5_000;

/**
 * 当前用户对该多维表格是否具备编辑权限（Base 级，一次判定全局有效）。
 * 三层兜底：
 *  1. getPermission（新接口，直接问「权限」）；
 *  2. 该接口不存在或抛错/超时 → isEditable()（旧接口，问「编辑模式」）；
 *  3. 仍失败 → 返回 true，视为可编辑，避免只读判断本身把插件锁死。
 */
export async function canEditCurrentBase(
  timeoutMs: number = PERMISSION_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const base = bitable.base;
  if (typeof base?.getPermission === "function") {
    try {
      return await withReadTimeout(
        "读取文档编辑权限",
        base.getPermission({ entity: PermissionEntity.Base, type: OperationType.Editable }),
        timeoutMs,
      );
    } catch {
      // host 不支持或超时，继续回退到 isEditable
    }
  }
  if (typeof base?.isEditable === "function") {
    try {
      return await withReadTimeout("读取文档编辑模式", base.isEditable(), timeoutMs);
    } catch {
      // 同样失败，落到「视为可编辑」
    }
  }
  return true;
}
