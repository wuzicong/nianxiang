export function apiOrigin(): string {
  // 用下标读取，避免 Next 在构建客户端包时把 API_ORIGIN 内联成空。
  const configured = process.env["API_ORIGIN"];
  const raw = configured && configured.trim() ? configured.trim() : "http://127.0.0.1:3001";
  return raw.replace(/\/$/, "");
}
