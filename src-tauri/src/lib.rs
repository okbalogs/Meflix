use tauri_plugin_fs;
use tauri_plugin_dialog;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use regex::Regex;
use reqwest;

#[cfg(not(target_os = "android"))]
use axum::extract::Query;
#[cfg(not(target_os = "android"))]
use axum::response::IntoResponse;
#[cfg(not(target_os = "android"))]
use std::process::Stdio;

// ─── Data Structures ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaItem {
    pub name: String,
    pub path: String,
    pub media_type: String,
    pub video_files: Vec<String>,
    pub seasons: Vec<Season>,
    pub year: Option<String>,
    pub quality: Option<String>,
    pub source: Option<String>,
    pub tmdb_id: Option<u64>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub rating: Option<f64>,
    pub genres: Option<Vec<String>>,
    pub tmdb_year: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Season {
    pub number: u32,
    pub path: String,
    pub episodes: Vec<Episode>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Episode {
    pub name: String,
    pub path: String,
    pub season: u32,
    pub number: u32,
    pub quality: Option<String>,
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub tmdb_api_key: Option<String>,
    pub source_folders: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MetadataCache {
    pub items: HashMap<String, CachedMetadata>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedMetadata {
    pub tmdb_id: Option<u64>,
    pub overview: Option<String>,
    pub poster_file: Option<String>,
    pub backdrop_file: Option<String>,
    pub rating: Option<f64>,
    pub genres: Option<Vec<String>>,
    pub year: Option<String>,
}

#[derive(Deserialize, Debug)]
struct TmdbSearchResult {
    results: Vec<TmdbItem>,
}

#[derive(Deserialize, Debug)]
struct TmdbItem {
    id: u64,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    name: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    backdrop_path: Option<String>,
    vote_average: Option<f64>,
    genre_ids: Option<Vec<u32>>,
    #[serde(default)]
    release_date: Option<String>,
    #[serde(default)]
    first_air_date: Option<String>,
}

#[derive(Deserialize, Debug)]
struct TmdbGenreList {
    genres: Vec<TmdbGenre>,
}

#[derive(Deserialize, Debug)]
struct TmdbGenre {
    id: u32,
    name: String,
}

// ─── Helper: Get app data directory ────────────────────────────────────────

fn get_meflix_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let meflix_dir = home.join(".meflix");
    fs::create_dir_all(&meflix_dir).ok();
    fs::create_dir_all(meflix_dir.join("posters")).ok();
    meflix_dir
}

// ─── Filename Parser ───────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct ParsedFilename {
    title: String,
    season: Option<u32>,
    episode: Option<u32>,
    year: Option<String>,
    quality: Option<String>,
    source: Option<String>,
}

fn parse_filename(filename: &str) -> ParsedFilename {
    let name = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    let se_re = Regex::new(r"(?i)[Ss](\d{1,2})[Ee](\d{1,2})").unwrap();
    let (season, episode) = if let Some(caps) = se_re.captures(name) {
        (
            caps.get(1).and_then(|m| m.as_str().parse().ok()),
            caps.get(2).and_then(|m| m.as_str().parse().ok()),
        )
    } else {
        let compact_re = Regex::new(r"(\d{1,2})x(\d{1,2})").unwrap();
        if let Some(caps) = compact_re.captures(name) {
            (
                caps.get(1).and_then(|m| m.as_str().parse().ok()),
                caps.get(2).and_then(|m| m.as_str().parse().ok()),
            )
        } else {
            (None, None)
        }
    };

    let year_re = Regex::new(r"[\.\s\(]((?:19|20)\d{2})[\.\s\)]").unwrap();
    let year = year_re
        .captures(name)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string());

    let quality_re = Regex::new(r"(?i)(2160p|1080p|720p|480p|4[Kk])").unwrap();
    let quality = quality_re
        .captures(name)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string());

    let source_re = Regex::new(r"(?i)(BluRay|WEB[- ]?DL|WEBRip|HDRip|DVDRip|HDTV|BRRip|AMZN|NF|HMAX)").unwrap();
    let source = source_re
        .captures(name)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string());

    let title_end_re = Regex::new(r"(?i)[\.\s](?:[Ss]\d{1,2}[Ee]\d{1,2}|\d{1,2}x\d{1,2}|(?:19|20)\d{2}|2160p|1080p|720p|480p|4[Kk])").unwrap();
    let title = if let Some(mat) = title_end_re.find(name) {
        &name[..mat.start()]
    } else {
        name
    };

    let clean_title = title
        .replace('.', " ")
        .replace('_', " ")
        .replace('-', " ")
        .trim()
        .to_string();

    ParsedFilename {
        title: clean_title,
        season,
        episode,
        year,
        quality,
        source,
    }
}

