use std::fs;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::io::{Cursor, Read};
use serde::{Deserialize, Serialize};
use reqwest;
use zip::ZipArchive;
use encoding_rs;
use tauri::{Emitter, Manager, menu::{Menu, MenuItem, Submenu, PredefinedMenuItem, AboutMetadata, IsMenuItem}};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use hmac::{Hmac, Mac};
use sha1::Sha1;

// Maximum file size: 50MB
const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

// Config file path: ~/.jsoneditor/oss_config.json
fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".jsoneditor")
        .join("oss_config.json")
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub content: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ZipEntry {
    pub name: String,        // Display name (decoded)
    pub original_name: String, // Original name in zip (for fallback lookup)
    pub index: usize,        // Index in zip for reliable lookup
    pub is_json: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct OssConfig {
    access_key_id: String,
    access_key_secret: String,
    bucket: String,
    endpoint: String,
    object_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OssCredentials {
    access_key_id: String,
    access_key_secret: String,
    endpoint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OssConfigFile {
    // Per-bucket credentials
    buckets: Option<std::collections::HashMap<String, OssCredentials>>,
    // Legacy environment-based credentials (for backward compatibility)
    test: Option<OssCredentials>,
    prod: Option<OssCredentials>,
    default: Option<OssCredentials>,
}

// Load OSS config from ~/.jsoneditor/oss_config.json
fn load_oss_config_file() -> Result<OssConfigFile, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(OssConfigFile {
            buckets: None,
            test: None,
            prod: None,
            default: None,
        });
    }
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read OSS config file: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse OSS config file: {}", e))
}

// Get credentials: first try environment variable, then config file
fn get_oss_credentials(bucket: &str) -> Result<(String, String, String), String> {
    // Determine environment prefix based on bucket name
    let env_prefix = if bucket == "servu-test-xw" {
        "TEST_OSS"
    } else if bucket == "servu-tax" {
        "PROD_OSS"
    } else {
        "OSS"
    };

    // First try environment variables
    let env_id = std::env::var(format!("{}_ACCESS_KEY_ID", env_prefix));
    let env_secret = std::env::var(format!("{}_ACCESS_KEY_SECRET", env_prefix));

    if let (Ok(id), Ok(secret)) = (env_id, env_secret) {
        return Ok((id, secret, "oss-cn-hangzhou.aliyuncs.com".to_string()));
    }

    // Fallback to config file
    let config = load_oss_config_file()?;

    // Try bucket-specific credentials first
    if let Some(ref buckets) = config.buckets {
        if let Some(creds) = buckets.get(bucket) {
            return Ok((
                creds.access_key_id.clone(),
                creds.access_key_secret.clone(),
                creds.endpoint.clone().unwrap_or_else(|| "oss-cn-hangzhou.aliyuncs.com".to_string()),
            ));
        }
    }

    // Try legacy environment-based credentials in config
    if bucket == "servu-test-xw" {
        if let Some(ref creds) = config.test {
            return Ok((
                creds.access_key_id.clone(),
                creds.access_key_secret.clone(),
                creds.endpoint.clone().unwrap_or_else(|| "oss-cn-hangzhou.aliyuncs.com".to_string()),
            ));
        }
    } else if bucket == "servu-tax" {
        if let Some(ref creds) = config.prod {
            return Ok((
                creds.access_key_id.clone(),
                creds.access_key_secret.clone(),
                creds.endpoint.clone().unwrap_or_else(|| "oss-cn-hangzhou.aliyuncs.com".to_string()),
            ));
        }
    }

    // Try default credentials
    if let Some(ref creds) = config.default {
        return Ok((
            creds.access_key_id.clone(),
            creds.access_key_secret.clone(),
            creds.endpoint.clone().unwrap_or_else(|| "oss-cn-hangzhou.aliyuncs.com".to_string()),
        ));
    }

    Err(format!("OSS credentials not found for bucket '{}'. Set environment variables or create ~/.jsoneditor/oss_config.json", bucket))
}

// Parse OSS URL and get credentials
// URL format: oss://bucket/path/to/object
fn parse_oss_url(url: &str) -> Result<OssConfig, String> {
    let url = url.strip_prefix("oss://").ok_or("URL must start with oss://")?;

    let parts: Vec<&str> = url.splitn(2, '/').collect();
    if parts.len() < 2 {
        return Err("Invalid OSS URL format. Expected: oss://bucket/path/to/object".to_string());
    }

    let bucket = parts[0].to_string();
    let object_key = parts[1].to_string();

    let (access_key_id, access_key_secret, endpoint) = get_oss_credentials(&bucket)?;

    Ok(OssConfig {
        access_key_id,
        access_key_secret,
        bucket,
        endpoint,
        object_key,
    })
}

// Generate OSS signature
fn generate_oss_signature(
    method: &str,
    resource: &str,
    date: &str,
    content_type: &str,
    access_key_secret: &str,
) -> String {
    let string_to_sign = format!(
        "{}\n\n{}\n{}\n{}",
        method, content_type, date, resource
    );

    type HmacSha1 = Hmac<Sha1>;
    let mut mac = HmacSha1::new_from_slice(access_key_secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(string_to_sign.as_bytes());
    let result = mac.finalize();
    STANDARD.encode(result.into_bytes())
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
async fn fetch_url(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL: must start with http:// or https://".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let content = response.text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if content.len() as u64 > MAX_FILE_SIZE {
        return Err(format!("Content too large: {} bytes (max {} bytes)", content.len(), MAX_FILE_SIZE));
    }

    Ok(content)
}

#[tauri::command]
async fn fetch_oss(url: String) -> Result<Vec<u8>, String> {
    let config = parse_oss_url(&url)?;

    let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let resource = format!("/{}/{}", config.bucket, config.object_key);
    let signature = generate_oss_signature("GET", &resource, &date, "", &config.access_key_secret);

    let oss_url = format!(
        "https://{}.{}/{}",
        config.bucket, config.endpoint, config.object_key
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&oss_url)
        .header("Date", &date)
        .header(
            "Authorization",
            format!("OSS {}:{}", config.access_key_id, signature),
        )
        .send()
        .await
        .map_err(|e| format!("Failed to fetch OSS object: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("OSS error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(format!(
            "Content too large: {} bytes (max {} bytes)",
            bytes.len(),
            MAX_FILE_SIZE
        ));
    }

    Ok(bytes.to_vec())
}

#[tauri::command]
fn get_pending_file(app: tauri::AppHandle, window_label: String) -> Option<String> {
    let pending = app.state::<PendingFiles>();
    let mut guard = pending.0.lock().unwrap();
    guard.remove(&window_label)
}

// Try to decode filename bytes with proper encoding
// ZIP files may use UTF-8 (with Language encoding flag) or legacy encoding like GBK/CP437
fn decode_filename_bytes(raw_bytes: &[u8]) -> String {
    // First try UTF-8
    if let Ok(utf8_str) = std::str::from_utf8(raw_bytes) {
        return utf8_str.to_string();
    }

    // Try GBK (common on Chinese Windows)
    let (decoded, _encoding, _had_errors) = encoding_rs::GBK.decode(raw_bytes);
    decoded.into_owned()
}

#[tauri::command]
fn list_zip_entries(path: String) -> Result<Vec<ZipEntry>, String> {
    if path.contains('\0') {
        return Err("Invalid path: contains null byte".to_string());
    }

    let path_buf = PathBuf::from(&path);
    let metadata = fs::metadata(&path_buf)
        .map_err(|e| format!("Cannot access file: {}", e))?;

    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!("File too large: {} bytes (max {} bytes)", metadata.len(), MAX_FILE_SIZE));
    }

    let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read zip file: {}", e))?;
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| format!("Failed to parse zip file: {}", e))?;

    let mut entries: Vec<ZipEntry> = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| format!("Failed to read entry {}: {}", i, e))?;

        // Get raw bytes of filename
        let raw_name_bytes = file.name_raw();
        let decoded_name = decode_filename_bytes(raw_name_bytes);

        // Skip directories
        if decoded_name.ends_with('/') {
            continue;
        }

        let is_json = decoded_name.to_lowercase().ends_with(".json");
        entries.push(ZipEntry {
            name: decoded_name,
            original_name: file.name().to_string(), // Use crate's decoded name for lookup
            index: i,  // Use index for reliable lookup
            is_json,
        });
    }

    Ok(entries)
}

