import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import type { AppConfig } from '../types/workspace'

function defaultAppConfig(): AppConfig {
  return {
    version: '1',
    theme: 'system',
    locale: 'ru',
    recents: [],
    interfaceDensity: 'comfortable',
    reducedMotion: 'system',
    scrollbarVisibility: 'hidden',
    focusRingStyle: 'accent',
    windowChromeStyle: 'default',
    interfaceZoom: 100,
    reduceTransparency: false,
    interfaceRoundness: 'default',
    themeSchedule: { enabled: false, lightTime: '07:00', darkTime: '20:00' },
    onboarding: { tourStatus: 'pending', firstSteps: [], firstStepsHidden: false, seenHints: [], hintsEnabled: true },
  }
}

// Wrapped in `reactive()` (unlike a plain mock object) so nested reads/writes
// through the onboarding store's computeds are tracked the same way they
// would be against a real Pinia store's reactive state.
const mockWorkspaceStore = reactive({
  appConfig: defaultAppConfig(),
  saveAppConfig: vi.fn(async (patch: Partial<AppConfig>) => {
    mockWorkspaceStore.appConfig = { ...mockWorkspaceStore.appConfig, ...patch } as AppConfig
  }),
})

vi.mock('./workspace', () => ({
  useWorkspaceStore: () => mockWorkspaceStore,
}))

import { useOnboardingStore } from './onboarding'

