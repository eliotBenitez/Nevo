mod stopwords;

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use super::search::{flatten_note_blocks, load_workspace_notes};
use super::{note_context, NoteDocument};
use crate::commands::folder::load_manifest;
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace;
use crate::logging::{LogContext, LogError};
use stopwords::STOPWORDS;

const DEFAULT_LIMIT: usize = 8;
const MAX_LIMIT: usize = 20;
const MAX_TERMS: usize = 12;
const MIN_TERM_CHARS: usize = 3;
const PREFIX_CHARS: usize = 5;
const MAX_HITS_PER_NOTE: usize = 3;
const MAX_TEXT_CHARS: usize = 800;

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteContextHit {
    pub note_id: String,
    pub note_title: String,
    pub folder_id: Option<String>,
    pub block_index: usize,
    pub text: String,
    pub score: f64,
}

fn words(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| w.to_lowercase())
}

/// Distinct prefix match keys for the query: whole term if <= 5 chars, else its first 5.
fn query_keys(query: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut keys = Vec::new();
    for term in words(query) {
        if term.chars().count() < MIN_TERM_CHARS || STOPWORDS.contains(&term.as_str()) {
            continue;
        }
        let key: String = term.chars().take(PREFIX_CHARS).collect();
        if seen.insert(key.clone()) {
            keys.push(key);
        }
        if keys.len() == MAX_TERMS {
            break;
        }
    }
    keys
}

fn matched_keys(text: &str, keys: &[String]) -> Vec<usize> {
    let block_words = words(text).collect::<Vec<_>>();
    keys.iter()
        .enumerate()
        .filter(|(_, key)| block_words.iter().any(|w| w.starts_with(key.as_str())))
        .map(|(index, _)| index)
        .collect()
}

fn truncate_text(text: &str) -> String {
    if text.chars().count() <= MAX_TEXT_CHARS {
        return text.to_string();
    }
    let mut out: String = text.chars().take(MAX_TEXT_CHARS).collect();
    out.push('…');
    out
}

fn rank_notes(notes: &[NoteDocument], query: &str, limit: Option<usize>) -> Vec<NoteContextHit> {
    let keys = query_keys(query);
    if keys.is_empty() {
        return vec![];
    }
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);

    struct Block<'a> {
        note: &'a NoteDocument,
        index: usize,
        text: String,
        matched: Vec<usize>,
        title_matched: Vec<usize>,
    }

    let mut total_blocks = 0usize;
    let mut df = vec![0usize; keys.len()];
    let mut candidates = Vec::<Block>::new();
    for note in notes {
        let title_matched = matched_keys(&note.title, &keys);
        for (index, text) in flatten_note_blocks(&note.content).into_iter().enumerate() {
            total_blocks += 1;
            let matched = matched_keys(&text, &keys);
            for &k in &matched {
                df[k] += 1;
            }
            if !matched.is_empty() {
                candidates.push(Block {
                    note,
                    index,
                    text,
                    matched,
                    title_matched: title_matched.clone(),
                });
            }
        }
    }

    let idf = |k: usize| (1.0 + total_blocks as f64 / (1.0 + df[k] as f64)).ln();
    let mut scored = candidates
        .into_iter()
        .map(|block| {
            let score = block.matched.iter().map(|&k| idf(k)).sum::<f64>()
                + block
                    .title_matched
                    .iter()
                    .filter(|k| block.matched.contains(k))
                    .map(|&k| 0.5 * idf(k))
                    .sum::<f64>();
            (score, block)
        })
        .collect::<Vec<_>>();

    scored.sort_by(|(ls, l), (rs, r)| {
        rs.total_cmp(ls)
            .then_with(|| l.note.title.cmp(&r.note.title))
            .then_with(|| l.index.cmp(&r.index))
    });

    let mut per_note = HashMap::<&str, usize>::new();
    let mut hits = Vec::new();
    for (score, block) in scored {
        let count = per_note.entry(block.note.id.as_str()).or_insert(0);
        if *count >= MAX_HITS_PER_NOTE {
            continue;
        }
        *count += 1;
        hits.push(NoteContextHit {
            note_id: block.note.id.clone(),
            note_title: block.note.title.clone(),
            folder_id: block.note.folder_id.clone(),
            block_index: block.index,
            text: truncate_text(&block.text),
            score,
        });
        if hits.len() == limit {
            break;
        }
    }
    hits
}