#[tauri::command]
fn read_zip_entry_by_index(path: String, index: usize) -> Result<String, String> {
    if path.contains('\0') {
        return Err("Invalid path: contains null byte".to_string());
    }

    let path_buf = PathBuf::from(&path);
    let metadata = fs::metadata(&path_buf)
        .map_err(|e| format!("Cannot access file: {}", e))?;

    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!("File too large: {} bytes (max {} bytes)", metadata.len(), MAX_FILE_SIZE));
    }

    let bytes = fs::read(&path_buf).map_err(|e| format!("Failed to read zip file: {}", e))?;
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| format!("Failed to parse zip file: {}", e))?;

    let mut file = archive.by_index(index)
        .map_err(|e| format!("Failed to read entry at index {}: {}", index, e))?;

    let mut content = String::new();
    Read::read_to_string(&mut file, &mut content)
        .map_err(|e| format!("Failed to read entry content: {}", e))?;

    if content.len() as u64 > MAX_FILE_SIZE {
        return Err(format!("Content too large: {} bytes (max {} bytes)", content.len(), MAX_FILE_SIZE));
    }

    Ok(content)
}

#[tauri::command]
fn list_zip_entries_from_bytes(bytes: Vec<u8>) -> Result<Vec<ZipEntry>, String> {
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(format!("Data too large: {} bytes (max {} bytes)", bytes.len(), MAX_FILE_SIZE));
    }

    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| format!("Failed to parse zip data: {}", e))?;

    let mut entries: Vec<ZipEntry> = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| format!("Failed to read entry {}: {}", i, e))?;

        let raw_name_bytes = file.name_raw();
        let decoded_name = decode_filename_bytes(raw_name_bytes);

        if decoded_name.ends_with('/') {
            continue;
        }

        let is_json = decoded_name.to_lowercase().ends_with(".json");
        entries.push(ZipEntry {
            name: decoded_name,
            original_name: file.name().to_string(),
            index: i,
            is_json,
        });
    }

    Ok(entries)
}

#[tauri::command]
fn read_zip_entry_from_bytes(bytes: Vec<u8>, index: usize) -> Result<String, String> {
    if bytes.len() as u64 > MAX_FILE_SIZE {
        return Err(format!("Data too large: {} bytes (max {} bytes)", bytes.len(), MAX_FILE_SIZE));
    }

    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| format!("Failed to parse zip data: {}", e))?;

    let mut file = archive.by_index(index)
        .map_err(|e| format!("Failed to read entry at index {}: {}", index, e))?;

    let mut content = String::new();
    Read::read_to_string(&mut file, &mut content)
        .map_err(|e| format!("Failed to read entry content: {}", e))?;

    if content.len() as u64 > MAX_FILE_SIZE {
        return Err(format!("Content too large: {} bytes (max {} bytes)", content.len(), MAX_FILE_SIZE));
    }

    Ok(content)
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
            fetch_url,
            fetch_oss,
            get_pending_file,
            list_zip_entries,
            read_zip_entry_by_index,
            list_zip_entries_from_bytes,
            read_zip_entry_from_bytes
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
