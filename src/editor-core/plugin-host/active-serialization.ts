import type { NevoEditorRegistries, NevoNodeImporter, NevoNodeSerializer } from '../../types/editor-plugin'

/**
 * Реестр сериализаторов/импортёров активного набора плагинов. Плагины
 * workspace-глобальны, поэтому в любой момент активен один набор. Сериализаторы
 * экспорта (markdown/html/typst) и импортёр Markdown — чистые функции без доступа
 * к editor core, поэтому читают плагинные хуки отсюда.
 */
let activeRegistries: NevoEditorRegistries | null = null

export function setActivePluginSerialization(registries: NevoEditorRegistries | null): void {
  activeRegistries = registries
}

export function getPluginNodeSerializer(nodeType: string): NevoNodeSerializer | undefined {
  return activeRegistries?.nodeSerializers.get(nodeType)
}

export function getPluginNodeImporter(fencedLang: string): NevoNodeImporter | undefined {
  return activeRegistries?.nodeImporters.get(fencedLang)
}
