import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NevoSandboxSidebarItem, NevoSandboxWorkspaceView } from '../../types/editor-plugin'
import type { KanbanBoardMeta } from '../../types/kanban'
import type { FolderMeta, NoteMeta } from '../../types/note'
import type { WorkspaceHomeFavorite, WorkspaceManifest, WorkspaceSettings } from '../../types/workspace'
import { workspaceHomeFavoriteKey } from '../../utils/workspace-settings/normalizers'

export type WorkspaceHomeItemKind = WorkspaceHomeFavorite['kind']

export interface WorkspaceHomeItem {
  key: string
  favorite: WorkspaceHomeFavorite
  kind: WorkspaceHomeItemKind
  title: string
  icon: string
  route: string | null
  updatedAt: string | null
  available: boolean
  loading: boolean
}

interface UseWorkspaceHomeOptions {
  manifest: Ref<WorkspaceManifest | null>
  settings: Ref<WorkspaceSettings>
  boards: Ref<KanbanBoardMeta[]>
  kanbanEnabled: Ref<boolean>
  pluginViews: Ref<NevoSandboxWorkspaceView[]>
  pluginItems: Ref<NevoSandboxSidebarItem[]>
  pluginUiReady: Ref<boolean>
  updateSettings: (mutator: (draft: WorkspaceSettings) => void) => Promise<void>
}

