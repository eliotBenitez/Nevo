<script setup lang="ts">
import { computed } from 'vue'
import { formatAudioTime, readAudioBookmarks } from '../../core/media/audioBookmarks'
import { readAudioTranscript } from '../../core/media/audioTranscript'
import { normalizeQueryBlockData } from '../../features/query/queryBlockData'
import { summarizeQueryBlockFilters } from '../../features/query/queryBlockSummary'
import { normalizeDatabaseData } from '../../types/database-block'
import { databaseBlockRecords, formatDbCellValue } from '../../utils/noteExport/databaseBlockExport'
import type { ProcessedNode } from '../../utils/noteExport/docxPagination'

const props = defineProps<{ node: ProcessedNode }>()

const attrs = computed(() => props.node.attrs ?? {})
const collapse = (text: string) => text.replace(/\s+/g, ' ')

const mediaKind = computed(() => (attrs.value.kind === 'video' ? 'video' : 'audio'))
const mediaLine = computed(() => {
  const name = String(attrs.value.name ?? (mediaKind.value === 'video' ? 'Video' : 'Audio'))
  return `${mediaKind.value === 'video' ? '🎬' : '🔊'} ${name}`
})
const audioLines = computed(() => {
  if (mediaKind.value !== 'audio') return { bookmarks: [], transcript: [] }
  return {
    bookmarks: readAudioBookmarks(attrs.value.bookmarks)
      .map(b => `${formatAudioTime(b.time)} — ${collapse(b.label)}`),
    transcript: readAudioTranscript(attrs.value.transcript)
      .map(s => `${formatAudioTime(s.start)} — ${collapse(s.text)}`),
  }
})

const embedUrl = computed(() => String(attrs.value.url ?? ''))
const embedTitle = computed(() => String(attrs.value.title ?? '').trim() || embedUrl.value)
const noteTitle = computed(() => String(attrs.value.title ?? 'Note'))
const notePreview = computed(() => String(attrs.value.previewText ?? ''))
const queryLine = computed(() => `Query: ${summarizeQueryBlockFilters(normalizeQueryBlockData(attrs.value.data))}`)

const database = computed(() => normalizeDatabaseData(attrs.value.data))
const databaseRows = computed(() => databaseBlockRecords(database.value))
</script>

<template>
  <p v-if="node.type === 'file_block'" class="docx-page__paragraph">📎 {{ String(attrs.filename ?? 'file') }}</p>

  <template v-else-if="node.type === 'media_block'">
    <p class="docx-page__paragraph docx-mark-em">{{ mediaLine }}</p>
    <p v-for="(line, idx) in audioLines.bookmarks" :key="`b${idx}`" class="docx-page__paragraph">{{ line }}</p>
    <p v-if="audioLines.transcript.length" class="docx-page__paragraph docx-mark-strong">Transcript</p>
    <p v-for="(line, idx) in audioLines.transcript" :key="`t${idx}`" class="docx-page__paragraph">{{ line }}</p>
  </template>

  <p v-else-if="node.type === 'embed_block'" class="docx-page__paragraph">
    <span v-if="embedUrl" class="docx-page__embed-link">{{ embedTitle }}</span>
  </p>

  <aside v-else-if="node.type === 'note_embed'" class="docx-page__callout docx-page__callout--plain">
    <div class="docx-page__callout-body">
      <p class="docx-page__paragraph docx-mark-strong">{{ noteTitle }}</p>
      <p v-if="notePreview.trim()" class="docx-page__paragraph">{{ notePreview }}</p>
    </div>
  </aside>

  <p v-else-if="node.type === 'block_embed'" class="docx-page__paragraph docx-mark-em">↪ Embedded block</p>

  <aside v-else-if="node.type === 'query_block'" class="docx-page__callout docx-page__callout--plain">
    <div class="docx-page__callout-body">
      <p class="docx-page__paragraph docx-mark-em">{{ queryLine }}</p>
    </div>
  </aside>

  <template v-else-if="node.type === 'database_block'">
    <p v-if="database.title.trim()" class="docx-page__paragraph docx-mark-strong">{{ database.title.trim() }}</p>
    <table v-if="database.fields.length" class="docx-page__table">
      <tbody>
        <tr>
          <th v-for="field in database.fields" :key="field.id" class="docx-page__th">{{ field.name }}</th>
        </tr>
        <tr v-for="record in databaseRows" :key="record.id">
          <td v-for="field in database.fields" :key="field.id" class="docx-page__td">
            {{ formatDbCellValue(record.cells[field.id] ?? null, field) }}
          </td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
