/** 与 API 的 SHARE_REQUIRE_PASSWORD 对齐，用于表单是否标必填。未设时默认可选。 */
export function sharePasswordRequiredFromEnv(): boolean {
  const raw = process.env.NEXT_PUBLIC_SHARE_REQUIRE_PASSWORD;
  return raw === "true" || raw === "1";
}
