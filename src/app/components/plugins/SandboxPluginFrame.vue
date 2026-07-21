<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  src: string
  pluginId: string
  locale: string
  theme: 'light' | 'dark'
  supported?: boolean
  unsupportedLabel?: string
}>(), {
  supported: true,
  unsupportedLabel: '',
})

const emit = defineEmits<{
  event: [payload: { type: string; payload: unknown }]
}>()

const frame = ref<HTMLIFrameElement | null>(null)

function assertPluginFrameUrl(value: string): void {
  if (!/^nevoplugin:\/\/[a-f0-9]{32}\/[A-Za-z0-9._/-]+$/i.test(value) || value.includes('..')) {
    throw new Error('Sandbox plugin iframe URL is invalid')
  }
}

function sendContext(): void {
  frame.value?.contentWindow?.postMessage({
    protocolVersion: '2.0',
    type: 'context',
    pluginId: props.pluginId,
    locale: props.locale,
    theme: props.theme,
  }, '*')
}

function onMessage(event: MessageEvent): void {
  if (event.source !== frame.value?.contentWindow) return
  const message = event.data
  if (!message || typeof message !== 'object' || message.protocolVersion !== '2.0') return
  if (typeof message.type !== 'string' || message.type.length > 120) return
  let encoded: string
  try {
    encoded = JSON.stringify(message.payload ?? null)
  } catch {
    return
  }
  if (new TextEncoder().encode(encoded).byteLength > 256 * 1024) return
  emit('event', { type: message.type, payload: message.payload })
}

onMounted(() => {
  if (props.supported !== false) assertPluginFrameUrl(props.src)
  globalThis.addEventListener('message', onMessage)
})
onBeforeUnmount(() => globalThis.removeEventListener('message', onMessage))
watch(() => [props.locale, props.theme], sendContext)
</script>

<template>
  <div v-if="supported === false" class="sandbox-plugin-frame__unsupported" role="status">
    {{ unsupportedLabel ?? '' }}
  </div>
  <iframe
    v-else
    ref="frame"
    class="sandbox-plugin-frame"
    :src="src"
    :title="pluginId"
    sandbox="allow-scripts"
    referrerpolicy="no-referrer"
    @load="sendContext"
  />
</template>

<style scoped>
.sandbox-plugin-frame {
  width: 100%;
  height: 100%;
  border: 0;
  color-scheme: light dark;
}

.sandbox-plugin-frame__unsupported {
  display: grid;
  min-height: 12rem;
  place-items: center;
  color: var(--text-muted);
}
</style>
