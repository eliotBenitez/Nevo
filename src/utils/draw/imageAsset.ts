/**
 * imageAsset — утилиты для работы с растровыми ассетами внутри draw_block.
 * Чистый модуль без Vue-зависимостей.
 */

export const PREVIEW_MAX_DIM = 512

export interface LoadedImageAsset {
  /** Полный data URL (оригинальные байты). */
  full: string
  /** Уменьшенный data URL (≤ PREVIEW_MAX_DIM по большей стороне). */
  preview: string
  naturalWidth: number
  naturalHeight: number
}

/**
 * Определяет MIME-тип изображения по magic-байтам.
 * Поддерживает: PNG, JPEG, GIF, WebP, SVG; дефолт — 'image/png'.
 */
export function sniffImageMime(bytes: ArrayLike<number>): string {
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: 47 49 46
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif'
  }
  // WebP: RIFF....WEBP (52 49 46 46 на 0, 57 45 42 50 на offset 8)
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  // SVG: начинается с '<' (0x3C)
  if (bytes[0] === 0x3c) {
    return 'image/svg+xml'
  }
  return 'image/png'
}

/**
 * Конвертирует массив байт в base64-строку через btoa.
 * Обрабатывает большие массивы чанками (~32 КБ), чтобы не переполнить стек.
 */
export function bytesToBase64(bytes: number[]): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.slice(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Загружает изображение из байт, получает натуральные размеры и строит
 * уменьшенный data URL-превью (≤ PREVIEW_MAX_DIM по большей стороне).
 */
export async function loadImageAsset(bytes: number[], mime?: string): Promise<LoadedImageAsset> {
  const m = mime || sniffImageMime(bytes)
  const full = 'data:' + m + ';base64,' + bytesToBase64(bytes)

  const { naturalWidth, naturalHeight } = await new Promise<{ naturalWidth: number; naturalHeight: number }>(
    (resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = full
    },
  )

  let preview = full

  if (Math.max(naturalWidth, naturalHeight) > PREVIEW_MAX_DIM) {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const scale = PREVIEW_MAX_DIM / Math.max(naturalWidth, naturalHeight)
        const pw = Math.round(naturalWidth * scale)
        const ph = Math.round(naturalHeight * scale)
        canvas.width = pw
        canvas.height = ph
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Failed to load image for preview'))
          img.src = full
        })
        ctx.drawImage(img, 0, 0, pw, ph)
        preview = canvas.toDataURL('image/png')
      }
    } catch {
      // Graceful fallback (например, в тестовой среде без canvas)
      preview = full
    }
  }

  return { full, preview, naturalWidth, naturalHeight }
}
