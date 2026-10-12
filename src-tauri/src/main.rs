#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod aap;
mod audio;
mod bluetooth;
mod eq;
mod socket;
mod soundcore;
mod tray;
use audio::{Audio, Command, Snapshot};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

#[derive(Clone, Default)]
struct Native(Arc<Mutex<Audio>>);

#[tauri::command]
async fn audio_state(state: tauri::State<'_, Native>) -> Result<Snapshot, String> {
    let audio = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        audio
            .lock()
            .map_err(|_| "Audio state unavailable.".to_string())?
            .snapshot()
    })
    .await
    .map_err(|_| "Audio task failed.".to_string())?
}

#[tauri::command]
async fn audio_command(
    state: tauri::State<'_, Native>,
    input: Command,
) -> Result<Snapshot, String> {
    let audio = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        audio
            .lock()
            .map_err(|_| "Audio state unavailable.".to_string())?
            .apply(input)
    })
    .await
    .map_err(|_| "Audio task failed.".to_string())?
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

struct TrayAvailable(bool);

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main_window(app)
        }))
        .manage(Native::default())
        .invoke_handler(tauri::generate_handler![audio_state, audio_command])
        .setup(|app| {
            app.manage(TrayAvailable(tray::spawn(app.handle()).is_ok()));
            let weak = Arc::downgrade(&app.state::<Native>().0);
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let Some(audio) = weak.upgrade() else {
                    break;
                };
                if let Ok(mut audio) = audio.lock() {
                    let _ = audio.monitor();
                };
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<TrayAvailable>().0 {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });
    let app = builder
        .build(tauri::generate_context!())
        .expect("Could not start Openear");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            if let Ok(mut audio) = app.state::<Native>().0.lock() {
                if audio.stop().is_err() {
                    eprintln!("Audio restoration failed. Select your physical output in system sound settings.");
                }
            }
        }
    });
}
