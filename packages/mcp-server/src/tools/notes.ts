import { callBridge } from '../client.js'

export interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  /** Bridge method this tool forwards to. */
  method: string
  /** Maps validated tool arguments onto bridge params. */
  toParams: (args: Record<string, unknown>) => Record<string, unknown>
}

const LIMIT_PROPERTY = {
  type: 'integer',
  minimum: 1,
  maximum: 500,
  description: 'Maximum number of entries to return (default 100).',
} as const

export const READ_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'nevo_workspace_info',
    title: 'Nevo workspace info',
    description:
      'Get the name, path, and note/folder counts of the Nevo workspace currently open. Use this first to confirm which vault you are working in.',
    method: 'workspace.info',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    toParams: () => ({}),
  },
  {
    name: 'nevo_list_notes',
    title: 'List Nevo notes',
    description:
      'List notes in the open Nevo workspace with their ids, titles, and folder paths. Optionally restrict the list to one folder.',
    method: 'notes.list',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Only list notes directly inside this folder.' },
        limit: LIMIT_PROPERTY,
      },
      additionalProperties: false,
    },
    toParams: args => args,
  },
  {
    name: 'nevo_search_notes',
    title: 'Search Nevo notes',
    description:
      'Full-text search across every note in the open workspace. Returns matching blocks with a snippet and the id of the note that contains them.',
    method: 'notes.search',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Text to search for.' },
        limit: LIMIT_PROPERTY,
      },
      required: ['query'],
      additionalProperties: false,
    },
    toParams: args => args,
  },
  {
    name: 'nevo_read_note',
    title: 'Read a Nevo note',
    description:
      'Read one note by id. Returns its metadata and its ProseMirror document JSON. Note: this is the copy saved on disk; a note currently open in the editor may have unsaved changes.',
    method: 'notes.read',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', minLength: 1, description: 'Note id, as returned by nevo_list_notes.' },
      },
      required: ['noteId'],
      additionalProperties: false,
    },
    toParams: args => args,
  },
]

const NOTE_ID_PROPERTY = {
  type: 'string',
  minLength: 1,
  description: 'Note id, as returned by nevo_list_notes.',
} as const

export const WRITE_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'nevo_create_note',
    title: 'Create a Nevo note',
    description:
      'Create an empty note in the open workspace, optionally inside a folder. Returns the new note id. Write the note body afterwards with nevo_apply_edit, which requires the note to be open in the editor.',
    method: 'notes.create',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 512, description: 'Title of the new note.' },
        folderId: { type: 'string', description: 'Folder to create the note in; omit for the workspace root.' },
        icon: { type: 'string', description: 'Optional emoji icon.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    toParams: args => args,
  },
  {
    name: 'nevo_editor_snapshot',
    title: 'Read the open Nevo note',
    description:
      'Read the note currently open in the editor, including unsaved changes, plus the revision number to quote in nevo_apply_edit. Call this immediately before editing.',
    method: 'notes.editorSnapshot',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'Fail unless this note is the one currently open.' },
      },
      additionalProperties: false,
    },
    toParams: args => args,
  },
  {
    name: 'nevo_apply_edit',
    title: 'Edit the open Nevo note',
    description:
      'Apply ProseMirror operations to the note open in the editor. Only the open note can be edited. Quote the revision from nevo_editor_snapshot: if the document changed since then, operations with absolute positions are refused and you must re-read and retry. Positions are ProseMirror document positions, not character offsets. To add new content, omit insertText.from or insertNode.at: Nevo appends it after the existing document blocks.',
    method: 'notes.applyEdit',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: NOTE_ID_PROPERTY,
        revision: {
          type: 'integer',
          minimum: 0,
          description: 'Revision from nevo_editor_snapshot.',
        },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          description:
            'Operations to apply, e.g. {"type":"insertText","text":"..."} appends a new text block, {"type":"insertText","text":"...","from":12} inserts at an explicit position, or {"type":"addMark","markType":"strong","from":4,"to":9}. Supported types: insertText, insertNode, replaceSelection, setNodeAttrs, addMark, removeMark, wrap, setSelection. Omitting insertNode.at appends the node; omitting "to" with an explicit "from" makes a pure insertion at "from".',
          items: { type: 'object' },
        },
      },
      required: ['noteId', 'revision', 'operations'],
      additionalProperties: false,
    },
    toParams: args => args,
  },
  {
    name: 'nevo_move_note',
    title: 'Move a Nevo note',
    description: 'Move a note into a different folder, or to the workspace root.',
    method: 'notes.move',
    inputSchema: {
      type: 'object',
      properties: {
        noteId: NOTE_ID_PROPERTY,
        targetFolderId: {
          type: ['string', 'null'],
          description: 'Destination folder; null or omitted moves the note to the workspace root.',
        },
      },
      required: ['noteId'],
      additionalProperties: false,
    },
    toParams: args => args,
  },
  {
    name: 'nevo_delete_note',
    title: 'Move a Nevo note to the trash',
    description:
      'Move a note to the workspace trash, where the user can restore it. There is no permanent delete.',
    method: 'notes.delete',
    inputSchema: {
      type: 'object',
      properties: { noteId: NOTE_ID_PROPERTY },
      required: ['noteId'],
      additionalProperties: false,
    },
    toParams: args => args,
  },
]

export const ALL_TOOLS: readonly ToolDefinition[] = [...READ_TOOLS, ...WRITE_TOOLS]

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(tool => tool.name === name)
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = findTool(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return callBridge(tool.method, tool.toParams(args))
}
