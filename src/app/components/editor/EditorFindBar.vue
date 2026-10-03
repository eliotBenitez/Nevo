<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronRight, ChevronUp, Replace, ReplaceAll, X } from 'lucide-vue-next'

interface Props {
  open: boolean
  replaceOpen: boolean
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  matchCount: number
  activeIndex: number
  hasError: boolean
  errorReason?: 'invalid' | 'unsafe' | 'timeout'
  truncated: boolean
  focusToken: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:query': [value: string]
  'update:replacement': [value: string]
  'update:caseSensitive': [value: boolean]
  'update:wholeWord': [value: boolean]
  'update:regex': [value: boolean]
  next: []
  prev: []
  replace: []
  'replace-all': []
  'toggle-replace': []
  close: []
}>()

const { t } = useI18n()

const findInputRef = ref<HTMLInputElement | null>(null)
const replaceInputRef = ref<HTMLInputElement | null>(null)

// Shared static class strings for repeated find-bar controls. Kept as
// constants (not per-button literals) to avoid unconditional + conditional
// utilities colliding on the same property — active/hover states are always
// applied through mutually exclusive branches, never layered on top of a
// base utility for the same CSS property.
const iconBtnBaseClass = 'tw:grid tw:h-8 tw:w-8 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-[background,color] tw:duration-120 tw:disabled:cursor-default tw:disabled:text-content-muted tw:disabled:opacity-40 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-accent tw:max-[719px]:h-10 tw:max-[719px]:w-10'
const iconBtnHoverClass = 'tw:enabled:hover:bg-(--hover) tw:enabled:hover:text-content-primary'
const closeBtnHoverClass = 'tw:enabled:hover:bg-(--danger-soft) tw:enabled:hover:text-(--danger)'
const optionBaseClass = 'tw:grid tw:h-6 tw:w-6 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:font-nv-ui tw:text-[11px] tw:font-semibold tw:transition-[background,color] tw:duration-120 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-1 tw:focus-visible:outline-accent'

function optionClass(active: boolean) {
  return active ? 'tw:bg-(--accent-soft) tw:text-accent' : 'tw:bg-transparent tw:text-content-muted'
}

const hasMatches = computed(() => props.matchCount > 0 && !props.hasError)

const counterText = computed(() => {
  if (props.hasError) {
    if (props.errorReason === 'unsafe') return t('editor.findBar.unsafeRegex')
    if (props.errorReason === 'timeout') return t('editor.findBar.regexTimedOut')
    return t('editor.findBar.invalidRegex')
  }
  if (!props.query) return ''
  if (props.matchCount === 0) return t('editor.findBar.noResults')
  const total = props.truncated ? t('editor.findBar.tooMany', { limit: props.matchCount }) : String(props.matchCount)
  return t('editor.findBar.counter', { current: props.activeIndex + 1, total })
})

watch(() => props.focusToken, () => {
  if (!props.open) return
  void nextTick(() => {
    findInputRef.value?.focus()
    findInputRef.value?.select()
  })
})

function onFindKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) emit('prev')
    else emit('next')
    return
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'h') {
    event.preventDefault()
    emit('toggle-replace')
    return
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const key = event.key.toLowerCase()
    if (key === 'c') { event.preventDefault(); emit('update:caseSensitive', !props.caseSensitive); return }
    if (key === 'w') { event.preventDefault(); emit('update:wholeWord', !props.wholeWord); return }
    if (key === 'r') { event.preventDefault(); emit('update:regex', !props.regex); return }
  }
}

function onReplaceKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) emit('replace-all')
  else emit('replace')
}

defineExpose({ findInputRef, replaceInputRef })
</script>

