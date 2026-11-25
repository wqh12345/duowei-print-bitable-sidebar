import { BitableReadTimeoutError } from "../host/read-timeout.ts";
import {
  describeError,
  feedbackText,
  type FeedbackTone,
} from "../core/feedback-copy.ts";

export type BatchReadFailureFeedback = {
  /** 主行结论 */
  status: string;
  tone: FeedbackTone;
  /** 次行原因；超时时已由主行说清，留空避免重复 */
  error: string;
  retryAvailable: boolean;
};

/**
 * 批量读取失败的用户可见反馈。
 * 超时是可重试的临时故障，给出明确入口；其余失败只陈述结果，
 * 不谎称「记录未更改」——已提交的批次本来就没有被这条失败路径改动。
 */
export function getBatchReadFailureFeedback(cause: unknown): BatchReadFailureFeedback {
  const retryAvailable = cause instanceof BitableReadTimeoutError;
  return {
    status: feedbackText(retryAvailable ? "warn.batch.retryTimeout" : "error.batch.readFailed"),
    tone: retryAvailable ? "warning" : "error",
    error: retryAvailable ? "" : describeError(cause, ""),
    retryAvailable,
  };
}

export function shouldShowBatchReadRetry(retryAvailable: boolean, busy: boolean): boolean {
  return retryAvailable && !busy;
}
