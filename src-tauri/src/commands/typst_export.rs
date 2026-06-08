use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Deserialize;
use std::fs::File;
use std::io::{Seek, Write};
use std::path::Path;
use typst::layout::PagedDocument;
use typst_as_lib::typst_kit_options::TypstKitFontOptions;
use typst_as_lib::TypstEngine;
use zip::write::FileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

use super::path_utils::normalize_workspace_path;
use crate::logging::{LogContext, LogError};

/// A file made available to the Typst compiler: either inline bytes (base64,
/// e.g. a rasterised mermaid diagram) or a workspace-relative path (an image).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstAsset {
    name: String,
    #[serde(default)]
    bytes_base64: Option<String>,
    #[serde(default)]
    rel_path: Option<String>,
}

fn resolve_assets(
    workspace: &Path,
    assets: &[TypstAsset],
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut resolved = Vec::with_capacity(assets.len());
    for asset in assets {
        let bytes = if let Some(b64) = &asset.bytes_base64 {
            STANDARD
                .decode(b64)
                .map_err(|err| format!("asset {}: {}", asset.name, err))?
        } else if let Some(rel) = &asset.rel_path {
            std::fs::read(workspace.join(rel)).map_err(|err| format!("asset {}: {}", rel, err))?
        } else {
            continue;
        };
        resolved.push((asset.name.clone(), bytes));
    }
    Ok(resolved)
}

fn compile_document(
    source: String,
    assets: Vec<(String, Vec<u8>)>,
) -> Result<PagedDocument, String> {
    let engine = TypstEngine::builder()
        .with_static_source_file_resolver([("main.typ", source)])
        .with_static_file_resolver(
            assets
                .iter()
                .map(|(name, bytes)| (name.as_str(), bytes.clone())),
        )
        .search_fonts_with(
            TypstKitFontOptions::default()
                .include_system_fonts(true)
                .include_embedded_fonts(true),
        )
        .build();

    engine
        .compile("main.typ")
        .output
        .map_err(|err| format!("Typst compilation failed: {err}"))
}

fn log_failure(stage: &str, workspace: &str, message: &str) {
    let _ = crate::logging::logger().error(
        "tauri.typst",
        stage,
        message,
        LogContext::default().with_error(LogError {
            kind: Some("typst".to_string()),
            message: message.to_string(),
            details: None,
        }),
    );
    let _ = workspace;
}

fn archive_stem(export_path: &str) -> String {
    Path::new(export_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace('/', "_").replace('\\', "_"))
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| "note".to_string())
}

fn archive_asset_entry(stem: &str, name: &str) -> Result<String, String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') {
        return Err(format!("invalid archive asset name: {name}"));
    }
    Ok(format!("{stem}_assets/{name}"))
}

