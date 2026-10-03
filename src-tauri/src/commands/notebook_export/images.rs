//! Raster image support for the notebook PDF export: IPC type, validation and
//! SVG embedding. `src` values come from note.json and are untrusted; they are
//! only ever resolved through `notebook_image_asset`.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::commands::path_utils::notebook_image_asset;

use super::render::number;

const MAX_IMAGES_PER_PAGE: usize = 1_000;
const MAX_IMAGES_TOTAL: usize = 10_000;
const MAX_EMBEDDED_IMAGE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_COORDINATE: f64 = 9_007_199_254_740_991.0;

/// A raster image placed on a page. `matrix` is the SVG `matrix(a b c d e f)`
/// mapping the unit square onto the image quad; `path_index` is the index in
/// the page's `paths` before which the image is drawn.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportImage {
    pub(super) id: String,
    pub(super) src: String,
    pub(super) opacity: f64,
    pub(super) matrix: [f64; 6],
    pub(super) path_index: usize,
}

pub(super) fn validate_page_images(
    images: &[ExportImage],
    path_count: usize,
    total: &mut usize,
) -> Result<(), String> {
    *total = total.saturating_add(images.len());
    if images.len() > MAX_IMAGES_PER_PAGE || *total > MAX_IMAGES_TOTAL {
        return Err("Notebook PDF image count exceeds the supported limit".to_string());
    }
    for image in images {
        let [a, b, c, d, ..] = image.matrix;
        let finite = image
            .matrix
            .iter()
            .all(|value| value.is_finite() && value.abs() <= MAX_COORDINATE);
        if image.id.is_empty()
            || !(0.0..=1.0).contains(&image.opacity)
            || image.path_index > path_count
            || !finite
            || (a * d - b * c).abs() <= 1e-9
        {
            return Err("Notebook PDF image is invalid".to_string());
        }
    }
    Ok(())
}

/// Resolves, reads and embeds images. Any image that cannot be embedded
/// (missing file, unknown format, byte budget exhausted) becomes a placeholder
/// so one bad asset never fails the whole export.
pub(super) struct ImageEmbedder<'a> {
    root: &'a Path,
    remaining: u64,
}

impl<'a> ImageEmbedder<'a> {
    pub(super) fn new(root: &'a Path) -> Self {
        Self::with_budget(root, MAX_EMBEDDED_IMAGE_BYTES)
    }

    fn with_budget(root: &'a Path, budget: u64) -> Self {
        Self {
            root,
            remaining: budget,
        }
    }

    pub(super) fn element(&mut self, image: &ExportImage) -> String {
        let matrix = image
            .matrix
            .iter()
            .map(|value| number(*value))
            .collect::<Vec<_>>()
            .join(" ");
        match self.load(&image.src) {
            Some((mime, bytes)) => {
                let uri = format!("data:{mime};base64,{}", STANDARD.encode(bytes));
                format!(
                    "<image href=\"{uri}\" width=\"1\" height=\"1\" preserveAspectRatio=\"none\" transform=\"matrix({matrix})\" opacity=\"{}\"/>",
                    number(image.opacity)
                )
            }
            None => placeholder(&image.matrix),
        }
    }

    fn load(&mut self, src: &str) -> Option<(&'static str, Vec<u8>)> {
        let path = notebook_image_asset(self.root, src).ok()?;
        let file = File::open(&path).ok()?;
        let length = file.metadata().ok()?.len();
        if length == 0 || length > self.remaining {
            return None;
        }
        let mut bytes = Vec::new();
        file.take(length.saturating_add(1))
            .read_to_end(&mut bytes)
            .ok()?;
        if bytes.len() as u64 != length {
            return None;
        }
        let mime = sniff_mime(&bytes)?;
        self.remaining -= length;
        Some((mime, bytes))
    }
}

fn sniff_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF8") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn placeholder(matrix: &[f64; 6]) -> String {
    let [a, b, c, d, e, f] = *matrix;
    let corners = [
        (e, f),
        (a + e, b + f),
        (a + c + e, b + d + f),
        (c + e, d + f),
    ];
    let data = corners
        .iter()
        .enumerate()
        .map(|(index, (x, y))| {
            let command = if index == 0 { "M" } else { "L" };
            format!("{command} {} {}", number(*x), number(*y))
        })
        .collect::<Vec<_>>()
        .join(" ");
    format!("<path d=\"{data} Z\" fill=\"#d9d9d9\" stroke=\"#9a9a9a\" stroke-width=\"0.5\"/>")
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    pub(in crate::commands::notebook_export) const PNG_2X2: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0xFD,
        0xD4, 0x9A, 0x73, 0x00, 0x00, 0x00, 0x14, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8,
        0xCF, 0xC0, 0xC0, 0x00, 0xC2, 0x0C, 0xFF, 0xFF, 0xFF, 0x67, 0x00, 0x00, 0x1E, 0xEF, 0x04,
        0xFC, 0xA3, 0xC8, 0xB4, 0xF7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
        0x60, 0x82,
    ];

    fn image(path_index: usize) -> ExportImage {
        ExportImage {
            id: "i1".to_string(),
            src: ".nevo/assets/x.png".to_string(),
            opacity: 1.0,
            matrix: [100.0, 0.0, 0.0, 50.0, 10.0, 20.0],
            path_index,
        }
    }

    #[test]
    fn validation_rejects_bad_matrix_index_opacity_and_counts() {
        assert!(validate_page_images(&[image(1)], 1, &mut 0).is_ok());
        let mut singular = image(0);
        singular.matrix = [1.0, 2.0, 2.0, 4.0, 0.0, 0.0];
        let mut nan = image(0);
        nan.matrix[4] = f64::NAN;
        let mut opacity = image(0);
        opacity.opacity = 1.5;
        let mut nameless = image(0);
        nameless.id.clear();
        for bad in [singular, nan, opacity, nameless, image(2)] {
            assert!(validate_page_images(&[bad], 1, &mut 0).is_err());
        }
        let many = vec![image(0); MAX_IMAGES_PER_PAGE + 1];
        assert!(validate_page_images(&many, 0, &mut 0).is_err());
        let mut total = MAX_IMAGES_TOTAL;
        assert!(validate_page_images(&[image(0)], 0, &mut total).is_err());
    }

    #[test]
    fn embeds_sniffed_mime_and_falls_back_to_placeholder() {
        let dir = std::env::temp_dir().join(format!("nevo_exp_img_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join(".nevo/assets")).unwrap();
        std::fs::write(dir.join(".nevo/assets/x.png"), PNG_2X2).unwrap();
        std::fs::write(dir.join(".nevo/assets/bad.png"), b"not an image").unwrap();
        let root = dir.canonicalize().unwrap();

        let mut embedder = ImageEmbedder::new(&root);
        let svg = embedder.element(&image(0));
        assert!(svg.starts_with("<image href=\"data:image/png;base64,"));
        assert!(svg.contains("transform=\"matrix(100 0 0 50 10 20)\""));

        let mut bad = image(0);
        bad.src = ".nevo/assets/bad.png".to_string();
        assert!(embedder.element(&bad).contains("#d9d9d9"));
        bad.src = ".nevo/assets/missing.png".to_string();
        assert!(embedder
            .element(&bad)
            .contains("M 10 20 L 110 20 L 110 70 L 10 70 Z"));

        let mut tiny = ImageEmbedder::with_budget(&root, 4);
        assert!(tiny.element(&image(0)).contains("#d9d9d9"));

        std::fs::remove_dir_all(dir).ok();
    }
}
