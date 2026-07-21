import * as Y from 'yjs'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror'
import type { MarkSpec, NodeSpec } from 'prosemirror-model'
import { workspaceCommands, collabCommands } from '../../tauri/commands'
import type {
  MarketplaceMigrationBundle,
  MarketplacePreparedPlugin,
  PluginManifest,
  WorkspaceManifest,
} from '../../types/workspace'
import type {
  NevoEditorPluginManifest,
  NevoSandboxContribution,
  NevoSandboxPluginDefinition,
} from '../../types/editor-plugin'
import { SandboxedPluginSession } from '../../editor-core/plugin-host/sandbox'
import {
  schemaMarkFromDescriptor,
  schemaNodeFromDescriptor,
} from '../../editor-core/plugin-host/sandboxUi'
import { createSchemaWithPluginSpecs } from '../../editor-core/buildSchema'

interface PluginRegistry {
  version: 1
  plugins: Record<string, {
    version: string
    dataVersion: number
    contributions: Array<Record<string, unknown>>
  }>
}

interface MarketplaceTransactionOptions {
  workspacePath: string
  pluginId: string
  permissionFingerprint: string
  version?: string
  update: boolean
  workspace: WorkspaceManifest
  workerFactory?: () => Worker
}

interface CollectedPluginNode {
  noteId: string
  path: number[]
  node: Record<string, unknown>
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function collectWorkspaceNoteIds(workspace: WorkspaceManifest): string[] {
  const noteIds = workspace.rootNotes.map(note => note.id)
  const visit = (folders: WorkspaceManifest['tree']) => {
    for (const folder of folders) {
      noteIds.push(...folder.notes.map(note => note.id))
      visit(folder.children)
    }
  }
  visit(workspace.tree)
  return [...new Set(noteIds)]
}

function schemaContributions(
  contributions: NevoSandboxContribution[],
): NevoSandboxContribution[] {
  return contributions.filter(contribution =>
    contribution.kind === 'schemaNode'
    || contribution.kind === 'schemaMark'
    || contribution.kind === 'blockType')
}

function contributionNodeTypes(contributions: Array<Record<string, unknown>>): Set<string> {
  const result = new Set<string>()
  for (const contribution of contributions) {
    const kind = contribution.kind
    const rawDescriptor = contribution.descriptor
    if (
      (kind === 'schemaNode' || kind === 'blockType')
      && rawDescriptor
      && typeof rawDescriptor === 'object'
      && !Array.isArray(rawDescriptor)
    ) {
      const descriptor = rawDescriptor as Record<string, unknown>
      if (typeof descriptor.name === 'string') result.add(descriptor.name)
    }
  }
  return result
}

function buildMigrationSchema(
  pluginId: string,
  contributions: Array<Record<string, unknown>>,
) {
  const nodes = new Map<string, NodeSpec>()
  const marks = new Map<string, MarkSpec>()
  for (const contribution of contributions) {
    const rawDescriptor = contribution.descriptor
    if (!rawDescriptor || typeof rawDescriptor !== 'object' || Array.isArray(rawDescriptor)) continue
    const descriptor = rawDescriptor as Record<string, unknown>
    if (contribution.kind === 'schemaNode') {
      const { name, spec } = schemaNodeFromDescriptor({
        ...descriptor,
        pluginId,
      })
      nodes.set(name, spec)
    } else if (contribution.kind === 'schemaMark') {
      const { name, spec } = schemaMarkFromDescriptor(descriptor)
      marks.set(name, spec)
    } else if (contribution.kind === 'blockType') {
      const schema = descriptor.schema
      if (!schema || typeof schema !== 'object' || Array.isArray(schema)) continue
      const { name, spec } = schemaNodeFromDescriptor({
        ...schema,
        name: descriptor.name,
        ui: descriptor.ui,
        pluginId,
      })
      nodes.set(name, spec)
    }
  }
  return createSchemaWithPluginSpecs(nodes, marks)
}

function collectPluginNodes(
  noteId: string,
  root: Record<string, unknown>,
  nodeTypes: ReadonlySet<string>,
): CollectedPluginNode[] {
  const result: CollectedPluginNode[] = []
  const visit = (node: Record<string, unknown>, path: number[]) => {
    if (typeof node.type === 'string' && nodeTypes.has(node.type)) {
      result.push({ noteId, path, node: jsonClone(node) })
      return
    }
    if (!Array.isArray(node.content)) return
    node.content.forEach((child, index) => {
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        visit(child as Record<string, unknown>, [...path, index])
      }
    })
  }
  visit(root, [])
  return result
}

