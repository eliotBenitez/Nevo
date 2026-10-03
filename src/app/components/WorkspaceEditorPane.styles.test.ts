import { describe, expect, it } from 'vitest'

const { readFileSync } = process.getBuiltinModule('fs') as {
  readFileSync: (path: string, encoding: BufferEncoding) => string
}

describe('WorkspaceEditorPane style ownership', () => {
  it('loads empty-state and upload-input styles before the editor surface mounts', () => {
    const pane = readFileSync('src/app/components/WorkspaceEditorPane.vue', 'utf8')
    const surface = readFileSync('src/app/components/editor/EditorSurface.vue', 'utf8')

    expect(pane).toContain("import '../../styles/editor.css'")
    expect(surface).not.toContain("import '../../../styles/editor.css'")
  })
})