function collectWorkspaceEntities(manifest: WorkspaceManifest | null) {
  const notes: NoteMeta[] = []
  const folders: FolderMeta[] = []
  if (!manifest) return { notes, folders }

  notes.push(...manifest.rootNotes)
  const visitFolders = (items: FolderMeta[]) => {
    for (const folder of items) {
      folders.push(folder)
      notes.push(...folder.notes)
      visitFolders(folder.children)
    }
  }
  visitFolders(manifest.tree)
  return { notes, folders }
}

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function useWorkspaceHome(options: UseWorkspaceHomeOptions) {
  const { t } = useI18n()
  const entities = computed(() => collectWorkspaceEntities(options.manifest.value))
  const favorites = computed(() => options.settings.value.general.homeFavorites)

  const pluginContributions = computed(() => {
    const result = new Map<string, NevoSandboxWorkspaceView | NevoSandboxSidebarItem>()
    for (const contribution of [...options.pluginViews.value, ...options.pluginItems.value]) {
      const key = `${contribution.pluginId}:${contribution.id}`
      if (!result.has(key)) result.set(key, contribution)
    }
    return result
  })

  function resolveFavorite(favorite: WorkspaceHomeFavorite): WorkspaceHomeItem {
    const key = workspaceHomeFavoriteKey(favorite)
    if (favorite.kind === 'graph') {
      return {
        key,
        favorite,
        kind: 'graph',
        title: t('workspace.home.types.graph'),
        icon: 'lucide:network',
        route: '/workspace/graph',
        updatedAt: null,
        available: true,
        loading: false,
      }
    }

    if (favorite.kind === 'pluginView') {
      const contribution = pluginContributions.value.get(
        `${favorite.pluginId}:${favorite.contributionId}`,
      )
      if (contribution) {
        return {
          key,
          favorite,
          kind: 'pluginView',
          title: contribution.title,
          icon: contribution.icon ?? 'lucide:blocks',
          route: contribution.route,
          updatedAt: null,
          available: true,
          loading: false,
        }
      }
      const loading = !options.pluginUiReady.value
      return {
        key,
        favorite,
        kind: 'pluginView',
        title: loading
          ? t('workspace.home.favorites.loadingPlugin')
          : `${favorite.pluginId} · ${favorite.contributionId}`,
        icon: 'lucide:blocks',
        route: null,
        updatedAt: null,
        available: false,
        loading,
      }
    }

    if (favorite.kind === 'note') {
      const note = entities.value.notes.find(item => item.id === favorite.id)
      return {
        key,
        favorite,
        kind: 'note',
        title: note?.title ?? favorite.id,
        icon: note?.icon ?? '📄',
        route: note ? `/workspace/note/${note.id}` : null,
        updatedAt: note?.updatedAt ?? null,
        available: !!note,
        loading: false,
      }
    }

    if (favorite.kind === 'folder') {
      const folder = entities.value.folders.find(item => item.id === favorite.id)
      return {
        key,
        favorite,
        kind: 'folder',
        title: folder?.title ?? favorite.id,
        icon: folder?.icon ?? '📁',
        route: folder ? `/workspace/folder/${folder.id}` : null,
        updatedAt: null,
        available: !!folder,
        loading: false,
      }
    }

    const board = options.kanbanEnabled.value
      ? options.boards.value.find(item => item.id === favorite.id)
      : undefined
    return {
      key,
      favorite,
      kind: 'board',
      title: board?.title ?? favorite.id,
      icon: board?.icon ?? '🗂️',
      route: board ? `/workspace/plugin/nevo.kanban/${board.id}` : null,
      updatedAt: board?.updatedAt ?? null,
      available: !!board,
      loading: false,
    }
  }

  const managerItems = computed(() => favorites.value.map(resolveFavorite))
  const favoriteItems = computed(() =>
    managerItems.value.filter(item => item.available || item.loading).slice(0, 8),
  )

  const candidates = computed<WorkspaceHomeItem[]>(() => {
    const result: WorkspaceHomeItem[] = []
    for (const note of entities.value.notes) {
      result.push(resolveFavorite({ kind: 'note', id: note.id }))
    }
    for (const folder of entities.value.folders) {
      result.push(resolveFavorite({ kind: 'folder', id: folder.id }))
    }
    if (options.kanbanEnabled.value) {
      for (const board of options.boards.value) {
        result.push(resolveFavorite({ kind: 'board', id: board.id }))
      }
    }
    result.push(resolveFavorite({ kind: 'graph' }))
    for (const contribution of pluginContributions.value.values()) {
      result.push(resolveFavorite({
        kind: 'pluginView',
        pluginId: contribution.pluginId,
        contributionId: contribution.id,
      }))
    }
    return result
  })

  const recentItems = computed(() => {
    const items: Array<WorkspaceHomeItem & { stableIndex: number; timestamp: number }> = []
    let stableIndex = 0
    for (const note of entities.value.notes) {
      const item = resolveFavorite({ kind: 'note', id: note.id })
      const timestamp = validTimestamp(item.updatedAt)
      if (timestamp !== null) items.push({ ...item, stableIndex, timestamp })
      stableIndex += 1
    }
    if (options.kanbanEnabled.value) {
      for (const board of options.boards.value) {
        const item = resolveFavorite({ kind: 'board', id: board.id })
        const timestamp = validTimestamp(item.updatedAt)
        if (timestamp !== null) items.push({ ...item, stableIndex, timestamp })
        stableIndex += 1
      }
    }
    return items
      .sort((left, right) => right.timestamp - left.timestamp || left.stableIndex - right.stableIndex)
      .slice(0, 6)
  })

  const isWorkspaceEmpty = computed(() =>
    entities.value.notes.length === 0
    && entities.value.folders.length === 0
    && (!options.kanbanEnabled.value || options.boards.value.length === 0),
  )

  function isFavorite(favorite: WorkspaceHomeFavorite) {
    const key = workspaceHomeFavoriteKey(favorite)
    return favorites.value.some(item => workspaceHomeFavoriteKey(item) === key)
  }

  async function addFavorite(favorite: WorkspaceHomeFavorite): Promise<'added' | 'exists' | 'limit'> {
    if (isFavorite(favorite)) return 'exists'
    if (favorites.value.length >= 8) return 'limit'
    await options.updateSettings((draft) => {
      draft.general.homeFavorites.push(favorite)
    })
    return 'added'
  }

  async function removeFavorite(favorite: WorkspaceHomeFavorite) {
    const key = workspaceHomeFavoriteKey(favorite)
    await options.updateSettings((draft) => {
      draft.general.homeFavorites = draft.general.homeFavorites.filter(
        item => workspaceHomeFavoriteKey(item) !== key,
      )
    })
  }

  async function toggleFavorite(favorite: WorkspaceHomeFavorite): Promise<'added' | 'removed' | 'limit'> {
    if (isFavorite(favorite)) {
      await removeFavorite(favorite)
      return 'removed'
    }
    const result = await addFavorite(favorite)
    return result === 'exists' ? 'added' : result
  }

  async function moveFavorite(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= favorites.value.length
      || toIndex >= favorites.value.length
    ) return
    await options.updateSettings((draft) => {
      const [moved] = draft.general.homeFavorites.splice(fromIndex, 1)
      draft.general.homeFavorites.splice(toIndex, 0, moved)
    })
  }

  return {
    favorites,
    favoriteItems,
    managerItems,
    candidates,
    recentItems,
    isWorkspaceEmpty,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    moveFavorite,
  }
}
