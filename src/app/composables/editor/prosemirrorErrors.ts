export function isProseMirrorTransformError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'TransformError'
}
