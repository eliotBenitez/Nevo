import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model'
import type { EditorPluginHost } from './plugin-host'
import { nevoBaseSchema } from './schema'

export function createSchemaWithPluginExtensions(pluginHost?: EditorPluginHost): Schema {
  if (!pluginHost) return nevoBaseSchema

  const nodeSpecs: Record<string, NodeSpec> = {}
  nevoBaseSchema.spec.nodes.forEach((name, spec) => {
    nodeSpecs[name] = spec
  })

  const markSpecs: Record<string, MarkSpec> = {}
  nevoBaseSchema.spec.marks.forEach((name, spec) => {
    markSpecs[name] = spec
  })

  for (const [name, spec] of pluginHost.registries.nodes.entries()) {
    if (!(name in nodeSpecs)) {
      nodeSpecs[name] = spec
    }
  }

  for (const [name, spec] of pluginHost.registries.marks.entries()) {
    if (!(name in markSpecs)) {
      markSpecs[name] = spec
    }
  }

  return new Schema({ nodes: nodeSpecs, marks: markSpecs })
}
