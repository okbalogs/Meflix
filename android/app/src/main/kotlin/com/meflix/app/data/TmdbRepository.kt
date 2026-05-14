package com.meflix.app.data

import android.content.Context
import com.meflix.app.data.model.CachedMetadata
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

private const val RATE_LIMIT_DELAY_MS = 260L

class TmdbRepository(private val context: Context) {

    private val api = TmdbApi.create()
    private val cache = MetadataCache(context)
    private val httpClient = OkHttpClient()
    private val posterDir = File(context.filesDir, "posters").also { it.mkdirs() }

    // ── Fetch metadata for a single item ──────────────────────────────────────

    suspend fun fetchMetadata(item: MediaItem, apiKey: String): MediaItem {
        // Check cache first
        val cached = cache.get(item.title)
        if (cached != null) {
            return applyCache(item, cached)
        }

        return try {
            val result = when (item.type) {
                MediaType.MOVIE -> fetchMovieMetadata(item, apiKey)
                MediaType.SERIES -> fetchTvMetadata(item, apiKey)
            }
            result
        } catch (e: Exception) {
            item // Return unchanged on error
        }
    }

    // ── Batch fetch with rate limiting ────────────────────────────────────────

    suspend fun fetchAllMetadata(
        items: List<MediaItem>,
        apiKey: String,
        onProgress: suspend (Int, Int) -> Unit = { _, _ -> }
    ): List<MediaItem> {
        val results = items.toMutableList()
        var fetched = 0

        items.forEachIndexed { index, item ->
            // Skip if already cached
            if (cache.get(item.title) == null) {
                results[index] = fetchMetadata(item, apiKey)
                fetched++
                delay(RATE_LIMIT_DELAY_MS)
            } else {
                results[index] = fetchMetadata(item, apiKey)
            }
            onProgress(index + 1, items.size)
        }

        return results
    }

    // ── Genre helpers ─────────────────────────────────────────────────────────

    private val movieGenreMap = mutableMapOf<Int, String>()
    private val tvGenreMap = mutableMapOf<Int, String>()

    private suspend fun ensureGenres(apiKey: String) {
        if (movieGenreMap.isEmpty()) {
            try {
                api.getMovieGenres(apiKey).body()?.genres?.forEach { g ->
                    movieGenreMap[g.id] = g.name
                }
            } catch (_: Exception) {}
        }
        if (tvGenreMap.isEmpty()) {
            try {
                api.getTvGenres(apiKey).body()?.genres?.forEach { g ->
                    tvGenreMap[g.id] = g.name
                }
            } catch (_: Exception) {}
        }
    }

    // ── Movie fetch ───────────────────────────────────────────────────────────

    private suspend fun fetchMovieMetadata(item: MediaItem, apiKey: String): MediaItem {
        ensureGenres(apiKey)
        val response = api.searchMovie(apiKey = apiKey, query = item.title)
        val movie = response.body()?.results?.firstOrNull() ?: return item

        val posterLocalPath = movie.posterPath?.let { downloadImage(it, "${movie.id}_poster") }
        val backdropLocalPath = movie.backdropPath?.let { downloadImage(it, "${movie.id}_backdrop") }
        val genres = movie.genreIds.mapNotNull { movieGenreMap[it] }

        val metadata = CachedMetadata(
            tmdbId = movie.id,
            title = movie.displayTitle,
            overview = movie.overview,
            posterLocalPath = posterLocalPath,
            backdropLocalPath = backdropLocalPath,
            rating = movie.voteAverage,
            year = movie.year,
            genres = genres,
            mediaType = "MOVIE"
        )
        cache.put(item.title, metadata)

        return applyCache(item, metadata)
    }

    // ── TV fetch ──────────────────────────────────────────────────────────────

    private suspend fun fetchTvMetadata(item: MediaItem, apiKey: String): MediaItem {
        ensureGenres(apiKey)
        val response = api.searchTv(apiKey = apiKey, query = item.title)
        val show = response.body()?.results?.firstOrNull() ?: return item

        val posterLocalPath = show.posterPath?.let { downloadImage(it, "${show.id}_poster") }
        val backdropLocalPath = show.backdropPath?.let { downloadImage(it, "${show.id}_backdrop") }
        val genres = show.genreIds.mapNotNull { tvGenreMap[it] }

        val metadata = CachedMetadata(
            tmdbId = show.id,
            title = show.displayTitle,
            overview = show.overview,
            posterLocalPath = posterLocalPath,
            backdropLocalPath = backdropLocalPath,
            rating = show.voteAverage,
            year = show.year,
            genres = genres,
            mediaType = "SERIES"
        )
        cache.put(item.title, metadata)

        return applyCache(item, metadata)
    }

    // ── Apply cache to MediaItem ──────────────────────────────────────────────

    private fun applyCache(item: MediaItem, cached: CachedMetadata): MediaItem {
        return item.copy(
            tmdbId = cached.tmdbId,
            overview = cached.overview,
            posterPath = cached.posterLocalPath,
            backdropPath = cached.backdropLocalPath,
            rating = cached.rating,
            year = cached.year,
            genres = cached.genres
        )
    }

    // ── Image downloader ──────────────────────────────────────────────────────

    private suspend fun downloadImage(tmdbPath: String, fileName: String): String? {
        return withContext(Dispatchers.IO) {
            try {
                val ext = if (tmdbPath.endsWith(".png")) "png" else "jpg"
                val destFile = File(posterDir, "$fileName.$ext")
                if (destFile.exists()) return@withContext destFile.absolutePath

                val url = TmdbApi.posterUrl(tmdbPath)
                val request = Request.Builder().url(url).build()
                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val body = response.body ?: return@withContext null
                    destFile.outputStream().use { out ->
                        body.byteStream().copyTo(out)
                    }
                    destFile.absolutePath
                }
            } catch (e: Exception) {
                null
            }
        }
    }

    // ── Expose cache for preloading ───────────────────────────────────────────

    fun getCachedMetadata(key: String): CachedMetadata? = cache.get(key)
}
