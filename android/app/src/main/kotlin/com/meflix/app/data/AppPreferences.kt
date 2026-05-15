package com.meflix.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.appDataStore: DataStore<Preferences>
    by preferencesDataStore(name = "meflix_settings")

val TMDB_KEY = stringPreferencesKey("tmdb_api_key")

fun Context.tmdbApiKeyFlow(): Flow<String> =
    appDataStore.data.map { prefs -> prefs[TMDB_KEY] ?: "" }