// ─── Video file detection ──────────────────────────────────────────────────

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts"];

fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_season_folder(name: &str) -> bool {
    let re = Regex::new(r"(?i)^(season\s*\d+|s\d+)$").unwrap();
    re.is_match(name.trim())
}

// ─── Folder Scanner ────────────────────────────────────────────────────────

#[tauri::command]
fn scan_folders(folder_paths: Vec<String>) -> Result<Vec<MediaItem>, String> {
    let mut all_items: Vec<MediaItem> = Vec::new();
    let cache = load_metadata_cache();

    for folder in &folder_paths {
        let root = Path::new(folder);
        if !root.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let mut loose_videos: Vec<PathBuf> = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_video_file(&path) {
                loose_videos.push(path);
                continue;
            }
            if !path.is_dir() {
                continue;
            }

            let folder_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();

            let mut seasons: Vec<Season> = Vec::new();
            let mut direct_videos: Vec<String> = Vec::new();
            let mut has_season_folders = false;

            if let Ok(sub_entries) = fs::read_dir(&path) {
                for sub_entry in sub_entries.flatten() {
                    let sub_path = sub_entry.path();
                    let sub_name = sub_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();

                    if sub_path.is_dir() && is_season_folder(&sub_name) {
                        has_season_folders = true;
                        let season_num_re = Regex::new(r"(?i)(?:season\s*|s)(\d+)").unwrap();
                        let season_num = season_num_re
                            .captures(&sub_name)
                            .and_then(|c| c.get(1))
                            .and_then(|m| m.as_str().parse::<u32>().ok())
                            .unwrap_or(0);

                        let mut episodes: Vec<Episode> = Vec::new();
                        if let Ok(ep_entries) = fs::read_dir(&sub_path) {
                            for ep_entry in ep_entries.flatten() {
                                let ep_path = ep_entry.path();
                                if ep_path.is_file() && is_video_file(&ep_path) {
                                    let ep_filename = ep_path
                                        .file_name()
                                        .unwrap_or_default()
                                        .to_string_lossy()
                                        .into_owned();
                                    let parsed = parse_filename(&ep_filename);
                                    episodes.push(Episode {
                                        name: ep_filename,
                                        path: ep_path.to_string_lossy().into_owned(),
                                        season: parsed.season.unwrap_or(season_num),
                                        number: parsed.episode.unwrap_or(0),
                                        quality: parsed.quality,
                                        source: parsed.source,
                                    });
                                }
                            }
                        }
                        episodes.sort_by_key(|e| e.number);
                        seasons.push(Season {
                            number: season_num,
                            path: sub_path.to_string_lossy().into_owned(),
                            episodes,
                        });
                    } else if sub_path.is_file() && is_video_file(&sub_path) {
                        direct_videos.push(sub_path.to_string_lossy().into_owned());
                    }
                }
            }

            if !has_season_folders && !direct_videos.is_empty() {
                let mut episode_videos: Vec<Episode> = Vec::new();
                let mut movie_videos: Vec<String> = Vec::new();

                for vid_path_str in &direct_videos {
                    let vid_path = Path::new(vid_path_str);
                    let filename = vid_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned();
                    let parsed = parse_filename(&filename);

                    if parsed.season.is_some() || parsed.episode.is_some() {
                        episode_videos.push(Episode {
                            name: filename,
                            path: vid_path_str.clone(),
                            season: parsed.season.unwrap_or(1),
                            number: parsed.episode.unwrap_or(0),
                            quality: parsed.quality,
                            source: parsed.source,
                        });
                    } else {
                        movie_videos.push(vid_path_str.clone());
                    }
                }

                if !episode_videos.is_empty() {
                    let mut season_map: HashMap<u32, Vec<Episode>> = HashMap::new();
                    for ep in episode_videos {
                        season_map.entry(ep.season).or_default().push(ep);
                    }
                    for (snum, mut eps) in season_map {
                        eps.sort_by_key(|e| e.number);
                        seasons.push(Season {
                            number: snum,
                            path: path.to_string_lossy().into_owned(),
                            episodes: eps,
                        });
                    }
                    has_season_folders = true;
                }

                if !movie_videos.is_empty() && !has_season_folders {
                    direct_videos = movie_videos;
                }
            }

            seasons.sort_by_key(|s| s.number);

            let is_series = has_season_folders || !seasons.is_empty();
            let media_type = if is_series { "series" } else { "movie" };

            let parsed_folder = parse_filename(&folder_name);

            let cache_key = folder_name.to_lowercase();
            let cached = cache.items.get(&cache_key);

            let item = MediaItem {
                name: parsed_folder.title.clone(),
                path: path.to_string_lossy().into_owned(),
                media_type: media_type.to_string(),
                video_files: if is_series { vec![] } else { direct_videos },
                seasons,
                year: parsed_folder.year.clone(),
                quality: parsed_folder.quality,
                source: parsed_folder.source,
                tmdb_id: cached.and_then(|c| c.tmdb_id),
                overview: cached.and_then(|c| c.overview.clone()),
                poster_path: cached.and_then(|c| c.poster_file.clone()),
                backdrop_path: cached.and_then(|c| c.backdrop_file.clone()),
                rating: cached.and_then(|c| c.rating),
                genres: cached.and_then(|c| c.genres.clone()),
                tmdb_year: cached.and_then(|c| c.year.clone()),
            };

            all_items.push(item);
        }

        let mut series_map: HashMap<String, Vec<Episode>> = HashMap::new();
        let mut movie_list: Vec<PathBuf> = Vec::new();

        for vid_path in loose_videos {
            let filename = vid_path.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let parsed = parse_filename(&filename);

            if parsed.season.is_some() || parsed.episode.is_some() {
                let s_num = parsed.season.unwrap_or(1);
                let e_num = parsed.episode.unwrap_or(0);
                series_map.entry(parsed.title.clone()).or_default().push(Episode {
                    name: filename,
                    path: vid_path.to_string_lossy().into_owned(),
                    season: s_num,
                    number: e_num,
                    quality: parsed.quality,
                    source: parsed.source,
                });
            } else {
                movie_list.push(vid_path);
            }
        }

        for (series_name, mut eps) in series_map {
            eps.sort_by_key(|e| e.number);

            let mut season_map: HashMap<u32, Vec<Episode>> = HashMap::new();
            for ep in eps {
                season_map.entry(ep.season).or_default().push(ep);
            }
            let mut seasons: Vec<Season> = Vec::new();
            for (snum, mut s_eps) in season_map {
                s_eps.sort_by_key(|e| e.number);
                seasons.push(Season {
                    number: snum,
                    path: folder.clone(),
                    episodes: s_eps,
                });
            }
            seasons.sort_by_key(|s| s.number);

            let cache_key = series_name.to_lowercase();
            let cached = cache.items.get(&cache_key);

            all_items.push(MediaItem {
                name: series_name.clone(),
                path: folder.clone(),
                media_type: "series".to_string(),
                video_files: vec![],
                seasons,
                year: None,
                quality: None,
                source: None,
                tmdb_id: cached.and_then(|c| c.tmdb_id),
                overview: cached.and_then(|c| c.overview.clone()),
                poster_path: cached.and_then(|c| c.poster_file.clone()),
                backdrop_path: cached.and_then(|c| c.backdrop_file.clone()),
                rating: cached.and_then(|c| c.rating),
                genres: cached.and_then(|c| c.genres.clone()),
                tmdb_year: cached.and_then(|c| c.year.clone()),
            });
        }

        for vid_path in movie_list {
            let filename = vid_path.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let parsed = parse_filename(&filename);
            let cache_key = filename.to_lowercase();
            let cached = cache.items.get(&cache_key);

            all_items.push(MediaItem {
                name: parsed.title.clone(),
                path: vid_path.to_string_lossy().into_owned(),
                media_type: "movie".to_string(),
                video_files: vec![vid_path.to_string_lossy().into_owned()],
                seasons: vec![],
                year: parsed.year.clone(),
                quality: parsed.quality,
                source: parsed.source,
                tmdb_id: cached.and_then(|c| c.tmdb_id),
                overview: cached.and_then(|c| c.overview.clone()),
                poster_path: cached.and_then(|c| c.poster_file.clone()),
                backdrop_path: cached.and_then(|c| c.backdrop_file.clone()),
                rating: cached.and_then(|c| c.rating),
                genres: cached.and_then(|c| c.genres.clone()),
                tmdb_year: cached.and_then(|c| c.year.clone()),
            });
        }
    }

    all_items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(all_items)
}

