import { describe, expect, it } from 'vitest'

const { readFileSync } = process.getBuiltinModule('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string
}

describe('WorkspaceSettingsModal mobile layout', () => {
  it('uses a native-style list/detail hierarchy with accessible touch targets', () => {
    const component = readFileSync('src/app/components/WorkspaceSettingsModal.vue', 'utf8')
    const css = readFileSync('src/styles/mobile-settings.css', 'utf8')

    expect(component).toContain("mobilePage = ref<'root' | 'detail'>('root')")
    expect(component).toContain('mobileSectionGroups')
    expect(component).toContain('mobile-settings__row')
    expect(component).toContain('<component :is="activePanelComponent" />')
    expect(css).toContain('grid-template-columns: 44px minmax(0, 1fr) 44px')
    expect(css).toContain('min-height: 68px')
    expect(css).toContain('max(var(--safe-area-top), 0px)')
    expect(css).toContain('max(var(--safe-area-bottom), 0px)')
  })

  it('keeps desktop settings in the existing two-column shell', () => {
    const component = readFileSync('src/app/components/WorkspaceSettingsModal.vue', 'utf8')

    expect(component).toContain('<div v-else class="settings-shell">')
    expect(component).toContain('<aside class="settings-sidebar">')
  })
})
