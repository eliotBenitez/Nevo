fn main() {
    #[cfg(target_os = "linux")]
    println!("cargo:rustc-link-arg=-Wl,--exclude-libs,ALL");

    tauri_build::build()
}