// ─── TMDB Metadata Fetching ───────────────────────────────────────────────

#[tauri::command]
async fn fetch_metadata(
    name: String,
    media_type: String,
    folder_name: String,
    api_key: String,
    year: Option<String>,
) -> Result<CachedMetadata, String> {
    let client = reqwest::Client::new();
    let meflix_dir = get_meflix_dir();

    let search_type = if media_type == "series" { "tv" } else { "movie" };
    let mut url = format!(
        "https://api.themoviedb.org/3/search/{}?api_key={}&query={}",
        search_type,
        api_key,
        urlencoded(&name)
    );
    if let Some(ref y) = year {
        if search_type == "movie" {
            url.push_str(&format!("&year={}", y));
        } else {
            url.push_str(&format!("&first_air_date_year={}", y));
        }
    }

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let search_result: TmdbSearchResult = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let item = search_result
        .results
        .first()
        .ok_or_else(|| "No results found on TMDB".to_string())?;

    let poster_file = if let Some(ref poster) = item.poster_path {
        let poster_url = format!("https://image.tmdb.org/t/p/w500{}", poster);
        let filename = format!("{}_poster.jpg", item.id);
        let filepath = meflix_dir.join("posters").join(&filename);
        if download_image(&client, &poster_url, &filepath).await.is_ok() {
            Some(filepath.to_string_lossy().into_owned())
        } else {
            None
        }
    } else {
        None
    };

    let backdrop_file = if let Some(ref backdrop) = item.backdrop_path {
        let backdrop_url = format!("https://image.tmdb.org/t/p/original{}", backdrop);
        let filename = format!("{}_backdrop.jpg", item.id);
        let filepath = meflix_dir.join("posters").join(&filename);
        if download_image(&client, &backdrop_url, &filepath).await.is_ok() {
            Some(filepath.to_string_lossy().into_owned())
        } else {
            None
        }
    } else {
        None
    };

    let genres = if let Some(ref genre_ids) = item.genre_ids {
        fetch_genre_names(&client, &api_key, search_type, genre_ids).await.ok()
    } else {
        None
    };

    let year_str = item
        .release_date
        .as_ref()
        .or(item.first_air_date.as_ref())
        .and_then(|d| d.split('-').next().map(|s| s.to_string()));

    let cached = CachedMetadata {
        tmdb_id: Some(item.id),
        overview: item.overview.clone(),
        poster_file,
        backdrop_file,
        rating: item.vote_average,
        genres,
        year: year_str,
    };

    let cache_key = folder_name.to_lowercase();
    let mut cache = load_metadata_cache();
    cache.items.insert(cache_key, cached.clone());
    save_metadata_cache(&cache);

    Ok(cached)
}

