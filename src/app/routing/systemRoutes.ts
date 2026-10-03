import type { SettingsSectionId } from '../../types/workspace'

export const ARCHIVE_PATH = '/workspace/archive'
export const SETTINGS_ROOT_PATH = '/workspace/settings'

export function settingsPath(section?: SettingsSectionId | null): string {
  if (section) {
    return `/workspace/settings/${section}`
  }
  return SETTINGS_ROOT_PATH
}

export function parseSettingsSection(
  param: unknown,
  allowed: readonly SettingsSectionId[],
): SettingsSectionId | null {
  const raw = Array.isArray(param) ? param[0] : param
  if (typeof raw !== 'string' || !raw) return null
  return allowed.includes(raw as SettingsSectionId) ? (raw as SettingsSectionId) : null
}

export function isSettingsPath(path: string): boolean {
  return path === SETTINGS_ROOT_PATH || path.startsWith('/workspace/settings/')
}

export function isArchivePath(path: string): boolean {
  return path === ARCHIVE_PATH || path.startsWith('/workspace/archive/')
}

export function isSystemPath(path: string): boolean {
  return isSettingsPath(path) || isArchivePath(path)
}
