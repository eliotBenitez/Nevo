//! Pinned Whisper model catalog. The SHA-256 is the integrity anchor for downloads.

pub struct ModelEntry {
    pub id: &'static str,
    pub file: &'static str,
    /// `None` for the model bundled with the app.
    pub url: Option<&'static str>,
    pub bytes: u64,
    pub sha256: &'static str,
}

pub const CATALOG: &[ModelEntry] = &[
    ModelEntry {
        id: "base",
        file: "ggml-base.bin",
        url: None,
        bytes: 147_951_465,
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    },
    ModelEntry {
        id: "small",
        file: "ggml-small-q5_1.bin",
        url: Some("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin"),
        bytes: 190_085_487,
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    },
    ModelEntry {
        id: "turbo",
        file: "ggml-large-v3-turbo-q5_0.bin",
        url: Some("https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin"),
        bytes: 574_041_195,
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    },
];

pub fn find(id: &str) -> Option<&'static ModelEntry> {
    CATALOG.iter().find(|entry| entry.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_well_formed() {
        for (index, entry) in CATALOG.iter().enumerate() {
            assert!(CATALOG[..index].iter().all(|other| other.id != entry.id));
            assert_eq!(entry.sha256.len(), 64);
            assert!(entry
                .sha256
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
            assert_eq!(entry.url.is_none(), entry.id == "base");
        }
        assert!(find("small").is_some() && find("nope").is_none());
    }
}
