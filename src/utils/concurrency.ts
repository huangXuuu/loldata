/** 限并发跑一批异步任务，避免像"探测几十个赛季 ID"这种场景一次性打出去几十个并发请求，
 * 把承载代理的小服务器打垮。跟 Promise.allSettled 一样返回逐项成功/失败结果，只是控制了并发度。 */
export async function settleWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
