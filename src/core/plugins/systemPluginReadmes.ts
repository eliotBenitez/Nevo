import { SYSTEM_PLUGIN_SHORT_IDS, type SystemPluginId } from '../../utils/system-plugins'

// Bundled READMEs of system plugins: `system-readmes/<shortId>.<locale>.md`, loaded lazily.
const files = import.meta.glob<string>('./system-readmes/*.md', { query: '?raw', import: 'default' })

/** README of a system plugin in `locale`, falling back to English; null when none is bundled. */
export async function loadSystemPluginReadme(id: SystemPluginId, locale: string): Promise<string | null> {
  const shortId = SYSTEM_PLUGIN_SHORT_IDS[id]
  const load = files[`./system-readmes/${shortId}.${locale}.md`] ?? files[`./system-readmes/${shortId}.en.md`]
  return load ? load() : null
}
