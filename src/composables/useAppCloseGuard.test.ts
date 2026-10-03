import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { useAppCloseGuard } from './useAppCloseGuard'

const BEFORE_CLOSE_EVENT = 'nevo://close-requested'

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  unlisten: vi.fn(),
}))

const invokeMock = vi.hoisted(() => vi.fn())
const confirmMock = vi.hoisted(() => vi.fn())
const noteStoreMocks = vi.hoisted(() => ({
  flushDurably: vi.fn(),
}))
const finalizeActiveRecordingMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: () => void) => {
    eventMocks.listeners.set(event, handler)
    return eventMocks.unlisten
  }),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('../ui/composables/useConfirmDialog', () => ({
  confirm: confirmMock,
}))

vi.mock('../stores/note', () => ({
  useNoteStore: () => noteStoreMocks,
}))

vi.mock('../utils/logger', () => ({
  appLogger: {
    error: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../core/voice-recording/activeRecording', () => ({
  finalizeActiveRecording: finalizeActiveRecordingMock,
}))

const Host = defineComponent({
  setup() {
    useAppCloseGuard()
    return () => h('div')
  },
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      closeGuard: {
        saveFailedTitle: 'Save failed',
        saveFailedMessage: 'Changes may be lost.',
        closeAnyway: 'Close anyway',
        stay: 'Stay',
      },
    },
  },
})

async function mountGuard() {
  const wrapper = mount(Host, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

function triggerClose() {
  eventMocks.listeners.get(BEFORE_CLOSE_EVENT)?.()
}

function deferredResult() {
  let resolve!: (value: { ok: true } | { ok: false; error: unknown }) => void
  const promise = new Promise<{ ok: true } | { ok: false; error: unknown }>((res) => { resolve = res })
  return { promise, resolve }
}

describe('useAppCloseGuard', () => {
  beforeEach(() => {
    eventMocks.listeners.clear()
    eventMocks.unlisten.mockClear()
    invokeMock.mockReset()
    confirmMock.mockReset()
    noteStoreMocks.flushDurably.mockReset()
    finalizeActiveRecordingMock.mockClear()
    finalizeActiveRecordingMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows the window to close after a successful durable flush', async () => {
    noteStoreMocks.flushDurably.mockResolvedValue({ ok: true })
    invokeMock.mockResolvedValue(undefined)
    await mountGuard()

    triggerClose()
    await flushPromises()

    expect(invokeMock).toHaveBeenCalledWith('allow_app_close')
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('does not close and lets a later attempt retry when the user chooses to stay', async () => {
    noteStoreMocks.flushDurably.mockResolvedValue({ ok: false, error: new Error('offline') })
    confirmMock.mockResolvedValueOnce(false)
    await mountGuard()

    triggerClose()
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).not.toHaveBeenCalled()

    // A subsequent close request must not be permanently blocked by the
    // earlier failure.
    noteStoreMocks.flushDurably.mockResolvedValue({ ok: true })
    triggerClose()
    await flushPromises()

    expect(invokeMock).toHaveBeenCalledWith('allow_app_close')
  })

  it('closes anyway when the user confirms despite the failed flush', async () => {
    noteStoreMocks.flushDurably.mockResolvedValue({ ok: false, error: new Error('offline') })
    confirmMock.mockResolvedValueOnce(true)
    invokeMock.mockResolvedValue(undefined)
    await mountGuard()

    triggerClose()
    await flushPromises()

    expect(invokeMock).toHaveBeenCalledWith('allow_app_close')
  })

  it('resets closing so a retry works when allow_app_close itself rejects', async () => {
    noteStoreMocks.flushDurably.mockResolvedValue({ ok: true })
    invokeMock.mockRejectedValueOnce(new Error('ipc down')).mockResolvedValueOnce(undefined)
    await mountGuard()

    triggerClose()
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledTimes(1)

    triggerClose()
    await flushPromises()
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })

  it('finalizes an in-progress voice recording before the durable flush', async () => {
    const callOrder: string[] = []
    finalizeActiveRecordingMock.mockImplementation(async () => { callOrder.push('finalize') })
    noteStoreMocks.flushDurably.mockImplementation(async () => {
      callOrder.push('flushDurably')
      return { ok: true }
    })
    invokeMock.mockResolvedValue(undefined)
    await mountGuard()

    triggerClose()
    await flushPromises()

    expect(callOrder).toEqual(['finalize', 'flushDurably'])
  })

  it('ignores a repeated close event while a flush is already in flight', async () => {
    const deferred = deferredResult()
    noteStoreMocks.flushDurably.mockReturnValue(deferred.promise)
    await mountGuard()

    triggerClose()
    triggerClose()
    deferred.resolve({ ok: true })
    await flushPromises()

    expect(noteStoreMocks.flushDurably).toHaveBeenCalledTimes(1)
  })
})
