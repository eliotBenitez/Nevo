import type { WorkspaceSettingSearchItem } from '../../types/search'
import type { BuildWorkspaceSettingsSearchItemsOptions } from './settings-helpers'
import { booleanLabel, sectionLabel } from './settings-helpers'

export function buildWorkspaceSearchItems(
  options: BuildWorkspaceSettingsSearchItemsOptions,
): WorkspaceSettingSearchItem[] {
  const { t, manifest, settings } = options
  const sec = sectionLabel(t, 'workspace')

  function item(id: string, title: string, description: string, value: string): WorkspaceSettingSearchItem {
    return { type: 'setting', id: `workspace.${id}`, section: 'workspace', sectionLabel: sec, title, description, value }
  }

  const ws = settings.workspace
  const coming = t('settings.state.coming')

  return [
    item('identity', t('settings.workspace.identity.title'), t('settings.workspace.identity.description'), manifest?.name || 'Nevo'),
    item('workspaceType', t('settings.workspace.workspaceType.title'), t('settings.workspace.workspaceType.description'), coming),
    item('workspaceStatus', t('settings.workspace.workspaceStatus.title'), t('settings.workspace.workspaceStatus.description'), coming),
    item('graphLabels', t('settings.workspace.graphLabels.title'), t('settings.workspace.graphLabels.description'), coming),
    item('openLastVisitedSystemView', t('settings.workspace.openLastVisitedSystemView.title'), t('settings.workspace.openLastVisitedSystemView.description'), coming),
    item('rememberExpandedFolders', t('settings.workspace.rememberExpandedFolders.title'), t('settings.workspace.rememberExpandedFolders.description'), coming),
    item('sidebarDefaultState', t('settings.workspace.sidebarDefaultState.title'), t('settings.workspace.sidebarDefaultState.description'), coming),
    item('rootNotesVisible', t('settings.workspace.rootNotesVisible.title'), t('settings.workspace.rootNotesVisible.description'), booleanLabel(t, ws.rootNotesVisible)),
    item('showBacklinksByDefault', t('settings.workspace.backlinksVisibility.title'), t('settings.workspace.backlinksVisibility.description'), coming),
    item('newNotePlacement', t('settings.workspace.newNotePlacement.title'), t('settings.workspace.newNotePlacement.description'), t(`settings.options.itemPlacement.${ws.newNotePlacement}`)),
    item('newFolderPlacement', t('settings.workspace.newFolderPlacement.title'), t('settings.workspace.newFolderPlacement.description'), t(`settings.options.itemPlacement.${ws.newFolderPlacement}`)),
    item('defaultChildSort', t('settings.workspace.defaultChildSort.title'), t('settings.workspace.defaultChildSort.description'), coming),
    item('showEmptyFolders', t('settings.workspace.showEmptyFolders.title'), t('settings.workspace.showEmptyFolders.description'), coming),
    item('defaultNoteTitlePattern', t('settings.workspace.defaultNoteTitlePattern.title'), t('settings.workspace.defaultNoteTitlePattern.description'), t(`settings.options.noteTitlePattern.${ws.defaultNoteTitlePattern}`)),
    item('newNoteTemplate', t('settings.workspace.newNoteTemplate.title'), t('settings.workspace.newNoteTemplate.description'), t(`settings.options.noteTemplate.${ws.newNoteTemplate}`)),
    item('autoCreateStarterStructure', t('settings.workspace.autoCreateStarterStructure.title'), t('settings.workspace.autoCreateStarterStructure.description'), t(`settings.options.starterStructure.${ws.autoCreateStarterStructure}`)),
    item('graphEntryMode', t('settings.workspace.graphEntryMode.title'), t('settings.workspace.graphEntryMode.description'), coming),
    item('graphScopeDefault', t('settings.workspace.graphScopeDefault.title'), t('settings.workspace.graphScopeDefault.description'), coming),
    item('searchStartScope', t('settings.workspace.searchStartScope.title'), t('settings.workspace.searchStartScope.description'), coming),
    item('historyDefaultRange', t('settings.workspace.historyDefaultRange.title'), t('settings.workspace.historyDefaultRange.description'), coming),
  ]
}
