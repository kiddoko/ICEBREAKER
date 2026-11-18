fn main() {
    // ICEBREAKER's own Google OAuth client (CALENDAR module), baked into the
    // binary when src-tauri/google-client.json exists. That file is git-ignored:
    // CI writes it from repository secrets; builds without it simply ask the
    // user for their own client (`cal google setup`). See docs/GOOGLE.md.
    println!("cargo:rerun-if-changed=google-client.json");
    if let Ok(text) = std::fs::read_to_string("google-client.json") {
        let field = |key: &str| {
            // tiny reader for {"client_id": "…", "client_secret": "…"} (no serde in build.rs)
            let at = text.find(&format!("\"{key}\""))?;
            let rest = &text[at + key.len() + 2..];
            let start = rest.find('"')? + 1;
            let end = start + rest[start..].find('"')?;
            Some(rest[start..end].trim().to_string())
        };
        if let (Some(id), Some(secret)) = (field("client_id"), field("client_secret")) {
            if id.ends_with(".apps.googleusercontent.com") && !secret.is_empty() {
                println!("cargo:rustc-env=IB_GOOGLE_CLIENT_ID={id}");
                println!("cargo:rustc-env=IB_GOOGLE_CLIENT_SECRET={secret}");
            } else {
                println!("cargo:warning=google-client.json: client_id / client_secret look wrong, ignored");
            }
        } else {
            println!("cargo:warning=google-client.json: needs \"client_id\": \"…\" and \"client_secret\": \"…\" (see google-client.example.json), ignored");
        }
    }
    tauri_build::build()
}
