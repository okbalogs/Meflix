package com.meflix.app.data

import android.content.Context
import android.content.SharedPreferences

data class ProgressInfo(
    val positionMs: Long,
    val durationMs: Long
) {
    /** Progress as a fraction 0.0–1.0; 0 if duration unknown. */
    val fraction: Float
        get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f

    /** True if progress is between 3% and 95% — eligible for "Continue Watching". */
    val isResumable: Boolean
        get() = fraction in 0.03f..0.95f
}

/**
 * Stores per-video playback progress in SharedPreferences.
 * Key: video file path (URL-encoded to avoid illegal chars).
 */
class ProgressStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("meflix_progress", Context.MODE_PRIVATE)

    private fun posKey(path: String) = "pos_$path"
    private fun durKey(path: String) = "dur_$path"

    fun save(path: String, positionMs: Long, durationMs: Long) {
        prefs.edit()
            .putLong(posKey(path), positionMs)
            .putLong(durKey(path), durationMs)
            .apply()
    }

    fun load(path: String): ProgressInfo? {
        val pos = prefs.getLong(posKey(path), -1L)
        if (pos < 0) return null
        val dur = prefs.getLong(durKey(path), 0L)
        return ProgressInfo(positionMs = pos, durationMs = dur)
    }

    fun delete(path: String) {
        prefs.edit()
            .remove(posKey(path))
            .remove(durKey(path))
            .apply()
    }

    /** Returns all paths that have saved progress. */
    fun allPaths(): List<String> {
        return prefs.all.keys
            .filter { it.startsWith("pos_") }
            .map { it.removePrefix("pos_") }
    }
}