fn write_typst_archive<W: Write + Seek>(
    writer: W,
    stem: &str,
    typst_source: String,
    assets: Vec<(String, Vec<u8>)>,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(writer);
    let options = FileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file(format!("{stem}.typ"), options)
        .map_err(|err| err.to_string())?;
    zip.write_all(typst_source.as_bytes())
        .map_err(|err| err.to_string())?;

    for (name, bytes) in assets {
        zip.start_file(archive_asset_entry(stem, &name)?, options)
            .map_err(|err| err.to_string())?;
        zip.write_all(&bytes).map_err(|err| err.to_string())?;
    }

    zip.finish().map_err(|err| err.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn compiles_representative_source() {
        // Includes constructs that previously broke compilation: a bold run
        // immediately followed by `(...)`, set-theory symbols, and adjacent
        // single-letter math variables.
        let source = r##"#set document(title: "Doc")
#set page(paper: "a4", flipped: false, margin: (top: 25mm, right: 20mm, bottom: 25mm, left: 20mm), numbering: "1", header: [#text(8pt, fill: luma(120))[Doc #h(1fr) 2026-06-01]])
#set text(size: 11pt, font: ("Times New Roman", "Libertinus Serif"))
#set par(justify: true, leading: 0.65em, spacing: 1em)
#show link: set text(fill: rgb("#2f6fdb"))
#set heading(numbering: "1.1.")
#align(center + horizon)[#text(26pt, weight: "bold")[Doc]
#v(0.8em)
#text(11pt, fill: luma(120))[2026-06-01]]
#pagebreak()
#outline()
#heading(level: 1, numbering: none, outlined: false)[Doc]

== Title

#strong[bold]\(Dirty Read\) and #emph[italic] and #raw("inline")

#raw(block: true, lang: "rust", "fn main() {}")

#quote(block: true)[a quote]

#list(
  [one],
  [two]
)

$ frac(1, 2) $

text with $x^(2)$ and $A subset.eq B$ and $X Z$ inline

a #link("nevo://note/abc-123")[note reference] here

#align(center)[#table(
  columns: 2,
  [a], [b], [c], [d]
)]
"##;
        match compile_document(source.to_string(), Vec::new()) {
            Ok(doc) => {
                let png = typst_render::render(&doc.pages[0], 2.0).encode_png();
                assert!(png.is_ok(), "render failed: {:?}", png.err());
            }
            Err(err) => panic!("compile failed: {err}"),
        }
    }

    /// Verifies the core assumption behind the Mermaid PDF fix: that Typst's usvg
    /// rasteriser resolves the embedded font ("Libertinus Serif") for SVG <text>
    /// and actually draws glyphs. If the font did not resolve, usvg would skip the
    /// text and the rendered page would have (almost) no dark pixels.
    #[test]
    fn renders_svg_text_with_embedded_font() {
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">
  <rect width="300" height="80" fill="white"/>
  <text x="10" y="50" font-family="Libertinus Serif" font-size="40" fill="black">Hello Diagram</text>
</svg>"##;

        let source = "#image(\"diagram.svg\", width: 100%)".to_string();
        let assets = vec![("diagram.svg".to_string(), svg.as_bytes().to_vec())];

        let doc = compile_document(source, assets).expect("compile svg image");
        let pixmap = typst_render::render(&doc.pages[0], 2.0);

        // Count clearly dark pixels (the glyph strokes). White background and the
        // antialiased page yield none; rendered black text yields hundreds.
        let data = pixmap.data();
        let dark = data
            .chunks_exact(4)
            .filter(|px| px[3] > 128 && px[0] < 100 && px[1] < 100 && px[2] < 100)
            .count();

        assert!(
            dark > 200,
            "expected rendered SVG text glyphs (dark pixels), got {dark}; \
             usvg likely failed to resolve the embedded font"
        );
    }

    /// Confirms the actual root cause of missing Mermaid text: usvg ignores SVG
    /// <foreignObject> entirely (0 glyph pixels), whereas the same label in a native
    /// SVG <text> element renders. This is why the fix forces Mermaid to emit
    /// <text> (htmlLabels:false) rather than HTML-in-foreignObject.
    #[test]
    fn usvg_ignores_foreign_object_but_renders_svg_text() {
        let render_dark = |svg: &str| {
            let source = "#image(\"d.svg\", width: 100%)".to_string();
            let assets = vec![("d.svg".to_string(), svg.as_bytes().to_vec())];
            let doc = compile_document(source, assets).expect("compile svg");
            typst_render::render(&doc.pages[0], 2.0)
                .data()
                .chunks_exact(4)
                .filter(|px| px[3] > 128 && px[0] < 100 && px[1] < 100 && px[2] < 100)
                .count()
        };

        let foreign = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">
  <rect width="300" height="80" fill="white"/>
  <foreignObject x="10" y="10" width="280" height="60"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:40px;color:black">Label</div></foreignObject>
</svg>"##;
        let native = r##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">
  <rect width="300" height="80" fill="white"/>
  <text x="10" y="50" font-size="40" fill="black">Label</text>
</svg>"##;

        assert_eq!(render_dark(foreign), 0, "usvg should ignore foreignObject");
        assert!(render_dark(native) > 200, "usvg should render SVG <text>");
    }

    #[test]
    fn archive_export_writes_typst_file_and_assets() {
        let base =
            std::env::temp_dir().join(format!("nevo-typst-archive-{}", uuid::Uuid::new_v4()));
        let workspace = base.join("workspace");
        let assets_dir = workspace.join("assets");
        std::fs::create_dir_all(&assets_dir).expect("create asset dir");
        std::fs::write(assets_dir.join("pic.png"), b"png-bytes").expect("write image asset");

        let export_path = base.join("Doc-typst.zip");
        let result = run_archive_export(
            &workspace.to_string_lossy(),
            &export_path.to_string_lossy(),
            "#figure(image(\"Doc-typst_assets/img-1.png\"))\n#figure(image(\"Doc-typst_assets/mermaid-1.svg\"))".to_string(),
            vec![
                TypstAsset {
                    name: "img-1.png".to_string(),
                    bytes_base64: None,
                    rel_path: Some("assets/pic.png".to_string()),
                },
                TypstAsset {
                    name: "mermaid-1.svg".to_string(),
                    bytes_base64: Some(STANDARD.encode("<svg></svg>")),
                    rel_path: None,
                },
            ],
        );

        assert!(result.is_ok(), "archive export failed: {:?}", result.err());

        let file = File::open(&export_path).expect("open archive");
        let mut archive = zip::ZipArchive::new(file).expect("read archive");

        let mut typst = String::new();
        archive
            .by_name("Doc-typst.typ")
            .expect("typst entry")
            .read_to_string(&mut typst)
            .expect("read typst");
        assert!(typst.contains("Doc-typst_assets/img-1.png"));

        let mut copied_asset = Vec::new();
        archive
            .by_name("Doc-typst_assets/img-1.png")
            .expect("copied asset entry")
            .read_to_end(&mut copied_asset)
            .expect("read copied asset");
        assert_eq!(copied_asset, b"png-bytes");

        let mut inline_asset = String::new();
        archive
            .by_name("Doc-typst_assets/mermaid-1.svg")
            .expect("inline asset entry")
            .read_to_string(&mut inline_asset)
            .expect("read inline asset");
        assert_eq!(inline_asset, "<svg></svg>");

        let _ = std::fs::remove_dir_all(base);
    }
}

