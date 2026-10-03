use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::commands::note::notebook::{NOTEBOOK_HEIGHT, NOTEBOOK_WIDTH};

use super::super::typst_export::compile_document;
use super::images::{validate_page_images, ExportImage, ImageEmbedder};

const MAX_EXPORT_BYTES: usize = 100 * 1024 * 1024;
const MAX_PAGES: usize = 1_000;
const MAX_PATHS: usize = 100_000;
const MAX_COMMANDS: usize = 8_000_000;
const MAX_COORDINATE: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookExportPage {
    width: f64,
    height: f64,
    paper: ExportPaper,
    paths: Vec<ExportPath>,
    #[serde(default)]
    images: Vec<ExportImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExportPaper {
    kind: String,
    #[serde(default)]
    lines: Vec<PaperLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PaperLine {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExportPath {
    color: String,
    opacity: f64,
    commands: Vec<PathCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum PathCommand {
    #[serde(rename = "M")]
    Move { x: f64, y: f64 },
    #[serde(rename = "Q")]
    Quadratic { cx: f64, cy: f64, x: f64, y: f64 },
    #[serde(rename = "L")]
    Line { x: f64, y: f64 },
    #[serde(rename = "Z")]
    Close,
}

pub(super) fn validate_export_pages(pages: &[NotebookExportPage]) -> Result<(), String> {
    if pages.is_empty() || pages.len() > MAX_PAGES {
        return Err("Notebook PDF page count is outside the supported range".to_string());
    }
    let mut paths = 0usize;
    let mut commands = 0usize;
    let mut images = 0usize;
    for page in pages {
        if page.width != NOTEBOOK_WIDTH || page.height != NOTEBOOK_HEIGHT {
            return Err("Notebook PDF pages must use the supported A4 dimensions".to_string());
        }
        if !matches!(page.paper.kind.as_str(), "plain" | "grid" | "ruled") {
            return Err("Notebook PDF contains an unsupported paper kind".to_string());
        }
        for line in &page.paper.lines {
            for value in [line.x1, line.y1, line.x2, line.y2] {
                validate_coordinate(value)?;
            }
        }
        paths = paths.saturating_add(page.paths.len());
        if paths > MAX_PATHS {
            return Err("Notebook PDF path count exceeds the supported limit".to_string());
        }
        validate_page_images(&page.images, page.paths.len(), &mut images)?;
        for path in &page.paths {
            if !valid_color(&path.color)
                || !path.opacity.is_finite()
                || !(0.0..=1.0).contains(&path.opacity)
            {
                return Err("Notebook PDF path style is invalid".to_string());
            }
            if path.commands.is_empty()
                || !matches!(path.commands.first(), Some(PathCommand::Move { .. }))
                || !matches!(path.commands.last(), Some(PathCommand::Close))
            {
                return Err("Notebook PDF path must be a closed outline".to_string());
            }
            commands = commands.saturating_add(path.commands.len());
            if commands > MAX_COMMANDS {
                return Err("Notebook PDF geometry exceeds the supported limit".to_string());
            }
            // Closed shapes are rings: an outer and a reversed inner contour in one path
            // (filled with the default nonzero rule). Each extra subpath may only start
            // right after the previous one was closed.
            let mut previous_closed = true;
            for command in &path.commands {
                match command {
                    PathCommand::Move { x, y } | PathCommand::Line { x, y } => {
                        validate_coordinate(*x)?;
                        validate_coordinate(*y)?;
                        if matches!(command, PathCommand::Move { .. }) && !previous_closed {
                            return Err(
                                "Notebook PDF path starts a subpath before closing the previous one"
                                    .to_string(),
                            );
                        }
                    }
                    PathCommand::Quadratic { cx, cy, x, y } => {
                        validate_coordinate(*cx)?;
                        validate_coordinate(*cy)?;
                        validate_coordinate(*x)?;
                        validate_coordinate(*y)?;
                    }
                    PathCommand::Close => {}
                }
                previous_closed = matches!(command, PathCommand::Close);
            }
        }
    }
    let serialized = serde_json::to_vec(pages).map_err(|error| error.to_string())?;
    if serialized.len() > MAX_EXPORT_BYTES {
        return Err("Notebook PDF input exceeds the supported size limit".to_string());
    }
    Ok(())
}

pub(super) fn render_notebook_pdf(
    pages: Vec<NotebookExportPage>,
    workspace_root: &Path,
) -> Result<Vec<u8>, String> {
    validate_export_pages(&pages)?;
    let mut source = String::new();
    let mut assets = Vec::with_capacity(pages.len());
    let mut embedder = ImageEmbedder::new(workspace_root);
    for (index, page) in pages.iter().enumerate() {
        if index > 0 {
            source.push_str("\n#pagebreak()\n");
        }
        source.push_str(&format!(
            "#set page(width: {}pt, height: {}pt, margin: 0pt)\n#image(\"page-{index}.svg\", width: {}pt, height: {}pt)\n",
            number(page.width), number(page.height), number(page.width), number(page.height)
        ));
        assets.push((
            format!("page-{index}.svg"),
            render_page_svg(page, &mut embedder).into_bytes(),
        ));
    }
    let document = compile_document(source, assets)?;
    let pdf = typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|errors| format!("PDF compilation failed: {errors:?}"))?;
    Ok(pdf)
}

fn render_page_svg(page: &NotebookExportPage, embedder: &mut ImageEmbedder) -> String {
    let mut svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"{}pt\" height=\"{}pt\" viewBox=\"0 0 {} {}\"><defs><clipPath id=\"page\"><rect width=\"{}\" height=\"{}\"/></clipPath></defs><rect width=\"{}\" height=\"{}\" fill=\"white\"/><g clip-path=\"url(#page)\">",
        number(page.width), number(page.height), number(page.width), number(page.height), number(page.width), number(page.height), number(page.width), number(page.height)
    );
    for line in &page.paper.lines {
        svg.push_str(&format!(
            "<path d=\"M {} {} L {} {}\" fill=\"none\" stroke=\"#e6e6e6\" stroke-width=\"0.5\"/>",
            number(line.x1),
            number(line.y1),
            number(line.x2),
            number(line.y2)
        ));
    }
    // Stable sort keeps the original order of images sharing a path index.
    let mut images = page.images.iter().collect::<Vec<_>>();
    images.sort_by_key(|image| image.path_index);
    let mut images = images.into_iter().peekable();
    for (index, path) in page.paths.iter().enumerate() {
        while let Some(image) = images.next_if(|image| image.path_index <= index) {
            svg.push_str(&embedder.element(image));
        }
        let data = path
            .commands
            .iter()
            .map(command_svg)
            .collect::<Vec<_>>()
            .join(" ");
        svg.push_str(&format!(
            "<path d=\"{data}\" fill=\"{}\" fill-opacity=\"{}\"/>",
            path.color,
            number(path.opacity)
        ));
    }
    for image in images {
        svg.push_str(&embedder.element(image));
    }
    svg.push_str("</g></svg>");
    svg
}

fn command_svg(command: &PathCommand) -> String {
    match command {
        PathCommand::Move { x, y } => format!("M {} {}", number(*x), number(*y)),
        PathCommand::Quadratic { cx, cy, x, y } => format!(
            "Q {} {} {} {}",
            number(*cx),
            number(*cy),
            number(*x),
            number(*y)
        ),
        PathCommand::Line { x, y } => format!("L {} {}", number(*x), number(*y)),
        PathCommand::Close => "Z".to_string(),
    }
}

fn validate_coordinate(value: f64) -> Result<(), String> {
    if !value.is_finite() || value.abs() > MAX_COORDINATE {
        return Err("Notebook PDF contains an invalid coordinate".to_string());
    }
    Ok(())
}

fn valid_color(color: &str) -> bool {
    let bytes = color.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

pub(super) fn number(value: f64) -> String {
    let rounded = format!("{value:.6}").parse::<f64>().unwrap_or(0.0);
    if rounded == 0.0 {
        "0".to_string()
    } else {
        rounded.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(paths: Vec<ExportPath>) -> NotebookExportPage {
        NotebookExportPage {
            width: 595.28,
            height: 841.89,
            paper: ExportPaper {
                kind: "plain".to_string(),
                lines: vec![],
            },
            paths,
            images: vec![],
        }
    }

    fn path() -> ExportPath {
        ExportPath {
            color: "#102030".to_string(),
            opacity: 0.75,
            commands: vec![
                PathCommand::Move { x: 1.0, y: 2.0 },
                PathCommand::Quadratic {
                    cx: 3.0,
                    cy: 4.0,
                    x: 5.0,
                    y: 6.0,
                },
                PathCommand::Line { x: 7.0, y: 8.0 },
                PathCommand::Close,
            ],
        }
    }

    #[test]
    fn renders_svg_with_clipping_paper_and_ordered_vector_paths() {
        let mut page = page(vec![path()]);
        page.paper.kind = "grid".to_string();
        page.paper.lines.push(PaperLine {
            x1: 0.0,
            y1: 5.0,
            x2: 595.28,
            y2: 5.0,
        });
        let svg = render_page_svg(&page, &mut ImageEmbedder::new(Path::new(".")));
        assert!(svg.contains("clip-path=\"url(#page)\""));
        assert!(svg.contains("#e6e6e6"));
        assert!(svg.contains("M 1 2 Q 3 4 5 6 L 7 8 Z"));
        assert!(svg.contains("fill-opacity=\"0.75\""));
    }

    #[test]
    fn compiles_blank_and_mixed_pages_to_exact_pdf_page_counts() {
        let blank_pdf =
            render_notebook_pdf(vec![page(vec![])], Path::new(".")).expect("blank page PDF");
        assert_eq!(pdf_page_count(&blank_pdf), 1);
        let blank_pdf_text = String::from_utf8_lossy(&blank_pdf);
        assert!(blank_pdf_text.contains("595.28"));
        assert!(blank_pdf_text.contains("841.89"));

        let mixed_pdf = render_notebook_pdf(vec![page(vec![]), page(vec![path()])], Path::new("."))
            .expect("mixed page PDF");
        assert_eq!(pdf_page_count(&mixed_pdf), 2);
    }

    fn pdf_page_count(pdf: &[u8]) -> usize {
        let marker = b"/Type /Page";
        pdf.windows(marker.len() + 1)
            .filter(|window| &window[..marker.len()] == marker && window[marker.len()] != b's')
            .count()
    }

    #[test]
    fn rejects_invalid_vector_commands_and_untrusted_colors() {
        let mut invalid_size = page(vec![path()]);
        invalid_size.width = 594.28;
        assert!(validate_export_pages(&[invalid_size]).is_err());

        let mut invalid = path();
        invalid.color = "red\"><script>".to_string();
        assert!(validate_export_pages(&[page(vec![invalid])]).is_err());

        let mut invalid = path();
        invalid.commands[0] = PathCommand::Move {
            x: f64::NAN,
            y: 0.0,
        };
        assert!(validate_export_pages(&[page(vec![invalid])]).is_err());
    }

    #[test]
    fn accepts_closed_ring_paths_and_rejects_unclosed_subpaths() {
        let contour = |offset: f64| {
            vec![
                PathCommand::Move {
                    x: 10.0 + offset,
                    y: 10.0 + offset,
                },
                PathCommand::Line {
                    x: 90.0 - offset,
                    y: 10.0 + offset,
                },
                PathCommand::Line {
                    x: 90.0 - offset,
                    y: 90.0 - offset,
                },
                PathCommand::Line {
                    x: 10.0 + offset,
                    y: 90.0 - offset,
                },
                PathCommand::Close,
            ]
        };
        let mut ring = path();
        ring.commands = [contour(0.0), contour(2.0)].concat();
        let pages = vec![page(vec![ring])];
        assert!(validate_export_pages(&pages).is_ok());
        let pdf = render_notebook_pdf(pages, Path::new(".")).expect("ring PDF");
        assert!(pdf.starts_with(b"%PDF"));

        let mut unclosed = path();
        unclosed.commands = vec![
            PathCommand::Move { x: 1.0, y: 1.0 },
            PathCommand::Line { x: 5.0, y: 1.0 },
            PathCommand::Move { x: 9.0, y: 9.0 },
            PathCommand::Line { x: 9.0, y: 12.0 },
            PathCommand::Close,
        ];
        assert!(validate_export_pages(&[page(vec![unclosed])]).is_err());
    }

    fn workspace_with_assets() -> (std::path::PathBuf, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("nevo_exp_pdf_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join(".nevo/assets")).unwrap();
        std::fs::write(
            dir.join(".nevo/assets/ok.png"),
            super::super::images::tests::PNG_2X2,
        )
        .unwrap();
        std::fs::write(dir.join(".nevo/assets/garbage.png"), b"garbage bytes").unwrap();
        let root = dir.canonicalize().unwrap();
        (dir, root)
    }

    fn image(src: &str, path_index: usize) -> ExportImage {
        ExportImage {
            id: format!("img-{src}-{path_index}"),
            src: src.to_string(),
            opacity: 0.5,
            matrix: [200.0, 0.0, 0.0, 100.0, 30.0, 40.0],
            path_index,
        }
    }

    #[test]
    fn interleaves_images_with_paths_by_path_index() {
        let (dir, root) = workspace_with_assets();
        let mut page = page(vec![path(), path()]);
        page.images = vec![
            image(".nevo/assets/ok.png", 2),
            image(".nevo/assets/ok.png", 1),
            image(".nevo/assets/garbage.png", 1),
            image(".nevo/assets/ok.png", 0),
        ];
        let svg = render_page_svg(&page, &mut ImageEmbedder::new(&root));
        let tags = svg
            .match_indices("<image ")
            .map(|(index, _)| ("image", index))
            .chain(
                svg.match_indices("fill-opacity")
                    .map(|(index, _)| ("path", index)),
            )
            .chain(
                svg.match_indices("#d9d9d9")
                    .map(|(index, _)| ("hole", index)),
            )
            .collect::<Vec<_>>();
        let mut ordered = tags.clone();
        ordered.sort_by_key(|(_, index)| *index);
        let kinds = ordered.iter().map(|(kind, _)| *kind).collect::<Vec<_>>();
        assert_eq!(
            kinds,
            ["image", "path", "image", "hole", "path", "image"],
            "images must keep path_index order, ties keep input order"
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn pdf_contains_image_xobject_and_survives_bad_images() {
        let (dir, root) = workspace_with_assets();
        let mut with_image = page(vec![path()]);
        with_image.images = vec![image(".nevo/assets/ok.png", 0)];
        let pdf = render_notebook_pdf(vec![with_image], &root).expect("PDF with image");
        let text = String::from_utf8_lossy(&pdf);
        assert!(
            text.contains("/Subtype /Image") || text.contains("/Subtype/Image"),
            "PDF must embed the raster image"
        );

        let mut broken = page(vec![path()]);
        broken.images = vec![
            image(".nevo/assets/missing.png", 0),
            image(".nevo/assets/garbage.png", 1),
            image("../../etc/passwd.png", 1),
        ];
        let pdf = render_notebook_pdf(vec![broken], &root).expect("placeholders keep export alive");
        assert!(pdf.starts_with(b"%PDF"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_invalid_image_geometry_and_indexes() {
        let mut bad_matrix = page(vec![path()]);
        bad_matrix.images = vec![image("x.png", 0)];
        bad_matrix.images[0].matrix = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        assert!(validate_export_pages(&[bad_matrix]).is_err());

        let mut bad_index = page(vec![path()]);
        bad_index.images = vec![image("x.png", 2)];
        assert!(validate_export_pages(&[bad_index]).is_err());

        let mut ok = page(vec![path()]);
        ok.images = vec![image("x.png", 1)];
        assert!(validate_export_pages(&[ok]).is_ok());
    }
}
