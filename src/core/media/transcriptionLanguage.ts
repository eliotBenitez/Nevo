export const TRANSCRIPTION_LANGUAGES = ['auto', 'ru', 'en', 'de', 'fr', 'es'] as const

export type TranscriptionLanguage = typeof TRANSCRIPTION_LANGUAGES[number]

/** Dictation segments are too short to detect the language reliably, so "auto" follows the interface language. */
export function resolveDictationLanguage(language: TranscriptionLanguage, uiLocale: string): TranscriptionLanguage {
  if (language !== 'auto') return language
  return TRANSCRIPTION_LANGUAGES.find(value => value !== 'auto' && value === uiLocale) ?? 'auto'
}
