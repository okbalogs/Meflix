package com.meflix.app.data

import android.content.ContentUris
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

class MediaScanner(
    private val context: Context,
    private val filterFolders: List<String> = emptyList()
) {

    data class RawVideo(
        val id: Long,
        val displayName: String,
        val data: String,
        val contentUri: String,
        val durationMs: Long,
        val bucketName: String
    )

    fun scan(): List<MediaItem> = groupIntoMediaItems(queryMediaStore())

    private fun queryMediaStore(): List<RawVideo> {
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DATA,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.BUCKET_DISPLAY_NAME
        )

        val selectionParts = mutableListOf("${MediaStore.Video.Media.DURATION} > ?")
        val args = mutableListOf("60000")

        if (filterFolders.isNotEmpty()) {
            val clauses = filterFolders.joinToString(" OR ") {
                "${MediaStore.Video.Media.DATA} LIKE ?"
            }
            selectionParts.add("($clauses)")
            filterFolders.forEach { args.add("$it/%") }
        }

        val results = mutableListOf<RawVideo>()

        context.contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            selectionParts.joinToString(" AND "),
            args.toTypedArray(),
            "${MediaStore.Video.Media.DISPLAY_NAME} ASC"
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
            val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)
            val durCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
            val bucketCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)

            while (cursor.moveToNext()) {
                val id = cursor.getLong(idCol)
                val name = cursor.getString(nameCol) ?: continue
                val data = cursor.getString(dataCol) ?: continue

                if (SKIP_PATTERN.containsMatchIn(name)) continue
                if (SKIP_PATTERN.containsMatchIn(data)) continue

                val contentUri = ContentUris.withAppendedId(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id
                ).toString()

                results += RawVideo(
                    id = id,
                    displayName = name,
                    data = data,
                    contentUri = contentUri,
                    durationMs = cursor.getLong(durCol),
                    bucketName = cursor.getString(bucketCol)
                        ?: File(data).parentFile?.name ?: "Unknown"
                )
            }
        }

        return results
    }

    private fun groupIntoMediaItems(videos: List<RawVideo>): List<MediaItem> {
        val byDirectory = videos.groupBy { File(it.data).parent ?: "/" }
        val items = mutableListOf<MediaItem>()

        for ((dirPath, files) in byDirectory) {
            val hasSeriesFiles = files.any { SE_PATTERN.containsMatchIn(it.displayName) }
            if (hasSeriesFiles || files.size > 1) {
                items += buildSeriesItem(dirPath, files)
            } else {
                items += buildMovieItem(files.first(), dirPath)
            }
        }

        return items.sortedBy { it.title.lowercase() }
    }

    private fun buildMovieItem(video: RawVideo, dirPath: String): MediaItem {
        val title = cleanTitle(File(video.displayName).nameWithoutExtension)
        return MediaItem(
            id = video.data,
            title = title,
            type = MediaType.MOVIE,
            folderPath = dirPath,
            filePath = video.data,
            contentUri = video.contentUri,
            durationMs = video.durationMs
        )
    }

    private fun buildSeriesItem(dirPath: String, files: List<RawVideo>): MediaItem {
        val seriesTitle = cleanTitle(File(dirPath).name)

        val episodes = files.mapNotNull { video ->
            val nameWithoutExt = File(video.displayName).nameWithoutExtension
            val match = SE_PATTERN.find(nameWithoutExt)
            if (match != null) {
                val season = match.groupValues[1].toIntOrNull() ?: 1
                val episode = match.groupValues[2].toIntOrNull() ?: 1
                val cleanName = nameWithoutExt
                    .replace(SE_PATTERN, "")
                    .trim(' ', '-', '_', '.')
                    .ifBlank { "Episode $episode" }
                Episode(
                    path = video.data,
                    contentUri = video.contentUri,
                    displayName = cleanName,
                    season = season,
                    episode = episode,
                    durationMs = video.durationMs
                )
            } else {
                val sortedIdx = files.sortedBy { it.data }.indexOf(video)
                Episode(
                    path = video.data,
                    contentUri = video.contentUri,
                    displayName = File(video.displayName).nameWithoutExtension,
                    season = 1,
                    episode = sortedIdx + 1,
                    durationMs = video.durationMs
                )
            }
        }

        val seasons = episodes.groupBy { it.season }.map { (num, eps) ->
            Season(number = num, episodes = eps.sortedBy { it.episode })
        }.sortedBy { it.number }

        val firstEpisode = seasons.firstOrNull()?.episodes?.firstOrNull()

        return MediaItem(
            id = dirPath,
            title = seriesTitle,
            type = MediaType.SERIES,
            folderPath = dirPath,
            filePath = firstEpisode?.path ?: files.first().data,
            contentUri = firstEpisode?.contentUri ?: files.first().contentUri,
            seasons = seasons,
            durationMs = firstEpisode?.durationMs ?: 0L
        )
    }

    private fun cleanTitle(raw: String): String {
        return raw
            .replace(CLEAN_TITLE_PATTERN, " ")
            .replace(YEAR_SUFFIX_PATTERN, "")
            .trim()
            .replaceFirstChar { it.uppercase() }
    }
}
