import type { NevoPluginRuntime } from '../../types/editor-plugin'
import type { AppMetadata } from '../../types/workspace'
import { resolveRuntimeCapabilities, type RuntimeKind } from '../../utils/runtime'

/** A manifest without `runtimes` is available on every runtime. */
export function isPluginAvailableOnRuntime(
  manifest: { runtimes?: NevoPluginRuntime[] },
  runtime: RuntimeKind,
): boolean {
  // 'web' is what an unloaded app metadata resolves to: the runtime is unknown, so do not gate.
  if (!manifest.runtimes || runtime === 'web') return true
  return (manifest.runtimes as string[]).includes(runtime)
}

/** Availability on the device this app runs on, resolved from its metadata. */
export function isPluginAvailableForApp(
  manifest: { runtimes?: NevoPluginRuntime[] },
  appMetadata: AppMetadata | null | undefined,
): boolean {
  return isPluginAvailableOnRuntime(manifest, resolveRuntimeCapabilities(appMetadata).runtime)
}
