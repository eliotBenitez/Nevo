interface MarketplaceRuntimeGuard {
  pause(): Promise<void>
  resume(): Promise<void>
}

let activeGuard: MarketplaceRuntimeGuard | null = null

export function registerMarketplaceRuntimeGuard(guard: MarketplaceRuntimeGuard): () => void {
  activeGuard = guard
  return () => {
    if (activeGuard === guard) activeGuard = null
  }
}

export async function pauseMarketplaceRuntime(): Promise<() => Promise<void>> {
  const guard = activeGuard
  if (!guard) return async () => {}
  await guard.pause()
  let resumed = false
  return async () => {
    if (resumed) return
    resumed = true
    await guard.resume()
  }
}
