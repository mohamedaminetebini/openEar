#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod audio;
mod eq;
use audio::{Audio, Command, Snapshot};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

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

fn menu_action(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(Native::default())
        .invoke_handler(tauri::generate_handler![audio_state, audio_command])
        .on_menu_event(menu_action)
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Open Openear", true, None::<&str>)?;
            let quit =
                MenuItem::with_id(app, "quit", "Quit and restore audio", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Openear")
                .on_menu_event(menu_action);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
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
                let active = window
                    .state::<Native>()
                    .0
                    .lock()
                    .map(|audio| audio.is_active())
                    .unwrap_or(false);
                if active {
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