// Typst compilation is CPU-bound and would freeze the webview if run on the
// command thread. The sync `run_*` helpers below execute the heavy work and are
// dispatched onto a blocking thread pool by the async command wrappers.

fn run_export(
    workspace_path: &str,
    export_path: &str,
    typst_source: String,
    assets: Vec<TypstAsset>,
) -> Result<(), String> {
    let on_err = |message: String| {
        log_failure("export_note_pdf", workspace_path, &message);
        message
    };

    let workspace = normalize_workspace_path(workspace_path).map_err(on_err)?;
    let resolved = resolve_assets(&workspace, &assets).map_err(on_err)?;
    let document = compile_document(typst_source, resolved).map_err(on_err)?;
    let pdf = typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|errors| on_err(format!("PDF export failed: {errors:?}")))?;
    std::fs::write(export_path, pdf).map_err(|err| on_err(err.to_string()))?;
    Ok(())
}

fn run_preview(
    workspace_path: &str,
    typst_source: String,
    assets: Vec<TypstAsset>,
) -> Result<Vec<String>, String> {
    let on_err = |message: String| {
        log_failure("render_note_pdf_preview", workspace_path, &message);
        message
    };

    let workspace = normalize_workspace_path(workspace_path).map_err(on_err)?;
    let resolved = resolve_assets(&workspace, &assets).map_err(on_err)?;
    let document = compile_document(typst_source, resolved).map_err(on_err)?;

    // 2x device pixels keeps the on-screen preview crisp without large payloads.
    let mut pages = Vec::with_capacity(document.pages.len());
    for page in &document.pages {
        let pixmap = typst_render::render(page, 2.0);
        let png = pixmap
            .encode_png()
            .map_err(|err| on_err(format!("preview render failed: {err}")))?;
        pages.push(STANDARD.encode(png));
    }
    Ok(pages)
}

fn run_archive_export(
    workspace_path: &str,
    export_path: &str,
    typst_source: String,
    assets: Vec<TypstAsset>,
) -> Result<(), String> {
    let on_err = |message: String| {
        log_failure("export_note_typst_archive", workspace_path, &message);
        message
    };

    let workspace = normalize_workspace_path(workspace_path).map_err(on_err)?;
    let resolved = resolve_assets(&workspace, &assets).map_err(on_err)?;
    let file = File::create(export_path).map_err(|err| on_err(err.to_string()))?;
    write_typst_archive(file, &archive_stem(export_path), typst_source, resolved)
        .map_err(on_err)?;
    Ok(())
}

#[tauri::command]
pub async fn export_note_pdf(
    workspace_path: String,
    export_path: String,
    typst_source: String,
    assets: Vec<TypstAsset>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_export(&workspace_path, &export_path, typst_source, assets)
    })
    .await
    .map_err(|err| format!("export task failed: {err}"))?
}

#[tauri::command]
pub async fn export_note_typst_archive(
    workspace_path: String,
    export_path: String,
    typst_source: String,
    assets: Vec<TypstAsset>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_archive_export(&workspace_path, &export_path, typst_source, assets)
    })
    .await
    .map_err(|err| format!("export task failed: {err}"))?
}

#[tauri::command]
pub async fn render_note_pdf_preview(
    workspace_path: String,
    typst_source: String,
    assets: Vec<TypstAsset>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || run_preview(&workspace_path, typst_source, assets))
        .await
        .map_err(|err| format!("preview task failed: {err}"))?
}
