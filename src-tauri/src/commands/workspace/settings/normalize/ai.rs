use serde_json::{Map, Value};

use super::clamp_u32;
use crate::commands::workspace::types::WorkspaceSettings;

pub(super) fn apply_ai(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
    let ai = object
        .get("ai")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.ai.enabled = ai
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.ai.privacy_mode = ai
        .get("privacyMode")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.ai.default_provider = ai
        .get("defaultProvider")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "local" | "cloud"))
        .unwrap_or("local")
        .to_string();
    settings.ai.default_model = ai
        .get("defaultModel")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("llama3")
        .to_string();
    settings.ai.slash_commands = ai
        .get("slashCommands")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.ai.contextual_suggestions = ai
        .get("contextualSuggestions")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.ai.streaming_output = ai
        .get("streamingOutput")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.ai.max_tokens_per_request = clamp_u32(
        ai.get("maxTokensPerRequest")
            .and_then(|value| value.as_u64()),
        1024,
        128,
        8192,
    );
    settings.ai.cloud_daily_budget_usd = clamp_u32(
        ai.get("cloudDailyBudgetUsd")
            .and_then(|value| value.as_u64()),
        0,
        0,
        500,
    );
    settings.ai.base_url = ai
        .get("baseUrl")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("http://localhost:11434")
        .to_string();
    settings.ai.api_kind = ai
        .get("apiKind")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "ollama" | "openai"))
        .unwrap_or("ollama")
        .to_string();
}
