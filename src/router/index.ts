import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

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
    path: '/workspace/note/:noteId',
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
    path: '/workspace/draw/:noteId/:drawId',
    component: () => import('../app/WorkspaceShell.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
