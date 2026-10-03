import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { finalizeActiveRecording } from '../core/voice-recording/activeRecording'
import { useNoteStore } from '../stores/note'
import { useWorkspaceStore } from '../stores/workspace'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/onboarding',
  },
  {
    path: '/onboarding',
    component: () => import('../features/onboarding/OnboardingView.vue'),
  },
  {
    path: '/workspace',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/notes',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/boards',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/more',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/note/:noteId',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/note/:noteId/canvas',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/note/:noteId/history',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/history',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/folder/:folderId',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/graph',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/board/:boardId',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/plugin/nevo.kanban/:boardId',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/plugin/:pluginId/:viewId?',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/draw/:noteId/:drawId',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/settings/:section?',
    component: () => import('../app/WorkspaceShell.vue'),
  },
  {
    path: '/workspace/archive',
    component: () => import('../app/WorkspaceShell.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Finalize an in-progress voice recording while the editor is still mounted,
// so the recorded block is inserted and saved before the view unmounts.
export async function finalizeRecordingBeforeNavigation(to?: { fullPath: string }, from?: { fullPath: string }): Promise<boolean | void> {
  await finalizeActiveRecording()
  if (!to || !from) return
  if (to.fullPath === from.fullPath) return true

  const noteStore = useNoteStore()
  const currentNote = noteStore.activeNote
  if (!currentNote) return true

  const workspaceStore = useWorkspaceStore()
  const noteId = currentNote.id
  const backend = workspaceStore.backend
  const result = await noteStore.flushDurably()
  return result.ok
    && !noteStore.isDirty
    && noteStore.saveStatus !== 'error'
    && noteStore.activeNote?.id === noteId
    && workspaceStore.backend === backend
}

router.beforeEach(finalizeRecordingBeforeNavigation)
