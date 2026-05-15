package com.meflix.app.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.meflix.app.data.FolderStore
import com.meflix.app.data.MediaScanner
import com.meflix.app.data.ProgressInfo
import com.meflix.app.data.ProgressStore
import com.meflix.app.data.TmdbRepository
import com.meflix.app.data.appDataStore
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import com.meflix.app.data.tmdbApiKeyFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class LibraryFilter { ALL, MOVIES, SERIES }

data class LibraryUiState(
    val isScanning: Boolean = false,
    val isFetchingMetadata: Boolean = false,
    val metadataProgress: Pair<Int, Int> = 0 to 0,
    val error: String? = null
)

class LibraryViewModel : ViewModel() {

    private val _library = MutableStateFlow<List<MediaItem>>(emptyList())
    private val _uiState = MutableStateFlow(LibraryUiState())
    private val _searchQuery = MutableStateFlow("")
    private val _filter = MutableStateFlow(LibraryFilter.ALL)
    private val _continueWatching = MutableStateFlow<List<Pair<MediaItem, ProgressInfo>>>(emptyList())

    val uiState: StateFlow<LibraryUiState> = _uiState
    val searchQuery: StateFlow<String> = _searchQuery
    val filter: StateFlow<LibraryFilter> = _filter
    val continueWatching: StateFlow<List<Pair<MediaItem, ProgressInfo>>> = _continueWatching

    val visibleLibrary: StateFlow<List<MediaItem>> = combine(
        _library, _searchQuery, _filter
    ) { lib, query, activeFilter ->
        var items = lib
        if (query.isNotBlank()) {
            val q = query.trim().lowercase()
            items = items.filter { it.title.lowercase().contains(q) }
        }
        items = when (activeFilter) {
            LibraryFilter.MOVIES -> items.filter { it.type == MediaType.MOVIE }
            LibraryFilter.SERIES -> items.filter { it.type == MediaType.SERIES }
            LibraryFilter.ALL -> items
        }
        items
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val movies: StateFlow<List<MediaItem>> = _library.map { lib ->
        lib.filter { it.type == MediaType.MOVIE }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val series: StateFlow<List<MediaItem>> = _library.map { lib ->
        lib.filter { it.type == MediaType.SERIES }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val featuredItem: StateFlow<MediaItem?> = _library.map { lib ->
        lib.firstOrNull { it.backdropPath != null } ?: lib.firstOrNull()
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun scanLibrary(context: Context) {
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.value = _uiState.value.copy(isScanning = true, error = null)
            try {
                val folders = FolderStore(context).folders.first()
                val items = MediaScanner(context, folders).scan()
                _library.value = items
                refreshContinueWatching(context, items)

                // Auto-fetch metadata if API key is configured and items need metadata
                val apiKey = context.tmdbApiKeyFlow().first()
                if (apiKey.isNotBlank() && items.any { it.tmdbId == null }) {
                    fetchMetadata(context, apiKey)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Scan failed")
            } finally {
                _uiState.value = _uiState.value.copy(isScanning = false)
            }
        }
    }

    fun fetchMetadata(context: Context, apiKey: String) {
        if (apiKey.isBlank()) return
        viewModelScope.launch(Dispatchers.IO) {
            _uiState.value = _uiState.value.copy(isFetchingMetadata = true, error = null)
            try {
                val repo = TmdbRepository(context)
                val updated = repo.fetchAllMetadata(
                    items = _library.value,
                    apiKey = apiKey,
                    onProgress = { done, total ->
                        _uiState.value = _uiState.value.copy(metadataProgress = done to total)
                    }
                )
                _library.value = updated
                refreshContinueWatching(context, updated)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "Metadata fetch failed")
            } finally {
                _uiState.value = _uiState.value.copy(isFetchingMetadata = false)
            }
        }
    }

    fun setSearchQuery(query: String) { _searchQuery.value = query }
    fun setFilter(f: LibraryFilter) { _filter.value = f }

    fun refreshContinueWatching(context: Context, items: List<MediaItem> = _library.value) {
        viewModelScope.launch(Dispatchers.IO) {
            val store = ProgressStore(context)
            val result = mutableListOf<Pair<MediaItem, ProgressInfo>>()
            for (item in items) {
                if (item.type == MediaType.SERIES) {
                    item.allEpisodes
                        .mapNotNull { ep -> store.load(ep.path)?.let { prog -> ep.path to prog } }
                        .filter { (_, prog) -> prog.isResumable }
                        .maxByOrNull { (_, prog) -> prog.positionMs }
                        ?.let { (_, prog) -> result.add(item to prog) }
                } else {
                    store.load(item.filePath)?.let { prog ->
                        if (prog.isResumable) result.add(item to prog)
                    }
                }
            }
            _continueWatching.value = result.sortedByDescending { (_, prog) -> prog.positionMs }
        }
    }

    fun libraryByGenre(): Map<String, List<MediaItem>> {
        val genreMap = mutableMapOf<String, MutableList<MediaItem>>()
        for (item in _library.value) {
            for (genre in item.genres) {
                genreMap.getOrPut(genre) { mutableListOf() }.add(item)
            }
        }
        return genreMap.filter { it.value.size >= 2 }
    }
}
