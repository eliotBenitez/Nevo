export function estimateNotebookBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function notebookListItemBytes(items: readonly unknown[]): number {
  return items.reduce<number>((sum, item) => sum + estimateNotebookBytes(item), 0)
}

export function notebookListSeparators(length: number): number { return Math.max(0, length - 1) }
