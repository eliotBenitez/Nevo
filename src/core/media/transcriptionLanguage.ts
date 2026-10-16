export const TRANSCRIPTION_LANGUAGES = ['auto', 'ru', 'en', 'de', 'fr', 'es'] as const

export type TranscriptionLanguage = typeof TRANSCRIPTION_LANGUAGES[number]
