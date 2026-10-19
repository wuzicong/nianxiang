/** 有限并发地处理队列项，保持结果顺序与输入一致。 */
export async function runUploadPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  async function drain(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => drain()));
}
