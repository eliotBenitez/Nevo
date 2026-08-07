import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMobileBackButton } from './useMobileBackButton'

const unregister = vi.fn()
let nativeBackHandler: (() => void) | null = null

vi.mock('@tauri-apps/api/app', () => ({
  onBackButtonPress: vi.fn(async (handler: () => void) => {
    nativeBackHandler = handler
    return { unregister }
  }),
}))

const Harness = defineComponent({
  props: {
    onBack: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    const enabled = ref(true)
    useMobileBackButton(() => { props.onBack() }, enabled)
    return { enabled }
  },
  template: '<div />',
})

describe('useMobileBackButton', () => {
  afterEach(() => {
    nativeBackHandler = null
    unregister.mockClear()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('handles Android back while enabled and restores native behavior after unmount', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
    const onBack = vi.fn()
    const wrapper = mount(Harness, { props: { onBack } })

    await vi.waitFor(() => expect(nativeBackHandler).not.toBeNull())
    nativeBackHandler?.()
    expect(onBack).toHaveBeenCalledOnce()

    wrapper.unmount()
    await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce())
  })
})
