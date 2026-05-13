import re

with open("src-tauri/src/main.rs", "r") as f:
    content = f.read()

# Add get_media_info and structs above // ─── TMDB Recommendations
structs = """
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaStream {
    pub index: u32,
    pub codec_type: String,
    pub codec_name: Option<String>,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeOutput {
    streams: Vec<FfprobeStream>,
}

#[derive(Deserialize)]
struct FfprobeStream {
    index: u32,
    codec_type: String,
    codec_name: Option<String>,
    tags: Option<HashMap<String, String>>,
}

#[tauri::command]
async fn get_media_info(path: String) -> Result<Vec<MediaStream>, String> {
    let out = tokio::process::Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            &path,
        ])
        .output().await.map_err(|e| e.to_string())?;

    let parsed: FfprobeOutput = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    
    let mut streams = Vec::new();
    for s in parsed.streams {
        let mut lang = None;
        let mut title = None;
        if let Some(tags) = s.tags {
            if let Some(l) = tags.get("language").or(tags.get("LANGUAGE")) {
                lang = Some(l.clone());
            }
            if let Some(t) = tags.get("title").or(tags.get("TITLE")) {
                title = Some(t.clone());
            }
        }
        streams.push(MediaStream {
            index: s.index,
            codec_type: s.codec_type,
            codec_name: s.codec_name,
            language: lang,
            title,
        });
    }
    Ok(streams)
}

// ─── TMDB Recommendations"""
content = content.replace("// ─── TMDB Recommendations", structs, 1)

# Modify stream_handler and StreamQuery
old_stream = """#[derive(Deserialize)]
struct StreamQuery {
    path: String,
    copy: Option<bool>,
}

async fn stream_handler(Query(q): Query<StreamQuery>) -> impl IntoResponse {
    let path = q.path;
    let use_copy = q.copy.unwrap_or(false);

    if !Path::new(&path).exists() {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .body(axum::body::Body::from("File not found"))
            .unwrap();
    }

    let ffmpeg_check = tokio::process::Command::new("ffmpeg")
        .arg("-version").stdout(Stdio::null()).stderr(Stdio::null())
        .status().await;
    if ffmpeg_check.is_err() {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
            .body(axum::body::Body::from("FFmpeg not found. Please install FFmpeg to play this file."))
            .unwrap();
    }

    let mut args: Vec<String> = vec!["-i".into(), path.clone()];
    if use_copy {
        args.extend(["-c:v".into(), "copy".into(), "-c:a".into(), "copy".into()]);
    } else {
        args.extend([
            "-c:v".into(), "libx264".into(),
            "-preset".into(), "veryfast".into(),
            "-crf".into(), "23".into(),
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "192k".into(),
        ]);
    }"""

new_stream = """#[derive(Deserialize)]
struct StreamQuery {
    path: String,
    copy: Option<bool>,
    a: Option<u32>,
}

async fn stream_handler(Query(q): Query<StreamQuery>) -> impl IntoResponse {
    let path = q.path;
    let use_copy = q.copy.unwrap_or(false);

    if !Path::new(&path).exists() {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .body(axum::body::Body::from("File not found"))
            .unwrap();
    }

    let ffmpeg_check = tokio::process::Command::new("ffmpeg")
        .arg("-version").stdout(Stdio::null()).stderr(Stdio::null())
        .status().await;
    if ffmpeg_check.is_err() {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
            .body(axum::body::Body::from("FFmpeg not found. Please install FFmpeg to play this file."))
            .unwrap();
    }

    let mut args: Vec<String> = vec!["-i".into(), path.clone()];
    args.extend(["-map".into(), "0:V:0".into()]);
    if let Some(a_idx) = q.a {
        args.extend(["-map".into(), format!("0:{}", a_idx)]);
    } else {
        args.extend(["-map".into(), "0:a:0".into()]);
    }
    args.extend(["-sn".into()]);

    if use_copy {
        args.extend(["-c:v".into(), "copy".into(), "-c:a".into(), "copy".into()]);
    } else {
        args.extend([
            "-c:v".into(), "libx264".into(),
            "-preset".into(), "veryfast".into(),
            "-crf".into(), "23".into(),
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "192k".into(),
        ]);
    }"""
content = content.replace(old_stream, new_stream, 1)

# Add subtitle handler
sub_handler = """#[derive(Deserialize)]
struct SubtitleQuery {
    path: String,
    s: u32,
}

async fn subtitle_handler(Query(q): Query<SubtitleQuery>) -> impl IntoResponse {
    let path = q.path;
    let s_idx = q.s;

    if !Path::new(&path).exists() {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .body(axum::body::Body::from("File not found"))
            .unwrap();
    }

    let mut args: Vec<String> = vec!["-i".into(), path.clone()];
    args.extend([
        "-map".into(), format!("0:{}", s_idx),
        "-f".into(), "webvtt".into(),
        "pipe:1".into(),
    ]);

    let child = tokio::process::Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();

    match child {
        Err(e) => axum::response::Response::builder()
            .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
            .body(axum::body::Body::from(format!("Failed to start FFmpeg for subtitle: {}", e)))
            .unwrap(),
        Ok(mut child) => {
            let stdout = child.stdout.take().expect("no stdout");
            let stream = tokio_util::io::ReaderStream::new(stdout);
            let body = axum::body::Body::from_stream(stream);
            axum::response::Response::builder()
                .header("Content-Type", "text/vtt")
                .header("Access-Control-Allow-Origin", "*")
                .body(body)
                .unwrap()
        }
    }
}

fn start_streaming_server()"""
content = content.replace("fn start_streaming_server()", sub_handler, 1)

content = content.replace(".route(\"/stream\", axum::routing::get(stream_handler))", ".route(\"/stream\", axum::routing::get(stream_handler))\n            .route(\"/subtitle\", axum::routing::get(subtitle_handler))")

content = content.replace("fetch_recommendations,", "fetch_recommendations,\n            get_media_info,")

with open("src-tauri/src/main.rs", "w") as f:
    f.write(content)
