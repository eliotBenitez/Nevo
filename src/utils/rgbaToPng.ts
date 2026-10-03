export function rgbaToPngBytes(rgba: Uint8Array, width: number, height: number): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const encoded = canvas.toDataURL('image/png').split(',')[1] ?? ''
  const binary = atob(encoded)
  return Array.from(binary, character => character.charCodeAt(0))
}
