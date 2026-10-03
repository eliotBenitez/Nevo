import { describe, expect, it } from 'vitest'

const { readFileSync } = process.getBuiltinModule('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string
}

// Replaces WorkspaceHistoryModal.mobile.test.ts: the history dialog became a
// full-screen route (see src/features/history/HistoryView.vue and the work
// order at .agents/history-redesign-phase1.md). This test locks in the
// narrow-viewport behaviour: the two
// columns stack, the top bar collapses to back + title, and diff rows fall
// back to a single column.
describe('history view mobile layout', () => {
  it('stacks the timeline above the diff pane below the two-column breakpoint', () => {
    const component = readFileSync('src/features/history/HistoryView.vue', 'utf8')

    expect(component).toContain('tw:grid-cols-[clamp(420px,26vw,520px)_minmax(0,1fr)]')
    expect(component).toContain('tw:max-[900px]:flex tw:max-[900px]:flex-col tw:max-[900px]:overflow-y-auto')
  })

  it('collapses the timeline column to its natural height on narrow viewports', () => {
    const component = readFileSync('src/features/history/HistoryTimeline.vue', 'utf8')

    expect(component).toContain('tw:max-[900px]:h-auto tw:max-[900px]:max-h-[46vh] tw:max-[900px]:shrink-0')
  })

  it('hides the muted subtitle and gives restore actions a touch-sized target', () => {
    const component = readFileSync('src/features/history/HistoryTopBar.vue', 'utf8')

    expect(component).toContain('history-top-bar__subtitle tw:shrink-0 tw:text-[12.5px] tw:text-content-muted tw:max-[719px]:hidden')
    expect(component).toContain('tw:max-[719px]:min-h-11')
  })

  it('places restore confirmation text above the two confirmation actions on phone widths', () => {
    const component = readFileSync('src/features/history/HistoryTopBar.vue', 'utf8')

    expect(component).toContain('history-top-bar__confirmation tw:flex')
    expect(component).toContain('tw:max-[480px]:grid tw:max-[480px]:grid-cols-2')
    expect(component).toContain('tw:max-[480px]:col-span-2')
    expect(component.indexOf('history-top-bar__confirm-text')).toBeLessThan(component.indexOf('ref="cancelButton"'))
    expect(component.indexOf('ref="cancelButton"')).toBeLessThan(component.indexOf('history-top-bar__confirm tw:'))
  })

  it('falls back diff rows to a single column below the phone breakpoint', () => {
    const component = readFileSync('src/features/history/HistoryDiffPane.vue', 'utf8')

    expect(component).toContain('history-diff-pane__row-grid tw:grid tw:grid-cols-2 tw:items-stretch tw:gap-2.5 tw:max-[719px]:grid-cols-1')
    expect(component).toContain('history-diff-pane__column-labels tw:mb-1 tw:grid tw:grid-cols-2 tw:gap-2.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.07em] tw:text-content-muted tw:uppercase tw:max-[719px]:grid-cols-1')
  })

  it('keeps the history shell class for workspace layout and custom CSS', () => {
    const component = readFileSync('src/features/history/HistoryView.vue', 'utf8')

    expect(component).toContain('class="history-view tw:flex')
  })
})
