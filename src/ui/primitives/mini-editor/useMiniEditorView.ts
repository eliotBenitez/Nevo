import { reactive, ref, shallowRef, type Ref } from 'vue'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { NevoCoreCommands } from '../../../editor-core/commands'
import type { NevoSlashItem } from '../../../types/editor-plugin'

export interface UseMiniEditorViewOptions {
  getModelValue: () => unknown
  emitUpdate: (value: unknown) => void
}

const noopCommand: Command = () => false

export function useMiniEditorView(_mountEl: Ref<HTMLElement | null>, _options: UseMiniEditorViewOptions) {
  const view = shallowRef<EditorView | null>(null)
  const activeMarks = ref<Set<string>>(new Set())
  const isEmpty = ref(true)
  const toolbar = reactive({ visible: false, top: 0, left: 0 })
  const mathPopover = reactive({ open: false, latex: '', top: 0, left: 0 })
  const slash = reactive({ open: false, query: '', activeIndex: 0, items: [] as NevoSlashItem[], top: 0, left: 0 })

  const coreCommands = {
    toggleHighlight: () => noopCommand,
    setLink: () => noopCommand,
    unsetLink: noopCommand,
    insertMathInline: () => noopCommand,
    updateMathAtSelection: () => noopCommand,
    removeMathAtSelection: noopCommand,
  } as unknown as NevoCoreCommands

  return {
    view,
    activeMarks,
    isEmpty,
    toolbar,
    mathPopover,
    slash,
    getCoreCommands: () => coreCommands,
    mount: () => {},
    destroy: () => {},
    syncModelValue: (_value: unknown) => {},
    dispatch: (_command: Command, _opts: { focus?: boolean } = {}) => {},
    executeCommandById: (_id: string) => {},
    runSlashItem: (_item: NevoSlashItem) => false,
    dismissSlash: () => { slash.open = false },
    editSelectedMath: () => {},
    closeMathPopover: () => { mathPopover.open = false },
    refreshOverlays: () => {},
  }
}
