import { h, render } from 'vue'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView, NodeView } from 'prosemirror-view'
import NvSelect from '../../ui/primitives/NvSelect.vue'
import {
  resolveNodePosition,
  getStringAttr,
  getCodeHighlight,
  formatLanguageLabel,
  renderHighlightedCodeLines,
  type CoreNodeViewOptions,
  type NodeViewPosition,
} from './utils'

export function createCodeBlockNodeView(node: PMNode, view: EditorView, getPos: NodeViewPosition, options?: CoreNodeViewOptions): NodeView {
  const dom = document.createElement('div')
  dom.className = 'nv-code-block'
  dom.dataset.editing = 'false'

  const controls = document.createElement('div')
  controls.className = 'nv-code-controls'
  const selectContainer = document.createElement('div')
  controls.append(selectContainer)
  dom.append(controls)

  const surface = document.createElement('div')
  surface.className = 'nv-code-surface'

  const highlightPre = document.createElement('pre')
  highlightPre.className = 'nv-code-highlight'
  highlightPre.setAttribute('aria-hidden', 'true')
  const highlightCode = document.createElement('code')
  highlightCode.className = 'hljs'
  highlightPre.append(highlightCode)

  const editorPre = document.createElement('pre')
  editorPre.className = 'nv-code-editor nv-code-content'
  const contentDOM = editorPre

  surface.append(highlightPre, editorPre)
  dom.append(surface)

  let currentNode = node
  let highlightFrame: number | null = null
  let isEditing = false
  const wrapEnabled = false
  let lastHighlightText: string | null = null
  let lastHighlightLanguage: string | null = null
  let lastActiveLineIndex: number | null = null

  const selectableLanguages = options?.codeLanguages ?? ['javascript', 'typescript', 'json', 'css', 'html', 'markdown', 'rust', 'python', 'go', 'sql']
  const languageOptions = [
    { value: '', label: 'Auto' },
    ...selectableLanguages.map((lang) => ({ value: lang, label: formatLanguageLabel(lang) })),
  ]

  const updateSelect = () => {
    const currentLang = getStringAttr(currentNode, 'language')
    const vnode = h(NvSelect, {
      modelValue: currentLang || '',
      options: languageOptions,
      placeholder: 'Auto',
      minWidth: 0,
      'onUpdate:modelValue': (val: string) => {
        const nextLanguage = val || null
        const position = resolveNodePosition(getPos)
        if (typeof position === 'number') {
          view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...currentNode.attrs, language: nextLanguage }))
        }
      },
    })
    render(vnode, selectContainer)
  }

  const updateWrapState = () => {
    dom.dataset.wrap = wrapEnabled ? 'true' : 'false'
  }

  const isSelectionInsideCodeBlock = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return false
    if (!view.hasFocus()) return false
    const selection = view.state.selection
    const from = position + 1
    const to = position + currentNode.nodeSize - 1
    return selection.from >= from && selection.to <= to
  }

  const getActiveLineIndex = () => {
    const position = resolveNodePosition(getPos)
    if (typeof position !== 'number') return null
    const selection = view.state.selection
    const blockFrom = position + 1
    const blockTo = position + currentNode.nodeSize - 1
    if (selection.from < blockFrom || selection.from > blockTo) return null
    const absoluteOffset = Math.max(0, Math.min(selection.from - blockFrom, currentNode.textContent.length))
    const textBefore = currentNode.textContent.slice(0, absoluteOffset)
    return Math.max(0, textBefore.split('\n').length - 1)
  }

  const setEditing = (nextEditing: boolean) => {
    if (isEditing === nextEditing) return
    isEditing = nextEditing
    dom.dataset.editing = nextEditing ? 'true' : 'false'
    if (!nextEditing) syncHighlight()
  }

  const syncHighlight = () => {
    const sourceText = currentNode.textContent
    const languageAttr = getStringAttr(currentNode, 'language').trim() || null
    const activeIndex = getActiveLineIndex()
    if (sourceText === lastHighlightText && languageAttr === lastHighlightLanguage && activeIndex === lastActiveLineIndex) {
      return
    }
    lastHighlightText = sourceText
    lastHighlightLanguage = languageAttr
    lastActiveLineIndex = activeIndex

    const highlighted = getCodeHighlight(sourceText, languageAttr)
    highlightCode.innerHTML = renderHighlightedCodeLines(highlighted.html || '&nbsp;', activeIndex)
    updateSelect()
  }

  const scheduleHighlight = () => {
    if (highlightFrame !== null) window.cancelAnimationFrame(highlightFrame)
    highlightFrame = window.requestAnimationFrame(() => { highlightFrame = null; syncHighlight() })
  }

  const onEditorScroll = () => { highlightPre.scrollTop = editorPre.scrollTop; highlightPre.scrollLeft = editorPre.scrollLeft }
  const onEditorFocusIn = () => { setEditing(isSelectionInsideCodeBlock()) }
  const onEditorFocusOut = () => {
    const active = document.activeElement
    if (active instanceof Node && editorPre.contains(active)) return
    setEditing(isSelectionInsideCodeBlock())
  }
  const onEditorMouseDown = () => { setEditing(true) }

  editorPre.addEventListener('mousedown', onEditorMouseDown)
  editorPre.addEventListener('scroll', onEditorScroll)
  editorPre.addEventListener('focusin', onEditorFocusIn)
  editorPre.addEventListener('focusout', onEditorFocusOut)
  updateWrapState()
  setEditing(isSelectionInsideCodeBlock())
  syncHighlight()

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      setEditing(isSelectionInsideCodeBlock())
      scheduleHighlight()
      return true
    },
    ignoreMutation(mutation) {
      return mutation.type !== 'selection' && !contentDOM.contains(mutation.target)
    },
    destroy() {
      render(null, selectContainer)
      editorPre.removeEventListener('mousedown', onEditorMouseDown)
      editorPre.removeEventListener('scroll', onEditorScroll)
      editorPre.removeEventListener('focusin', onEditorFocusIn)
      editorPre.removeEventListener('focusout', onEditorFocusOut)
      if (highlightFrame !== null) window.cancelAnimationFrame(highlightFrame)
    },
  }
}
