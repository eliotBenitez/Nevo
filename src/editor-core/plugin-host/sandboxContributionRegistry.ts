import { Decoration } from 'prosemirror-view'
import type { Transaction, EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type {
  NevoDocxFragment,
  NevoEditorPluginManifest,
  NevoEditorRegistries,
  NevoSandboxContribution,
  NevoSandboxPluginDefinition,
} from '../../types/editor-plugin'
import { nevoBaseSchema } from '../schema'
import { pluginCodeUrl } from './pluginFrameUrl'
import { manifestCapabilities, type SandboxedPluginSession } from './sandbox'
import type { SandboxEditorBridge } from './sandboxEditorBridge'
import type { SandboxEditorEvents } from './sandboxEditorEvents'
import { createSandboxFrameNodeView } from './sandboxFrameView'
import { createSandboxRenderNodeView } from './sandboxRenderView'
import { sanitizeScopedCss, schemaMarkFromDescriptor, schemaNodeFromDescriptor } from './sandboxUi'
import { normalizeErrorMessage, type EditorPluginHostOptions } from './utils'

interface SandboxContributionRegistryDeps {
  registries: NevoEditorRegistries
  runtime: EditorPluginHostOptions['runtime']
  errors: string[]
  codeSessions: ReadonlyMap<string, { token: string; entryUrl: string }>
  events: SandboxEditorEvents
  bridge: SandboxEditorBridge
  recordError: (pluginId: string, phase: string, error: unknown) => void
}

/** Turns sandboxed plugin contributions (and cached schema descriptors) into editor registry entries. */
export class SandboxContributionRegistry {
  private readonly registries: NevoEditorRegistries
  private readonly runtime: EditorPluginHostOptions['runtime']
  private readonly errors: string[]
  private readonly codeSessions: ReadonlyMap<string, { token: string; entryUrl: string }>
  private readonly events: SandboxEditorEvents
  private readonly bridge: SandboxEditorBridge
  private readonly recordError: SandboxContributionRegistryDeps['recordError']
  private readonly serializerOwners = new Map<string, string>()
  private readonly uiHandlers = new Map<string, string>()
  private readonly styles: HTMLStyleElement[] = []

  constructor(deps: SandboxContributionRegistryDeps) {
    this.registries = deps.registries
    this.runtime = deps.runtime
    this.errors = deps.errors
    this.codeSessions = deps.codeSessions
    this.events = deps.events
    this.bridge = deps.bridge
    this.recordError = deps.recordError
  }

  uiHandlerId(pluginId: string, contributionId: string): string | undefined {
    return this.uiHandlers.get(`${pluginId}:${contributionId}`)
  }

  dispose(): void {
    this.uiHandlers.clear()
    for (const style of this.styles.splice(0)) style.remove()
  }

  registerCachedSchemas(pluginId: string, contributions: Array<Record<string, unknown>>): void {
    for (const raw of contributions) {
      const kind = raw.kind
      const descriptor = raw.descriptor
      if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) continue
      try {
        if (kind === 'schemaNode') {
          const { name, spec } = schemaNodeFromDescriptor({
            ...(descriptor as Record<string, unknown>),
            pluginId,
          })
          if (!this.registries.nodes.has(name)) this.registries.nodes.set(name, spec)
        } else if (kind === 'schemaMark') {
          const { name, spec } = schemaMarkFromDescriptor(descriptor as Record<string, unknown>)
          if (!this.registries.marks.has(name)) this.registries.marks.set(name, spec)
        } else if (kind === 'blockType') {
          const block = descriptor as Record<string, unknown>
          const schema = block.schema
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) continue
          const { name, spec } = schemaNodeFromDescriptor({
            ...schema,
            name: block.name,
            ui: block.ui,
            pluginId,
          })
          if (!this.registries.nodes.has(name)) this.registries.nodes.set(name, spec)
        }
      } catch (error) {
        this.errors.push(`Cached schema for ${pluginId} was rejected: ${normalizeErrorMessage(error)}`)
      }
    }
  }

  registerDefinition(
    manifest: NevoEditorPluginManifest,
    definition: NevoSandboxPluginDefinition,
    session: SandboxedPluginSession,
  ): void {
    for (const contribution of definition.contributions) {
      this.registerContribution(manifest, contribution, session)
    }
  }

  private registerContribution(
    manifest: NevoEditorPluginManifest,
    contribution: NevoSandboxContribution,
    session: SandboxedPluginSession,
  ): void {
    const descriptor = contribution.descriptor
    const title = typeof descriptor.title === 'string' ? descriptor.title : contribution.id
    const handlerId = contribution.handlerId
    const run = (
      state: EditorState,
      dispatch: (transaction: Transaction) => void,
      input: unknown = null,
      view?: EditorView,
    ) => {
      if (!handlerId) return
      void this.bridge.executeHandler(manifest, session, handlerId, state, dispatch, input, view)
    }

    if (contribution.kind === 'schemaNode') {
      const { name, spec } = schemaNodeFromDescriptor(descriptor)
      if (this.registries.nodes.has(name)) throw new Error(`Node already registered: ${name}`)
      this.registries.nodes.set(name, spec)
      return
    }
    if (contribution.kind === 'schemaMark') {
      const { name, spec } = schemaMarkFromDescriptor(descriptor)
      if (this.registries.marks.has(name)) throw new Error(`Mark already registered: ${name}`)
      this.registries.marks.set(name, spec)
      return
    }
    if (contribution.kind === 'blockType') {
      const schema = descriptor.schema
      if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
        const merged = {
          ...schema,
          id: contribution.id,
          name: descriptor.name,
          ui: descriptor.ui,
          pluginId: manifest.id,
        }
        const { name, spec } = schemaNodeFromDescriptor(merged)
        if (this.registries.nodes.has(name)) throw new Error(`Node already registered: ${name}`)
        this.registries.nodes.set(name, spec)
        if (typeof descriptor.css === 'string' && typeof document !== 'undefined') {
          const style = document.createElement('style')
          style.dataset.nevoPluginStyle = manifest.id
          style.textContent = sanitizeScopedCss(manifest.id, descriptor.css)
          document.head.append(style)
          this.styles.push(style)
        }
        // Tier 1 render channel: a Worker handler owns `attrs -> { svg }` and the
        // host mounts the sanitized output as a live NodeView. The static toDOM from
        // the schema spec stays as the export/copy/disabled-plugin fallback.
        if (descriptor.render === 'svg' && handlerId) {
          this.registries.nodeViews.set(name, createSandboxRenderNodeView({
            pluginId: manifest.id,
            nodeName: name,
            handlerId,
            session,
            onError: error => this.recordError(manifest.id, 'render', error),
          }))
        }
        // Tier 2 interactive block: the plugin view runs in a sandboxed iframe and
        // proposes attr patches that the host applies node-scoped after validation.
        const frame = descriptor.frame
        if (frame && typeof frame === 'object' && !Array.isArray(frame)) {
          const frameUrl = this.sandboxIframeUrl(manifest.id, (frame as Record<string, unknown>).source)
          this.registries.nodeViews.set(name, createSandboxFrameNodeView({
            pluginId: manifest.id,
            nodeName: name,
            frameUrl,
            session,
            editable: manifestCapabilities(manifest).includes('editor.write.self'),
            locale: () => this.runtime?.locale?.() ?? 'en',
            theme: () => this.runtime?.theme?.() ?? 'light',
            applyPatch: (view, position, patch) =>
              this.bridge.applyFramePatch(manifest, view, position, patch),
            onError: error => this.recordError(manifest.id, 'frame', error),
          }))
        }
      }
      return
    }
    if (contribution.kind === 'command') {
      if (this.registries.commands.has(contribution.id)) {
        throw new Error(`Command already registered: ${contribution.id}`)
      }
      this.registries.commands.set(contribution.id, (state, dispatch, view) => {
        if (!dispatch) return true
        run(state, dispatch, null, view)
        return true
      })
      return
    }
    if (contribution.kind === 'keymap') {
      const key = typeof descriptor.key === 'string' ? descriptor.key : ''
      if (!key) throw new Error(`Keymap ${contribution.id} requires key`)
      const priority = typeof descriptor.priority === 'number' ? descriptor.priority : 0
      this.registries.keymaps.push({
        pluginId: manifest.id,
        priority,
        bindings: {
          [key]: (state, dispatch, view) => {
            if (!dispatch) return true
            run(state, dispatch, null, view)
            return true
          },
        },
      })
      return
    }
    if (contribution.kind === 'slashItem') {
      if (this.registries.slashItems.has(contribution.id)) {
        throw new Error(`Slash item already registered: ${contribution.id}`)
      }
      this.registries.slashItems.set(contribution.id, {
        id: contribution.id,
        title,
        category: typeof descriptor.category === 'string' ? descriptor.category : undefined,
        keywords: Array.isArray(descriptor.keywords)
          ? descriptor.keywords.filter((item): item is string => typeof item === 'string')
          : undefined,
        run: ({ view, state, dispatch }) => run(state, dispatch, null, view),
      })
      return
    }
    if (contribution.kind === 'toolbarAction') {
      if (this.registries.toolbarActions.has(contribution.id)) {
        throw new Error(`Toolbar action already registered: ${contribution.id}`)
      }
      this.registries.toolbarActions.set(contribution.id, {
        id: contribution.id,
        title,
        order: typeof descriptor.order === 'number' ? descriptor.order : undefined,
        run: ({ view, state, dispatch }) => run(state, dispatch, null, view),
      })
      return
    }
    if (contribution.kind === 'serializer') {
      const nodeType = typeof descriptor.nodeType === 'string' ? descriptor.nodeType : ''
      const format = descriptor.format
      if (!nodeType || !['markdown', 'html', 'typst', 'docx'].includes(String(format))) {
        throw new Error(`Serializer ${contribution.id} has invalid nodeType/format`)
      }
      // A plugin may serialize its own nodes only: never core nodes, never another plugin's.
      const owner = this.serializerOwners.get(nodeType)
      if (nevoBaseSchema.nodes[nodeType] || (owner && owner !== manifest.id)) {
        throw new Error(`Serializer ${contribution.id} cannot serialize node ${nodeType}`)
      }
      this.serializerOwners.set(nodeType, manifest.id)
      const serializer = this.registries.nodeSerializers.get(nodeType) ?? {}
      const invoke = async (node: unknown, helpers: { serializeChildren: () => string }) => {
        const result = await session.invoke(handlerId!, { node, children: helpers.serializeChildren() })
        if (typeof result !== 'string') throw new Error(`Serializer ${contribution.id} must return a string`)
        if (result.length > 1024 * 1024) throw new Error(`Serializer ${contribution.id} exceeded 1 MiB`)
        if (
          format === 'html'
          && /<\s*(?:script|iframe|object|embed|link|meta)\b|\son[a-z]+\s*=|javascript:|data:\s*text\/html/i
            .test(result)
        ) {
          throw new Error(`Serializer ${contribution.id} returned unsafe HTML`)
        }
        return result
      }
      if (format === 'docx') {
        serializer.docx = async node => {
          const result = await session.invoke(handlerId!, { node })
          if (!result || typeof result !== 'object' || Array.isArray(result)) {
            throw new Error(`Serializer ${contribution.id} must return an object`)
          }
          if (JSON.stringify(result).length > 1024 * 1024) {
            throw new Error(`Serializer ${contribution.id} exceeded 1 MiB`)
          }
          return result as NevoDocxFragment
        }
        this.registries.nodeSerializers.set(nodeType, serializer)
        return
      }
      if (format === 'markdown') serializer.markdown = invoke
      if (format === 'html') serializer.html = invoke
      if (format === 'typst') serializer.typst = invoke
      this.registries.nodeSerializers.set(nodeType, serializer)
      return
    }
    if (contribution.kind === 'importer') {
      const fencedLang = typeof descriptor.fencedLang === 'string' ? descriptor.fencedLang : ''
      if (!fencedLang) throw new Error(`Importer ${contribution.id} requires fencedLang`)
      this.registries.nodeImporters.set(fencedLang, {
        fencedLang,
        fromFenced: async code => {
          const result = await session.invoke(handlerId!, { code })
          return result && typeof result === 'object' ? result as never : null
        },
      })
      return
    }
    if (contribution.kind === 'popover') {
      const nodeType = typeof descriptor.nodeType === 'string' ? descriptor.nodeType : ''
      if (!nodeType || !Array.isArray(descriptor.fields)) {
        throw new Error(`Popover ${contribution.id} requires nodeType and fields`)
      }
      const fields = descriptor.fields.map((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`Popover ${contribution.id} field ${index} is invalid`)
        }
        const field = value as Record<string, unknown>
        if (typeof field.key !== 'string') {
          throw new Error(`Popover ${contribution.id} field ${index} requires key`)
        }
        return {
          key: field.key,
          type: typeof field.type === 'string' ? field.type as never : undefined,
          label: typeof field.label === 'string' ? field.label : undefined,
          placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
          rows: typeof field.rows === 'number' ? field.rows : undefined,
          min: typeof field.min === 'number' ? field.min : undefined,
          max: typeof field.max === 'number' ? field.max : undefined,
          step: typeof field.step === 'number' ? field.step : undefined,
          options: Array.isArray(field.options)
            ? field.options
                .filter((option): option is Record<string, unknown> =>
                  Boolean(option) && typeof option === 'object' && !Array.isArray(option))
                .map(option => ({
                  value: String(option.value ?? ''),
                  label: String(option.label ?? option.value ?? ''),
                }))
            : undefined,
        }
      })
      this.registries.nodePopovers.set(nodeType, {
        title,
        fields,
        removable: descriptor.removable !== false,
      })
      return
    }
    if (contribution.kind === 'decoration') {
      const mode = descriptor.mode === 'selection' ? 'selection' : 'node'
      const nodeType = typeof descriptor.nodeType === 'string' ? descriptor.nodeType : ''
      const className = typeof descriptor.className === 'string' ? descriptor.className : ''
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(className)) {
        throw new Error(`Decoration ${contribution.id} requires a safe className`)
      }
      if (mode === 'node' && !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(nodeType)) {
        throw new Error(`Decoration ${contribution.id} requires a safe nodeType`)
      }
      const attrs = descriptor.attrs && typeof descriptor.attrs === 'object' && !Array.isArray(descriptor.attrs)
        ? descriptor.attrs as Record<string, unknown>
        : {}
      this.registries.decorationProviders.set(contribution.id, {
        dependsOnSelection: mode === 'selection',
        provider: state => {
          if (mode === 'selection') {
            if (state.selection.empty) return []
            return [Decoration.inline(state.selection.from, state.selection.to, {
              class: className,
              'data-nevo-plugin': manifest.id,
            })]
          }
          const decorations: Decoration[] = []
          state.doc.descendants((node, position) => {
            if (node.type.name !== nodeType) return
            const matches = Object.entries(attrs).every(([key, value]) => node.attrs[key] === value)
            if (!matches) return
            decorations.push(Decoration.node(position, position + node.nodeSize, {
              class: className,
              'data-nevo-plugin': manifest.id,
            }))
          })
          return decorations
        },
      })
      return
    }
    if (contribution.kind === 'workspaceView') {
      const source = this.sandboxIframeUrl(manifest.id, descriptor.source)
      const route = this.sandboxContributionRoute(manifest.id, contribution.id, descriptor.route)
      this.registries.workspaceViews.set(contribution.id, {
        pluginId: manifest.id,
        id: contribution.id,
        title,
        route,
        component: Object.freeze({
          type: 'sandboxed-plugin-iframe',
          pluginId: manifest.id,
          source,
          sandbox: 'allow-scripts',
        }),
        icon: typeof descriptor.icon === 'string' ? descriptor.icon : undefined,
        order: typeof descriptor.order === 'number' ? descriptor.order : undefined,
      })
      if (handlerId) {
        this.uiHandlers.set(`${manifest.id}:${contribution.id}`, handlerId)
      }
      return
    }
    if (contribution.kind === 'sidebarItem') {
      const route = this.sandboxContributionRoute(manifest.id, contribution.id, descriptor.route)
      this.registries.sidebarItems.set(contribution.id, {
        pluginId: manifest.id,
        id: contribution.id,
        title,
        route,
        icon: typeof descriptor.icon === 'string' ? descriptor.icon : undefined,
        order: typeof descriptor.order === 'number' ? descriptor.order : undefined,
      })
      if (handlerId) {
        this.uiHandlers.set(`${manifest.id}:${contribution.id}`, handlerId)
      }
      return
    }
    if (contribution.kind === 'modal') {
      const source = this.sandboxIframeUrl(manifest.id, descriptor.source)
      this.registries.modals.set(contribution.id, {
        pluginId: manifest.id,
        id: contribution.id,
        component: Object.freeze({
          type: 'sandboxed-plugin-iframe',
          pluginId: manifest.id,
          source,
          sandbox: 'allow-scripts',
        }),
      })
      if (handlerId) {
        this.uiHandlers.set(`${manifest.id}:${contribution.id}`, handlerId)
      }
      return
    }
    if (contribution.kind === 'editorEvent') {
      const event = typeof descriptor.event === 'string' ? descriptor.event : ''
      if (!event || !handlerId) throw new Error(`Editor event ${contribution.id} is invalid`)
      this.events.addHandler(manifest.id, event, handlerId)
    }
  }

  private sandboxIframeUrl(pluginId: string, source: unknown): string {
    if (typeof source !== 'string') throw new Error('Sandbox iframe source is required')
    const codeSession = this.codeSessions.get(pluginId)
    if (!codeSession) throw new Error('Sandbox iframe requires a plugin-scoped code session')
    return pluginCodeUrl(codeSession, source)
  }

  private sandboxContributionRoute(pluginId: string, contributionId: string, route: unknown): string {
    if (typeof route === 'string') return route
    const viewId = contributionId.startsWith(`${pluginId}.`)
      ? contributionId.slice(pluginId.length + 1)
      : contributionId
    return `/workspace/plugin/${pluginId}/${encodeURIComponent(viewId)}`
  }
}