<template>
  <Transition name="nv-find-bar-fade">
    <div
      v-if="open"
      class="nv-find-bar tw:absolute tw:top-3 tw:right-5 tw:z-40 tw:grid tw:w-[min(420px,calc(100%-24px))] tw:gap-1.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2 tw:shadow-(--shadow-overlay) tw:max-[719px]:top-[var(--safe-area-top,0px)] tw:max-[719px]:right-2 tw:max-[719px]:left-2 tw:max-[719px]:w-auto"
      role="search"
      :aria-label="t('editor.findBar.ariaLabel')"
      @keydown.escape.stop.prevent="emit('close')"
    >
      <div class="nv-find-bar__row tw:flex tw:items-center tw:gap-1">
        <button
          type="button"
          class="nv-find-bar__toggle-replace"
          :class="[iconBtnBaseClass, iconBtnHoverClass]"
          :aria-expanded="replaceOpen"
          :aria-label="t('editor.findBar.toggleReplace')"
          :title="t('editor.findBar.toggleReplace')"
          @click="emit('toggle-replace')"
        >
          <ChevronDown v-if="replaceOpen" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>

        <div class="nv-find-bar__field tw:relative tw:flex tw:min-w-0 tw:flex-1 tw:items-center">
          <input
            ref="findInputRef"
            class="nv-find-bar__input tw:h-8 tw:w-full tw:min-w-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:pr-[92px] tw:font-nv-ui tw:text-[13px] tw:font-medium tw:text-content-primary tw:caret-accent tw:outline-none tw:transition-[border-color,box-shadow] tw:duration-120 tw:placeholder:text-content-muted tw:focus-visible:bg-(--surface-raised) tw:focus-visible:shadow-[0_0_0_2px_var(--input-ring)] tw:aria-invalid:bg-(--surface-danger) tw:aria-invalid:focus-visible:shadow-[0_0_0_2px_var(--danger)]"
            type="text"
            :value="query"
            :placeholder="t('editor.findBar.findPlaceholder')"
            :aria-invalid="hasError"
            autocomplete="off"
            spellcheck="false"
            @input="emit('update:query', ($event.target as HTMLInputElement).value)"
            @keydown="onFindKeydown"
          >
          <div class="nv-find-bar__field-toggles tw:absolute tw:top-1/2 tw:right-1 tw:flex tw:-translate-y-1/2 tw:items-center tw:gap-0.5">
            <button
              type="button"
              class="nv-find-bar__option"
              :class="[optionBaseClass, optionClass(caseSensitive)]"
              :aria-pressed="caseSensitive"
              :aria-label="t('editor.findBar.matchCase')"
              :title="`${t('editor.findBar.matchCase')} (Alt+C)`"
              @click="emit('update:caseSensitive', !caseSensitive)"
            >Aa</button>
            <button
              type="button"
              class="nv-find-bar__option nv-find-bar__option--word tw:underline tw:underline-offset-2"
              :class="[optionBaseClass, optionClass(wholeWord)]"
              :aria-pressed="wholeWord"
              :aria-label="t('editor.findBar.wholeWord')"
              :title="`${t('editor.findBar.wholeWord')} (Alt+W)`"
              @click="emit('update:wholeWord', !wholeWord)"
            >ab</button>
            <button
              type="button"
              class="nv-find-bar__option"
              :class="[optionBaseClass, optionClass(regex)]"
              :aria-pressed="regex"
              :aria-label="t('editor.findBar.useRegex')"
              :title="`${t('editor.findBar.useRegex')} (Alt+R)`"
              @click="emit('update:regex', !regex)"
            >.*</button>
          </div>
        </div>

        <span
          class="nv-find-bar__counter tw:shrink-0 tw:min-w-16 tw:text-center tw:font-nv-ui tw:text-[11.5px] tw:font-medium tw:whitespace-nowrap"
          :class="hasError || (query.length > 0 && matchCount === 0) ? 'nv-find-bar__counter--error tw:text-(--danger)' : 'tw:text-content-muted'"
          aria-live="polite"
        >{{ counterText }}</span>

        <button
          type="button"
          class="nv-find-bar__icon-btn"
          :class="[iconBtnBaseClass, iconBtnHoverClass]"
          :disabled="!hasMatches"
          :aria-label="t('editor.findBar.previous')"
          :title="t('editor.findBar.previous')"
          @click="emit('prev')"
        >
          <ChevronUp :size="15" />
        </button>
        <button
          type="button"
          class="nv-find-bar__icon-btn"
          :class="[iconBtnBaseClass, iconBtnHoverClass]"
          :disabled="!hasMatches"
          :aria-label="t('editor.findBar.next')"
          :title="t('editor.findBar.next')"
          @click="emit('next')"
        >
          <ChevronDown :size="15" />
        </button>
        <button
          type="button"
          class="nv-find-bar__icon-btn nv-find-bar__close"
          :class="[iconBtnBaseClass, closeBtnHoverClass]"
          :aria-label="t('editor.findBar.close')"
          :title="t('editor.findBar.close')"
          @click="emit('close')"
        >
          <X :size="15" />
        </button>
      </div>

      <div v-if="replaceOpen" class="nv-find-bar__row nv-find-bar__row--replace tw:flex tw:items-center tw:gap-1">
        <span class="nv-find-bar__row-spacer tw:w-8 tw:shrink-0" aria-hidden="true" />
        <input
          ref="replaceInputRef"
          class="nv-find-bar__input nv-find-bar__input--replace tw:h-8 tw:w-full tw:min-w-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:font-nv-ui tw:text-[13px] tw:font-medium tw:text-content-primary tw:caret-accent tw:outline-none tw:transition-[border-color,box-shadow] tw:duration-120 tw:placeholder:text-content-muted tw:focus-visible:bg-(--surface-raised) tw:focus-visible:shadow-[0_0_0_2px_var(--input-ring)]"
          type="text"
          :value="replacement"
          :placeholder="t('editor.findBar.replacePlaceholder')"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update:replacement', ($event.target as HTMLInputElement).value)"
          @keydown="onReplaceKeydown"
        >
        <button
          type="button"
          class="nv-find-bar__icon-btn"
          :class="[iconBtnBaseClass, iconBtnHoverClass]"
          :disabled="!hasMatches"
          :aria-label="t('editor.findBar.replace')"
          :title="t('editor.findBar.replace')"
          @click="emit('replace')"
        >
          <Replace :size="15" />
        </button>
        <button
          type="button"
          class="nv-find-bar__icon-btn"
          :class="[iconBtnBaseClass, iconBtnHoverClass]"
          :disabled="!hasMatches"
          :aria-label="t('editor.findBar.replaceAll')"
          :title="t('editor.findBar.replaceAll')"
          @click="emit('replace-all')"
        >
          <ReplaceAll :size="15" />
        </button>
      </div>
    </div>
  </Transition>
</template>
