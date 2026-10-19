/**
 * 冒烟用查询参数走分享页的 429 分支。
 * 开发服务器认 `?smokeRateLimit=429`。生产构建只在 MEMORA_SHARE_STATUS_HOOK=1 时认，
 * 避免有人用查询参数把正常分享页改成限流提示。
 */
export function forcedPublicShareStatus(
  value: string | string[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw !== "429") return undefined;
  if (env.NODE_ENV === "production" && env.MEMORA_SHARE_STATUS_HOOK !== "1") return undefined;
  return 429;
}
