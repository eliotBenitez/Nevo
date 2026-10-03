// Framework-agnostic handle on the single in-progress voice recording, so
// navigation and app-close code can finalize it while the editor is still
// mounted without importing editor or Vue internals.

interface ActiveRecording {
  id: string
  finalize: () => Promise<void>
  inflight: Promise<void> | null
}

let active: ActiveRecording | null = null

export function setActiveRecording(id: string, finalize: () => Promise<void>): void {
  active = { id, finalize, inflight: null }
}

export function clearActiveRecording(id: string): void {
  if (active?.id === id) active = null
}

export function hasActiveRecording(): boolean {
  return active !== null
}

export async function finalizeActiveRecording(): Promise<void> {
  const current = active
  if (!current) return
  current.inflight ??= current.finalize().catch(() => {})
  await current.inflight
}
