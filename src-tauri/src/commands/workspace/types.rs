use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub icon: String,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderMeta {
    pub id: String,
    pub title: String,
    pub icon: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    pub order: i32,
    pub children: Vec<FolderMeta>,
    pub notes: Vec<NoteMeta>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrashedItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String, // "note" or "folder"
    pub title: String,
    #[serde(rename = "deletedAt")]
    pub deleted_at: String,
    #[serde(rename = "originalParentId")]
    pub original_parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceManifest {
    pub id: String,
    pub name: String,
    pub glyph: String,
    pub gradient: String,
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "rootOrder")]
    pub root_order: Vec<String>,
    pub tree: Vec<FolderMeta>,
    #[serde(rename = "rootNotes")]
    pub root_notes: Vec<NoteMeta>,
    #[serde(default)]
    pub trash: Vec<TrashedItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceLastContext {
    pub kind: String,
    #[serde(rename = "folderId")]
    pub folder_id: Option<String>,
    #[serde(rename = "noteId")]
    pub note_id: Option<String>,
}

impl Default for WorkspaceLastContext {
    fn default() -> Self {
        Self {
            kind: "workspace".to_string(),
            folder_id: None,
            note_id: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeneralSettings {
    #[serde(rename = "defaultStartupView")]
    pub default_startup_view: String,
    #[serde(rename = "restoreLastContext")]
    pub restore_last_context: bool,
    #[serde(rename = "recentItemsBehavior")]
    pub recent_items_behavior: String,
    #[serde(rename = "confirmBeforeDelete")]
    pub confirm_before_delete: bool,
    #[serde(rename = "lastContext")]
    pub last_context: WorkspaceLastContext,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            default_startup_view: "editor".to_string(),
            restore_last_context: true,
            recent_items_behavior: "remember".to_string(),
            confirm_before_delete: true,
            last_context: WorkspaceLastContext::default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppearanceSettings {
    #[serde(rename = "accentPreset")]
    pub accent_preset: String,
    #[serde(rename = "backgroundScene")]
    pub background_scene: String,
    #[serde(rename = "surfaceStyle")]
    pub surface_style: String,
    #[serde(rename = "contrastMode")]
    pub contrast_mode: String,
    #[serde(rename = "sidebarStyle")]
    pub sidebar_style: String,
    #[serde(rename = "editorFontFamily")]
    pub editor_font_family: String,
    #[serde(rename = "editorFontSize")]
    pub editor_font_size: u32,
    #[serde(rename = "editorLineWidth")]
    pub editor_line_width: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            accent_preset: "violet".to_string(),
            background_scene: "aurora".to_string(),
            surface_style: "glass".to_string(),
            contrast_mode: "balanced".to_string(),
            sidebar_style: "floating".to_string(),
            editor_font_family: "ui".to_string(),
            editor_font_size: 16,
            editor_line_width: "medium".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditorSettings {
    #[serde(rename = "spellCheck")]
    pub spell_check: bool,
    #[serde(rename = "markdownShortcuts")]
    pub markdown_shortcuts: bool,
    #[serde(rename = "slashCommands")]
    pub slash_commands: bool,
    #[serde(rename = "smoothScrolling")]
    pub smooth_scrolling: bool,
    #[serde(rename = "caretAnimation")]
    pub caret_animation: String,
    #[serde(rename = "tabKeyBehavior")]
    pub tab_key_behavior: String,
    #[serde(rename = "autosavePolicy")]
    pub autosave_policy: String,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            spell_check: false,
            markdown_shortcuts: true,
            slash_commands: true,
            smooth_scrolling: true,
            caret_animation: "system".to_string(),
            tab_key_behavior: "indent".to_string(),
            autosave_policy: "immediate".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceBehaviorSettings {
    #[serde(rename = "defaultLandingView")]
    pub default_landing_view: String,
    #[serde(rename = "showBacklinksByDefault")]
    pub show_backlinks_by_default: bool,
    #[serde(rename = "showGraphLabels")]
    pub show_graph_labels: bool,
    #[serde(rename = "folderCreateBehavior")]
    pub folder_create_behavior: String,
    #[serde(rename = "rootNotesVisible")]
    pub root_notes_visible: bool,
    #[serde(rename = "defaultSort")]
    pub default_sort: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "workspaceType", default = "default_workspace_type")]
    pub workspace_type: String,
    #[serde(default = "default_workspace_status")]
    pub status: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "openLastVisitedSystemView", default = "bool_true")]
    pub open_last_visited_system_view: bool,
    #[serde(rename = "rememberExpandedFolders", default = "bool_true")]
    pub remember_expanded_folders: bool,
    #[serde(rename = "sidebarDefaultState", default = "default_sidebar_state")]
    pub sidebar_default_state: String,
    #[serde(rename = "newNotePlacement", default = "default_placement")]
    pub new_note_placement: String,
    #[serde(rename = "newFolderPlacement", default = "default_placement")]
    pub new_folder_placement: String,
    #[serde(rename = "defaultChildSort", default = "default_child_sort")]
    pub default_child_sort: String,
    #[serde(rename = "showEmptyFolders", default = "bool_true")]
    pub show_empty_folders: bool,
    #[serde(rename = "defaultNoteIcon", default = "default_note_icon")]
    pub default_note_icon: String,
    #[serde(
        rename = "defaultNoteTitlePattern",
        default = "default_note_title_pattern"
    )]
    pub default_note_title_pattern: String,
    #[serde(rename = "defaultFolderIcon", default = "default_folder_icon")]
    pub default_folder_icon: String,
    #[serde(rename = "newNoteTemplate", default = "default_note_template")]
    pub new_note_template: String,
    #[serde(rename = "newWorkspaceHomeNote", default = "bool_true")]
    pub new_workspace_home_note: bool,
    #[serde(
        rename = "autoCreateStarterStructure",
        default = "default_starter_structure"
    )]
    pub auto_create_starter_structure: String,
    #[serde(rename = "graphEntryMode", default = "default_graph_entry_mode")]
    pub graph_entry_mode: String,
    #[serde(rename = "graphScopeDefault", default = "default_scope_workspace")]
    pub graph_scope_default: String,
    #[serde(rename = "searchStartScope", default = "default_scope_workspace")]
    pub search_start_scope: String,
    #[serde(rename = "historyDefaultRange", default = "default_history_range")]
    pub history_default_range: String,
    #[serde(rename = "sidebarSortMode", default = "default_sidebar_sort_mode")]
    pub sidebar_sort_mode: String,
}

