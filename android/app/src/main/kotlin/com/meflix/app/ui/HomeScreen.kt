package com.meflix.app.ui

import android.Manifest
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.meflix.app.data.model.MediaItem
import com.meflix.app.ui.components.BillboardHeader
import com.meflix.app.ui.components.ContentRow
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.ui.theme.NetflixRed
import com.meflix.app.viewmodel.LibraryFilter
import com.meflix.app.viewmodel.LibraryViewModel

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun HomeScreen(
    onNavigateToDetail: (MediaItem) -> Unit,
    onNavigateToPlayer: (MediaItem, String?) -> Unit,
    onNavigateToSettings: () -> Unit,
    viewModel: LibraryViewModel = viewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val featured by viewModel.featuredItem.collectAsState()
    val movies by viewModel.movies.collectAsState()
    val series by viewModel.series.collectAsState()
    val continueWatching by viewModel.continueWatching.collectAsState()
    val visibleLibrary by viewModel.visibleLibrary.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val filter by viewModel.filter.collectAsState()

    var isSearchActive by remember { mutableStateOf(false) }

    // Permission handling
    val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        listOf(
            Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_IMAGES
        )
    } else {
        listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    val permissionState = rememberMultiplePermissionsState(permissions)
    val hasPermission = permissionState.permissions.all { it.status.isGranted }

    // Scan once permission is granted
    LaunchedEffect(hasPermission) {
        if (hasPermission) {
            viewModel.scanLibrary(context)
        }
    }

    Scaffold(
        containerColor = NetflixBlack,
        topBar = {
            HomeTopBar(
                isSearchActive = isSearchActive,
                searchQuery = searchQuery,
                filter = filter,
                onSearchToggle = {
                    isSearchActive = !isSearchActive
                    if (!isSearchActive) viewModel.setSearchQuery("")
                },
                onSearchQueryChange = { viewModel.setSearchQuery(it) },
                onFilterChange = { viewModel.setFilter(it) },
                onSettingsClick = onNavigateToSettings
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(NetflixBlack)
                .padding(padding)
        ) {
            when {
                !hasPermission -> {
                    PermissionRequest(
                        onGrantClick = { permissionState.launchMultiplePermissionRequest() }
                    )
                }

                uiState.isScanning -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator(color = NetflixRed)
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Scanning library…",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                movies.isEmpty() && series.isEmpty() -> {
                    EmptyLibrary()
                }

                isSearchActive -> {
                    SearchResults(
                        items = visibleLibrary,
                        onItemClick = { onNavigateToDetail(it) }
                    )
                }

                else -> {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        // Billboard
                        item {
                            featured?.let { item ->
                                BillboardHeader(
                                    item = item,
                                    onPlayClick = { onNavigateToPlayer(item, null) },
                                    onInfoClick = { onNavigateToDetail(item) }
                                )
                            }
                        }

                        // Continue Watching
                        if (continueWatching.isNotEmpty()) {
                            item {
                                ContentRow(
                                    title = "Continue Watching",
                                    items = continueWatching.map { it.first },
                                    onItemClick = { item ->
                                        val progress = continueWatching
                                            .find { it.first.id == item.id }
                                            ?.second
                                        val resumePath = if (item.seasons.isNotEmpty()) {
                                            // Find the episode with progress
                                            item.allEpisodes.firstOrNull { ep ->
                                                val prog = continueWatching
                                                    .find { it.first.id == item.id }
                                                    ?.second
                                                prog != null
                                            }?.path
                                        } else null
                                        onNavigateToPlayer(item, resumePath)
                                    },
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                            }
                        }

                        // Movies row
                        if (movies.isNotEmpty()) {
                            item {
                                ContentRow(
                                    title = "Movies",
                                    items = movies,
                                    onItemClick = { onNavigateToDetail(it) },
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                            }
                        }

                        // Series row
                        if (series.isNotEmpty()) {
                            item {
                                ContentRow(
                                    title = "TV Series",
                                    items = series,
                                    onItemClick = { onNavigateToDetail(it) },
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                            }
                        }

                        // Genre rows
                        val genreMap = viewModel.libraryByGenre()
                        for ((genre, genreItems) in genreMap.entries.take(8)) {
                            item {
                                ContentRow(
                                    title = genre,
                                    items = genreItems,
                                    onItemClick = { onNavigateToDetail(it) },
                                    modifier = Modifier.padding(bottom = 8.dp)
                                )
                            }
                        }

                        item { Spacer(Modifier.height(24.dp)) }
                    }
                }
            }

            // Error snackbar
            uiState.error?.let { err ->
                Snackbar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp)
                ) {
                    Text(err)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeTopBar(
    isSearchActive: Boolean,
    searchQuery: String,
    filter: LibraryFilter,
    onSearchToggle: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onFilterChange: (LibraryFilter) -> Unit,
    onSettingsClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(NetflixBlack)
    ) {
        TopAppBar(
            title = {
                if (isSearchActive) {
                    TextField(
                        value = searchQuery,
                        onValueChange = onSearchQueryChange,
                        placeholder = {
                            Text("Search titles…", color = Color.Gray)
                        },
                        singleLine = true,
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            cursorColor = NetflixRed,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    Text(
                        "MEFLIX",
                        color = NetflixRed,
                        style = MaterialTheme.typography.headlineSmall
                    )
                }
            },
            actions = {
                IconButton(onClick = onSearchToggle) {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "Search",
                        tint = Color.White
                    )
                }
                IconButton(onClick = onSettingsClick) {
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = "Settings",
                        tint = Color.White
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = NetflixBlack,
                titleContentColor = Color.White
            )
        )

        // Filter chips
        if (!isSearchActive) {
            Row(
                modifier = Modifier
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                LibraryFilter.values().forEach { f ->
                    FilterChip(
                        selected = filter == f,
                        onClick = { onFilterChange(f) },
                        label = {
                            Text(
                                when (f) {
                                    LibraryFilter.ALL -> "All"
                                    LibraryFilter.MOVIES -> "Movies"
                                    LibraryFilter.SERIES -> "Series"
                                }
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = NetflixRed,
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun PermissionRequest(onGrantClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            "Storage permission is required to scan your media files.",
            color = Color.White,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onGrantClick,
            colors = ButtonDefaults.buttonColors(containerColor = NetflixRed)
        ) {
            Text("Grant Permission")
        }
    }
}

@Composable
private fun EmptyLibrary() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "No media found.\nAdd video files to your device and tap refresh.",
            color = Color.Gray,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp)
        )
    }
}

@Composable
private fun SearchResults(
    items: List<MediaItem>,
    onItemClick: (MediaItem) -> Unit
) {
    if (items.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "No results found",
                color = Color.Gray,
                style = MaterialTheme.typography.bodyLarge
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(items.size) { idx ->
            val item = items[idx]
            Surface(
                modifier = Modifier
                    .fillMaxWidth(),
                color = Color(0xFF1F1F1F),
                shape = MaterialTheme.shapes.small,
                onClick = { onItemClick(item) }
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    com.meflix.app.ui.components.MediaCard(
                        item = item,
                        onClick = { onItemClick(item) },
                        width = 60.dp,
                        height = 90.dp
                    )
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            item.title,
                            style = MaterialTheme.typography.titleSmall,
                            color = Color.White
                        )
                        item.year?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall)
                        }
                        item.overview?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2,
                                color = Color.Gray
                            )
                        }
                    }
                }
            }
        }
    }
}
