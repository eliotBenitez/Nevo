<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  open: boolean
  title: string
  heading: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:title': [value: string]
  submit: []
  close: []
}>()

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.open, (open) => {
  if (open) {
    import('vue').then(({ nextTick }) => nextTick(() => inputRef.value?.focus()))
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="rename-backdrop" @click.self="emit('close')">
      <form class="rename-modal" @submit.prevent="emit('submit')">
        <h3 class="rename-modal__title">{{ heading }}</h3>
        <input
          ref="inputRef"
          :value="title"
          class="rename-modal__input"
          :placeholder="t('workspace.context.renameModalPlaceholder')"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
        />
        <div class="rename-modal__actions">
          <button type="button" class="nv-btn" @click="emit('close')">{{ t('workspace.context.cancel') }}</button>
          <button type="submit" class="nv-btn nv-btn--primary">{{ t('workspace.context.confirm') }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
