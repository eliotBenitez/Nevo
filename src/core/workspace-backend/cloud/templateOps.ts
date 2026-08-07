// User-defined templates for a cloud workspace.
//
// Locally these are JSON files under `<workspace>/.nevo/templates/`. A cloud
// workspace has no such directory, so they live in the manifest document —
// keyed per template id, so creating or editing one never rewrites the others,
// and so they sync to every member like the rest of the workspace.
//
// Built-in templates are not stored here: the backend generates them, localized,
// for both kinds of workspace.

import * as Y from 'yjs'
import type { TemplateDocument } from '../../../types/template'
import { plainClone } from './manifest'
import { CLOUD_LOCAL_ORIGIN } from './session'

const TEMPLATES_MAP = 'user_templates'

function templatesMap(ydoc: Y.Doc): Y.Map<TemplateDocument> {
  return ydoc.getMap<TemplateDocument>(TEMPLATES_MAP)
}

export function readUserTemplates(ydoc: Y.Doc): TemplateDocument[] {
  const out: TemplateDocument[] = []
  for (const template of templatesMap(ydoc).values()) {
    if (template) out.push({ ...plainClone(template), builtIn: false })
  }
  return out
}

export function readUserTemplate(ydoc: Y.Doc, templateId: string): TemplateDocument | null {
  const stored = templatesMap(ydoc).get(templateId)
  return stored ? { ...plainClone(stored), builtIn: false } : null
}

export function writeUserTemplate(ydoc: Y.Doc, template: TemplateDocument): void {
  ydoc.transact(() => {
    templatesMap(ydoc).set(template.id, plainClone({ ...template, builtIn: false }))
  }, CLOUD_LOCAL_ORIGIN)
}

/** Removes a template, and its old key too when an edit renamed the id. */
export function deleteUserTemplate(ydoc: Y.Doc, templateId: string): void {
  ydoc.transact(() => {
    templatesMap(ydoc).delete(templateId)
  }, CLOUD_LOCAL_ORIGIN)
}
