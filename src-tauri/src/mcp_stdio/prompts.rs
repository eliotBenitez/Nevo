//! MCP prompts: reusable task recipes that tell an agent which Nevo tools to
//! chain. They only produce text; every action still goes through the tools
//! and therefore through the workspace access mode.

use rmcp::model::{GetPromptResult, JsonObject, Prompt, PromptArgument, PromptMessage, Role};

struct Recipe {
    name: &'static str,
    description: &'static str,
    /// (name, description, required)
    arguments: &'static [(&'static str, &'static str, bool)],
    template: &'static str,
}

const RECIPES: &[Recipe] = &[
    Recipe {
        name: "nevo_summarize_note",
        description: "Summarize one note from the open Nevo workspace.",
        arguments: &[("noteId", "Id of the note to summarize", true)],
        template:
            "Read the Nevo note {noteId} with nevo_read_note and write a concise summary of it: \
the main points, decisions, and open questions. Do not modify the note.",
    },
    Recipe {
        name: "nevo_draft_note",
        description: "Create a new note and write a first draft into it.",
        arguments: &[
            ("title", "Title of the new note", true),
            ("brief", "What the note should cover", true),
            ("folderId", "Folder to create it in (optional)", false),
        ],
        template:
            "Create a Nevo note titled \"{title}\" with nevo_create_note (folderId: {folderId}), \
open it with nevo_open_note, and write a well-structured Markdown draft with nevo_write_markdown \
(mode \"append\") covering: {brief}",
    },
    Recipe {
        name: "nevo_organize_workspace",
        description: "Review the workspace structure and propose a cleaner folder layout.",
        arguments: &[],
        template:
            "List the folders and notes of the open Nevo workspace with nevo_list_folders and \
nevo_list_notes. Propose a clearer folder structure and which notes to move or rename. Ask before \
making any change, then apply the approved ones with nevo_create_folder, nevo_move_note, and \
nevo_rename_note.",
    },
];

pub fn listed() -> Vec<Prompt> {
    RECIPES
        .iter()
        .map(|recipe| {
            let arguments = recipe
                .arguments
                .iter()
                .map(|(name, description, required)| {
                    PromptArgument::new(*name)
                        .with_description(*description)
                        .with_required(*required)
                })
                .collect();
            Prompt::new(recipe.name, Some(recipe.description), Some(arguments))
        })
        .collect()
}

/// Renders a prompt, or explains what is missing.
pub fn render(name: &str, arguments: Option<&JsonObject>) -> Result<GetPromptResult, String> {
    let recipe = RECIPES
        .iter()
        .find(|recipe| recipe.name == name)
        .ok_or_else(|| format!("Unknown Nevo prompt: {name}"))?;
    let mut text = recipe.template.to_string();
    for (argument, _, required) in recipe.arguments {
        let value = arguments
            .and_then(|args| args.get(*argument))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let value = match (value, required) {
            (Some(value), _) => value,
            (None, true) => return Err(format!("Missing required argument: {argument}")),
            (None, false) => "omit for the workspace root",
        };
        text = text.replace(&format!("{{{argument}}}"), value);
    }
    Ok(
        GetPromptResult::new(vec![PromptMessage::new_text(Role::User, text)])
            .with_description(recipe.description),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(value: serde_json::Value) -> JsonObject {
        value.as_object().cloned().expect("object")
    }

    fn text(result: &GetPromptResult) -> String {
        serde_json::to_value(&result.messages[0]).expect("serialize")["content"]["text"]
            .as_str()
            .expect("text")
            .to_string()
    }

    #[test]
    fn prompts_fill_their_arguments() {
        let result = render(
            "nevo_draft_note",
            Some(&args(
                serde_json::json!({ "title": "Plan", "brief": "Q4 goals" }),
            )),
        )
        .expect("render");
        let text = text(&result);
        assert!(text.contains("\"Plan\""), "{text}");
        assert!(text.contains("Q4 goals"), "{text}");
        assert!(text.contains("omit for the workspace root"), "{text}");
        assert!(!text.contains('{'), "{text}");
    }

    #[test]
    fn missing_required_arguments_and_unknown_prompts_fail() {
        assert!(render("nevo_summarize_note", None).is_err());
        assert!(render("nevo_unknown", None).is_err());
        assert!(render("nevo_organize_workspace", None).is_ok());
    }

    #[test]
    fn every_template_placeholder_is_a_declared_argument() {
        for recipe in RECIPES {
            for (argument, _, _) in recipe.arguments {
                assert!(
                    recipe.template.contains(&format!("{{{argument}}}")),
                    "{}: {argument}",
                    recipe.name
                );
            }
            assert_eq!(listed().len(), RECIPES.len());
        }
    }
}
