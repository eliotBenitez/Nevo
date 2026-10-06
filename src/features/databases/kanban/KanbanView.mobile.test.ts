import { describe, expect, it } from 'vitest'

const { readFileSync } = process.getBuiltinModule('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string
}

describe('Kanban mobile layout', () => {
  it('keeps the board header below the Android status bar', () => {
    const view = readFileSync('src/features/databases/kanban/KanbanView.vue', 'utf8')

    // Safe-area padding lives in Tailwind arbitrary values (no spaces allowed).
    expect(view).toContain('max(var(--safe-area-top),0px)')
    expect(view).toContain('max(var(--safe-area-bottom),0px)')
    expect(view).toContain('scroll-snap-type:inline_proximity')
  })

  it('contains horizontal overflow within touch-scrollable board controls', () => {
    const toolbar = readFileSync('src/features/databases/kanban/KanbanToolbar.vue', 'utf8')
    const column = readFileSync('src/features/databases/kanban/KanbanColumn.vue', 'utf8')

    expect(toolbar).toContain('overflow-x: auto')
    expect(toolbar).toContain('min-height: 36px')
    expect(toolbar).toContain('mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent)')
    // Transparent ::after insets keep the effective touch target at 44px.
    expect(toolbar).toContain('inset: -4px;')
    // Column width/scroll-snap live in a Tailwind arbitrary value now (no
    // spaces allowed inside `[...]`), not a plain CSS media-query rule.
    expect(column).toContain('calc(100vw_-_32px')
    expect(column).toContain('scroll-snap-align:start')
  })

  it('replaces the board with a full work area and back control on narrow screens', () => {
    const view = readFileSync('src/features/databases/kanban/KanbanView.vue', 'utf8')
    const pane = readFileSync('src/features/databases/kanban/KanbanCardEditorPane.vue', 'utf8')

    expect(view).toContain('> .kb-view__board')
    for (const viewRoot of ['.kb-group', '.kb-table', '.kb-cal']) expect(view).toContain(`:deep(${viewRoot})`)
    expect(view).toContain('grid-row: 3')
    expect(view).toContain('@media (max-width: 1300px)')
    expect(pane).toContain('@media (max-width: 1300px)')
    expect(pane).toContain('.kb-editor-back { display: inline-flex; min-width: 44px; min-height: 44px; }')
    expect(pane).toContain('.kb-editor-properties-popover { right: -40px; }')
    expect(view).toContain('.kb-view--split-error > .kb-view__error-banner { grid-column: 1; grid-row: 1; }')
    expect(view).toContain("'kb-view--split-error': activeCard && moveError")
    expect(pane).toContain('.kb-editor-title:focus-visible,')
    expect(pane).toContain('.kb-editor-properties summary:focus-visible')
    expect(view).toContain('.kb-view--split > .kb-editor-pane { border-left: 0; }')
    expect(pane).toContain('@media (max-width: 760px)')
    expect(pane).toContain('.kb-editor-properties-trigger { min-height: 44px; }')
    expect(pane).toContain('min-width: 44px; min-height: 44px;')
    expect(pane).toContain('class="kb-editor-header__top')
    expect(pane).toContain('class="kb-editor-title')
    expect(pane).toContain('class="kb-editor-meta')
    expect(pane).toContain('.kb-editor-content { display: block; min-height: 55vh; border: 0;')
  })
})
