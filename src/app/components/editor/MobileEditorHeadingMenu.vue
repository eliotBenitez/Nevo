<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [level: number]
}>()

const { t } = useI18n()
const headingLevels = [1, 2, 3, 4, 5, 6] as const
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      id="mobile-editor-heading-menu"
      class="mobile-editor-heading-menu"
      role="menu"
      @pointerdown.prevent
      @keydown.esc.stop="emit('close')"
    >
      <button
        v-for="level in headingLevels"
        :key="level"
        type="button"
        role="menuitem"
        :aria-label="t(`slashMenu.items.h${level}`)"
        :title="t(`slashMenu.items.h${level}`)"
        @click="emit('select', level)"
      >
        H{{ level }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.mobile-editor-heading-menu {
  position: fixed;
  z-index: 43;
  right: calc(12px + max(var(--safe-area-right), 0px));
  bottom:
    calc(
      88px
      + max(var(--safe-area-bottom), 0px)
      + var(--mobile-keyboard-inset, 0px)
    );
  left: calc(12px + max(var(--safe-area-left), 0px));
  display: grid;
  grid-template-columns: repeat(6, 44px);
  justify-content: space-between;
  gap: 0;
  padding: 8px;
  overflow-x: auto;
  border: 1px solid var(--line-2);
  border-radius: calc(18px * var(--radius-scale, 1));
  background: color-mix(in oklab, var(--glass-titlebar) 96%, var(--canvas-1));
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(24px) saturate(118%);
  -webkit-backdrop-filter: blur(24px) saturate(118%);
  scrollbar-width: none;
}

.mobile-editor-heading-menu::-webkit-scrollbar {
  display: none;
}

.mobile-editor-heading-menu button {
  display: grid;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: calc(11px * var(--radius-scale, 1));
  color: var(--text-2);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 720;
}

.mobile-editor-heading-menu button:active {
  background: var(--press);
}

.mobile-editor-heading-menu button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
