import { computed, markRaw, type Ref } from 'vue'
import { Download, Network, Upload } from 'lucide-vue-next'
import type { NoteDocument, TreeNode } from '../../../types/note'
import type { WorkspaceSettings } from '../../../types/workspace'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import { EDITOR_LINE_WIDTHS, resolveEditorFontFamilyCss } from '../../../utils/workspace-settings'
import { normalizeIcon, resolveCoverSource, resolveCoverStyle } from './editorCoverStyle'

interface WorkspaceEditorPresentationOptions {
  getNote: () => NoteDocument | null
  getSettings: () => WorkspaceSettings
  getContainerKind: () => 'root' | 'folder' | null
  getContainerItems: () => TreeNode[]
  getScrollbarDragging: () => boolean
  workspaceAssetRefreshToken: Ref<number>
  resolveWorkspaceAssetSrc: (src: string) => string | null
  titleInputRef: Ref<HTMLTextAreaElement | null>
  localGraphOpen: Ref<boolean>
  translate: (key: string) => string
  emitTitle: (title: string) => void
  requestExport: (format: 'markdown' | 'html' | 'docx' | 'typst' | 'pdf') => void
  requestMarkdownImport: () => void
}

export function useWorkspaceEditorPresentation(options: WorkspaceEditorPresentationOptions) {
  const showContainerOverview = computed(() =>
    !options.getNote()
    && options.getContainerKind() !== null
    && options.getContainerItems().length > 0)
  const isFolderEmptyState = computed(() => options.getContainerKind() === 'folder')
  const noteIcon = computed(() => normalizeIcon(options.getNote()?.icon ?? '📄'))
  const noteCoverStyle = computed(() => {
    void options.workspaceAssetRefreshToken.value
    const resolvedCover = resolveCoverSource(
      options.getNote()?.cover,
      options.resolveWorkspaceAssetSrc,
    )
    return resolveCoverStyle(resolvedCover ?? undefined)
  })
  const noteIconButtonLabel = computed(() => {
    const title = options.getNote()?.title.trim() || options.translate('workspace.titlePlaceholder')
    return `Change icon for ${title}`
  })
  const editorBodyClasses = computed(() => {
    const settings = options.getSettings()
    return {
      'doc-body--smooth': settings.editor.smoothScrolling,
      'doc-body--active-emphasis': settings.editor.activeBlockEmphasis,
      'doc-body--scrollbar-dragging': options.getScrollbarDragging(),
    }
  })
  const editorContentStyle = computed(() => {
    const appearance = options.getSettings().appearance
    return {
      '--workspace-editor-font-family': resolveEditorFontFamilyCss(appearance.editorFontFamily),
      '--workspace-editor-font-size': `${appearance.editorFontSize}px`,
      '--workspace-editor-line-width': EDITOR_LINE_WIDTHS[appearance.editorLineWidth],
    }
  })
  const breadcrumbMenuItems = computed<NvMenuItemDef[]>(() => [
    {
      label: options.translate('export.buttonTitle'),
      icon: markRaw(Download),
      items: [
        {
          label: options.translate('export.formatMarkdown'),
          action: () => options.requestExport('markdown'),
        },
        {
          label: options.translate('export.formatHtml'),
          action: () => options.requestExport('html'),
        },
        {
          label: options.translate('export.formatDocx'),
          action: () => options.requestExport('docx'),
        },
        {
          label: options.translate('export.formatTypst'),
          action: () => options.requestExport('typst'),
        },
        {
          label: options.translate('export.formatPdf'),
          action: () => options.requestExport('pdf'),
        },
      ],
    },
    {
      label: options.translate('workspace.context.importIntoNote'),
      icon: markRaw(Upload),
      action: options.requestMarkdownImport,
    },
    {
      label: options.translate('graph.title'),
      icon: markRaw(Network),
      action: () => { options.localGraphOpen.value = !options.localGraphOpen.value },
    },
  ])

  function resizeTitle() {
    const element = options.titleInputRef.value
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }

  function onTitleInput(event: Event) {
    options.emitTitle((event.target as HTMLTextAreaElement).value)
    resizeTitle()
  }

  return {
    showContainerOverview,
    isFolderEmptyState,
    noteIcon,
    noteCoverStyle,
    noteIconButtonLabel,
    editorBodyClasses,
    editorContentStyle,
    breadcrumbMenuItems,
    resizeTitle,
    onTitleInput,
  }
}
