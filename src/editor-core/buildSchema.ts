import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model'
import type { EditorPluginHost } from './plugin-host'
import { nevoBaseSchema } from './schema'

export function createSchemaWithPluginExtensions(pluginHost?: EditorPluginHost): Schema {
  if (!pluginHost) return nevoBaseSchema

  return createSchemaWithPluginSpecs(
    pluginHost.registries.nodes,
    pluginHost.registries.marks,
  )
}

export function createSchemaWithPluginSpecs(
  pluginNodes: ReadonlyMap<string, NodeSpec>,
  pluginMarks: ReadonlyMap<string, MarkSpec>,
): Schema {
  const nodeSpecs: Record<string, NodeSpec> = {}
  nevoBaseSchema.spec.nodes.forEach((name, spec) => {
    nodeSpecs[name] = spec
  })

  const markSpecs: Record<string, MarkSpec> = {}
  nevoBaseSchema.spec.marks.forEach((name, spec) => {
    markSpecs[name] = spec
  })

  for (const [name, spec] of pluginNodes) {
    if (!(name in nodeSpecs)) {
      nodeSpecs[name] = spec
    }
  }

  for (const [name, spec] of pluginMarks) {
    if (!(name in markSpecs)) {
      markSpecs[name] = spec
    }
  }

  return new Schema({ nodes: nodeSpecs, marks: markSpecs })
}