function replaceNodeAtPath(
  root: Record<string, unknown>,
  path: readonly number[],
  replacement: Record<string, unknown>,
): void {
  if (path.length === 0) {
    for (const key of Object.keys(root)) delete root[key]
    Object.assign(root, jsonClone(replacement))
    return
  }
  let current = root
  for (const index of path.slice(0, -1)) {
    const content = current.content
    if (!Array.isArray(content) || !content[index] || typeof content[index] !== 'object') {
      throw new Error('Plugin migration returned a node for an invalid document path')
    }
    current = content[index] as Record<string, unknown>
  }
  const content = current.content
  const lastIndex = path[path.length - 1]
  if (!Array.isArray(content) || lastIndex === undefined || !content[lastIndex]) {
    throw new Error('Plugin migration returned a node for an invalid document path')
  }
  content[lastIndex] = jsonClone(replacement)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

function stagedHostBroker(storage: Record<string, unknown>) {
  const localStorage: Record<string, unknown> = {}
  return async (method: string, rawArgs: unknown): Promise<unknown> => {
    const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? rawArgs as Record<string, unknown>
      : {}
    const key = typeof args.key === 'string' ? args.key : ''
    const target = method.startsWith('storage.local.') ? localStorage : storage
    if (method.startsWith('storage.workspace.') || method.startsWith('storage.local.')) {
      if (!key) throw new Error('Staged plugin storage key is invalid')
      if (method.endsWith('.get')) return target[key] ?? null
      if (method.endsWith('.set')) {
        target[key] = jsonClone(args.value)
        return null
      }
      delete target[key]
      return null
    }
    if (method === 'runtime.schedule') return `staged-${crypto.randomUUID()}`
    if (method === 'runtime.schedule.clear') return null
    if (method === 'settings.get') return null
    throw new Error(`Host call ${method} is unavailable during staged validation`)
  }
}

async function buildMigrationBundle(
  prepared: MarketplacePreparedPlugin,
  definition: NevoSandboxPluginDefinition,
  session: SandboxedPluginSession,
  workspacePath: string,
  workspace: WorkspaceManifest,
): Promise<MarketplaceMigrationBundle> {
  const pluginId = prepared.manifest.id
  const registry = await workspaceCommands.pluginRegistryLoad(workspacePath) as PluginRegistry
  const previousEntry = registry.plugins[pluginId]
  const validatedSchema = schemaContributions(definition.contributions)
    .map(contribution => jsonClone(contribution) as unknown as Record<string, unknown>)
  const cachedSchema = validatedSchema.length > 0
    ? validatedSchema
    : (previousEntry?.contributions ?? [])
  const nextRegistry = jsonClone(registry)
  if (cachedSchema.length > 0) {
    nextRegistry.plugins[pluginId] = {
      version: prepared.manifest.version,
      dataVersion: prepared.manifest.dataVersion ?? definition.dataVersion ?? 1,
      contributions: cachedSchema,
    }
  }

  const storage = await workspaceCommands.pluginStorageSnapshot(
    workspacePath,
    pluginId,
    'workspace',
  )
  const fromDataVersion = prepared.previousDataVersion
  const targetDataVersion = prepared.manifest.dataVersion ?? definition.dataVersion ?? 1
  if (fromDataVersion === null || fromDataVersion === targetDataVersion) {
    return {
      workspaceStorage: storage,
      pluginRegistry: nextRegistry as unknown as Record<string, unknown>,
    }
  }

  const nodeTypes = contributionNodeTypes([
    ...(previousEntry?.contributions ?? []),
    ...cachedSchema,
  ])
  const documents = new Map<string, Record<string, unknown>>()
  const collected: CollectedPluginNode[] = []
  for (const noteId of collectWorkspaceNoteIds(workspace)) {
    const bytes = await collabCommands.loadYjsState(workspacePath, noteId)
    if (bytes.length === 0) continue
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, bytes)
    const document = yDocToProsemirrorJSON(ydoc, 'prosemirror') as Record<string, unknown>
    documents.set(noteId, document)
    collected.push(...collectPluginNodes(noteId, document, nodeTypes))
  }

  const result = await session.migrate({
    fromDataVersion,
    storage,
    nodes: collected.map(item => item.node),
  }, targetDataVersion)
  if (result.nodes.length !== collected.length) {
    throw new Error('Plugin migration must preserve the number of serialized plugin nodes')
  }
  result.nodes.forEach((node, index) => {
    const location = collected[index]
    if (!location) throw new Error('Plugin migration returned an unexpected node')
    const document = documents.get(location.noteId)
    if (!document) throw new Error('Plugin migration lost its source document')
    replaceNodeAtPath(document, location.path, node)
  })

  const schema = buildMigrationSchema(pluginId, cachedSchema)
  const collabStatesBase64: Record<string, string> = {}
  for (const [noteId, document] of documents) {
    schema.nodeFromJSON(document)
    if (!collected.some(item => item.noteId === noteId)) continue
    const migrated = prosemirrorJSONToYDoc(schema, document, 'prosemirror')
    collabStatesBase64[noteId] = bytesToBase64(Y.encodeStateAsUpdate(migrated))
  }
  return {
    workspaceStorage: result.storage,
    pluginRegistry: nextRegistry as unknown as Record<string, unknown>,
    collabStatesBase64,
  }
}