describe('useOnboardingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockWorkspaceStore.appConfig = defaultAppConfig()
  })

  it('maybeStartTour starts the tour only when the persisted status is pending', () => {
    mockWorkspaceStore.appConfig.onboarding.tourStatus = 'dismissed'
    const dismissedStore = useOnboardingStore()
    dismissedStore.maybeStartTour()
    expect(dismissedStore.tourActive).toBe(false)

    setActivePinia(createPinia())
    mockWorkspaceStore.appConfig.onboarding.tourStatus = 'pending'
    const pendingStore = useOnboardingStore()
    pendingStore.maybeStartTour()
    expect(pendingStore.tourActive).toBe(true)
  })

  it('startTour activates the tour regardless of persisted status', () => {
    const store = useOnboardingStore()
    expect(store.tourActive).toBe(false)
    store.startTour()
    expect(store.tourActive).toBe(true)
  })

  it('markFirstStep is idempotent: a repeat call does not save again', async () => {
    const store = useOnboardingStore()

    await store.markFirstStep('insertBlock')
    expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
    expect(mockWorkspaceStore.appConfig.onboarding.firstSteps).toEqual(['insertBlock'])

    await store.markFirstStep('insertBlock')
    expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
  })

  it('derives completedFirstSteps: createWorkspace is always included', () => {
    const store = useOnboardingStore()
    expect(store.completedFirstSteps).toEqual(['createWorkspace'])
  })

  it('derives completedFirstSteps: takeTour is included only once the tour is completed', () => {
    mockWorkspaceStore.appConfig.onboarding.tourStatus = 'completed'
    const store = useOnboardingStore()
    expect(new Set(store.completedFirstSteps)).toEqual(new Set(['createWorkspace', 'takeTour']))
  })

  it('firstStepsVisible is true by default (not hidden, not all steps done)', () => {
    const store = useOnboardingStore()
    expect(store.firstStepsVisible).toBe(true)
  })

  it('firstStepsVisible hides once all 5 steps are completed', () => {
    mockWorkspaceStore.appConfig.onboarding = {
      tourStatus: 'completed',
      firstSteps: ['insertBlock', 'openGraph', 'chooseAppearance'],
      firstStepsHidden: false,
      seenHints: [],
      hintsEnabled: true,
    }
    const store = useOnboardingStore()
    expect(store.completedFirstSteps).toHaveLength(5)
    expect(store.firstStepsVisible).toBe(false)
  })

  it('firstStepsVisible is false when explicitly hidden even with steps remaining', () => {
    mockWorkspaceStore.appConfig.onboarding.firstStepsHidden = true
    const store = useOnboardingStore()
    expect(store.firstStepsVisible).toBe(false)
  })

  it('completeTour persists tourStatus completed and clears tourActive', async () => {
    const store = useOnboardingStore()
    store.startTour()
    expect(store.tourActive).toBe(true)

    await store.completeTour()

    expect(store.tourActive).toBe(false)
    expect(mockWorkspaceStore.appConfig.onboarding.tourStatus).toBe('completed')
  })

  it('dismissTour persists tourStatus dismissed and clears tourActive', async () => {
    const store = useOnboardingStore()
    store.startTour()

    await store.dismissTour()

    expect(store.tourActive).toBe(false)
    expect(mockWorkspaceStore.appConfig.onboarding.tourStatus).toBe('dismissed')
  })

  it('dismissTour keeps an earlier completion when a replay is closed early', async () => {
    const store = useOnboardingStore()
    await store.completeTour()
    mockWorkspaceStore.saveAppConfig.mockClear()
    store.startTour()

    await store.dismissTour()

    expect(store.tourActive).toBe(false)
    expect(mockWorkspaceStore.appConfig.onboarding.tourStatus).toBe('completed')
    expect(mockWorkspaceStore.saveAppConfig).not.toHaveBeenCalled()
  })

  it('setFirstStepsHidden only saves when the value actually changes', async () => {
    const store = useOnboardingStore()

    await store.setFirstStepsHidden(false)
    expect(mockWorkspaceStore.saveAppConfig).not.toHaveBeenCalled()

    await store.setFirstStepsHidden(true)
    expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
    expect(mockWorkspaceStore.appConfig.onboarding.firstStepsHidden).toBe(true)
  })

  it('setStarterNoteId sets the in-memory id without persisting', () => {
    const store = useOnboardingStore()
    store.setStarterNoteId('note-1')
    expect(store.starterNoteId).toBe('note-1')
    expect(mockWorkspaceStore.saveAppConfig).not.toHaveBeenCalled()
  })

  describe('first-use hints', () => {
    it('requestHint activates a hint and returns true', () => {
      const store = useOnboardingStore()
      expect(store.requestHint('editorCanvas')).toBe(true)
      expect(store.activeHint).toBe('editorCanvas')
    })

    it('requestHint refuses when hints are disabled', () => {
      mockWorkspaceStore.appConfig.onboarding.hintsEnabled = false
      const store = useOnboardingStore()
      expect(store.requestHint('editorCanvas')).toBe(false)
      expect(store.activeHint).toBeNull()
    })

    it('requestHint refuses a hint already marked seen', () => {
      mockWorkspaceStore.appConfig.onboarding.seenHints = ['editorCanvas']
      const store = useOnboardingStore()
      expect(store.requestHint('editorCanvas')).toBe(false)
      expect(store.activeHint).toBeNull()
    })

    it('requestHint refuses while the guided tour is active', () => {
      const store = useOnboardingStore()
      store.startTour()
      expect(store.requestHint('editorCanvas')).toBe(false)
      expect(store.activeHint).toBeNull()
    })

    it('requestHint refuses a second hint while one is already active', () => {
      const store = useOnboardingStore()
      expect(store.requestHint('editorCanvas')).toBe(true)
      expect(store.requestHint('graphFilters')).toBe(false)
      expect(store.activeHint).toBe('editorCanvas')
    })

    it('dismissHint marks the hint seen and clears it, saving once', async () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')

      await store.dismissHint('editorCanvas')

      expect(store.activeHint).toBeNull()
      expect(mockWorkspaceStore.appConfig.onboarding.seenHints).toEqual(['editorCanvas'])
      expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
    })

    it('dismissHint is idempotent: a repeat call does not save again', async () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')

      await store.dismissHint('editorCanvas')
      await store.dismissHint('editorCanvas')

      expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
    })

    it('releaseHint dismisses only when the given id is the active hint', async () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')

      await store.releaseHint('graphFilters')
      expect(store.activeHint).toBe('editorCanvas')
      expect(mockWorkspaceStore.saveAppConfig).not.toHaveBeenCalled()

      await store.releaseHint('editorCanvas')
      expect(store.activeHint).toBeNull()
      expect(mockWorkspaceStore.appConfig.onboarding.seenHints).toEqual(['editorCanvas'])
    })

    it('cancelHint clears the active hint without marking it seen', () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')

      store.cancelHint('editorCanvas')

      expect(store.activeHint).toBeNull()
      expect(mockWorkspaceStore.appConfig.onboarding.seenHints).toEqual([])
      expect(mockWorkspaceStore.saveAppConfig).not.toHaveBeenCalled()
    })

    it('cancelHint is a no-op for an id that is not the active hint', () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')

      store.cancelHint('graphFilters')

      expect(store.activeHint).toBe('editorCanvas')
    })

    it('startTour clears an active hint', () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')
      expect(store.activeHint).toBe('editorCanvas')

      store.startTour()

      expect(store.activeHint).toBeNull()
    })

    it('setHintsEnabled(false) clears an active hint and persists', async () => {
      const store = useOnboardingStore()
      store.requestHint('editorCanvas')

      await store.setHintsEnabled(false)

      expect(store.activeHint).toBeNull()
      expect(mockWorkspaceStore.appConfig.onboarding.hintsEnabled).toBe(false)
      expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
    })

    it('setHintsEnabled only saves when the value actually changes', async () => {
      const store = useOnboardingStore()

      await store.setHintsEnabled(true)
      expect(mockWorkspaceStore.saveAppConfig).not.toHaveBeenCalled()

      await store.setHintsEnabled(false)
      expect(mockWorkspaceStore.saveAppConfig).toHaveBeenCalledTimes(1)
    })
  })
})
