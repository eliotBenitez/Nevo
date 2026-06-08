import type { AppMetadata } from '../types/workspace'

export type RuntimeKind = 'desktop' | 'android' | 'ios' | 'web'
export type PlatformKind = 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'web'

export interface RuntimeCapabilities {
  runtime: RuntimeKind
  platform: PlatformKind
  isDesktopRuntime: boolean
  isMobileRuntime: boolean
  supportsWindowControls: boolean
  supportsGlobalShortcuts: boolean
  supportsRevealInFileManager: boolean
  supportsWindowDragRegions: boolean
}

function normalizePlatform(platform: string | null | undefined): PlatformKind {
  switch ((platform ?? '').toLowerCase()) {
    case 'macos':
    case 'darwin':
      return 'macos'
    case 'windows':
    case 'win32':
      return 'windows'
    case 'linux':
      return 'linux'
    case 'android':
      return 'android'
    case 'ios':
      return 'ios'
    default:
      return 'web'
  }
}

function normalizeRuntime(runtime: string | null | undefined, platform: PlatformKind): RuntimeKind {
  const normalizedRuntime = (runtime ?? '').toLowerCase()

  switch (normalizedRuntime) {
    case 'desktop':
    case 'android':
    case 'ios':
      return normalizedRuntime as RuntimeKind
    default:
      return platform === 'android' || platform === 'ios' ? platform : 'web'
  }
}

export function resolveRuntimeCapabilities(metadata: AppMetadata | null | undefined): RuntimeCapabilities {
  const platform = normalizePlatform(metadata?.platform)
  const runtime = normalizeRuntime(metadata?.runtime, platform)
  const isDesktopRuntime = runtime === 'desktop'
  const isMobileRuntime = runtime === 'android' || runtime === 'ios'

  return {
    runtime,
    platform,
    isDesktopRuntime,
    isMobileRuntime,
    supportsWindowControls: metadata?.supportsWindowControls ?? isDesktopRuntime,
    supportsGlobalShortcuts: metadata?.supportsGlobalShortcuts ?? isDesktopRuntime,
    supportsRevealInFileManager: metadata?.supportsRevealInFileManager ?? isDesktopRuntime,
    supportsWindowDragRegions: metadata?.supportsWindowDragRegions ?? isDesktopRuntime,
  }
}
