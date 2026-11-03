<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { X } from '../../ui/icons'
import SandboxPluginFrame from './plugins/SandboxPluginFrame.vue'
import type { NevoSandboxModal } from '../../types/editor-plugin'

defineProps<{
  modal: NevoSandboxModal
  isDark: boolean
  supported: boolean
}>()

defineEmits<{
  close: []
  event: [event: { type: string; payload: unknown }]
}>()

const { t, locale } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div
      class="sandbox-plugin-modal-backdrop"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <section
        class="sandbox-plugin-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="modal.id"
      >
        <button
          type="button"
          class="nv-btn sandbox-plugin-modal__close"
          :aria-label="t('workspace.pluginUi.closeModal')"
          @click="$emit('close')"
        >
          <X :size="15" />
        </button>
        <SandboxPluginFrame
          :src="modal.frame.source"
          :plugin-id="modal.pluginId"
          :locale="String(locale)"
          :theme="isDark ? 'dark' : 'light'"
          :supported="supported"
          :unsupported-label="t('workspace.pluginUi.unsupportedMobile')"
          @event="$emit('event', $event)"
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sandbox-plugin-modal-backdrop {
  position: fixed;
  z-index: 220;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  background: rgb(0 0 0 / 42%);
}

.sandbox-plugin-modal {
  position: relative;
  width: min(760px, calc(100vw - 48px));
  height: min(680px, calc(100dvh - 48px));
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background: var(--surface-raised);
  box-shadow: var(--shadow-xl);
}

.sandbox-plugin-modal__close {
  position: absolute;
  z-index: 1;
  top: 10px;
  right: 10px;
}

@media (max-width: 719px) {
  .sandbox-plugin-modal-backdrop {
    padding: 0;
  }

  .sandbox-plugin-modal {
    width: 100vw;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }
}
</style>
