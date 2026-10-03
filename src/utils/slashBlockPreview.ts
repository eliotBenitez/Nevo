export type SlashPreviewKind =
  | 'text' | 'heading-1' | 'heading-2' | 'heading-3' | 'heading-4' | 'heading-5' | 'heading-6'
  | 'quote' | 'callout' | 'toggle' | 'bullets' | 'numbers' | 'checks' | 'code'
  | 'math' | 'math-inline' | 'table' | 'database' | 'query' | 'image' | 'divider'
  | 'embed' | 'note-embed' | 'emoji' | 'draw'
  | 'audio' | 'video' | 'file' | 'chart' | 'mermaid' | 'markmap' | 'template'

const kinds: Record<string, SlashPreviewKind> = {
  paragraph: 'text', h1: 'heading-1', h2: 'heading-2', h3: 'heading-3',
  h4: 'heading-4', h5: 'heading-5', h6: 'heading-6', quote: 'quote',
  callout: 'callout', toggle: 'toggle', ul: 'bullets', ol: 'numbers',
  checklist: 'checks', code: 'code', math: 'math', 'math-inline': 'math-inline',
  table: 'table', database: 'database', query: 'query', image: 'image',
  divider: 'divider', embed: 'embed', 'note-embed': 'note-embed', emoji: 'emoji', draw: 'draw',
  audio: 'audio', 'voice-recording': 'audio', video: 'video', file: 'file', chart: 'chart',
  mermaid: 'mermaid', markmap: 'markmap', 'insert-template': 'template',
}

export function slashPreviewKind(itemId: string): SlashPreviewKind | null {
  return Object.prototype.hasOwnProperty.call(kinds, itemId) ? kinds[itemId] : null
}
