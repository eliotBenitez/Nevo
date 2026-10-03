import { isNotebookImageSrc, notebookQuadArea } from './image'
import {
  NOTEBOOK_A4_HEIGHT,
  NOTEBOOK_A4_WIDTH,
  NOTEBOOK_COORDINATE_LIMIT,
  NOTEBOOK_OBJECT_LIMIT,
  NOTEBOOK_PAGE_LIMIT,
  NOTEBOOK_POINT_LIMIT,
  NOTEBOOK_SERIALIZED_LIMIT_BYTES,
  NOTEBOOK_SEGMENT_POINT_LIMIT,
  NOTEBOOK_SNAPSHOT_VERSION,
  type NoteFormatResult,
  type NotebookDecodeResult,
  type NotebookDiagnostic,
  type NotebookPaperKind,
  type NotebookSnapshotV1,
} from './types'

export function createNotebook(paper: NotebookPaperKind = 'ruled'): NotebookSnapshotV1 {
  return {
    version: NOTEBOOK_SNAPSHOT_VERSION,
    pages: [{
      id: createNotebookId(),
      width: NOTEBOOK_A4_WIDTH,
      height: NOTEBOOK_A4_HEIGHT,
      paper: { kind: paper },
      objects: [],
    }],
  }
}

export function createNotebookId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `notebook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function decodeNotebook(value: unknown): NotebookDecodeResult {
  let source = value
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source) as unknown
    } catch {
      return failure('invalid', value, 'invalid-json', '$', 'Notebook JSON could not be parsed.')
    }
  }

  try {
    const serialized = JSON.stringify(source)
    if (serialized === undefined) return failure('invalid', value, 'invalid-json-value', '$', 'Notebook value is not JSON serializable.')
    if (new TextEncoder().encode(serialized).byteLength > NOTEBOOK_SERIALIZED_LIMIT_BYTES) {
      return failure('limit-exceeded', value, 'serialized-size', '$', 'Notebook exceeds the serialized size limit.')
    }
  } catch {
    return failure('invalid', value, 'invalid-json-value', '$', 'Notebook value is not JSON serializable.')
  }

  const issues: NotebookDiagnostic[] = []
  if (!isRecord(source)) return failure('invalid', value, 'expected-object', '$', 'Notebook must be an object.')
  if (source.version !== NOTEBOOK_SNAPSHOT_VERSION) {
    return failure('unsupported-version', value, 'unsupported-version', '$.version', 'Notebook version is not supported.')
  }
  if (!Array.isArray(source.pages)) return failure('invalid', value, 'expected-array', '$.pages', 'Notebook pages must be an array.')
  if (source.pages.length === 0) return failure('invalid', value, 'missing-page', '$.pages', 'A notebook must contain at least one page.')
  if (source.pages.length > NOTEBOOK_PAGE_LIMIT) {
    return failure('limit-exceeded', value, 'page-limit', '$.pages', 'Notebook exceeds the page limit.')
  }

  const ids = new Set<string>()
  let objectCount = 0
  let pointCount = 0
  let unsupportedKind = false

  for (let pageIndex = 0; pageIndex < source.pages.length; pageIndex += 1) {
    const page = source.pages[pageIndex]
    const path = `$.pages[${pageIndex}]`
    if (!isRecord(page)) {
      issues.push(diagnostic('expected-object', path, 'Page must be an object.'))
      continue
    }
    requireUniqueId(page.id, `${path}.id`, ids, issues)
    requireFinitePositive(page.width, `${path}.width`, issues)
    requireFinitePositive(page.height, `${path}.height`, issues)
    if (page.width !== NOTEBOOK_A4_WIDTH || page.height !== NOTEBOOK_A4_HEIGHT) {
      issues.push(diagnostic('invalid-page-size', path, 'Notebook pages must use the supported A4 dimensions.'))
    }
    if (!isRecord(page.paper) || !isPaperKind(page.paper.kind)) {
      if (isRecord(page.paper) && typeof page.paper.kind === 'string') unsupportedKind = true
      else issues.push(diagnostic('invalid-paper', `${path}.paper.kind`, 'Paper kind must be plain, grid, or ruled.'))
    }
    if (!Array.isArray(page.objects)) {
      issues.push(diagnostic('expected-array', `${path}.objects`, 'Page objects must be an array.'))
      continue
    }
    objectCount += page.objects.length
    for (let objectIndex = 0; objectIndex < page.objects.length; objectIndex += 1) {
      const object = page.objects[objectIndex]
      const objectPath = `${path}.objects[${objectIndex}]`
      if (!isRecord(object)) {
        issues.push(diagnostic('expected-object', objectPath, 'Stroke must be an object.'))
        continue
      }
      requireUniqueId(object.id, `${objectPath}.id`, ids, issues)
      if (object.kind === 'image') {
        pointCount += validateImage(object, objectPath, issues)
        continue
      }
      if (object.kind !== 'stroke' && object.kind !== 'highlighter') {
        if (typeof object.kind === 'string') unsupportedKind = true
        else issues.push(diagnostic('invalid-kind', `${objectPath}.kind`, 'Stroke kind must be stroke or highlighter.'))
      }
      requireNonEmptyString(object.actionId, `${objectPath}.actionId`, issues)
      if (typeof object.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(object.color)) {
        issues.push(diagnostic('invalid-color', `${objectPath}.color`, 'Stroke color must be a six-digit hex color.'))
      }
      requireFinitePositive(object.width, `${objectPath}.width`, issues)
      if (object.kind === 'stroke' && typeof object.width === 'number' && (object.width < 0.25 || object.width > 8)) {
        issues.push(diagnostic('invalid-width', `${objectPath}.width`, 'Pen width must be between 0.25 and 8 points.'))
      }
      if (object.kind === 'highlighter' && typeof object.width === 'number' && (object.width < 2 || object.width > 24)) {
        issues.push(diagnostic('invalid-width', `${objectPath}.width`, 'Highlighter width must be between 2 and 24 points.'))
      }
      requireUnitInterval(object.opacity, `${objectPath}.opacity`, issues)
      if (object.dash !== undefined && object.dash !== 'solid' && object.dash !== 'dashed' && object.dash !== 'dotted') {
        issues.push(diagnostic('invalid-dash', `${objectPath}.dash`, 'Line dash must be solid, dashed, or dotted.'))
      }
      if (object.path !== undefined && typeof object.path !== 'string') {
        issues.push(diagnostic('invalid-path', `${objectPath}.path`, 'Stroke path mode must be a string.'))
      }
      if (!Array.isArray(object.points) || object.points.length === 0) {
        issues.push(diagnostic('invalid-points', `${objectPath}.points`, 'Stroke points must be a non-empty array.'))
        continue
      }
      if (object.points.length > NOTEBOOK_SEGMENT_POINT_LIMIT) {
        return failure('limit-exceeded', value, 'segment-point-limit', `${objectPath}.points`, 'Stroke exceeds the segment point limit.')
      }
      pointCount += object.points.length
      for (let pointIndex = 0; pointIndex < object.points.length; pointIndex += 1) {
        const point = object.points[pointIndex]
        const pointPath = `${objectPath}.points[${pointIndex}]`
        if (!isRecord(point)) {
          issues.push(diagnostic('expected-object', pointPath, 'Point must be an object.'))
          continue
        }
        requireFiniteCoordinate(point.x, `${pointPath}.x`, issues)
        requireFiniteCoordinate(point.y, `${pointPath}.y`, issues)
        if ('pressure' in point) requireUnitInterval(point.pressure, `${pointPath}.pressure`, issues)
      }
    }
  }

  if (objectCount > NOTEBOOK_OBJECT_LIMIT || pointCount > NOTEBOOK_POINT_LIMIT) {
    return failure('limit-exceeded', value, objectCount > NOTEBOOK_OBJECT_LIMIT ? 'object-limit' : 'point-limit', '$.pages', 'Notebook exceeds an object or point limit.')
  }
  if (unsupportedKind) return failure('unsupported-kind', value, 'unsupported-kind', '$.pages', 'Notebook contains an unsupported object kind.')
  if (issues.length) return { status: 'invalid', rawValue: value, diagnostics: issues }
  return { status: 'valid', snapshot: source as unknown as NotebookSnapshotV1, diagnostics: [] }
}

export function encodeNotebook(snapshot: NotebookSnapshotV1): string {
  const decoded = decodeNotebook(snapshot)
  if (decoded.status !== 'valid') {
    throw new TypeError(`Cannot encode notebook: ${decoded.diagnostics.map(issue => issue.code).join(', ')}`)
  }
  return JSON.stringify(decoded.snapshot)
}

export function decodeNoteFormat(note: unknown): NoteFormatResult {
  if (!isRecord(note)) return { status: 'invalid', editable: false, diagnostics: [diagnostic('expected-object', '$', 'Note must be an object.')] }
  if (note.documentKind === undefined && note.notebook === undefined) return { status: 'document', editable: true }
  if (note.documentKind === 'document' && note.notebook === undefined) return { status: 'document', editable: true }
  if (note.documentKind !== 'notebook' || note.notebook === undefined) {
    const status = note.documentKind !== undefined && note.documentKind !== 'document' && note.documentKind !== 'notebook'
      ? 'unsupported'
      : 'invalid'
    return { status, editable: false, diagnostics: [diagnostic('inconsistent-format', '$', 'Note format fields are inconsistent or unsupported.')] }
  }
  if (!isEmptyProseMirrorDoc(note.content) || note.canvas !== undefined) {
    return { status: 'invalid', editable: false, diagnostics: [diagnostic('invalid-notebook-note', '$', 'Notebook notes require empty document content and no canvas.')] }
  }
  const decoded = decodeNotebook(note.notebook)
  if (decoded.status === 'valid') return { status: 'notebook', editable: true, snapshot: decoded.snapshot, diagnostics: [] }
  return {
    status: decoded.status === 'unsupported-version' || decoded.status === 'unsupported-kind' ? 'unsupported' : 'invalid',
    editable: false,
    diagnostics: decoded.diagnostics,
  }
}

function validateImage(object: Record<string, unknown>, path: string, issues: NotebookDiagnostic[]): number {
  requireNonEmptyString(object.actionId, `${path}.actionId`, issues)
  if (!isNotebookImageSrc(object.src)) {
    issues.push(diagnostic('invalid-image-src', `${path}.src`, 'Image source must be a raster asset under .nevo/assets.'))
  }
  requireUnitInterval(object.opacity, `${path}.opacity`, issues)
  if (!Array.isArray(object.points) || object.points.length !== 4) {
    issues.push(diagnostic('invalid-points', `${path}.points`, 'Image must have exactly four corner points.'))
    return 0
  }
  const before = issues.length
  for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
    const point = object.points[pointIndex]
    const pointPath = `${path}.points[${pointIndex}]`
    if (!isRecord(point)) {
      issues.push(diagnostic('expected-object', pointPath, 'Point must be an object.'))
      continue
    }
    requireFiniteCoordinate(point.x, `${pointPath}.x`, issues)
    requireFiniteCoordinate(point.y, `${pointPath}.y`, issues)
  }
  if (issues.length === before && !(notebookQuadArea(object.points as { x: number; y: number }[]) > 0)) {
    issues.push(diagnostic('invalid-image-area', `${path}.points`, 'Image corners must enclose a non-zero area.'))
  }
  return 4
}

function isEmptyProseMirrorDoc(value: unknown): boolean {
  if (!isRecord(value) || value.type !== 'doc') return false
  if (value.content === undefined) return true
  if (!Array.isArray(value.content)) return false
  return value.content.every((node) => {
    if (!isRecord(node) || node.type !== 'paragraph') return false
    if (node.content === undefined) return true
    return Array.isArray(node.content) && node.content.length === 0
  })
}

function failure(
  status: 'invalid' | 'unsupported-version' | 'unsupported-kind' | 'limit-exceeded',
  rawValue: unknown,
  code: string,
  path: string,
  message: string,
): NotebookDecodeResult {
  return { status, rawValue, diagnostics: [diagnostic(code, path, message)] }
}

function diagnostic(code: string, path: string, message: string): NotebookDiagnostic {
  return { code, path, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPaperKind(value: unknown): value is NotebookPaperKind {
  return value === 'plain' || value === 'grid' || value === 'ruled'
}

function requireUniqueId(value: unknown, path: string, ids: Set<string>, issues: NotebookDiagnostic[]): void {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(diagnostic('invalid-id', path, 'ID must be a non-empty string.'))
  } else if (ids.has(value)) {
    issues.push(diagnostic('duplicate-id', path, 'Notebook page and object IDs must be unique.'))
  } else {
    ids.add(value)
  }
}

function requireNonEmptyString(value: unknown, path: string, issues: NotebookDiagnostic[]): void {
  if (typeof value !== 'string' || value.length === 0) issues.push(diagnostic('invalid-string', path, 'Value must be a non-empty string.'))
}

function requireFiniteCoordinate(value: unknown, path: string, issues: NotebookDiagnostic[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > NOTEBOOK_COORDINATE_LIMIT) {
    issues.push(diagnostic('invalid-coordinate', path, 'Coordinate must be finite and within the safe numeric range.'))
  }
}

function requireFinitePositive(value: unknown, path: string, issues: NotebookDiagnostic[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) issues.push(diagnostic('invalid-number', path, 'Value must be finite and greater than zero.'))
}

function requireUnitInterval(value: unknown, path: string, issues: NotebookDiagnostic[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) issues.push(diagnostic('invalid-number', path, 'Value must be finite and between zero and one.'))
}
