package com.meflix.app.ui

import android.Manifest
import android.os.Build
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.meflix.app.data.model.MediaItem
import com.meflix.app.ui.components.BillboardHeader
import com.meflix.app.ui.components.ContentRow
import com.meflix.app.ui.components.MediaCard
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
    val listState = rememberLazyListState()

    var isSearchActive by remember { mutableStateOf(false) }

    // Determine if we've scrolled past the billboard enough to darken the top bar
    val isScrolled by remember {
        derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 300 }
    }
    val topBarAlpha by animateFloatAsState(if (isScrolled) 1f else 0f, label = "topBarAlpha")

    val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        listOf(Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_IMAGES)
    } else {
        listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    val permissionState = rememberMultiplePermissionsState(permissions)
    val hasPermission = permissionState.permissions.all { it.status.isGranted }

    LaunchedEffect(hasPermission) {
        if (hasPermission) viewModel.scanLibrary(context)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
    ) {
        when {
            !hasPermission -> PermissionRequest(
                onGrantClick = { permissionState.launchMultiplePermissionRequest() }
            )

            uiState.isScanning -> ScanningIndicator()

            isSearchActive -> SearchOverlay(
                query = searchQuery,
                items = visibleLibrary,
                onQueryChange = { viewModel.setSearchQuery(it) },
                onItemClick = { onNavigateToDetail(it) },
                onClose = { isSearchActive = false; viewModel.setSearchQuery("") }
            )

            movies.isEmpty() && series.isEmpty() -> EmptyLibrary(
                onSettingsClick = onNavigateToSettings
            )

            else -> {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    // Billboard takes full top portion (no top padding — slides behind the nav bar)
                    item {
                        featured?.let { item ->
                            BillboardHeader(
                                item = item,
                                onPlayClick = { onNavigateToPlayer(item, null) },
                                onInfoClick = { onNavigateToDetail(item) }
                            )
                        }
                    }

                    if (continueWatching.isNotEmpty()) {
                        item {
                            ContentRow(
                                title = "Continue Watching",
                                items = continueWatching.map { it.first },
                                onItemClick = { item ->
                                    onNavigateToPlayer(item, null)
                                }
                            )
                        }
                    }

                    if (movies.isNotEmpty()) {
                        item { ContentRow(title = "Movies", items = movies, onItemClick = { onNavigateToDetail(it) }) }
                    }

                    if (series.isNotEmpty()) {
                        item { ContentRow(title = "TV Shows", items = series, onItemClick = { onNavigateToDetail(it) }) }
                    }

                    val genreMap = viewModel.libraryByGenre()
                    for ((genre, genreItems) in genreMap.entries.take(8)) {
                        item {
                            ContentRow(title = genre, items = genreItems, onItemClick = { onNavigateToDetail(it) })
                        }
                    }

                    item { Spacer(Modifier.navigationBarsPadding().height(24.dp)) }
                }
            }
        }

        // Netflix-style top nav overlay (floats above content)
        if (!isSearchActive && hasPermission) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                NetflixBlack.copy(alpha = 0.9f + topBarAlpha * 0.1f),
                                NetflixBlack.copy(alpha = topBarAlpha * 0.9f),
                                Color.Transparent
                            ),
                            startY = 0f,
                            endY = Float.POSITIVE_INFINITY
                        )
                    )
                    .statusBarsPadding()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Meflix logo
                    Text(
                        "MEFLIX",
                        color = NetflixRed,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 2.sp
                    )

                    // Filter tabs
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf(LibraryFilter.ALL to "For You", LibraryFilter.MOVIES to "Movies", LibraryFilter.SERIES to "TV Shows").forEach { (f, label) ->
                            NetflixTab(label = label, selected = filter == f, onClick = { viewModel.setFilter(f) })
                        }
                    }

                    // Action icons
                    Row {
                        IconButton(onClick = { isSearchActive = true }) {
                            Icon(Icons.Default.Search, "Search", tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                        IconButton(onClick = onNavigateToSettings) {
                            Icon(Icons.Default.Settings, "Settings", tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                    }
                }
            }
        }

        // Error toast
        uiState.error?.let { err ->
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp)
                    .navigationBarsPadding()
            ) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Color(0xFF323232)
                ) {
                    Text(
                        err,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
private fun NetflixTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .background(if (selected) Color.White else Color.Transparent)
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(
            label,
            color = if (selected) Color.Black else Color.White,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
        )
    }
}

@Composable
private fun SearchOverlay(
    query: String,
    items: List<MediaItem>,
    onQueryChange: (String) -> Unit,
    onItemClick: (MediaItem) -> Unit,
    onClose: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
            .statusBarsPadding()
    ) {
        // Search bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Search, null, tint = Color.Gray, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                textStyle = TextStyle(color = Color.White, fontSize = 16.sp),
                cursorBrush = SolidColor(NetflixRed),
                decorationBox = { inner ->
                    if (query.isEmpty()) Text("Search titles…", color = Color.Gray, fontSize = 16.sp)
                    inner()
                }
            )
            Spacer(Modifier.width(12.dp))
            TextButton(onClick = onClose) {
                Text("Cancel", color = Color.White)
            }
        }

        HorizontalDivider(color = Color.White.copy(alpha = 0.1f))

        if (items.isEmpty() && query.isNotBlank()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No results for \"$query\"", color = Color.Gray)
            }
        } else {
            androidx.compose.foundation.lazy.LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(items.size) { idx ->
                    val item = items[idx]
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { onItemClick(item) },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        MediaCard(item = item, onClick = { onItemClick(item) }, width = 80.dp, height = 45.dp)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(item.title, color = Color.White, fontWeight = FontWeight.Medium)
                            item.year?.let { Text(it, color = Color.Gray, fontSize = 12.sp) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScanningIndicator() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = NetflixRed, strokeWidth = 3.dp)
            Spacer(Modifier.height(16.dp))
            Text("Scanning library…", color = Color.White, fontSize = 14.sp)
        }
    }
}

@Composable
private fun EmptyLibrary(onSettingsClick: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "No videos found",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Add a folder in Settings to get started.",
                color = Color.Gray,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = onSettingsClick,
                colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                shape = RoundedCornerShape(4.dp)
            ) {
                Text("Go to Settings")
            }
        }
    }
}

@Composable
private fun PermissionRequest(onGrantClick: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "Storage access required",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Meflix needs permission to read your video files.",
                color = Color.Gray,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = onGrantClick,
                colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                shape = RoundedCornerShape(4.dp)
            ) {
                Text("Grant Permission")
            }
        }
    }
}
