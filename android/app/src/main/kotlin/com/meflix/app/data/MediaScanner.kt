package com.meflix.app.data

import android.content.Context
import android.provider.MediaStore
import com.meflix.app.data.model.Episode
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import com.meflix.app.data.model.Season
import java.io.File

private val SE_PATTERN = Regex("""(?i)[Ss](\d{1,2})[Ee](\d{1,2})""")
private val SKIP_PATTERN = Regex("""(?i)(sample|trailer|featurette|interview|behind.the.scenes)""")
private val CLEAN_TITLE_PATTERN = Regex("""[._\-]+""")
private val YEAR_SUFFIX_PATTERN = Regex("""\s*\(\d{4}\)\s*$""")

/**
 * Scans the device MediaStore for video files, groups them into MediaItems
 * (movies or series), and returns a sorted list.
 */
class MediaScanner(private val context: Context) {

    data class RawVideo(
        val id: Long,
        val displayName: String,
        val data: String,
        val durationMs: Long,
        val bucketName: String
    )

    fun scan(): List<MediaItem> {
        val rawVideos = queryMediaStore()
        return groupIntoMediaItems(rawVideos)
    }

    // ── MediaStore query ──────────────────────────────────────────────────────

    private fun queryMediaStore(): List<RawVideo> {
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DATA,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME
        )

        val selection = "${MediaStore.Video.Media.DURATION} > ?"
        val selectionArgs = arrayOf("60000") // > 1 minute

        val results = mutableListOf<RawVideo>()

        context.contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            "${MediaStore.Video.Media.DISPLAY_NAME} ASC"
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
            val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)
            val durCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
            val bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)

            while (cursor.moveToNext()) {
                val name = cursor.getString(nameCol) ?: continue
                val data = cursor.getString(dataCol) ?: continue

                // Skip samples / trailers
                if (SKIP_PATTERN.containsMatchIn(name)) continue
                if (SKIP_PATTERN.containsMatchIn(data)) continue

                results += RawVideo(
                    id = cursor.getLong(idCol),
                    displayName = name,
                    data = data,
                    durationMs = cursor.getLong(durCol),
                    bucketName = cursor.getString(bucketCol) ?: File(data).parentFile?.name ?: "Unknown"
                )
            }
        }

        return results
    }

    // ── Grouping ──────────────────────────────────────────────────────────────

    private fun groupIntoMediaItems(videos: List<RawVideo>): List<MediaItem> {
        // Group by directory path
        val byDirectory = videos.groupBy { File(it.data).parent ?: "/" }

        val items = mutableListOf<MediaItem>()

        for ((dirPath, files) in byDirectory) {
            val hasSeriesFiles = files.any { SE_PATTERN.containsMatchIn(it.displayName) }

            if (hasSeriesFiles || files.size > 1) {
                // Treat as a series
                items += buildSeriesItem(dirPath, files)
            } else {
                // Single file → movie
                val video = files.first()
                items += buildMovieItem(video, dirPath)
            }
        }

        return items.sortedBy { it.title.lowercase() }
    }

    // ── Movie item ────────────────────────────────────────────────────────────

    private fun buildMovieItem(video: RawVideo, dirPath: String): MediaItem {
        val title = cleanTitle(File(video.displayName).nameWithoutExtension)
        return MediaItem(
            id = video.data,
            title = title,
            type = MediaType.MOVIE,
            folderPath = dirPath,
            filePath = video.data,
            durationMs = video.durationMs
        )
    }

    // ── Series item ───────────────────────────────────────────────────────────

    private fun buildSeriesItem(dirPath: String, files: List<RawVideo>): MediaItem {
        val folderName = File(dirPath).name
        val seriesTitle = cleanTitle(folderName)

        // Parse each file into an Episode
        val episodes = files.mapNotNull { video ->
            val nameWithoutExt = File(video.displayName).nameWithoutExtension
            val match = SE_PATTERN.find(nameWithoutExt)
            if (match != null) {
                val season = match.groupValues[1].toIntOrNull() ?: 1
                val episode = match.groupValues[2].toIntOrNull() ?: 1
                // Clean episode title: remove the SxxExx portion and any leading/trailing punctuation
                val cleanName = nameWithoutExt
                    .replace(SE_PATTERN, "")
                    .trim(' ', '-', '_', '.')
                    .ifBlank { "Episode $episode" }
                Episode(
                    path = video.data,
                    displayName = cleanName,
                    season = season,
                    episode = episode,
                    durationMs = video.durationMs
                )
            } else {
                // No S/E pattern — still include as season 1 based on sorted order
                val sortedIdx = files.sortedBy { it.data }.indexOf(video)
                Episode(
                    path = video.data,
                    displayName = File(video.displayName).nameWithoutExtension,
                    season = 1,
                    episode = sortedIdx + 1,
                    durationMs = video.durationMs
                )
            }
        }

        // Group into seasons
        val seasonMap = episodes.groupBy { it.season }
        val seasons = seasonMap.map { (num, eps) ->
            Season(number = num, episodes = eps.sortedBy { it.episode })
        }.sortedBy { it.number }

        val firstEpisode = seasons.firstOrNull()?.episodes?.firstOrNull()

        return MediaItem(
            id = dirPath,
            title = seriesTitle,
            type = MediaType.SERIES,
            folderPath = dirPath,
            filePath = firstEpisode?.path ?: files.first().data,
            seasons = seasons,
            durationMs = firstEpisode?.durationMs ?: 0L
        )
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun cleanTitle(raw: String): String {
        return raw
            .replace(CLEAN_TITLE_PATTERN, " ")
            .replace(YEAR_SUFFIX_PATTERN, "")
            .trim()
            .replaceFirstChar { it.uppercase() }
    }
}
