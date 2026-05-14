package com.meflix.app.data.model

import com.google.gson.annotations.SerializedName

// ─── Search responses ─────────────────────────────────────────────────────────

data class TmdbSearchResponse<T>(
    val page: Int = 1,
    val results: List<T> = emptyList(),
    @SerializedName("total_results") val totalResults: Int = 0,
    @SerializedName("total_pages") val totalPages: Int = 0
)

// ─── Movie ────────────────────────────────────────────────────────────────────

data class TmdbMovie(
    val id: Int,
    val title: String? = null,
    @SerializedName("original_title") val originalTitle: String? = null,
    val overview: String? = null,
    @SerializedName("poster_path") val posterPath: String? = null,
    @SerializedName("backdrop_path") val backdropPath: String? = null,
    @SerializedName("vote_average") val voteAverage: Float? = null,
    @SerializedName("release_date") val releaseDate: String? = null,
    @SerializedName("genre_ids") val genreIds: List<Int> = emptyList()
) {
    val year: String? get() = releaseDate?.take(4)?.takeIf { it.isNotBlank() }
    val displayTitle: String get() = title ?: originalTitle ?: "Unknown"
}

// ─── TV Show ──────────────────────────────────────────────────────────────────

data class TmdbTvShow(
    val id: Int,
    val name: String? = null,
    @SerializedName("original_name") val originalName: String? = null,
    val overview: String? = null,
    @SerializedName("poster_path") val posterPath: String? = null,
    @SerializedName("backdrop_path") val backdropPath: String? = null,
    @SerializedName("vote_average") val voteAverage: Float? = null,
    @SerializedName("first_air_date") val firstAirDate: String? = null,
    @SerializedName("genre_ids") val genreIds: List<Int> = emptyList()
) {
    val year: String? get() = firstAirDate?.take(4)?.takeIf { it.isNotBlank() }
    val displayTitle: String get() = name ?: originalName ?: "Unknown"
}

// ─── Genres ───────────────────────────────────────────────────────────────────

data class TmdbGenre(
    val id: Int,
    val name: String
)

data class TmdbGenreListResponse(
    val genres: List<TmdbGenre> = emptyList()
)

// ─── Cached metadata (stored in metadata_cache.json) ─────────────────────────

data class CachedMetadata(
    val tmdbId: Int,
    val title: String,
    val overview: String?,
    val posterLocalPath: String?,
    val backdropLocalPath: String?,
    val rating: Float?,
    val year: String?,
    val genres: List<String>,
    val mediaType: String   // "MOVIE" or "SERIES"
)