fn bool_true() -> bool {
    true
}
fn default_workspace_type() -> String {
    "general".to_string()
}
fn default_workspace_status() -> String {
    "active".to_string()
}
fn default_sidebar_state() -> String {
    "expanded".to_string()
}
fn default_placement() -> String {
    "current-folder".to_string()
}
fn default_child_sort() -> String {
    "manual".to_string()
}
fn default_note_icon() -> String {
    "📄".to_string()
}
fn default_note_title_pattern() -> String {
    "untitled".to_string()
}
fn default_folder_icon() -> String {
    "📁".to_string()
}
fn default_note_template() -> String {
    "blank".to_string()
}
fn default_starter_structure() -> String {
    "light".to_string()
}
fn default_graph_entry_mode() -> String {
    "global".to_string()
}
fn default_scope_workspace() -> String {
    "workspace".to_string()
}
fn default_history_range() -> String {
    "30d".to_string()
}
fn default_sidebar_sort_mode() -> String {
    "manual".to_string()
}

impl Default for WorkspaceBehaviorSettings {
    fn default() -> Self {
        Self {
            default_landing_view: "editor".to_string(),
            show_backlinks_by_default: true,
            show_graph_labels: false,
            folder_create_behavior: "current-folder".to_string(),
            root_notes_visible: true,
            default_sort: "updated-desc".to_string(),
            description: String::new(),
            workspace_type: default_workspace_type(),
            status: default_workspace_status(),
            tags: vec![],
            open_last_visited_system_view: true,
            remember_expanded_folders: true,
            sidebar_default_state: default_sidebar_state(),
            new_note_placement: default_placement(),
            new_folder_placement: default_placement(),
            default_child_sort: default_child_sort(),
            show_empty_folders: true,
            default_note_icon: default_note_icon(),
            default_note_title_pattern: default_note_title_pattern(),
            default_folder_icon: default_folder_icon(),
            new_note_template: default_note_template(),
            new_workspace_home_note: true,
            auto_create_starter_structure: default_starter_structure(),
            graph_entry_mode: default_graph_entry_mode(),
            graph_scope_default: default_scope_workspace(),
            search_start_scope: default_scope_workspace(),
            history_default_range: default_history_range(),
            sidebar_sort_mode: default_sidebar_sort_mode(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AISettings {
    pub enabled: bool,
    #[serde(rename = "privacyMode")]
    pub privacy_mode: bool,
    #[serde(rename = "defaultProvider")]
    pub default_provider: String,
    #[serde(rename = "defaultModel")]
    pub default_model: String,
    #[serde(rename = "slashCommands")]
    pub slash_commands: bool,
    #[serde(rename = "contextualSuggestions")]
    pub contextual_suggestions: bool,
    #[serde(rename = "streamingOutput")]
    pub streaming_output: bool,
    #[serde(rename = "maxTokensPerRequest")]
    pub max_tokens_per_request: u32,
    #[serde(rename = "cloudDailyBudgetUsd")]
    pub cloud_daily_budget_usd: u32,
}

impl Default for AISettings {
    fn default() -> Self {
        Self {
            enabled: false,
            privacy_mode: true,
            default_provider: "local".to_string(),
            default_model: "llama3".to_string(),
            slash_commands: false,
            contextual_suggestions: false,
            streaming_output: true,
            max_tokens_per_request: 1024,
            cloud_daily_budget_usd: 0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginsSettings {
    #[serde(rename = "autoReloadOnLaunch")]
    pub auto_reload_on_launch: bool,
    #[serde(rename = "installSource")]
    pub install_source: String,
}

impl Default for PluginsSettings {
    fn default() -> Self {
        Self {
            auto_reload_on_launch: true,
            install_source: "folder-only".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeaturesSettings {
    pub kanban: bool,
    pub templates: bool,
}

impl Default for FeaturesSettings {
    fn default() -> Self {
        Self {
            kanban: true,
            templates: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HotkeyBinding {
    #[serde(rename = "commandId")]
    pub command_id: String,
    pub label: String,
    #[serde(rename = "defaultChord")]
    pub default_chord: String,
    #[serde(rename = "customChord")]
    pub custom_chord: Option<String>,
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HotkeysSettings {
    pub bindings: Vec<HotkeyBinding>,
}

impl Default for HotkeysSettings {
    fn default() -> Self {
        Self {
            bindings: default_hotkey_bindings(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilesSettings {
    #[serde(rename = "attachmentImportBehavior")]
    pub attachment_import_behavior: String,
    #[serde(rename = "snapshotRetentionCount")]
    pub snapshot_retention_count: u32,
    #[serde(
        rename = "trashRetentionDays",
        default = "default_trash_retention_days"
    )]
    pub trash_retention_days: u32,
}

fn default_trash_retention_days() -> u32 {
    30
}

impl Default for FilesSettings {
    fn default() -> Self {
        Self {
            attachment_import_behavior: "copy-into-workspace".to_string(),
            snapshot_retention_count: 50,
            trash_retention_days: 30,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdvancedSettings {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(rename = "experimentalGraphTools")]
    pub experimental_graph_tools: bool,
    #[serde(rename = "developerLogging")]
    pub developer_logging: bool,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            schema_version: 2,
            experimental_graph_tools: false,
            developer_logging: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceSettings {
    pub general: GeneralSettings,
    pub appearance: AppearanceSettings,
    pub editor: EditorSettings,
    pub workspace: WorkspaceBehaviorSettings,
    pub ai: AISettings,
    pub plugins: PluginsSettings,
    #[serde(default)]
    pub features: FeaturesSettings,
    pub hotkeys: HotkeysSettings,
    pub files: FilesSettings,
    pub advanced: AdvancedSettings,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            appearance: AppearanceSettings::default(),
            editor: EditorSettings::default(),
            workspace: WorkspaceBehaviorSettings::default(),
            ai: AISettings::default(),
            plugins: PluginsSettings::default(),
            features: FeaturesSettings::default(),
            hotkeys: HotkeysSettings::default(),
            files: FilesSettings::default(),
            advanced: AdvancedSettings::default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub enabled: bool,
    #[serde(rename = "entryPoint")]
    pub entry_point: String,
    #[serde(rename = "apiVersion", default = "default_api_version")]
    pub api_version: String,
    #[serde(rename = "editorCapabilities", default = "default_editor_capabilities")]
    pub editor_capabilities: Vec<String>,
    #[serde(rename = "nevoVersionRange")]
    pub nevo_version_range: Option<String>,
    #[serde(default)]
    pub priority: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceDiagnostics {
    #[serde(rename = "workspacePath")]
    pub workspace_path: String,
    #[serde(rename = "notesFolderPath")]
    pub notes_folder_path: String,
    #[serde(rename = "assetsFolderPath")]
    pub assets_folder_path: String,
    #[serde(rename = "nevoFolderPath")]
    pub nevo_folder_path: String,
    #[serde(rename = "settingsPath")]
    pub settings_path: String,
    #[serde(rename = "logsPath")]
    pub logs_path: String,
    #[serde(rename = "noteCount")]
    pub note_count: usize,
    #[serde(rename = "folderCount")]
    pub folder_count: usize,
    #[serde(rename = "pluginCount")]
    pub plugin_count: usize,
    #[serde(rename = "snapshotCount")]
    pub snapshot_count: usize,
    #[serde(rename = "assetCount")]
    pub asset_count: usize,
    #[serde(rename = "workspaceBytes")]
    pub workspace_bytes: u64,
    #[serde(rename = "notesBytes")]
    pub notes_bytes: u64,
    #[serde(rename = "assetsBytes")]
    pub assets_bytes: u64,
    #[serde(rename = "snapshotsBytes")]
    pub snapshots_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceCleanupReport {
    #[serde(rename = "removedFiles")]
    pub removed_files: usize,
    #[serde(rename = "bytesFreed")]
    pub bytes_freed: u64,
}

fn default_api_version() -> String {
    "1.0.0".to_string()
}

fn default_editor_capabilities() -> Vec<String> {
    vec!["editor.read".to_string(), "editor.write".to_string()]
}

pub(crate) fn default_hotkey_bindings() -> Vec<HotkeyBinding> {
    vec![
        HotkeyBinding {
            command_id: "core.undo".to_string(),
            label: "Undo".to_string(),
            default_chord: "Ctrl+Z".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.redo".to_string(),
            label: "Redo".to_string(),
            default_chord: "Ctrl+Shift+Z".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.bold".to_string(),
            label: "Bold".to_string(),
            default_chord: "Ctrl+B".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.italic".to_string(),
            label: "Italic".to_string(),
            default_chord: "Ctrl+I".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.strikethrough".to_string(),
            label: "Strikethrough".to_string(),
            default_chord: "Ctrl+Shift+S".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.underline".to_string(),
            label: "Underline".to_string(),
            default_chord: "Ctrl+U".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.kbd".to_string(),
            label: "Keyboard key".to_string(),
            default_chord: "Ctrl+E".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.tag".to_string(),
            label: "Tag".to_string(),
            default_chord: "Ctrl+Shift+T".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.heading.1".to_string(),
            label: "Heading 1".to_string(),
            default_chord: "Ctrl+Alt+1".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.heading.2".to_string(),
            label: "Heading 2".to_string(),
            default_chord: "Ctrl+Alt+2".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.heading.3".to_string(),
            label: "Heading 3".to_string(),
            default_chord: "Ctrl+Alt+3".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.heading.4".to_string(),
            label: "Heading 4".to_string(),
            default_chord: "Ctrl+Alt+4".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.heading.5".to_string(),
            label: "Heading 5".to_string(),
            default_chord: "Ctrl+Alt+5".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.heading.6".to_string(),
            label: "Heading 6".to_string(),
            default_chord: "Ctrl+Alt+6".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.orderedList".to_string(),
            label: "Ordered list".to_string(),
            default_chord: "Ctrl+Shift+7".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.bulletList".to_string(),
            label: "Bullet list".to_string(),
            default_chord: "Ctrl+Shift+8".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.blockquote".to_string(),
            label: "Quote".to_string(),
            default_chord: "Ctrl+Shift+9".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "core.math.inline.insert".to_string(),
            label: "Inline math".to_string(),
            default_chord: "Ctrl+M".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "workspace.new-note".to_string(),
            label: "Create note".to_string(),
            default_chord: "Ctrl+N".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "workspace.new-folder".to_string(),
            label: "Create folder".to_string(),
            default_chord: "Ctrl+Shift+N".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "workspace.save-note".to_string(),
            label: "Save note".to_string(),
            default_chord: "Ctrl+S".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "workspace.search".to_string(),
            label: "Global search".to_string(),
            default_chord: "Ctrl+P".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "workspace.toggle-sidebar".to_string(),
            label: "Toggle sidebar".to_string(),
            default_chord: "Ctrl+\\".to_string(),
            custom_chord: None,
            scope: "workspace".to_string(),
        },
        HotkeyBinding {
            command_id: "app.open-settings".to_string(),
            label: "Open settings".to_string(),
            default_chord: "Ctrl+,".to_string(),
            custom_chord: None,
            scope: "app".to_string(),
        },
    ]
}
