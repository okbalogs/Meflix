package com.meflix.app.data

import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.folderDataStore: DataStore<Preferences>
    by preferencesDataStore(name = "meflix_folders")

private val FOLDER_LIST_KEY = stringPreferencesKey("folder_list")

class FolderStore(private val context: Context) {

    val folders: Flow<List<String>> = context.folderDataStore.data.map { prefs ->
        prefs[FOLDER_LIST_KEY]
            ?.split("\n")
            ?.filter { it.isNotBlank() }
            ?: emptyList()
    }

    suspend fun addFolder(path: String) {
        context.folderDataStore.edit { prefs ->
            val current = current(prefs)
            if (!current.contains(path)) {
                prefs[FOLDER_LIST_KEY] = (current + path).joinToString("\n")
            }
        }
    }

    suspend fun removeFolder(path: String) {
        context.folderDataStore.edit { prefs ->
            prefs[FOLDER_LIST_KEY] = current(prefs)
                .filter { it != path }
                .joinToString("\n")
        }
    }

    private fun current(prefs: Preferences): List<String> =
        prefs[FOLDER_LIST_KEY]?.split("\n")?.filter { it.isNotBlank() } ?: emptyList()

    companion object {
        fun pathFromTreeUri(uri: Uri): String? {
            return try {
                val docId = DocumentsContract.getTreeDocumentId(uri)
                val parts = docId.split(":")
                val sub = parts.getOrElse(1) { "" }
                when (parts[0]) {
                    "primary" -> "${Environment.getExternalStorageDirectory().absolutePath}/$sub"
                    else -> "/storage/${parts[0]}/$sub"
                }.trimEnd('/')
            } catch (e: Exception) {
                null
            }
        }
    }
}
