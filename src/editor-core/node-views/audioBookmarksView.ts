import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { clearIcon, mountIcon, type UiIconName } from '../../ui/icons/dom'
import { formatAudioTime, readAudioBookmarks, type AudioBookmark } from '../../core/media/audioBookmarks'
import type { NodeViewPosition } from './utils'
import { createAudioPlayerView } from './audioPlayerView'

export interface AudioBookmarksViewOptions {
  view: EditorView
  getPos: NodeViewPosition
  t: (key: string) => string
  resolveMediaSrc: (relativeSrc: string) => string | null
  resolveWaveformSrc: (relativeSrc: string) => string
}

function iconButton(label: string, icon: UiIconName, className: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  const mount = document.createElement('span')
  mount.setAttribute('aria-hidden', 'true')
  button.append(mount)
  mountIcon(icon, mount)
  return button
}

/** Bookmark list and inline editing, composed with the independent audio player. */
export function createAudioBookmarksView(node: PMNode, options: AudioBookmarksViewOptions) {
  const { view, getPos, t } = options
  const root = document.createElement('div')
  root.className = 'nv-audio-layout'
  const player = createAudioPlayerView(node, options)
  const list = document.createElement('section')
  list.className = 'nv-audio-bookmarks'
  list.setAttribute('aria-label', t('media.bookmarks'))
  const listTitle = document.createElement('h3')
  listTitle.textContent = t('media.bookmarks')
  const rows = document.createElement('div')
  rows.className = 'nv-audio-bookmark-list'
  const add = iconButton(t('media.addBookmark'), 'Plus', 'nv-audio-add')
  const addText = document.createElement('span')
  addText.textContent = t('media.addBookmark')
  add.append(addText)
  list.append(listTitle, rows, add)
  root.append(player.dom, list)

  let currentNode = node
  let bookmarkSnapshot = JSON.stringify(node.attrs.bookmarks ?? [])
  let editableSnapshot = view.editable
  let draftTime = 0
  let draft: HTMLInputElement | null = null
  let draftForm: HTMLFormElement | null = null
  let destroyed = false
  const canEdit = () => view.editable

  function dispatchBookmarks(next: unknown[]) {
    if (destroyed || view.isDestroyed || !canEdit()) return
    let pos: number | undefined
    try { pos = typeof getPos === 'function' ? getPos() : undefined } catch { return }
    if (typeof pos !== 'number') return
    const live = view.state.doc.nodeAt(pos)
    if (!live || live.type !== currentNode.type || live.attrs.src !== currentNode.attrs.src) return
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...live.attrs, bookmarks: next }))
  }

  function renderRows() {
    if (destroyed) return
    if (!canEdit()) {
      draft = null
      draftForm = null
    }
    for (const mount of rows.querySelectorAll<HTMLElement>('.nv-audio-icon-button span')) clearIcon(mount)
    rows.replaceChildren()
    const bookmarks = readAudioBookmarks(currentNode.attrs.bookmarks)
    if (!bookmarks.length) {
      const empty = document.createElement('p')
      empty.className = 'nv-audio-empty'
      empty.textContent = t('media.emptyBookmarks')
      rows.append(empty)
    }
    const active = [...bookmarks].reverse().find((bookmark) => bookmark.time <= player.currentTime)
    for (const bookmark of bookmarks) {
      const row = document.createElement('div')
      row.className = 'nv-audio-bookmark'
      row.dataset.bookmarkId = bookmark.id
      if (active?.id === bookmark.id) {
        row.dataset.active = 'true'
        row.setAttribute('aria-current', 'location')
      }
      const jump = document.createElement('button')
      jump.type = 'button'
      jump.className = 'nv-audio-time'
      jump.setAttribute('aria-label', `${formatAudioTime(bookmark.time)} ${bookmark.label}`)
      jump.textContent = formatAudioTime(bookmark.time)
      jump.addEventListener('click', () => player.seekTo(bookmark.time))
      const label = document.createElement('span')
      label.className = 'nv-audio-label'
      label.textContent = bookmark.label
      row.append(jump, label)
      if (canEdit()) {
        row.append(iconButton(t('media.renameBookmark'), 'Pencil', 'nv-audio-icon-button'))
        row.append(iconButton(t('media.deleteBookmark'), 'Trash2', 'nv-audio-icon-button'))
        row.lastElementChild?.addEventListener('click', () => {
          const raw = Array.isArray(currentNode.attrs.bookmarks) ? currentNode.attrs.bookmarks : []
          dispatchBookmarks(raw.filter((entry) => !entry || typeof entry !== 'object' || (entry as Record<string, unknown>).id !== bookmark.id))
        })
        row.querySelector('.nv-audio-icon-button')?.addEventListener('click', () => beginRename(bookmark))
      }
      rows.append(row)
    }
    if (draftForm) rows.append(draftForm)
    add.hidden = !canEdit()
  }

  function updateActiveRow() {
    const bookmarks = readAudioBookmarks(currentNode.attrs.bookmarks)
    const active = [...bookmarks].reverse().find((bookmark) => bookmark.time <= player.currentTime)
    for (const row of rows.querySelectorAll<HTMLElement>('[data-bookmark-id]')) {
      const isActive = row.dataset.bookmarkId === active?.id
      if (isActive) {
        row.dataset.active = 'true'
        row.setAttribute('aria-current', 'location')
      } else {
        delete row.dataset.active
        row.removeAttribute('aria-current')
      }
    }
  }

  function beginRename(bookmark: AudioBookmark) {
    const raw = Array.isArray(currentNode.attrs.bookmarks) ? currentNode.attrs.bookmarks : []
    const input = document.createElement('input')
    input.value = bookmark.label
    input.setAttribute('aria-label', t('media.renameBookmark'))
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); renderRows(); return }
      if (event.key !== 'Enter') return
      event.preventDefault()
      const label = input.value.trim()
      if (!label) return
      dispatchBookmarks(raw.map((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === bookmark.id
        ? { ...(entry as Record<string, unknown>), label }
        : entry))
      input.blur()
    })
    const row = [...rows.querySelectorAll<HTMLElement>('[data-bookmark-id]')]
      .find((candidate) => candidate.dataset.bookmarkId === bookmark.id)
    const label = row?.querySelector('.nv-audio-label')
    if (!label) return
    label.replaceWith(input)
    input.focus()
    input.select()
    input.addEventListener('blur', renderRows, { once: true })
  }

  function showAddForm() {
    if (!canEdit() || draft) return
    draftTime = player.currentTime
    const form = document.createElement('form')
    form.className = 'nv-audio-bookmark-form'
    const time = document.createElement('span')
    time.textContent = formatAudioTime(draftTime)
    const input = document.createElement('input')
    input.placeholder = t('media.bookmarkNamePlaceholder')
    input.setAttribute('aria-label', t('media.bookmarkName'))
    input.required = true
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.textContent = t('media.addBookmark')
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'nv-audio-cancel'
    cancel.textContent = t('media.cancel')
    cancel.addEventListener('click', () => {
      draft = null
      draftForm = null
      form.remove()
      renderRows()
      add.focus()
    })
    form.append(time, input, submit, cancel)
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        draft = null
        draftForm = null
        form.remove()
        renderRows()
        add.focus()
      } else if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault()
        form.requestSubmit()
      }
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const label = input.value.trim()
      if (!label || !canEdit()) return
      const raw = Array.isArray(currentNode.attrs.bookmarks) ? currentNode.attrs.bookmarks : []
      dispatchBookmarks([...raw, { id: crypto.randomUUID(), time: draftTime, label }])
      draft = null
      draftForm = null
      form.remove()
      renderRows()
      add.focus()
    })
    draft = input
    draftForm = form
    rows.append(form)
    input.focus()
  }

  add.addEventListener('click', showAddForm)
  const unsubscribeTime = player.onTimeUpdate(updateActiveRow)
  renderRows()
  function updateBookmarks(next: PMNode) {
    currentNode = next
    const nextSnapshot = JSON.stringify(next.attrs.bookmarks ?? [])
    const nextEditable = view.editable
    if (nextSnapshot !== bookmarkSnapshot || nextEditable !== editableSnapshot) {
      bookmarkSnapshot = nextSnapshot
      editableSnapshot = nextEditable
      renderRows()
    } else updateActiveRow()
  }
  return {
    dom: root,
    update(next: PMNode) { updateBookmarks(next); player.update(next) },
    updateBookmarks,
    isPaused: player.isPaused,
    suspend: player.suspend,
    stopEvent: (target: Node) => player.stopEvent(target) || root.contains(target),
    destroy() {
      destroyed = true
      unsubscribeTime()
      player.destroy()
      const addIcon = add.querySelector<HTMLElement>('span')
      if (addIcon) clearIcon(addIcon)
      for (const mount of root.querySelectorAll<HTMLElement>('.nv-audio-icon-button span')) clearIcon(mount)
    },
  }
}
