use crate::MainWindow;
use serde::Deserialize;
use slint::ComponentHandle;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

const UPDATE_ENDPOINT: &str = "https://one-brain-updater.tuckerlowson.workers.dev/api/update";
const OPENROUTER_ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_ENDPOINT: &str = "https://openrouter.ai/api/v1/models";
const MAX_PARALLEL_MODELS: usize = 20;

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<ModelInfo>,
}

#[derive(Deserialize)]
struct ModelInfo {
    id: String,
    name: Option<String>,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: Option<String>,
}

pub fn run() {
    let ui = MainWindow::new().expect("could not create ONE BRAIN window");
    // Start as a proper desktop workspace instead of a small floating window.
    ui.window().set_maximized(true);
    let api_key: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let notifications = Arc::new(AtomicBool::new(true));
    let computer_permission = Arc::new(AtomicBool::new(false));
    let update_download_url = Arc::new(Mutex::new(None::<String>));

    let key_store = Arc::clone(&api_key);
    let weak_for_save = ui.as_weak();
    ui.on_save_key(move |value| {
        let cleaned = value.trim().to_string();
        if cleaned.is_empty() {
            if let Some(window) = weak_for_save.upgrade() {
                window.set_status_text("Enter an OpenRouter API key first.".into());
            }
            return;
        }
        *key_store.lock().expect("API key lock poisoned") = Some(cleaned);
        if let Some(window) = weak_for_save.upgrade() {
            window.set_api_key_input("".into());
            window.set_api_connected(false);
            window.set_status_text("API key saved in memory. Test the connection next.".into());
        }
    });

    let key_for_test = Arc::clone(&api_key);
    let weak_for_test = ui.as_weak();
    ui.on_test_connection(move || {
        let key = key_for_test.lock().expect("API key lock poisoned").clone();
        let Some(key) = key else {
            if let Some(window) = weak_for_test.upgrade() {
                window.set_status_text("Save your OpenRouter key before testing the connection.".into());
            }
            return;
        };
        if let Some(window) = weak_for_test.upgrade() {
            window.set_status_text("Testing OpenRouter connection…".into());
        }
        let weak = weak_for_test.clone();
        std::thread::spawn(move || {
            let result = reqwest::blocking::Client::new()
                .get(OPENROUTER_MODELS_ENDPOINT)
                .bearer_auth(key)
                .header("User-Agent", "ONE-BRAIN")
                .send()
                .and_then(|response| response.error_for_status())
                .map(|_| ());
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(window) = weak.upgrade() {
                    match result {
                        Ok(()) => {
                            window.set_api_connected(true);
                            window.set_status_text("OpenRouter connection successful.".into());
                        }
                        Err(error) => {
                            window.set_api_connected(false);
                            window.set_status_text(format!("Connection failed: {error}").into());
                        }
                    }
                }
            });
        });
    });

    let key_for_discovery = Arc::clone(&api_key);
    let weak_for_discovery = ui.as_weak();
    ui.on_discover_models(move || {
        let key = key_for_discovery.lock().expect("API key lock poisoned").clone();
        let Some(key) = key else {
            if let Some(window) = weak_for_discovery.upgrade() {
                window.set_status_text("Save your OpenRouter API key before loading the model catalogue.".into());
            }
            return;
        };
        if let Some(window) = weak_for_discovery.upgrade() {
            window.set_status_text("Loading the OpenRouter model catalogue…".into());
        }
        let weak = weak_for_discovery.clone();
        std::thread::spawn(move || {
            let result = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| e.to_string())
                .and_then(|client| client.get(OPENROUTER_MODELS_ENDPOINT)
                    .bearer_auth(key)
                    .header("User-Agent", "ONE-BRAIN")
                    .send().map_err(|e| e.to_string())?
                    .error_for_status().map_err(|e| e.to_string())?
                    .json::<ModelsResponse>().map_err(|e| e.to_string()))
                .map(|mut catalog| {
                    catalog.data.sort_by(|a, b| a.id.cmp(&b.id));
                    let count = catalog.data.len();
                    let listing = catalog.data.into_iter().map(|model| {
                        match model.name {
                            Some(name) if name != model.id => format!("{} — {}", model.id, name),
                            _ => model.id
                        }
                    }).collect::<Vec<_>>().join("\\n");
                    (count, listing)
                });
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(window) = weak.upgrade() {
                    match result {
                        Ok((count, listing)) => {
                            window.set_available_models(listing.into());
                            window.set_status_text(format!("Loaded {count} models from OpenRouter. Availability and billing are provider-dependent.").into());
                        }
                        Err(error) => window.set_status_text(format!("Model catalogue failed: {error}").into())
                    }
                }
            });
        });
    });

    let weak_for_maximize = ui.as_weak();
    ui.on_toggle_maximize(move || {
        if let Some(window) = weak_for_maximize.upgrade() {
            let native_window = window.window();
            native_window.set_maximized(!native_window.is_maximized());
        }
    });

    let weak_for_fullscreen = ui.as_weak();
    ui.on_toggle_fullscreen(move || {
        if let Some(window) = weak_for_fullscreen.upgrade() {
            let native_window = window.window();
            native_window.set_fullscreen(!native_window.is_fullscreen());
        }
    });

    let notification_state = Arc::clone(&notifications);
    ui.on_toggle_notifications(move |enabled| {
        notification_state.store(enabled, Ordering::Relaxed);
    });

    let weak_for_clear = ui.as_weak();
    ui.on_clear_conversation(move || {
        if let Some(window) = weak_for_clear.upgrade() {
            window.set_transcript("New conversation started. Enter a prompt below when you're ready.".into());
            window.set_prompt("".into());
            window.set_status_text("New conversation ready.".into());
            window.set_active_page("workspace".into());
        }
    });

    let key_for_chat = Arc::clone(&api_key);
    let notifications_for_chat = Arc::clone(&notifications);
    let weak_for_chat = ui.as_weak();
    ui.on_send_prompt(move |prompt, model_ids| {
        let prompt = prompt.trim().to_string();
        if prompt.is_empty() {
            if let Some(window) = weak_for_chat.upgrade() {
                window.set_status_text("Type a prompt before sending.".into());
            }
            return;
        }

        let key = key_for_chat.lock().expect("API key lock poisoned").clone();
        let Some(key) = key else {
            if let Some(window) = weak_for_chat.upgrade() {
                window.set_status_text("Add and save your OpenRouter API key in Settings before chatting.".into());
                window.set_active_page("settings".into());
            }
            return;
        };

        let models: Vec<String> = model_ids
            .split(';')
            .map(str::trim)
            .filter(|model| !model.is_empty())
            .take(MAX_PARALLEL_MODELS)
            .map(str::to_string)
            .collect();

        if models.is_empty() {
            if let Some(window) = weak_for_chat.upgrade() {
                window.set_status_text("Enter at least one valid provider/model ID in Settings.".into());
                window.set_active_page("settings".into());
            }
            return;
        }

        let Some(window) = weak_for_chat.upgrade() else {
            return;
        };
        let previous = window.get_transcript().to_string();
        let updated = format!("{previous}\n\nYOU\n{prompt}\n\nONE BRAIN NETWORK\nConsulting {} model(s)…", models.len());
        window.set_transcript(updated.into());
        window.set_prompt("".into());
        window.set_status_text(format!("Running {} model(s) in parallel…", models.len()).into());

        let weak = weak_for_chat.clone();
        let notify = Arc::clone(&notifications_for_chat);
        std::thread::spawn(move || {
            let mut workers = Vec::new();
            for model in models {
                let request_key = key.clone();
                let request_prompt = prompt.clone();
                workers.push(std::thread::spawn(move || {
                    let result = ask_openrouter(&request_key, &model, &request_prompt);
                    (model, result)
                }));
            }

            let mut report = String::new();
            for worker in workers {
                match worker.join() {
                    Ok((model, Ok(answer))) => {
                        report.push_str(&format!("\n\n━━━━━━━━ {} ━━━━━━━━\n{}", model, answer));
                    }
                    Ok((model, Err(error))) => {
                        report.push_str(&format!("\n\n━━━━━━━━ {} ━━━━━━━━\nRequest failed: {}", model, error));
                    }
                    Err(_) => report.push_str("\n\nA model request worker stopped unexpectedly."),
                }
            }

            let should_notify = notify.load(Ordering::Relaxed);
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(window) = weak.upgrade() {
                    let base = window.get_transcript().to_string();
                    let trimmed = base.trim_end_matches(|c: char| c.is_whitespace());
                    window.set_transcript(format!("{trimmed}{report}").into());
                    window.set_status_text("Model requests finished. Review the responses above.".into());
                    #[cfg(windows)]
                    if should_notify {
                        let _ = notify_rust::Notification::new()
                            .summary("ONE BRAIN")
                            .body("Your model responses are ready.")
                            .show();
                    }
                }
            });
        });
    });

    let weak_for_update = ui.as_weak();
    let notifications_for_update = Arc::clone(&notifications);
    let update_url_state = Arc::clone(&update_download_url);
    ui.on_check_updates(move || {
        let weak = weak_for_update.clone();
        let url_state = Arc::clone(&update_url_state);
        let notify = Arc::clone(&notifications_for_update);
        std::thread::spawn(move || {
            let result = reqwest::blocking::Client::new()
                .get(UPDATE_ENDPOINT)
                .header("User-Agent", "ONE-BRAIN-Updater")
                .send()
                .and_then(|response| response.error_for_status())
                .and_then(|response| response.json::<serde_json::Value>())
                .map_err(|error| error.to_string());

            let _ = slint::invoke_from_event_loop(move || {
                if let Some(window) = weak.upgrade() {
                    match result {
                        Ok(release) => {
                            let latest = release["tag_name"].as_str().unwrap_or("unknown");
                            let windows_url = release["windows"]["download_url"].as_str().map(str::to_string);
                            *url_state.lock().expect("update URL lock poisoned") = windows_url.clone();
                            let current = env!("CARGO_PKG_VERSION");
                            let latest_clean = latest.trim_start_matches('v');
                            let is_newer = semver::Version::parse(latest_clean)
                                .ok()
                                .zip(semver::Version::parse(current).ok())
                                .map(|(latest, current)| latest > current)
                                .unwrap_or(false);
                            if is_newer {
                                window.set_status_text(format!("Update available: {latest}. Download it from the ONE BRAIN website.").into());
                                #[cfg(windows)]
                                if notify.load(Ordering::Relaxed) {
                                    let _ = notify_rust::Notification::new()
                                        .summary("ONE BRAIN update available")
                                        .body(&format!("Version {latest} is ready."))
                                        .show();
                                }
                            } else {
                                window.set_status_text(format!("ONE BRAIN {current} is up to date.").into());
                            }
                        }
                        Err(error) => window.set_status_text(format!("Update check unavailable: {error}").into()),
                    }
                }
            });
        });
    });

    let weak_for_install = ui.as_weak();
    let url_for_install = Arc::clone(&update_download_url);
    ui.on_install_update(move || {
        let url = url_for_install.lock().expect("update URL lock poisoned").clone();
        let Some(url) = url else {
            if let Some(window) = weak_for_install.upgrade() {
                window.set_status_text("Check for updates first. No Windows update is ready.".into());
            }
            return;
        };
        #[cfg(windows)]
        {
            let weak = weak_for_install.clone();
            std::thread::spawn(move || {
                let result = (|| -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
                    use std::io::Write;
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(300))
                        .build().map_err(|e| e.to_string())?;
                    let mut response = client.get(&url).header("User-Agent", "ONE-BRAIN-Updater")
                        .send().map_err(|e| e.to_string())?
                        .error_for_status().map_err(|e| e.to_string())?;
                    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
                    let temp_dir = std::env::temp_dir();
                    let download = temp_dir.join("one-brain-update.exe");
                    let mut file = std::fs::File::create(&download).map_err(|e| e.to_string())?;
                    std::io::copy(&mut response, &mut file).map_err(|e| e.to_string())?;
                    file.flush().map_err(|e| e.to_string())?;
                    let script = temp_dir.join("one-brain-update.cmd");
                    let pid = std::process::id();
                    let body = format!(
                        "@echo off\r\n:wait\r\ntasklist /FI \"PID eq {pid}\" | find \"{pid}\" >nul\r\nif not errorlevel 1 (timeout /t 1 /nobreak >nul & goto wait)\r\ncopy /Y \"{}\" \"{}\" >nul\r\nif errorlevel 1 exit /b 1\r\nstart \"\" \"{}\"\r\ndel \"{}\"\r\ndel \"%~f0\"\r\n",
                        download.display(), current_exe.display(), current_exe.display(), download.display()
                    );
                    std::fs::write(&script, body).map_err(|e| e.to_string())?;
                    std::process::Command::new("cmd").args(["/C", "start", "", &format!("\"{}\"", script.display())])
                        .spawn().map_err(|e| e.to_string())?;
                    Ok((download, script))
                })();
                let install_started = result.is_ok();
                let _ = slint::invoke_from_event_loop(move || {
                    if let Some(window) = weak.upgrade() {
                        match result {
                            Ok(_) => window.set_status_text("Update downloaded. ONE BRAIN will close, replace its EXE, and restart.".into()),
                            Err(error) => window.set_status_text(format!("Update installation failed: {error}").into())
                        }
                    }
                });
                #[cfg(windows)]
                if install_started { std::thread::sleep(std::time::Duration::from_millis(700)); std::process::exit(0); }
            });
        }
        #[cfg(not(windows))]
        if let Some(window) = weak_for_install.upgrade() {
            window.set_status_text("In-app installation is currently supported on Windows. Use the website download on this device.".into());
        }
    });

    let weak_for_stats = ui.as_weak();
    ui.on_refresh_system_stats(move || {
        let weak = weak_for_stats.clone();
        std::thread::spawn(move || {
            #[cfg(windows)]
            let stats = {
                use sysinfo::System;
                let mut system = System::new_all();
                system.refresh_all();
                let cpu = system.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>()
                    / system.cpus().len().max(1) as f32;
                let used = system.used_memory() / 1024 / 1024;
                let total = system.total_memory() / 1024 / 1024;
                let os = System::os_version().unwrap_or_else(|| "Windows".to_string());
                format!("{} | CPU {:.0}% | RAM {} / {} MB | {} logical CPUs", os, cpu, used, total, system.cpus().len())
            };
            #[cfg(not(windows))]
            let stats = "System stats are available in the Windows desktop build.".to_string();
            let _ = slint::invoke_from_event_loop(move || {
                if let Some(window) = weak.upgrade() {
                    window.set_system_stats(stats.into());
                }
            });
        });
    });

    let weak_for_control = ui.as_weak();
    let permission = Arc::clone(&computer_permission);
    ui.on_computer_control(move || {
        let enabled = !permission.load(Ordering::Relaxed);
        permission.store(enabled, Ordering::Relaxed);
        if let Some(window) = weak_for_control.upgrade() {
            window.set_control_enabled(enabled);
            window.set_control_log(if enabled {
                "CONTROL ENABLED. Manual button actions only.".into()
            } else {
                "EMERGENCY STOP: computer input disabled.".into()
            });
            window.set_status_text(if enabled { "Computer control armed.".into() } else { "Computer control stopped.".into() });
        }
    });

    let permission = Arc::clone(&computer_permission);
    let weak = ui.as_weak();
    ui.on_control_move(move |x_text, y_text| {
        let (Ok(x), Ok(y)) = (x_text.parse::<i32>(), y_text.parse::<i32>()) else {
            if let Some(w) = weak.upgrade() { w.set_control_log("Enter valid numeric screen coordinates.".into()); }
            return;
        };
        if !permission.load(Ordering::Relaxed) {
            if let Some(w) = weak.upgrade() { w.set_control_log("Blocked: enable control first.".into()); }
            return;
        }
        #[cfg(windows)]
        let result: Result<(), String> = (|| {
            use enigo::{Coordinate, Enigo, Mouse, Settings};
            let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            e.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())
        })();
        #[cfg(not(windows))]
        let result: Result<(), String> = Err("Windows desktop control only.".into());
        if let Some(w) = weak.upgrade() {
            w.set_control_log(match result { Ok(()) => format!("Cursor moved to ({}, {}).", x, y), Err(e) => format!("Move failed: {}", e) }.into());
        }
    });

    let permission = Arc::clone(&computer_permission);
    let weak = ui.as_weak();
    ui.on_control_click(move || {
        if !permission.load(Ordering::Relaxed) {
            if let Some(w) = weak.upgrade() { w.set_control_log("Blocked: enable control first.".into()); }
            return;
        }
        #[cfg(windows)]
        let result: Result<(), String> = (|| {
            use enigo::{Button, Direction, Enigo, Mouse, Settings};
            let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            e.button(Button::Left, Direction::Click).map_err(|e| e.to_string())
        })();
        #[cfg(not(windows))]
        let result: Result<(), String> = Err("Windows desktop control only.".into());
        if let Some(w) = weak.upgrade() {
            w.set_control_log(match result { Ok(()) => "Left click sent.".to_string(), Err(e) => format!("Click failed: {}", e) }.into());
        }
    });

    let permission = Arc::clone(&computer_permission);
    let weak = ui.as_weak();
    ui.on_control_type(move |value| {
        if !permission.load(Ordering::Relaxed) {
            if let Some(w) = weak.upgrade() { w.set_control_log("Blocked: enable control first.".into()); }
            return;
        }
        let value = value.to_string();
        if value.len() > 2000 {
            if let Some(w) = weak.upgrade() { w.set_control_log("Text input limit: 2,000 bytes.".into()); }
            return;
        }
        #[cfg(windows)]
        let result: Result<(), String> = (|| {
            use enigo::{Enigo, Keyboard, Settings};
            let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            e.text(&value).map_err(|e| e.to_string())
        })();
        #[cfg(not(windows))]
        let result: Result<(), String> = Err("Windows desktop control only.".into());
        if let Some(w) = weak.upgrade() {
            w.set_control_log(match result { Ok(()) => format!("Typed {} characters.", value.chars().count()), Err(e) => format!("Typing failed: {}", e) }.into());
        }
    });

    let permission = Arc::clone(&computer_permission);
    let weak = ui.as_weak();
    ui.on_control_enter(move || {
        if !permission.load(Ordering::Relaxed) {
            if let Some(w) = weak.upgrade() { w.set_control_log("Blocked: enable control first.".into()); }
            return;
        }
        #[cfg(windows)]
        let result: Result<(), String> = (|| {
            use enigo::{Direction, Enigo, Key, Keyboard, Settings};
            let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            e.key(Key::Return, Direction::Click).map_err(|e| e.to_string())
        })();
        #[cfg(not(windows))]
        let result: Result<(), String> = Err("Windows desktop control only.".into());
        if let Some(w) = weak.upgrade() {
            w.set_control_log(match result { Ok(()) => "Enter key sent.".to_string(), Err(e) => format!("Enter failed: {}", e) }.into());
        }
    });

    ui.run().expect("ONE BRAIN window failed");
}

fn ask_openrouter(api_key: &str, model_id: &str, prompt: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model_id,
        "messages": [
            {
                "role": "system",
                "content": "You are ONE BRAIN, a helpful assistant. Be accurate, concise, and clear. Never claim to have performed actions you have not performed."
            },
            { "role": "user", "content": prompt }
        ]
    });

    let response: ChatResponse = reqwest::blocking::Client::new()
        .post(OPENROUTER_ENDPOINT)
        .bearer_auth(api_key)
        .header("HTTP-Referer", "https://one-brain-site.pages.dev")
        .header("X-Title", "ONE BRAIN")
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .map_err(|error| error.to_string())?;

    response
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .ok_or_else(|| "The model returned an empty response.".to_string())
}
