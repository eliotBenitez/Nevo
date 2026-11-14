import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, render } from 'vue'
import QueryBlock from './QueryBlock.vue'
import { emptyQueryBlockData } from '../../../../features/query/queryBlockData'
import type { NoteRow } from '../../../../types/note-query'

const ROW: NoteRow = {
  noteId: 'n1',
  title: 'Psychology',
  icon: '',
  folderId: 'f1',
  folderPath: 'Cube',
  noteType: 'note',
  status: 'active',
  date: '2026-08-06',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  tags: ['study'],
}

// Mounted like the editor node view: render(h(...)) with no Vue app context.
async function mountTable(onOpenNote = vi.fn()) {
  const data = emptyQueryBlockData()
  data.view = 'table'
  const container = document.createElement('div')
  document.body.appendChild(container)
  render(h(QueryBlock, {
    data,
    t: (key: string) => key,
    onQueryNotes: async () => [ROW],
    onOpenNote,
    onEditRequest: () => {},
  }), container)
  await vi.waitFor(() => expect(container.querySelector('.nv-db-table')).not.toBeNull())
  await nextTick()
  return { container, onOpenNote }
}

describe('QueryBlock table view', () => {
  const containers: HTMLElement[] = []
  afterEach(() => {
    for (const container of containers.splice(0)) {
      render(null, container)
      container.remove()
    }
  })

  it('renders results without editing affordances', async () => {
    const { container } = await mountTable()
    containers.push(container)

    expect(container.querySelector('.nv-db-table__add-row')).toBeNull()
    expect(container.querySelector('.nv-db-table__add-field-btn')).toBeNull()
    expect(container.querySelector('.nv-db-table__field-menu-trigger')).toBeNull()
    expect(container.querySelector('.nv-db-table__resize-handle')).toBeNull()
    expect(container.querySelector('.nv-db-table__row-delete')).toBeNull()
    expect(container.querySelector('.nv-db-table input')).toBeNull()
    expect(container.textContent).toContain('Psychology')
    expect(container.textContent).toContain('study')
    expect(container.textContent).not.toContain('database.cell.selectPlaceholder')
  })

  it('opens the note when a row is clicked', async () => {
    const { container, onOpenNote } = await mountTable()
    containers.push(container)

    container.querySelector<HTMLElement>('.nv-db-table__readonly-cell:not(:has(button))')!.click()
    container.querySelector<HTMLButtonElement>('.nv-db-table__open-record')!.click()

    expect(onOpenNote).toHaveBeenCalledTimes(2)
    expect(onOpenNote).toHaveBeenCalledWith('n1')
  })
})
