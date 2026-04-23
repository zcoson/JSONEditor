use std::fs;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, menu::{Menu, MenuItem, Submenu, PredefinedMenuItem, AboutMetadata, IsMenuItem}};

// Maximum file size: 50MB
const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub content: String,
    pub path: String,
}

// Store for pending files to open (maps window label to file path)
struct PendingFiles(Arc<Mutex<std::collections::HashMap<String, String>>>);

// Track if first file has been handled
struct FirstFileHandled(Arc<Mutex<bool>>);

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    // Validate path - prevent null bytes and ensure it's a valid path
    if path.contains('\0') {
        return Err("Invalid path: contains null byte".to_string());
    }

    let path_buf = PathBuf::from(&path);

    // Check file exists and get metadata
    let metadata = fs::metadata(&path_buf)
        .map_err(|e| format!("Cannot access file: {}", e))?;

    // Check file size
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!("File too large: {} bytes (max {} bytes)", metadata.len(), MAX_FILE_SIZE));
    }

    fs::read_to_string(&path_buf).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    // Validate path - prevent null bytes
    if path.contains('\0') {
        return Err("Invalid path: contains null byte".to_string());
    }

    // Check content size
    if content.len() as u64 > MAX_FILE_SIZE {
        return Err(format!("Content too large: {} bytes (max {} bytes)", content.len(), MAX_FILE_SIZE));
    }

    let path_buf = PathBuf::from(&path);
    fs::write(&path_buf, content).map_err(|e| e.to_string())
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

#[tauri::command]
fn get_pending_file(app: tauri::AppHandle, window_label: String) -> Option<String> {
    let pending = app.state::<PendingFiles>();
    let mut guard = pending.0.lock().unwrap();
    guard.remove(&window_label)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending_files = Arc::new(Mutex::new(std::collections::HashMap::<String, String>::new()));
    let first_file_handled = Arc::new(Mutex::new(false));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(PendingFiles(pending_files.clone()))
        .manage(FirstFileHandled(first_file_handled.clone()))
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            remove_escape,
            compress_json,
            get_pending_file
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

            // Create Open and Save menu items with keyboard shortcuts
            let open_item = MenuItem::with_id(app_handle, "open", "Open...", true, Some("CommandOrControl+O"))?;
            let save_item = MenuItem::with_id(app_handle, "save", "Save", true, Some("CommandOrControl+S"))?;

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

    app.run(move |app, event| {
        // Handle file open events from macOS (double-click to open)
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                // Convert file URL to path
                if url.scheme() == "file" {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().to_string();
                        
                        // Extract filename from path for window title
                        let filename = path.file_name()
                            .and_then(|f| f.to_str())
                            .unwrap_or("Unknown");
                        
                        // Check if this is the first file being opened
                        let first_handled = app.state::<FirstFileHandled>();
                        let mut first_flag = first_handled.0.lock().unwrap();
                        let is_first = !*first_flag;
                        
                        if is_first {
                            // First file - try to use main window
                            *first_flag = true;
                            drop(first_flag);

                            if let Some(window) = app.get_webview_window("main") {
                                // Main window exists, use it
                                let _ = window.set_title(&format!("JSON Editor - {}", filename));

                                // Store pending file for main window
                                {
                                    let pending = app.state::<PendingFiles>();
                                    let mut guard = pending.0.lock().unwrap();
                                    guard.insert("main".to_string(), path_str.clone());
                                }

                                // Emit event to the window to load the file
                                let _ = window.emit("file-opened", &path_str);

                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                // Main window not ready yet, store for later
                                {
                                    let pending = app.state::<PendingFiles>();
                                    let mut guard = pending.0.lock().unwrap();
                                    guard.insert("main".to_string(), path_str.clone());
                                }
                            }
                        } else {
                            // Not the first file - create a new window
                            drop(first_flag);
                            
                            let app_handle = app.app_handle().clone();
                            let window_label = format!("window-{}", std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis());
                            
                            match tauri::WebviewWindowBuilder::new(
                                &app_handle,
                                &window_label,
                                tauri::WebviewUrl::App("index.html".into())
                            )
                            .title(format!("JSON Editor - {}", filename))
                            .inner_size(1200.0, 800.0)
                            .min_inner_size(800.0, 600.0)
                            .resizable(true)
                            .build() {
                                Ok(window) => {
                                    // Store the pending file for this window
                                    {
                                        let pending = app.state::<PendingFiles>();
                                        let mut guard = pending.0.lock().unwrap();
                                        guard.insert(window_label.clone(), path_str.clone());
                                    }
                                    // Emit event to the window to load the file
                                    let _ = window.emit("file-opened", &path_str);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                                Err(e) => {
                                    eprintln!("Failed to create window: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}
