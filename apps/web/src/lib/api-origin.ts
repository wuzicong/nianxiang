export function apiOrigin(): string {
  return (process.env.API_ORIGIN ?? "http://127.0.0.1:3001").replace(/\/$/, "");
}
