import { describe, expect, it, afterEach } from 'vitest'
import { h, render } from 'vue'
import DatabaseBlock from './DatabaseBlock.vue'
import { createDefaultDatabaseData, type DatabaseBlockData, type DbRecord } from '../../../../types/database-block'
import { MemoryDatabaseRepository, type DatabaseOperation } from '../../../../features/database/databaseRepository'

// Mirrors exactly how src/editor-core/node-views/database.ts mounts the component:
// via render(h(...)) with NO Vue app context (no i18n/pinia plugins available).
function mount(
  data: DatabaseBlockData,
  onChange: (next: DatabaseBlockData) => void,
  onRequestDelete = () => {},
  repository = new MemoryDatabaseRepository(),
) {
  const container = document.createElement('div')
  render(
    h(DatabaseBlock, {
      data,
      repository,
      t: (key: string) => key,
      onChange,
      onRequestDelete,
    }),
    container,
  )
  return { container, unmount: () => render(null, container) }
}

describe('DatabaseBlock (context-free mount)', () => {
  const mounted: Array<() => void> = []
  afterEach(() => {
    mounted.splice(0).forEach(fn => fn())
  })

  it('renders the default table view without a Vue app context', () => {
    const { container, unmount } = mount(createDefaultDatabaseData(), () => {})
    mounted.push(unmount)
    // The component root renders (node view sets .nv-database-block on its own wrapper).
    expect(container.firstElementChild).toBeTruthy()
    expect((container.textContent ?? '').length).toBeGreaterThan(0)
    // A table view renders at least one editable input (title + cells).
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('propagates edits through onChange as a fresh cloned snapshot', async () => {
    const data = createDefaultDatabaseData()
    let received: DatabaseBlockData | null = null
    const { container, unmount } = mount(data, (next) => { received = next })
    mounted.push(unmount)

    const titleInput = container.querySelector('input') as HTMLInputElement | null
    expect(titleInput).toBeTruthy()

    // Editing the title input should schedule a commit that emits a new snapshot.
    titleInput!.value = 'My database'
    titleInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(received).not.toBeNull()
    // Emitted snapshot must be a distinct object (no shared-attr mutation).
    expect(received).not.toBe(data)
    expect((received as unknown as DatabaseBlockData).title).toBe('My database')
  })

  it('updates a number cell before its background persistence resolves', async () => {
    class DelayedWriteRepository extends MemoryDatabaseRepository {
      override applyOperations(_databaseId: string, _operations: DatabaseOperation[]): Promise<number> {
        return new Promise(() => {})
      }
    }

    const data = createDefaultDatabaseData()
    if (data.version !== 2) throw new Error('Expected v2 database data')
    const numberField = { id: 'number', name: 'Number', type: 'number' as const }
    data.fields.push(numberField)
    data.rowCount = 1
    const repository = new DelayedWriteRepository()
    await repository.importRecords(data.databaseId, [{ id: 'r1', cells: { [numberField.id]: 2 } } satisfies DbRecord], 'replace')

    const { container, unmount } = mount(data, () => {}, () => {}, repository)
    mounted.push(unmount)
    await new Promise(resolve => setTimeout(resolve, 0))

    const increment = container.querySelector<HTMLButtonElement>('.nv-db-cell--number .nni-step:last-child')
    expect(increment).toBeTruthy()
    increment!.click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(container.querySelector<HTMLInputElement>('.nv-db-cell--number .nni-input')?.value).toBe('3')
  })
})