#[tauri::command]
async fn fetch_all_metadata(
    items: Vec<MediaItem>,
    api_key: String,
) -> Result<Vec<CachedMetadata>, String> {
    let mut results = Vec::new();

    for item in &items {
        if item.tmdb_id.is_some() {
            continue;
        }

        let folder_name = Path::new(&item.path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();

        match fetch_metadata(
            item.name.clone(),
            item.media_type.clone(),
            folder_name,
            api_key.clone(),
            item.year.clone(),
        )
        .await
        {
            Ok(cached) => results.push(cached),
            Err(_) => continue,
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(260)).await;
    }

    Ok(results)
}

// ─── Image Download ────────────────────────────────────────────────────────

async fn download_image(
    client: &reqwest::Client,
    url: &str,
    filepath: &Path,
) -> Result<(), String> {
    if filepath.exists() {
        return Ok(());
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download error: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Read error: {}", e))?;

    let mut file = fs::File::create(filepath).map_err(|e| format!("File error: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Write error: {}", e))?;

    Ok(())
}

// ─── Genre Name Resolver ───────────────────────────────────────────────────

async fn fetch_genre_names(
    client: &reqwest::Client,
    api_key: &str,
    media_type: &str,
    genre_ids: &[u32],
) -> Result<Vec<String>, String> {
    let url = format!(
        "https://api.themoviedb.org/3/genre/{}/list?api_key={}",
        media_type, api_key
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Genre fetch error: {}", e))?;

    let genre_list: TmdbGenreList = response
        .json()
        .await
        .map_err(|e| format!("Genre parse error: {}", e))?;

    let names: Vec<String> = genre_list
        .genres
        .iter()
        .filter(|g| genre_ids.contains(&g.id))
        .map(|g| g.name.clone())
        .collect();

    Ok(names)
}

// ─── Metadata Cache ────────────────────────────────────────────────────────

fn load_metadata_cache() -> MetadataCache {
    let cache_path = get_meflix_dir().join("metadata_cache.json");
    if let Ok(data) = fs::read_to_string(&cache_path) {
        serde_json::from_str(&data).unwrap_or(MetadataCache {
            items: HashMap::new(),
        })
    } else {
        MetadataCache {
            items: HashMap::new(),
        }
    }
}

fn save_metadata_cache(cache: &MetadataCache) {
    let cache_path = get_meflix_dir().join("metadata_cache.json");
    if let Ok(data) = serde_json::to_string_pretty(cache) {
        fs::write(cache_path, data).ok();
    }
}

// ─── Settings ──────────────────────────────────────────────────────────────

#[tauri::command]
fn load_settings() -> AppSettings {
    let settings_path = get_meflix_dir().join("config.json");
    if let Ok(data) = fs::read_to_string(&settings_path) {
        serde_json::from_str(&data).unwrap_or(AppSettings {
            tmdb_api_key: None,
            source_folders: vec![],
        })
    } else {
        AppSettings {
            tmdb_api_key: None,
            source_folders: vec![],
        }
    }
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let settings_path = get_meflix_dir().join("config.json");
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(settings_path, data).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── URL Encoding Helper ──────────────────────────────────────────────────

fn urlencoded(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => '+'.to_string(),
            c if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' => {
                c.to_string()
            }
            c => format!("%{:02X}", c as u32),
        })
        .collect()
}

// ─── TMDB Recommendations ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TmdbRecommendation {
    pub tmdb_id: u64,
    pub title: String,
    pub poster_url: Option<String>,
    pub year: Option<String>,
    pub rating: Option<f64>,
    pub media_type: String,
    pub overview: Option<String>,
}

