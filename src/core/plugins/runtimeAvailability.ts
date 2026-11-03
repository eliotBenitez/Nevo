import type { NevoPluginRuntime } from '../../types/editor-plugin'
import type { RuntimeKind } from '../../utils/runtime'

/** A manifest without `runtimes` is available on every runtime. */
export function isPluginAvailableOnRuntime(
  manifest: { runtimes?: NevoPluginRuntime[] },
  runtime: RuntimeKind,
): boolean {
  if (!manifest.runtimes) return true
  return (manifest.runtimes as string[]).includes(runtime)
}
