fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["audio_state", "audio_command"]),
        ),
    )
    .expect("Tauri build configuration failed");
}
