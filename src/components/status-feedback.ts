/**
 * 状态条（气泡）的呈现策略。
 *
 * 只做与 UI 无关的纯计算：tone 优先级、停留时长、多通道合行、错误防覆盖。
 * 目的是让「只读提示不再染红」「一行只出一条主提示」「进度不顶掉错误」
 * 三件事有单点可测的实现，而不是散落在 App.vue 的模板表达式里。
 */

import {
  MAX_DETAIL_LENGTH,
  clipText,
  type FeedbackTone,
} from "../core/feedback-copy.ts";

export const TONE_PRIORITY: Record<FeedbackTone, number> = {
  progress: 0,
  info: 1,
  success: 2,
  warning: 3,
  error: 4,
};

/** 各 tone 的基础停留时长（毫秒） */
export const BASE_DURATION: Record<FeedbackTone, number> = {
  progress: 2600,
  info: 2600,
  success: 2600,
  warning: 3600,
  error: 4000,
};

export const MAX_DURATION = 6000;
/** 超过该字数才延长停留 */
export const DURATION_EXTRA_THRESHOLD = 24;
/** 每超出 10 字增加 400ms */
export const DURATION_EXTRA_STEP = 10;
export const DURATION_EXTRA_MS = 400;

/** 提示停留时长：错误 4s、警告 3.6s、其他 2.6s，长文案每 10 字 +400ms，上限 6s */
export function durationFor(tone: FeedbackTone, text: string): number {
  const overflow = Math.max(0, text.trim().length - DURATION_EXTRA_THRESHOLD);
  const extra = Math.ceil(overflow / DURATION_EXTRA_STEP) * DURATION_EXTRA_MS;
  return Math.min(MAX_DURATION, BASE_DURATION[tone] + extra);
}

export type StatusFeedbackInput = {
  /** 结论性文案（主通道） */
  status: string;
  statusTone: FeedbackTone;
  /** 原因通道，展示层已清洗 */
  error: string;
  /** 模板级警告 / 预览级错误 */
  templateWarning: string;
  previewError: string;
  /** 阅读权限说明；空串表示没有 */
  readOnly: string;
  busy: boolean;
  retryVisible: boolean;
  /** 结论性提示是否仍在展示窗口内；失败与警告类为常驻，不看此值 */
  toastVisible: boolean;
};

export type StatusFeedbackModel = {
  primary: string;
  detail: string;
  tone: FeedbackTone;
  visible: boolean;
};

/**
 * 合成状态条：主行是结论，次行是原因。
 * 只有 error 会降级为次行，模板/预览提示仅在主行缺位时补位，
 * 因此不会出现「模板已保存」和「模板已保存，但…」同时上屏。
 */
export function composeStatusLine(input: StatusFeedbackInput): StatusFeedbackModel {
  const status = input.status.trim();
  const error = input.error.trim();
  const templateWarning = input.templateWarning.trim();
  const previewError = input.previewError.trim();
  const readOnly = input.readOnly.trim();

  const primary = status || readOnly || templateWarning || previewError || error;
  let detail = "";
  if (status && error && error !== status) detail = clipText(error, MAX_DETAIL_LENGTH);

  let tone: FeedbackTone;
  if (error) tone = "error";
  else if (templateWarning || previewError) tone = "warning";
  else if (status) tone = input.statusTone;
  else if (readOnly) tone = "info";
  else tone = "progress";

  const hasCopy = Boolean(primary || detail);
  // 失败、警告、权限说明、忙态与重试入口都属于「不主动消失」的提示；
  // 只有纯结论（成功/进度）才跟随 2.6s 的展示窗口。
  const sticky = Boolean(
    error || templateWarning || previewError || readOnly || input.busy || input.retryVisible,
  );
  const visible = hasCopy ? input.toastVisible || sticky : sticky;

  return { primary, detail, tone, visible };
}

export type FeedbackGate = {
  /** 是否接受该 tone 的提示；低于当前锁的会被拒绝 */
  accept(tone: FeedbackTone): boolean;
  /** 用户已看到（点击/按键）或超时后解锁 */
  release(): void;
  readonly locked: FeedbackTone | null;
};

/**
 * 单槽防覆盖：警告与错误一旦上屏就锁住，
 * 随后的进度/成功提示不会把它顶掉；用户操作或超时后解锁。
 */
export function createFeedbackGate(): FeedbackGate {
  let locked: FeedbackTone | null = null;
  return {
    accept(tone: FeedbackTone): boolean {
      if (locked && TONE_PRIORITY[tone] < TONE_PRIORITY[locked]) return false;
      if (TONE_PRIORITY[tone] >= TONE_PRIORITY.warning) locked = tone;
      return true;
    },
    release(): void {
      locked = null;
    },
    get locked(): FeedbackTone | null {
      return locked;
    },
  };
}
