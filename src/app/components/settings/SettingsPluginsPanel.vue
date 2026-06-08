<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { openPath } from '@tauri-apps/plugin-opener'
import { Kanban, LayoutTemplate, BarChart3, Network } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../../stores/workspace'
import { workspaceCommands } from '../../../tauri/commands'
import type { PluginManifest } from '../../../types/workspace'
import { getEnabledPluginCount, getTotalPluginCount } from '../../../utils/plugin-counts'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'

type RowState = 'functional' | 'info' | 'coming'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { plugins, activePath, settings } = storeToRefs(workspaceStore)

const pluginValidation = ref<Record<string, 'valid' | 'invalid'>>({})

const pluginTotalCount = computed(() => getTotalPluginCount(plugins.value))
const pluginEnabledCount = computed(() => getEnabledPluginCount(plugins.value, settings.value))
const pluginIssueCount = computed(() => Object.values(pluginValidation.value).filter(s => s === 'invalid').length)

async function validatePlugins() {
  if (!activePath.value) return
  const next: Record<string, 'valid' | 'invalid'> = {}
  for (const plugin of plugins.value) {
    try {
      await workspaceCommands.validatePluginManifest(activePath.value, plugin.id)
      next[plugin.id] = 'valid'
    } catch {
      next[plugin.id] = 'invalid'
    }
  }
  pluginValidation.value = next
}

async function togglePlugin(plugin: PluginManifest, enabled: boolean) {
  await workspaceStore.setPluginEnabled(plugin.id, enabled)
  await validatePlugins()
}

function stateClass(state: RowState): string {
  if (state === 'functional') return 'status-chip--functional'
  if (state === 'coming') return 'status-chip--coming'
  return 'status-chip--info'
}

onMounted(validatePlugins)
</script>

