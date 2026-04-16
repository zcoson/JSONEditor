use std::fs;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, menu::{Menu, MenuItem, Submenu, PredefinedMenuItem, AboutMetadata, IsMenuItem}};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub content: String,
    pub path: String,
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_escape(content: String) -> String {
    content.replace("\\\"", "\"")
}

#[tauri::command]
fn compress_json(content: String) -> Result<String, String> {
    // Try to parse and compress JSON
    match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(json) => serde_json::to_string(&json).map_err(|e| e.to_string()),
        Err(_) => {
            // If not valid JSON, just remove whitespace
            Ok(content.chars().filter(|c| !c.is_whitespace()).collect())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            remove_escape,
            compress_json
        ])
        .setup(move |app| {
            // Handle file open events from macOS
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                app.set_activation_policy(ActivationPolicy::Regular);
            }

            let app_handle = app.handle();
            let pkg_info = app_handle.package_info();
            let config = app_handle.config();

            let about_metadata = AboutMetadata {
                name: Some(pkg_info.name.clone()),
                version: Some(pkg_info.version.to_string()),
                copyright: config.bundle.copyright.clone(),
                authors: config.bundle.publisher.clone().map(|p| vec![p]),
                ..Default::default()
            };

            // Create Open and Save menu items
            let open_item = MenuItem::with_id(app_handle, "open", "Open", true, None::<&str>)?;
            let save_item = MenuItem::with_id(app_handle, "save", "Save", true, None::<&str>)?;

            // Create empty menu
            let menu = Menu::new(app_handle)?;

            // macOS App menu (first menu with app name)
            #[cfg(target_os = "macos")]
            {
                let app_menu = Submenu::with_items(
                    app_handle,
                    pkg_info.name.clone(),
                    true,
                    &[
                        &PredefinedMenuItem::about(app_handle, None, Some(about_metadata.clone()))?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::services(app_handle, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::hide(app_handle, None)?,
                        &PredefinedMenuItem::hide_others(app_handle, None)?,
                        &PredefinedMenuItem::separator(app_handle)?,
                        &PredefinedMenuItem::quit(app_handle, None)?,
                    ],
                )?;
                menu.append(&app_menu)?;
            }

            // File menu
            let file_menu = Submenu::with_items(
                app_handle,
                "File",
                true,
                &[
                    &open_item as &dyn IsMenuItem<_>,
                    &save_item as &dyn IsMenuItem<_>,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::close_window(app_handle, None)?,
                ],
            )?;
            menu.append(&file_menu)?;

            // Edit menu
            let edit_menu = Submenu::with_items(
                app_handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app_handle, None)?,
                    &PredefinedMenuItem::redo(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::cut(app_handle, None)?,
                    &PredefinedMenuItem::copy(app_handle, None)?,
                    &PredefinedMenuItem::paste(app_handle, None)?,
                    &PredefinedMenuItem::select_all(app_handle, None)?,
                ],
            )?;
            menu.append(&edit_menu)?;

            // View menu (macOS only)
            #[cfg(target_os = "macos")]
            {
                let view_menu = Submenu::with_items(
                    app_handle,
                    "View",
                    true,
                    &[&PredefinedMenuItem::fullscreen(app_handle, None)?],
                )?;
                menu.append(&view_menu)?;
            }

            // Window menu
            let window_menu = Submenu::with_items(
                app_handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app_handle, None)?,
                    &PredefinedMenuItem::maximize(app_handle, None)?,
                    #[cfg(target_os = "macos")]
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::close_window(app_handle, None)?,
                ],
            )?;
            menu.append(&window_menu)?;

            // Help menu
            #[cfg(not(target_os = "macos"))]
            {
                let help_menu = Submenu::with_items(
                    app_handle,
                    "Help",
                    true,
                    &[&PredefinedMenuItem::about(app_handle, None, Some(about_metadata))?],
                )?;
                menu.append(&help_menu)?;
            }

            #[cfg(target_os = "macos")]
            {
                let help_menu = Submenu::new(app_handle, "Help", true)?;
                menu.append(&help_menu)?;
            }

            // Set menu for all windows
            app.set_menu(menu)?;

            // Handle menu events
            let app_handle_clone = app_handle.clone();
            app.on_menu_event(move |_app, event| {
                match event.id().as_ref() {
                    "open" => {
                        let _ = app_handle_clone.emit("menu-open", ());
                    }
                    "save" => {
                        let _ = app_handle_clone.emit("menu-save", ());
                    }
                    _ => {}
                }
            });

            if cfg!(debug_assertions) {
                app_handle.plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_, _| {});
}
