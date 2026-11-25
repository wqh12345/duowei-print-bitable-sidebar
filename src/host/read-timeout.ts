export const DEFAULT_READ_TIMEOUT_MS = 15_000;

export class BitableReadTimeoutError extends Error {
  /** 触发超时的内部操作名，只用于诊断，不上屏 */
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    // 超时时长与内部操作名对用户没有意义，用「发生了什么 + 影响 + 下一步」替代
    super("读取数据超时，原来的打印内容已保留；请重试");
    this.name = "BitableReadTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export function withReadTimeout<T>(
  operation: string,
  value: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BitableReadTimeoutError(operation, timeoutMs));
    }, timeoutMs);
    Promise.resolve(value).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
