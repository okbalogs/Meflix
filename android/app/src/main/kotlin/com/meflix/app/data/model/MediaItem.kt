package com.meflix.app.data.model

import java.io.Serializable

enum class MediaType : Serializable { MOVIE, SERIES }

data class Episode(
    val path: String,
    val contentUri: String = "",
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
    val id: String,
    val title: String,
    val type: MediaType,
    val folderPath: String,
    val filePath: String,
    val contentUri: String = "",
    val seasons: List<Season> = emptyList(),
    val durationMs: Long = 0L,

    // TMDB metadata (null until fetched)
    val tmdbId: Int? = null,
    val overview: String? = null,
    val posterPath: String? = null,
    val backdropPath: String? = null,
    val rating: Float? = null,
    val year: String? = null,
    val genres: List<String> = emptyList()
) : Serializable {
    val allEpisodes: List<Episode>
        get() = seasons.sortedBy { it.number }.flatMap { s ->
            s.episodes.sortedBy { it.episode }
        }

    val gradientIndex: Int
        get() = ((title.hashCode() and Int.MAX_VALUE) % 5)
}
