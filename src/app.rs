use crate::MainWindow;
use serde::Deserialize;
use slint::ComponentHandle;
use std::sync::{Arc, Mutex};

const UPDATE_ENDPOINT: &str = "https://one-brain-site.pages.dev/api/update";
const OPENROUTER_ENDPOINT: &str = "https://openrouter.ai/api/v1/chat/completions";
const MAX_PARALLEL_MODELS: usize = 5;

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
    let api_key: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let key_store = Arc::clone(&api_key);
    let weak_for_save = ui.as_weak();
    ui.on_save_key(move |value| {
        let cleaned = value.trim().to_string();
        if cleaned.is_empty() {
            if let Some(window) = weak_for_save.upgrade() {
                window.set_status_text("Paste an OpenRouter key first.".into());
            }
            return;
        }
        *key_store.lock().expect("API key lock poisoned") = Some(cleaned);
        if let Some(window) = weak_for_save.upgrade() {
            window.set_api_key_input("".into());
            window.set_status_text("OpenRouter key saved in memory for this session.".into());
        }
    });

    let key_for_chat = Arc::clone(&api_key);
    let weak_for_chat = ui.as_weak();
    ui.on_send_prompt(move |prompt, model_ids| {
        let prompt = prompt.trim().to_string();
        if prompt.is_empty() {
            return;
        }

        let key = key_for_chat.lock().expect("API key lock poisoned").clone();
        let Some(key) = key else {
            if let Some(window) = weak_for_chat.upgrade() {
                window.set_status_text("Add and save your OpenRouter API key before chatting.".into());
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
                window.set_status_text("Enter at least one OpenRouter model ID.".into());
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

            let _ = slint::invoke_from_event_loop(move || {
                if let Some(window) = weak.upgrade() {
                    let base = window.get_transcript().to_string();
                    let trimmed = base.trim_end_matches(|c: char| c.is_whitespace());
                    window.set_transcript(format!("{trimmed}{report}").into());
                    window.set_status_text("All model responses received. Compare their answers above.".into());
                    #[cfg(windows)]
                    {
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
    ui.on_check_updates(move || {
        let weak = weak_for_update.clone();
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
                            let current = env!("CARGO_PKG_VERSION");
                            let latest_clean = latest.trim_start_matches('v');
                            let is_newer = semver::Version::parse(latest_clean)
                                .ok()
                                .zip(semver::Version::parse(current).ok())
                                .map(|(latest, current)| latest > current)
                                .unwrap_or(false);
                            if is_newer {
                                window.set_status_text(format!("Update available: {latest} — use the download website.").into());
                                #[cfg(windows)]
                                {
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

    let weak_for_control = ui.as_weak();
    ui.on_computer_control(move || {
        if let Some(window) = weak_for_control.upgrade() {
            window.set_status_text(
                "Computer control is locked in this preview. Future actions require explicit permission and confirmation.".into(),
            );
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
