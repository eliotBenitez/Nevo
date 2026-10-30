use super::*;

#[test]
fn asset_ids_are_content_hashes_and_reject_traversal() {
    assert!(validate_asset_id(&"a".repeat(64)).is_ok());
    assert!(validate_asset_id(&"a".repeat(63)).is_err());
    assert!(validate_asset_id(&"g".repeat(64)).is_err());
    assert!(validate_asset_id("../secret").is_err());
    assert!(validate_asset_id("").is_err());
}

#[test]
fn asset_store_round_trips_dedupes_and_confines() {
    let workspace =
        std::env::temp_dir().join(format!("nevo-plugin-assets-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&workspace).expect("workspace");

    let first = write_plugin_asset(&workspace, "plugin.safe", b"hello world").expect("write");
    let second = write_plugin_asset(&workspace, "plugin.safe", b"hello world").expect("dedupe");
    assert_eq!(
        first, second,
        "identical bytes reuse the same content address"
    );
    assert_eq!(
        directory_size(&plugin_assets_dir(&workspace, "plugin.safe")).unwrap(),
        b"hello world".len() as u64,
        "dedupe must not write a second object"
    );

    let read = read_plugin_asset(&workspace, "plugin.safe", &first).expect("read");
    assert_eq!(read.as_deref(), Some(&b"hello world"[..]));

    // Assets are namespaced per plugin: another plugin cannot see the object.
    assert!(read_plugin_asset(&workspace, "plugin.other", &first)
        .expect("cross-plugin read")
        .is_none());

    // Empty and oversized payloads are rejected.
    assert!(write_plugin_asset(&workspace, "plugin.safe", b"").is_err());
    assert!(
        write_plugin_asset(&workspace, "plugin.safe", &vec![0u8; MAX_ASSET_BYTES + 1]).is_err()
    );

    delete_plugin_asset(&workspace, "plugin.safe", &first).expect("delete");
    assert!(read_plugin_asset(&workspace, "plugin.safe", &first)
        .expect("read after delete")
        .is_none());

    std::fs::remove_dir_all(&workspace).expect("cleanup");
}

#[test]
fn chunked_upload_assembles_dedupes_and_enforces_ownership() {
    let workspace =
        std::env::temp_dir().join(format!("nevo-plugin-upload-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&workspace).expect("workspace");

    let upload_id = begin_asset_upload(&workspace, "plugin.safe").expect("begin");
    append_asset_chunk(&workspace, "plugin.safe", &upload_id, b"hello ").expect("chunk 1");
    append_asset_chunk(&workspace, "plugin.safe", &upload_id, b"world").expect("chunk 2");

    // A concurrent upload owned by another plugin cannot touch this one.
    assert!(append_asset_chunk(&workspace, "plugin.other", &upload_id, b"x").is_err());
    // Oversized chunks are rejected outright.
    assert!(append_asset_chunk(
        &workspace,
        "plugin.safe",
        &upload_id,
        &vec![0u8; MAX_ASSET_CHUNK_BYTES + 1]
    )
    .is_err());

    let asset_id = finish_asset_upload(&workspace, "plugin.safe", &upload_id).expect("finish");
    let stored = std::fs::read(plugin_assets_dir(&workspace, "plugin.safe").join(&asset_id))
        .expect("stored asset");
    assert_eq!(stored, b"hello world");
    // The assembled bytes share the content address of a single-shot write.
    assert_eq!(
        asset_id,
        write_plugin_asset(&workspace, "plugin.safe", b"hello world").unwrap()
    );
    // Staging is cleared and the upload id is no longer usable.
    assert!(!upload_staging_path(&workspace, "plugin.safe", &upload_id).exists());
    assert!(finish_asset_upload(&workspace, "plugin.safe", &upload_id).is_err());

    // Abort removes staging and forgets the upload.
    let aborted = begin_asset_upload(&workspace, "plugin.safe").expect("begin abort");
    append_asset_chunk(&workspace, "plugin.safe", &aborted, b"scratch").expect("chunk");
    abort_asset_upload(&workspace, "plugin.safe", &aborted).expect("abort");
    assert!(!upload_staging_path(&workspace, "plugin.safe", &aborted).exists());

    std::fs::remove_dir_all(&workspace).expect("cleanup");
}

#[test]
fn asset_urls_sniff_images_confine_to_the_session_and_reject_non_images() {
    // Magic-byte sniffing recognizes the supported image formats and nothing else.
    assert_eq!(
        sniff_image_content_type(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]),
        Some("image/png")
    );
    assert_eq!(
        sniff_image_content_type(&[0xFF, 0xD8, 0xFF, 0]),
        Some("image/jpeg")
    );
    assert_eq!(sniff_image_content_type(b"GIF89a....."), Some("image/gif"));
    assert_eq!(
        sniff_image_content_type(b"RIFF\0\0\0\0WEBP...."),
        Some("image/webp")
    );
    assert_eq!(
        sniff_image_content_type(b"\0\0\0\0ftypavif...."),
        Some("image/avif")
    );
    assert!(sniff_image_content_type(b"<svg>nope</svg>").is_none());
    assert!(sniff_image_content_type(b"plain text").is_none());

    let workspace =
        std::env::temp_dir().join(format!("nevo-plugin-asseturl-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&workspace).expect("workspace");

    let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
    let asset_id = write_plugin_asset(&workspace, "plugin.safe", &png).unwrap();
    let root = plugin_assets_dir(&workspace, "plugin.safe")
        .canonicalize()
        .unwrap();
    let token = asset_url_token_for("plugin.safe", &root);
    // The same plugin root always reuses one opaque token.
    assert_eq!(token, asset_url_token_for("plugin.safe", &root));

    let uri = format!("nevoplugin-asset://{token}/{asset_id}");
    let (path, content_type) = resolve_asset_uri(&uri).expect("resolve image asset");
    assert_eq!(content_type, "image/png");
    assert!(path.starts_with(&root));

    // A malformed id and an unknown token are both refused.
    assert!(resolve_asset_uri(&format!("nevoplugin-asset://{token}/../escape")).is_err());
    assert!(resolve_asset_uri(&format!("nevoplugin-asset://deadbeef/{asset_id}")).is_err());

    // A non-image asset is stored fine but refused as a renderable URL.
    let text_id = write_plugin_asset(&workspace, "plugin.safe", b"not an image").unwrap();
    assert!(resolve_asset_uri(&format!("nevoplugin-asset://{token}/{text_id}")).is_err());

    std::fs::remove_dir_all(&workspace).expect("cleanup");
}
