fn main() {
    #[cfg(target_os = "linux")]
    println!("cargo:rustc-link-arg=-Wl,--exclude-libs,ALL");

    // tauri-build embeds the Common Controls v6 manifest as a resource in the
    // app binary only, so the unit-test executable (which links the same
    // comctl32 v6 imports) cannot start on Windows (STATUS_ENTRYPOINT_NOT_FOUND).
    // Embed the same manifest through the linker for every target instead.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app.manifest");
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rerun-if-changed=windows-app.manifest");
        let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
            .expect("failed to run tauri-build");
        return;
    }

    tauri_build::build()
}
