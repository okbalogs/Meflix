package com.meflix.app.data.model

import java.io.Serializable

enum class MediaType : Serializable { MOVIE, SERIES }

data class Episode(
    val path: String,
    val displayName: String,
    val season: Int,
    val episode: Int,
    val durationMs: Long
) : Serializable {
    val title: String
        get() = "S%02dE%02d – %s".format(season, episode, displayName)
}

data class Season(
    val number: Int,
    val episodes: List<Episode>
) : Serializable

data class MediaItem(
    val id: String,                    // unique: folder path or file path
    val title: String,                 // display title (cleaned folder/file name)
    val type: MediaType,
    val folderPath: String,            // directory containing the media
    val filePath: String,              // single file path (movies) or first episode (series)
    val seasons: List<Season> = emptyList(),
    val durationMs: Long = 0L,

    // TMDB metadata (null until fetched)
    val tmdbId: Int? = null,
    val overview: String? = null,
    val posterPath: String? = null,    // local file path to cached poster
    val backdropPath: String? = null,  // local file path to cached backdrop
    val rating: Float? = null,
    val year: String? = null,
    val genres: List<String> = emptyList()
) : Serializable {
    /** All episodes in season-then-episode order (for series queue). */
    val allEpisodes: List<Episode>
        get() = seasons.sortedBy { it.number }.flatMap { s ->
            s.episodes.sortedBy { it.episode }
        }

    /** Gradient index derived from title hash (0-4) */
    val gradientIndex: Int
        get() = ((title.hashCode() and Int.MAX_VALUE) % 5)
}