export async function runMarketplacePluginTransaction(
  options: MarketplaceTransactionOptions,
): Promise<PluginManifest> {
  const prepared = await workspaceCommands.marketplacePreparePlugin(
    options.workspacePath,
    options.pluginId,
    options.permissionFingerprint,
    { version: options.version, update: options.update },
  )
  let codeToken: string | null = null
  let session: SandboxedPluginSession | null = null
  try {
    const storage = await workspaceCommands.pluginStorageSnapshot(
      options.workspacePath,
      options.pluginId,
      'workspace',
    )
    const codeSession = await workspaceCommands.createStagedPluginCodeSession(
      options.workspacePath,
      prepared.transactionId,
      prepared.manifest.id,
      prepared.manifest.entryPoint,
    )
    codeToken = codeSession.token
    session = new SandboxedPluginSession(
      prepared.manifest as NevoEditorPluginManifest,
      codeSession.entryUrl,
      options.workerFactory,
      stagedHostBroker(storage),
    )
    const definition = await session.initialize()
    const migration = await buildMigrationBundle(
      prepared,
      definition,
      session,
      options.workspacePath,
      options.workspace,
    )
    await session.dispose()
    session = null
    await workspaceCommands.revokePluginCodeSession(codeToken)
    codeToken = null
    return await workspaceCommands.marketplaceCommitPlugin(
      options.workspacePath,
      prepared.transactionId,
      options.permissionFingerprint,
      migration,
    )
  } catch (error) {
    await session?.dispose().catch(() => {})
    if (codeToken) await workspaceCommands.revokePluginCodeSession(codeToken).catch(() => {})
    await workspaceCommands.marketplaceAbortPlugin(
      options.workspacePath,
      prepared.transactionId,
    ).catch(() => {})
    throw error
  }
}
