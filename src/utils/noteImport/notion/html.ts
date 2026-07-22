export interface NotionHtmlPreprocessResult {
  markdown: string
  warnings: number
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function visibleHtmlText(value: string): string {
  return decodeEntities(value
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function preprocessNotionHtml(markdown: string): NotionHtmlPreprocessResult {
  let warnings = 0
  let result = markdown.replace(/<aside\b[^>]*>([\s\S]*?)<\/aside>/gi, (_match, body: string) => {
    const visible = visibleHtmlText(body)
    return visible
      ? `\n> [!notion]\n${visible.split('\n').map(line => `> ${line}`).join('\n')}\n`
      : '\n> [!notion]\n'
  })
  result = result.replace(/<(?!https?:\/\/)([a-z][\w-]*)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => {
    warnings += 1
    return visibleHtmlText(body)
  })
  result = result.replace(/<[^>]+>/g, match => {
    warnings += 1
    return visibleHtmlText(match)
  })
  return { markdown: result, warnings }
}
