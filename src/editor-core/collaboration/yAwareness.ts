import type { Awareness } from 'y-protocols/awareness'

export interface AwarenessUser {
  name: string
  color: string
}

const CURSOR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

function randomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
}

export function initAwarenessUser(awareness: Awareness, name: string, color?: string): void {
  awareness.setLocalStateField('user', {
    name,
    color: color ?? randomColor(),
  } satisfies AwarenessUser)
}

export function getAwarenessUsers(awareness: Awareness): Map<number, AwarenessUser & { clientId: number }> {
  const result = new Map<number, AwarenessUser & { clientId: number }>()
  for (const [clientId, state] of awareness.getStates()) {
    if (state.user) {
      result.set(clientId, { clientId, ...state.user as AwarenessUser })
    }
  }
  return result
}
