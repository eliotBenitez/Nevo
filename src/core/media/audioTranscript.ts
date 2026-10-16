export interface AudioTranscriptSegment {
  start: number
  end: number
  text: string
}

/** Read untrusted note/clipboard/backend segment data without treating text as HTML. */
export function readAudioTranscript(value: unknown): AudioTranscriptSegment[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 3000).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const segment = entry as Record<string, unknown>
    if (typeof segment.start !== 'number' || !Number.isFinite(segment.start) || segment.start < 0
      || typeof segment.end !== 'number' || !Number.isFinite(segment.end) || segment.end <= segment.start
      || typeof segment.text !== 'string') return []
    const text = segment.text.trim()
    if (!text || text.length > 2000) return []
    return [{ start: segment.start, end: segment.end, text }]
  })
}
