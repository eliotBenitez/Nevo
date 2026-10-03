import { describe, expect, it } from 'vitest'
import type { SettingsSectionId } from '../../types/workspace'
import {
  ARCHIVE_PATH,
  SETTINGS_ROOT_PATH,
  isArchivePath,
  isSettingsPath,
  isSystemPath,
  parseSettingsSection,
  settingsPath,
} from './systemRoutes'

const ALL_SECTIONS: readonly SettingsSectionId[] = [
  'general',
  'appearance',
  'editor',
  'workspace',
  'ai',
  'plugins',
  'mcp',
  'hotkeys',
  'files',
  'backup',
  'advanced',
  'about',
]

const PHONE_SECTIONS: readonly SettingsSectionId[] = [
  'general',
  'appearance',
  'editor',
  'workspace',
  'ai',
  'plugins',
  'files',
  'backup',
  'advanced',
  'about',
]

describe('systemRoutes', () => {
  describe('path builders', () => {
    it('builds settingsPath correctly', () => {
      expect(settingsPath()).toBe(SETTINGS_ROOT_PATH)
      expect(settingsPath(null)).toBe(SETTINGS_ROOT_PATH)
      expect(settingsPath('appearance')).toBe('/workspace/settings/appearance')
      expect(settingsPath('plugins')).toBe('/workspace/settings/plugins')
    })

    it('exports ARCHIVE_PATH constant', () => {
      expect(ARCHIVE_PATH).toBe('/workspace/archive')
    })
  })

  describe('parseSettingsSection', () => {
    it('parses valid section ids', () => {
      expect(parseSettingsSection('general', ALL_SECTIONS)).toBe('general')
      expect(parseSettingsSection('editor', ALL_SECTIONS)).toBe('editor')
      expect(parseSettingsSection('mcp', ALL_SECTIONS)).toBe('mcp')
    })

    it('returns null for unknown section ids', () => {
      expect(parseSettingsSection('unknown-section', ALL_SECTIONS)).toBeNull()
      expect(parseSettingsSection('', ALL_SECTIONS)).toBeNull()
      expect(parseSettingsSection(undefined, ALL_SECTIONS)).toBeNull()
      expect(parseSettingsSection(null, ALL_SECTIONS)).toBeNull()
      expect(parseSettingsSection(123, ALL_SECTIONS)).toBeNull()
    })

    it('handles route param arrays', () => {
      expect(parseSettingsSection(['appearance'], ALL_SECTIONS)).toBe('appearance')
      expect(parseSettingsSection(['unknown'], ALL_SECTIONS)).toBeNull()
      expect(parseSettingsSection([], ALL_SECTIONS)).toBeNull()
    })

    it('filters out phone-excluded ids when given phone allowed list', () => {
      expect(parseSettingsSection('mcp', PHONE_SECTIONS)).toBeNull()
      expect(parseSettingsSection('hotkeys', PHONE_SECTIONS)).toBeNull()
      expect(parseSettingsSection('editor', PHONE_SECTIONS)).toBe('editor')
    })
  })

  describe('path predicates', () => {
    it('identifies settings paths', () => {
      expect(isSettingsPath('/workspace/settings')).toBe(true)
      expect(isSettingsPath('/workspace/settings/editor')).toBe(true)
      expect(isSettingsPath('/workspace/settings/unknown')).toBe(true)
      expect(isSettingsPath('/workspace')).toBe(false)
      expect(isSettingsPath('/workspace/notes')).toBe(false)
      expect(isSettingsPath('/workspace/archive')).toBe(false)
    })

    it('identifies archive paths', () => {
      expect(isArchivePath('/workspace/archive')).toBe(true)
      expect(isArchivePath('/workspace/archive/item-1')).toBe(true)
      expect(isArchivePath('/workspace')).toBe(false)
      expect(isArchivePath('/workspace/settings')).toBe(false)
    })

    it('identifies system paths', () => {
      expect(isSystemPath('/workspace/settings')).toBe(true)
      expect(isSystemPath('/workspace/settings/general')).toBe(true)
      expect(isSystemPath('/workspace/archive')).toBe(true)
      expect(isSystemPath('/workspace')).toBe(false)
      expect(isSystemPath('/workspace/note/123')).toBe(false)
      expect(isSystemPath('/workspace/graph')).toBe(false)
    })
  })
})
