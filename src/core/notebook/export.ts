import { notebookStrokeOutlines } from './geometry'
import { paperLines } from './paper'
import { notebookImageMatrix } from './image'
import { isNotebookStroke } from './types'
import type { NotebookExportImage, NotebookExportPath, NotebookExportV1, NotebookPageV1, NotebookSnapshotV1 } from './types'

export function createNotebookExport(snapshot: NotebookSnapshotV1, includePaper = true): NotebookExportV1 {
  return {
    version: 1,
    pages: snapshot.pages.map(page => exportPage(page, includePaper)),
  }
}

function exportPage(page: NotebookPageV1, includePaper: boolean): NotebookExportV1['pages'][number] {
  const paths: NotebookExportPath[] = []
  const images: NotebookExportImage[] = []
  for (const object of page.objects) {
    if (!isNotebookStroke(object)) {
      images.push({
        id: object.id,
        src: object.src,
        opacity: object.opacity,
        matrix: notebookImageMatrix(object.points),
        pathIndex: paths.length,
      })
      continue
    }
    notebookStrokeOutlines(object.points, object.width, object.kind === 'highlighter', object.dash, object.path === 'modeled')
      .forEach((commands, index) => paths.push({
        id: index === 0 ? object.id : `${object.id}-${index}`,
        actionId: object.actionId,
        kind: object.kind,
        color: object.color,
        opacity: object.opacity,
        commands,
      }))
  }
  return {
    id: page.id,
    width: page.width,
    height: page.height,
    paper: {
      kind: page.paper.kind,
      lines: includePaper ? paperLines(page.paper.kind, page.width, page.height) : [],
    },
    paths,
    images,
  }
}