<template>
  <section class="panel settings-plugins-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.plugins') }}</h2>
        <p class="panel-sub">{{ t('settings.plugins.description') }}</p>
      </div>
      <div class="header-actions">
        <NvButton disabled>{{ t('settings.plugins.marketplace') }}</NvButton>
        <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
        <NvButton @click="workspaceStore.reloadPlugins()">{{ t('settings.plugins.rescan') }}</NvButton>
      </div>
    </header>

    <div class="panel-body">
      <div class="filters">
        <span class="nv-chip filter-chip filter-chip--active">{{ t('settings.plugins.filters.all', { count: pluginTotalCount }) }}</span>
        <span class="nv-chip filter-chip">{{ t('settings.plugins.filters.enabled', { count: pluginEnabledCount }) }}</span>
        <span class="nv-chip filter-chip" :class="{ 'filter-chip--warning': pluginIssueCount }">{{ t('settings.plugins.filters.manifestIssues', { count: pluginIssueCount }) }}</span>
      </div>

      <!-- ── System plugins ──────────────────────── -->
      <div class="group-label">{{ t('settings.plugins.systemLabel') }}</div>
      <div class="plugin-grid plugin-grid--system">
        <article class="plugin-card">
          <div class="plugin-card__icon plugin-card__icon--system">
            <Kanban :size="16" />
          </div>
          <div class="plugin-card__body">
            <div class="plugin-card__head">
              <div>
                <div class="plugin-card__title">
                  {{ t('settings.plugins.kanban.title') }}
                  <span class="plugin-card__version">{{ t('settings.plugins.builtIn') }}</span>
                </div>
                <div class="plugin-card__author">nevo.kanban</div>
              </div>
              <NvToggle
                :model-value="settings.features?.kanban !== false"
                @update:model-value="v => workspaceStore.updateSettings(draft => { if (!draft.features) (draft as any).features = { kanban: true }; draft.features.kanban = v })"
              />
            </div>
            <p class="plugin-card__desc">{{ t('settings.plugins.kanban.description') }}</p>
            <div class="plugin-card__footer">
              <div class="spacer" />
              <span class="status-chip status-chip--functional">{{ t('settings.plugins.builtIn') }}</span>
            </div>
          </div>
        </article>
        <article class="plugin-card">
          <div class="plugin-card__icon plugin-card__icon--system">
            <LayoutTemplate :size="16" />
          </div>
          <div class="plugin-card__body">
            <div class="plugin-card__head">
              <div>
                <div class="plugin-card__title">
                  {{ t('settings.plugins.templates.title') }}
                  <span class="plugin-card__version">{{ t('settings.plugins.builtIn') }}</span>
                </div>
                <div class="plugin-card__author">nevo.templates</div>
              </div>
              <NvToggle
                :model-value="settings.features?.templates !== false"
                @update:model-value="v => workspaceStore.updateSettings(draft => { if (!draft.features) (draft as any).features = { kanban: true, templates: true }; draft.features.templates = v })"
              />
            </div>
            <p class="plugin-card__desc">{{ t('settings.plugins.templates.description') }}</p>
            <div class="plugin-card__footer">
              <div class="spacer" />
              <span class="status-chip status-chip--functional">{{ t('settings.plugins.builtIn') }}</span>
            </div>
          </div>
        </article>
        <article class="plugin-card">
          <div class="plugin-card__icon plugin-card__icon--system">
            <BarChart3 :size="16" />
          </div>
          <div class="plugin-card__body">
            <div class="plugin-card__head">
              <div>
                <div class="plugin-card__title">
                  {{ t('settings.plugins.vega.title') }}
                  <span class="plugin-card__version">{{ t('settings.plugins.builtIn') }}</span>
                </div>
                <div class="plugin-card__author">nevo.vega</div>
              </div>
              <NvToggle
                :model-value="settings.features?.vega !== false"
                @update:model-value="v => workspaceStore.updateSettings(draft => { if (!draft.features) (draft as any).features = { kanban: true, templates: true, vega: true }; draft.features.vega = v })"
              />
            </div>
            <p class="plugin-card__desc">{{ t('settings.plugins.vega.description') }}</p>
            <div class="plugin-card__footer">
              <div class="spacer" />
              <span class="status-chip status-chip--functional">{{ t('settings.plugins.builtIn') }}</span>
            </div>
          </div>
        </article>
        <article class="plugin-card">
          <div class="plugin-card__icon plugin-card__icon--system">
            <Network :size="16" />
          </div>
          <div class="plugin-card__body">
            <div class="plugin-card__head">
              <div>
                <div class="plugin-card__title">
                  {{ t('settings.plugins.markmap.title') }}
                  <span class="plugin-card__version">{{ t('settings.plugins.builtIn') }}</span>
                </div>
                <div class="plugin-card__author">nevo.markmap</div>
              </div>
              <NvToggle
                :model-value="settings.features?.markmap !== false"
                @update:model-value="v => workspaceStore.updateSettings(draft => { if (!draft.features) (draft as any).features = { kanban: true, templates: true, vega: true, markmap: true }; draft.features.markmap = v })"
              />
            </div>
            <p class="plugin-card__desc">{{ t('settings.plugins.markmap.description') }}</p>
            <div class="plugin-card__footer">
              <div class="spacer" />
              <span class="status-chip status-chip--functional">{{ t('settings.plugins.builtIn') }}</span>
            </div>
          </div>
        </article>
      </div>

      <hr v-if="plugins.length" class="panel-divider" />

      <div v-if="plugins.length" class="plugin-grid">
        <article
          v-for="plugin in plugins"
          :key="plugin.id"
          class="plugin-card"
          :class="{ 'plugin-card--issue': pluginValidation[plugin.id] === 'invalid' }"
        >
          <div class="plugin-card__icon">{{ plugin.name.charAt(0).toUpperCase() }}</div>
          <div class="plugin-card__body">
            <div class="plugin-card__head">
              <div>
                <div class="plugin-card__title">
                  {{ plugin.name }}
                  <span class="plugin-card__version">v{{ plugin.version }}</span>
                </div>
                <div class="plugin-card__author">{{ plugin.id }}</div>
              </div>
              <NvToggle
                :model-value="plugin.enabled"
                @update:model-value="v => togglePlugin(plugin, v)"
              />
            </div>

            <p class="plugin-card__desc">{{ plugin.description || t('settings.plugins.noDescription') }}</p>

            <div class="plugin-card__footer">
              <NvButton variant="ghost" size="xs" disabled>{{ t('settings.plugins.permissions') }}</NvButton>
              <NvButton variant="ghost" size="xs" @click="openPath(`${activePath}/.nevo/plugins/${plugin.id}`)">{{ t('settings.plugins.source') }}</NvButton>
              <div class="spacer" />
              <span class="status-chip" :class="stateClass(pluginValidation[plugin.id] === 'invalid' ? 'coming' : 'functional')">
                {{ pluginValidation[plugin.id] === 'invalid' ? t('settings.plugins.manifestIssue') : t('settings.plugins.manifestValid') }}
              </span>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <div class="empty-state__title">{{ t('settings.plugins.emptyTitle') }}</div>
        <div class="empty-state__sub">{{ t('settings.plugins.emptyDescription') }}</div>
      </div>
    </div>
  </section>
</template>
