import { safeErrorMessage } from "@memora/storage";

/** failed 事件里的 attemptsMade 计的是已经发生的失败次数（含本次）。 */
export function isFinalJobAttempt(attemptsMade: number, maxAttempts: number): boolean {
  const max = Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1;
  return attemptsMade >= max;
}

export async function onJobFailed(input: {
  label: "media.derivative" | "meta.exif";
  assetId: string;
  attemptsMade: number;
  maxAttempts: number;
  err: unknown;
  markFailed?: (assetId: string, error: string) => Promise<void>;
  noteExifFailure?: (assetId: string, error: string) => Promise<void>;
  log?: (line: string) => void;
}): Promise<void> {
  const message = safeErrorMessage(input.err);
  const final = isFinalJobAttempt(input.attemptsMade, input.maxAttempts);
  const log = input.log ?? ((line: string) => console.error(line));
  log(
    `[worker] ${input.label} failed asset=${input.assetId} attempt=${input.attemptsMade}/${input.maxAttempts} final=${final} err=${message}`,
  );
  if (!final) return;
  try {
    if (input.label === "media.derivative") {
      await input.markFailed?.(input.assetId, message);
    } else {
      await input.noteExifFailure?.(input.assetId, message);
    }
  } catch (markErr) {
    log(
      `[worker] ${input.label} status update failed asset=${input.assetId} err=${safeErrorMessage(markErr)}`,
    );
  }
}
