use crate::show_main_window;
use ksni::blocking::TrayMethods;
use tauri::{image::Image, AppHandle};

struct Tray {
    app: AppHandle,
    icon: Option<ksni::Icon>,
}

fn show_window(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || show_main_window(&handle));
}

impl ksni::Tray for Tray {
    fn id(&self) -> String {
        "io.openear.desktop".into()
    }
    fn title(&self) -> String {
        "Openear".into()
    }
    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        self.icon.iter().cloned().collect()
    }
    fn tool_tip(&self) -> ksni::ToolTip {
        ksni::ToolTip {
            title: "Openear".into(),
            ..Default::default()
        }
    }
    fn activate(&mut self, _x: i32, _y: i32) {
        show_window(&self.app);
    }
    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        vec![
            ksni::menu::StandardItem {
                label: "Open Openear".into(),
                activate: Box::new(|tray: &mut Tray| show_window(&tray.app)),
                ..Default::default()
            }
            .into(),
            ksni::menu::StandardItem {
                label: "Quit and restore audio".into(),
                activate: Box::new(|tray: &mut Tray| {
                    let app = tray.app.clone();
                    let exit = app.clone();
                    let _ = app.run_on_main_thread(move || exit.exit(0));
                }),
                ..Default::default()
            }
            .into(),
        ]
    }
}

fn argb_icon(image: &Image<'_>) -> ksni::Icon {
    let data = image
        .rgba()
        .chunks_exact(4)
        .flat_map(|pixel| [pixel[3], pixel[0], pixel[1], pixel[2]])
        .collect();
    ksni::Icon {
        width: image.width() as i32,
        height: image.height() as i32,
        data,
    }
}

pub fn spawn(app: &AppHandle) -> Result<(), ksni::Error> {
    let icon = Image::from_bytes(include_bytes!("../icons/tray-light.png"))
        .ok()
        .map(|image| argb_icon(&image));
    let handle = Tray {
        app: app.clone(),
        icon,
    }
    .spawn()?;
    Box::leak(Box::new(handle));
    Ok(())
}
