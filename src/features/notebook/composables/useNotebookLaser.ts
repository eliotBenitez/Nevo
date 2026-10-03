import { onBeforeUnmount, shallowRef } from 'vue'
import type { NotebookPointV1 } from '../../../core/notebook/types'
import { notebookStrokeOutlinePath } from '../../../core/notebook/geometry'

export const NOTEBOOK_LASER_LIFETIME_MS = 1600
export const NOTEBOOK_LASER_POINT_LIMIT = 2048

export interface NotebookLaserTrace {
  id: number
  pageId: string
  path: string
  color: string
  width: number
  head: { x: number; y: number }
}

export function useNotebookLaser() {
  const traces = shallowRef<NotebookLaserTrace[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 0
  let disposed = false

  function remove(id: number): void {
    clearTimeout(timers.get(id))
    timers.delete(id)
    traces.value = traces.value.filter(trace => trace.id !== id)
  }

  function add(points: NotebookPointV1[], style: { color: string; width: number }, pageId: string | null): void {
    if (disposed || !points.length || !pageId) return
    const tail = points.slice(-NOTEBOOK_LASER_POINT_LIMIT)
    const head = tail[tail.length - 1]!
    const id = ++nextId
    if (traces.value.length >= 32) remove(traces.value[0]!.id)
    traces.value = [...traces.value, { id, pageId, path: notebookStrokeOutlinePath(tail, style.width),
      color: style.color, width: style.width, head: { x: head.x, y: head.y } }]
    timers.set(id, setTimeout(() => remove(id), NOTEBOOK_LASER_LIFETIME_MS))
  }

  onBeforeUnmount(() => {
    disposed = true
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    traces.value = []
  })
  return { traces, add }
}