#[tauri::command]
async fn fetch_recommendations(
    tmdb_id: u64,
    media_type: String,
    api_key: String,
) -> Result<Vec<TmdbRecommendation>, String> {
    let client = reqwest::Client::new();
    let search_type = if media_type == "series" { "tv" } else { "movie" };
    let url = format!(
        "https://api.themoviedb.org/3/{}/{}/recommendations?api_key={}&page=1",
        search_type, tmdb_id, api_key
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: TmdbSearchResult = resp.json().await.map_err(|e| e.to_string())?;
    let recs = data.results.iter().take(12).map(|item| {
        TmdbRecommendation {
            tmdb_id: item.id,
            title: item.title.clone().or_else(|| item.name.clone()).unwrap_or_default(),
            poster_url: item.poster_path.as_ref().map(|p| format!("https://image.tmdb.org/t/p/w300{}", p)),
            year: item.release_date.as_ref().or(item.first_air_date.as_ref())
                .and_then(|d| d.split('-').next().map(|s| s.to_string())),
            rating: item.vote_average,
            media_type: media_type.clone(),
            overview: item.overview.clone(),
        }
    }).collect();
    Ok(recs)
}

// ─── Desktop-only: Play Media, FFmpeg, Streaming Server ───────────────────

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn play_media(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open media: {}", e))
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn check_ffmpeg() -> bool {
    tokio::process::Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .is_ok()
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn probe_codecs(path: String) -> Result<String, String> {
    let v_out = tokio::process::Command::new("ffprobe")
        .args(&["-v", "error", "-select_streams", "V:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1", &path])
        .output().await.map_err(|e| e.to_string())?;
    let a_out = tokio::process::Command::new("ffprobe")
        .args(&["-v", "error", "-select_streams", "a:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1", &path])
        .output().await.map_err(|e| e.to_string())?;
    let video = String::from_utf8_lossy(&v_out.stdout).trim().to_string();
    let audio = String::from_utf8_lossy(&a_out.stdout).trim().to_string();
    Ok(format!("{}:{}", video, audio))
}

#[cfg(not(target_os = "android"))]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaInfo {
    pub duration: f64,
    pub streams: Vec<MediaStream>,
    pub chapters: Vec<MediaChapter>,
}

#[cfg(not(target_os = "android"))]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaChapter {
    pub id: u64,
    pub start_time: f64,
    pub end_time: f64,
    pub title: Option<String>,
}

#[cfg(not(target_os = "android"))]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaStream {
    pub index: u32,
    pub codec_type: String,
    pub codec_name: Option<String>,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[cfg(not(target_os = "android"))]
#[derive(Deserialize)]
struct FfprobeOutput {
    streams: Vec<FfprobeStream>,
    format: Option<FfprobeFormat>,
    chapters: Option<Vec<FfprobeChapter>>,
}

#[cfg(not(target_os = "android"))]
#[derive(Deserialize)]
struct FfprobeChapter {
    id: u64,
    start_time: Option<String>,
    end_time: Option<String>,
    tags: Option<HashMap<String, String>>,
}

#[cfg(not(target_os = "android"))]
#[derive(Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

#[cfg(not(target_os = "android"))]
#[derive(Deserialize)]
struct FfprobeStream {
    index: u32,
    codec_type: String,
    codec_name: Option<String>,
    tags: Option<HashMap<String, String>>,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn get_media_info(path: String) -> Result<MediaInfo, String> {
    let out = tokio::process::Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-show_chapters",
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

    let mut duration = 0.0;
    if let Some(format) = parsed.format {
        if let Some(dur_str) = format.duration {
            duration = dur_str.parse::<f64>().unwrap_or(0.0);
        }
    }

    let mut chapters = Vec::new();
    if let Some(ff_chapters) = parsed.chapters {
        for c in ff_chapters {
            let start = c.start_time.unwrap_or_default().parse::<f64>().unwrap_or(0.0);
            let end = c.end_time.unwrap_or_default().parse::<f64>().unwrap_or(0.0);
            let mut title = None;
            if let Some(tags) = c.tags {
                if let Some(t) = tags.get("title").or(tags.get("TITLE")) {
                    title = Some(t.clone());
                }
            }
            chapters.push(MediaChapter {
                id: c.id,
                start_time: start,
                end_time: end,
                title,
            });
        }
    }

    Ok(MediaInfo {
        duration,
        streams,
        chapters,
    })
}

// ─── Desktop-only: Streaming Server ───────────────────────────────────────

#[cfg(not(target_os = "android"))]
#[derive(Deserialize)]
struct StreamQuery {
    path: String,
    copy: Option<bool>,
    a: Option<u32>,
    start: Option<f64>,
}

#[cfg(not(target_os = "android"))]
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

    let mut args: Vec<String> = Vec::new();
    if let Some(start_time) = q.start {
        args.extend(["-ss".into(), start_time.to_string()]);
    }
    args.extend(["-i".into(), path.clone()]);

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
            "-pix_fmt".into(), "yuv420p".into(),
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "192k".into(),
        ]);
    }
    args.extend([
        "-movflags".into(), "frag_keyframe+empty_moov+faststart".into(),
        "-f".into(), "mp4".into(),
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
            .body(axum::body::Body::from(format!("Failed to start FFmpeg: {}", e)))
            .unwrap(),
        Ok(mut child) => {
            let stdout = child.stdout.take().expect("no stdout");
            let stream = tokio_util::io::ReaderStream::new(stdout);
            let body = axum::body::Body::from_stream(stream);
            axum::response::Response::builder()
                .header("Content-Type", "video/mp4")
                .header("Access-Control-Allow-Origin", "*")
                .body(body)
                .unwrap()
        }
    }
}

