import { convertFileSrc } from '@tauri-apps/api/core'

const ALLOWED_PREFIXES = ['.nevo/assets/', '.nevo/plugins/'] as const

export function workspaceAssetUrl(src: string): string {
  const normalized = src.replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (
    normalized !== src
    || !ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix))
    || segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('Unsafe workspace asset path')
  }
  return convertFileSrc(normalized, 'nevoasset')
}
