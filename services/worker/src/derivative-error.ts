import { UnrecoverableError } from "bullmq";

/**
 * 写进 assets.error 的稳定错误码，方便按 status=failed 扫。
 * asset_not_found / asset_payload_mismatch 不会因为重试变好。
 * 其余错误走队列的指数退避，用完次数再落成 failed。
 */
export const DERIVATIVE_ERROR_CODES = [
  "asset_not_found",
  "asset_payload_mismatch",
  "asset_not_uploaded",
  "original_unreadable",
  "render_failed",
  "derivative_store_failed",
  "derivative_failed",
] as const;

export type DerivativeErrorCode = (typeof DERIVATIVE_ERROR_CODES)[number];

const CODES = new Set<string>(DERIVATIVE_ERROR_CODES);

export function isDerivativeErrorCode(value: string): value is DerivativeErrorCode {
  return CODES.has(value);
}

export class DerivativeJobError extends Error {
  readonly code: DerivativeErrorCode;
  readonly permanent: boolean;

  constructor(code: DerivativeErrorCode, cause?: unknown) {
    super(code);
    this.name = "DerivativeJobError";
    this.code = code;
    this.permanent = code === "asset_not_found" || code === "asset_payload_mismatch";
    if (cause !== undefined) this.cause = cause;
  }
}

export function derivativeFailureCode(err: unknown): DerivativeErrorCode {
  if (err instanceof DerivativeJobError) return err.code;
  if (err instanceof Error && isDerivativeErrorCode(err.message)) return err.message;
  if (err instanceof Error && err.cause) return derivativeFailureCode(err.cause);
  return "derivative_failed";
}

export function derivativeFailureDetail(err: unknown): string {
  if (err instanceof DerivativeJobError) {
    return err.cause === undefined ? err.code : messageOf(err.cause);
  }
  if (err instanceof Error && err.cause !== undefined && err.cause !== err) {
    return derivativeFailureDetail(err.cause);
  }
  return messageOf(err);
}

export function isTerminalDerivativeFailure(err: unknown): boolean {
  if (err instanceof DerivativeJobError && err.permanent) return true;
  return err instanceof Error && err.name === "UnrecoverableError";
}

/** 永久错误不再退避。可重试错误原样抛回，让队列按 attempts/backoff 再跑。 */
export function asWorkerError(err: unknown): Error {
  if (err instanceof DerivativeJobError && err.permanent) {
    const wrapped = new UnrecoverableError(err.code);
    wrapped.cause = err;
    return wrapped;
  }
  if (err instanceof Error) return err;
  return new DerivativeJobError("derivative_failed");
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "derivative_failed";
}