#[cfg(not(target_os = "android"))]
#[derive(Deserialize)]
struct SubtitleQuery {
    path: String,
    s: u32,
    start: Option<f64>,
}

#[cfg(not(target_os = "android"))]
async fn subtitle_handler(Query(q): Query<SubtitleQuery>) -> impl IntoResponse {
    let path = q.path;
    let s_idx = q.s;

    if !Path::new(&path).exists() {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::NOT_FOUND)
            .body(axum::body::Body::from("File not found"))
            .unwrap();
    }

    let mut args: Vec<String> = Vec::new();
    if let Some(start_time) = q.start {
        args.extend(["-ss".into(), start_time.to_string()]);
    }
    args.extend(["-i".into(), path.clone()]);

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

#[cfg(not(target_os = "android"))]
fn start_streaming_server() {
    tauri::async_runtime::spawn(async move {
        let app = axum::Router::new()
            .route("/stream", axum::routing::get(stream_handler))
            .route("/subtitle", axum::routing::get(subtitle_handler))
            .layer(tower_http::cors::CorsLayer::permissive());

        let listener = tokio::net::TcpListener::bind("127.0.0.1:1421").await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });
}

// ─── App Entry Point ───────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(not(target_os = "android"))]
    start_streaming_server();

    #[cfg(not(target_os = "android"))]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                scan_folders,
                fetch_metadata,
                fetch_all_metadata,
                play_media,
                load_settings,
                save_settings,
                check_ffmpeg,
                probe_codecs,
                fetch_recommendations,
                get_media_info,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }

    #[cfg(target_os = "android")]
    {
        tauri::Builder::default()
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                scan_folders,
                fetch_metadata,
                fetch_all_metadata,
                load_settings,
                save_settings,
                fetch_recommendations,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}
