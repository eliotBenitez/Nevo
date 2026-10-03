import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import FirstStepsChecklist from './FirstStepsChecklist.vue'
import en from '../../../locales/en.json'
import type { FirstStepId } from '../../../types/workspace'

function mountChecklist(props: { visible?: boolean; completedSteps?: FirstStepId[] } = {}) {
  return mount(FirstStepsChecklist, {
    props: { visible: true, completedSteps: ['createWorkspace'], ...props },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('FirstStepsChecklist', () => {
  it('shows the createWorkspace step already done and the progress count', () => {
    const w = mountChecklist()

    expect(w.text()).toContain(en.onboarding.firstSteps.items.createWorkspace.label)
    expect(w.text()).toContain('1 of 5')
  })

  it('updates the count as more steps complete', () => {
    const w = mountChecklist({ completedSteps: ['createWorkspace', 'insertBlock', 'openGraph'] })

    expect(w.text()).toContain('3 of 5')
    const progressbar = w.get('[role="progressbar"]')
    expect(progressbar.attributes('aria-valuenow')).toBe('60')
  })

  it('does not render when visible is false', () => {
    const w = mountChecklist({ visible: false })

    expect(w.find('.first-steps').exists()).toBe(false)
  })

  it('renders when visible is true and not all steps are done', () => {
    const w = mountChecklist({ visible: true, completedSteps: ['createWorkspace'] })

    expect(w.find('.first-steps').exists()).toBe(true)
  })

  it('emits hide when the hide button is clicked', async () => {
    const w = mountChecklist()

    const hideButton = w.findAll('button').find(b => b.attributes('aria-label') === en.onboarding.firstSteps.hide)
    expect(hideButton).toBeTruthy()
    await hideButton!.trigger('click')

    expect(w.emitted('hide')).toBeTruthy()
  })

  it('the "take the tour" item is a button that emits take-tour when not done', async () => {
    const w = mountChecklist()

    const takeTourButton = w.findAll('button').find(b => b.text().includes(en.onboarding.firstSteps.items.takeTour.label))
    expect(takeTourButton).toBeTruthy()

    await takeTourButton!.trigger('click')

    expect(w.emitted('take-tour')).toBeTruthy()
  })

  it('renders "take the tour" as plain text (not a button) once done', () => {
    const w = mountChecklist({ completedSteps: ['createWorkspace', 'takeTour'] })

    const takeTourButton = w.findAll('button').find(b => b.text().includes(en.onboarding.firstSteps.items.takeTour.label))
    expect(takeTourButton).toBeUndefined()
    expect(w.text()).toContain(en.onboarding.firstSteps.items.takeTour.label)
  })
})
