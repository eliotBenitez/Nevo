import type { NevoEditorPluginManifest, NevoWorkspaceCapability } from '../../types/editor-plugin'

const WORKSPACE_COMMAND_CAPABILITIES: Readonly<Record<string, NevoWorkspaceCapability>> = {
  template_list: 'template.read',
  template_get: 'template.read',
  template_create: 'template.write',
  template_update: 'template.write',
  template_delete: 'template.write',
  template_create_note: 'template.write',
  kanban_list_boards: 'kanban.read',
  kanban_list_cards: 'kanban.read',
  kanban_create_board: 'kanban.write',
  kanban_update_board: 'kanban.write',
  kanban_delete_board: 'kanban.write',
  kanban_create_card: 'kanban.write',
  kanban_update_card: 'kanban.write',
  kanban_delete_card: 'kanban.write',
  kanban_move_card: 'kanban.write',
  kanban_save_board_schema: 'kanban.write',
}

export function workspaceCommandCapability(commandId: string): NevoWorkspaceCapability | null {
  return WORKSPACE_COMMAND_CAPABILITIES[commandId] ?? null
}

export function assertWorkspaceCommandCapability(
  manifest: NevoEditorPluginManifest,
  commandId: string,
): void {
  const capability = workspaceCommandCapability(commandId)
  if (!capability) throw new Error(`Workspace command is not exposed to plugins: ${commandId}`)
  const capabilities = manifest.executionMode === 'sandboxed-worker'
    ? (manifest.capabilities ?? [])
    : (manifest.workspaceCapabilities ?? [])
  if (!capabilities.includes(capability)) {
    throw new Error(`Plugin ${manifest.id} requires capability ${capability}`)
  }
}
