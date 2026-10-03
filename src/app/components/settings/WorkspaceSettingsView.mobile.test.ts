import { describe, expect, it } from 'vitest'

const { readFileSync } = process.getBuiltinModule('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string
}

describe('WorkspaceSettingsView mobile layout', () => {
  it('uses a route-driven list/detail hierarchy with accessible touch targets', () => {
    const view = readFileSync('src/app/components/settings/WorkspaceSettingsView.vue', 'utf8')
    const home = readFileSync('src/app/components/settings/MobileSettingsHome.vue', 'utf8')
    const css = readFileSync('src/styles/mobile-settings.css', 'utf8')

    expect(view).toContain('<div v-if="isPhone" class="mobile-settings ')
    expect(view).toContain('<MobileSettingsHome')
    expect(view).toContain('mobileSectionGroups')
    expect(view).toContain('<component :is="activePanelComponent" />')
    expect(home).toContain('mobile-settings__row')
    expect(view).toContain('tw:max-[719px]:grid-cols-[44px_minmax(0,1fr)_44px]')
    expect(home).toContain('tw:max-[719px]:min-h-[68px]')
    expect(view).toContain('max(var(--safe-area-top),0px)')
    expect(home).toContain('max(var(--safe-area-bottom),0px)')
    expect(css).toContain('.mobile-settings__detail .panel-body')
  })

  it('keeps desktop settings in the two-column frame + island layout', () => {
    const view = readFileSync('src/app/components/settings/WorkspaceSettingsView.vue', 'utf8')
    const nav = readFileSync('src/app/components/settings/SettingsNavColumn.vue', 'utf8')

    expect(view).toContain('<SettingsNavColumn')
    expect(view).toContain('<main class="settings-main ')
    expect(nav).toContain('settings-nav-col')
  })

  it('lists phone-supported sections and labels the view landmark', () => {
    const view = readFileSync('src/app/components/settings/WorkspaceSettingsView.vue', 'utf8')
    const sections = readFileSync('src/app/composables/useSettingsSections.ts', 'utf8')

    expect(view).toContain('aria-labelledby="workspace-settings-heading"')
    expect(view).toContain('id="workspace-settings-heading"')
    expect(sections).toContain("id: 'general'")
    expect(sections).toContain("id: 'advanced'")
    expect(sections).toContain("mcp")
    expect(sections).toContain("hotkeys")
  })
})
