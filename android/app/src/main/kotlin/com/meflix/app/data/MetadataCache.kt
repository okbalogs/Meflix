package com.meflix.app.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.meflix.app.data.model.CachedMetadata
import java.io.File

/**
 * File-based JSON metadata cache stored at [context.filesDir]/metadata_cache.json.
 * Key: lowercased folder/series name.
 */
class MetadataCache(context: Context) {

    private val cacheFile = File(context.filesDir, "metadata_cache.json")
    private val gson = Gson()
    private val mapType = object : TypeToken<MutableMap<String, CachedMetadata>>() {}.type

    private var cache: MutableMap<String, CachedMetadata> = loadFromDisk()

    // ── Read ──────────────────────────────────────────────────────────────────

    fun get(key: String): CachedMetadata? = cache[key.lowercase()]

    fun getAll(): Map<String, CachedMetadata> = cache.toMap()

    // ── Write ─────────────────────────────────────────────────────────────────

    fun put(key: String, metadata: CachedMetadata) {
        cache[key.lowercase()] = metadata
        saveToDisk()
    }

    fun remove(key: String) {
        cache.remove(key.lowercase())
        saveToDisk()
    }

    fun clear() {
        cache.clear()
        saveToDisk()
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    private fun loadFromDisk(): MutableMap<String, CachedMetadata> {
        return try {
            if (cacheFile.exists()) {
                val json = cacheFile.readText()
                gson.fromJson(json, mapType) ?: mutableMapOf()
            } else {
                mutableMapOf()
            }
        } catch (e: Exception) {
            mutableMapOf()
        }
    }

    private fun saveToDisk() {
        try {
            cacheFile.writeText(gson.toJson(cache))
        } catch (e: Exception) {
            // Log silently — cache is best-effort
        }
    }
}
