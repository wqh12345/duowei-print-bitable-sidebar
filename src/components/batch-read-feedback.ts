import { BitableReadTimeoutError } from "../host/read-timeout.ts";

export type BatchReadFailureFeedback = {
  /** 取消/失败不再占用主句；错误详情与重试入口已足够（Copy-v1 C1） */
  status: "";
  error: string;
  retryAvailable: boolean;
};

export function getBatchReadFailureFeedback(cause: unknown): BatchReadFailureFeedback {
  return {
    status: "",
    error: cause instanceof Error ? cause.message : "批量读取失败，原批量打印保持不变",
    retryAvailable: cause instanceof BitableReadTimeoutError,
  };
}

export function shouldShowBatchReadRetry(retryAvailable: boolean, busy: boolean): boolean {
  return retryAvailable && !busy;
}
