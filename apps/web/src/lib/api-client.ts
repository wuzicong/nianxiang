export type ApiErrorBody = { error?: string; message?: string };

export async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function apiMessage(body: ApiErrorBody | null | undefined, fallback = "请求失败"): string {
  if (body?.message && typeof body.message === "string") return body.message;
  return fallback;
}