// Offloaded like search_workspace_blocks: walks and parses every note file.
#[tauri::command]
pub async fn search_note_context(
    workspace_path: String,
    query: String,
    limit: Option<usize>,
    exclude_note_id: Option<String>,
) -> Result<Vec<NoteContextHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_note_context_sync(workspace_path, query, limit, exclude_note_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(crate) fn search_note_context_sync(
    workspace_path: String,
    query: String,
    limit: Option<usize>,
    exclude_note_id: Option<String>,
) -> Result<Vec<NoteContextHit>, String> {
    let logger = crate::logging::logger();
    let workspace_path = normalize_workspace_path(&workspace_path).inspect_err(|message| {
        let _ = logger.error(
            "tauri.note",
            "search_note_context",
            "Failed to normalize workspace path",
            LogContext::default().with_error(LogError {
                kind: Some("path".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
    })?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let diagnostics_enabled = workspace::is_extended_diagnostics_enabled(&workspace_path);

    if query_keys(&query).is_empty() {
        return Ok(vec![]);
    }

    let mut notes = load_workspace_notes(&workspace_path, "search_note_context")?;
    // The caller already sends the open note itself; its blocks must not take result slots.
    notes.retain(|note| Some(&note.id) != exclude_note_id.as_ref());
    // A trashed note keeps its file in notes/; it must not take result slots from live notes.
    if let Ok(manifest) = load_manifest(&workspace_path) {
        let trashed: HashSet<&str> = manifest.trash.iter().map(|item| item.id.as_str()).collect();
        notes.retain(|note| !trashed.contains(note.id.as_str()));
    }
    let hits = rank_notes(&notes, &query, limit);
    let _ = logger.debug(
        "tauri.note",
        "search_note_context",
        "Searched note context",
        diagnostics_enabled,
        note_context(&workspace_path).with_payload(serde_json::json!({
            "queryLength": query.len(),
            "resultCount": hits.len(),
        })),
    );
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn note(id: &str, title: &str, blocks: &[&str]) -> NoteDocument {
        serde_json::from_value(json!({
            "id": id,
            "title": title,
            "icon": "📄",
            "cover": null,
            "folderId": null,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
            "properties": null,
            "content": {
                "type": "doc",
                "content": blocks.iter().map(|text| json!({
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": text }]
                })).collect::<Vec<_>>()
            }
        }))
        .expect("note json")
    }

    #[test]
    fn matches_inflected_forms() {
        let notes = vec![note("a", "Лог", &["Результаты замеров за март", "Другое"])];
        let hits = rank_notes(&notes, "замеры", None);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].block_index, 0);

        let notes = vec![note("b", "Hw", &["The sensor is calibrated"])];
        assert_eq!(rank_notes(&notes, "sensors", None).len(), 1);
    }

    #[test]
    fn rare_term_outranks_common_term() {
        let notes = vec![note(
            "a",
            "N",
            &[
                "budget plan one",
                "budget plan two",
                "budget plan three",
                "budget plan four",
                "zeppelin schedule",
            ],
        )];
        let hits = rank_notes(&notes, "budget zeppelin", None);
        assert_eq!(hits[0].block_index, 4);
        assert!(hits[0].score > hits[1].score);
    }

    #[test]
    fn caps_hits_per_note_and_clamps_limit() {
        let many = vec!["alpha beta"; 6];
        let notes = vec![note("a", "A", &many), note("b", "B", &["alpha only"])];
        let hits = rank_notes(&notes, "alpha", Some(100));
        assert_eq!(hits.iter().filter(|h| h.note_id == "a").count(), 3);
        assert_eq!(hits.len(), 4);
        assert_eq!(rank_notes(&notes, "alpha", Some(0)).len(), 1);
        assert_eq!(rank_notes(&notes, "alpha", Some(2)).len(), 2);

        let many_notes = (0..30)
            .map(|i| note(&format!("n{i}"), "T", &["alpha"]))
            .collect::<Vec<_>>();
        assert_eq!(rank_notes(&many_notes, "alpha", Some(100)).len(), MAX_LIMIT);
        assert_eq!(rank_notes(&many_notes, "alpha", None).len(), DEFAULT_LIMIT);
    }

    #[test]
    fn empty_short_and_stopword_queries_return_nothing() {
        let notes = vec![note("a", "A", &["the and for ab"])];
        assert!(rank_notes(&notes, "", None).is_empty());
        assert!(rank_notes(&notes, "ab", None).is_empty());
        assert!(rank_notes(&notes, "the and what", None).is_empty());
        assert!(rank_notes(&notes, "что как", None).is_empty());
    }

    #[test]
    fn title_match_adds_bonus() {
        let notes = vec![
            note("a", "Roadmap", &["roadmap items"]),
            note("b", "Other", &["roadmap items"]),
        ];
        let hits = rank_notes(&notes, "roadmap", None);
        assert_eq!(hits[0].note_id, "a");
        assert!(hits[0].score > hits[1].score);
    }

    #[test]
    fn truncation_is_char_safe() {
        let long = "ё".repeat(1000) + " замеры";
        let notes = vec![note("a", "A", &[long.as_str()])];
        let hits = rank_notes(&notes, "ёёёёё", None);
        assert_eq!(hits[0].text.chars().count(), MAX_TEXT_CHARS + 1);
        assert!(hits[0].text.ends_with('…'));
    }
}
