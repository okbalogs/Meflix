package com.meflix.app.ui

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.ui.PlayerView
import com.meflix.app.data.ProgressStore
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import com.meflix.app.ui.theme.NetflixRed
import com.meflix.app.viewmodel.PlayerViewModel
import com.meflix.app.viewmodel.TrackInfo
import kotlinx.coroutines.delay
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerScreen(
    item: MediaItem,
    startPath: String? = null,
    onBack: () -> Unit,
    viewModel: PlayerViewModel = viewModel()
) {
    val context = LocalContext.current
    val view = LocalView.current
    val activity = context as? Activity

    DisposableEffect(Unit) {
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val window = activity?.window
        if (window != null) {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val ctrl = WindowInsetsControllerCompat(window, view)
            ctrl.hide(WindowInsetsCompat.Type.systemBars())
            ctrl.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (window != null) {
                WindowCompat.setDecorFitsSystemWindows(window, true)
                WindowInsetsControllerCompat(window, view).show(WindowInsetsCompat.Type.systemBars())
            }
            viewModel.saveCurrentProgress()
        }
    }

    val progressStore = remember { ProgressStore(context) }
    LaunchedEffect(item, startPath) {
        val cfg = buildQueue(item, startPath, progressStore)
        viewModel.openMedia(
            paths = cfg.paths,
            contentUris = cfg.contentUris,
            titles = cfg.titles,
            startIndex = cfg.startIndex,
            startPositionMs = cfg.startPositionMs,
            store = progressStore
        )
    }

    val isPlaying by viewModel.isPlaying.collectAsState()
    val position by viewModel.currentPosition.collectAsState()
    val duration by viewModel.duration.collectAsState()
    val currentIndex by viewModel.currentIndex.collectAsState()
    val queueTitles by viewModel.queueTitles.collectAsState()
    val audioTracks by viewModel.audioTracks.collectAsState()
    val subtitleTracks by viewModel.subtitleTracks.collectAsState()
    val showUpNext by viewModel.showUpNext.collectAsState()

    var showControls by remember { mutableStateOf(true) }
    var showTrackSheet by remember { mutableStateOf(false) }

    LaunchedEffect(showControls, isPlaying) {
        if (showControls && isPlaying) {
            delay(3_500)
            showControls = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { showControls = !showControls }
    ) {
        // ExoPlayer surface
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    player = viewModel.player
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Controls overlay
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f))
            ) {
                // ── Top bar ────────────────────────────────────────────────────
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopStart)
                        .padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                    Text(
                        text = queueTitles.getOrNull(currentIndex) ?: item.title,
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(horizontal = 4.dp)
                    )
                    if (audioTracks.size > 1 || subtitleTracks.isNotEmpty()) {
                        IconButton(onClick = { showTrackSheet = true; showControls = true }) {
                            Icon(Icons.Default.MoreVert, "Tracks", tint = Color.White)
                        }
                    }
                }

                // ── Center play controls ───────────────────────────────────────
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    PlayerIconButton(
                        icon = Icons.Default.Replay10,
                        contentDescription = "Back 10s",
                        size = 36.dp,
                        onClick = { viewModel.skipBackward() }
                    )

                    // Play/pause with circle background
                    Box(
                        modifier = Modifier
                            .size(62.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.15f))
                            .clickable { viewModel.togglePlayPause() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(40.dp)
                        )
                    }

                    PlayerIconButton(
                        icon = Icons.Default.Forward10,
                        contentDescription = "Forward 10s",
                        size = 36.dp,
                        onClick = { viewModel.skipForward() }
                    )

                    if (viewModel.hasNext()) {
                        PlayerIconButton(
                            icon = Icons.Default.SkipNext,
                            contentDescription = "Next",
                            size = 28.dp,
                            onClick = { viewModel.playNext() }
                        )
                    }
                }

                // ── Bottom: time + Netflix red progress bar ────────────────────
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    // Time row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(formatMs(position), color = Color.White, fontSize = 12.sp)
                        Text(formatMs(duration), color = Color(0xFFB3B3B3), fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(4.dp))

                    // Seek bar — Netflix red
                    Slider(
                        value = if (duration > 0) position.toFloat() / duration.toFloat() else 0f,
                        onValueChange = { frac ->
                            viewModel.seekTo((frac * duration).toLong())
                            showControls = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = SliderDefaults.colors(
                            thumbColor = NetflixRed,
                            activeTrackColor = NetflixRed,
                            inactiveTrackColor = Color.White.copy(alpha = 0.3f)
                        )
                    )
                }
            }
        }

        // Up-Next card
        if (showUpNext && viewModel.hasNext()) {
            UpNextCard(
                title = viewModel.nextTitle() ?: "Next Episode",
                remainingMs = (duration - position).coerceAtLeast(0L),
                onPlayNow = { viewModel.playNext() },
                modifier = Modifier.align(Alignment.BottomEnd).padding(24.dp)
            )
        }
    }

    // Track selection sheet
    if (showTrackSheet) {
        ModalBottomSheet(
            onDismissRequest = { showTrackSheet = false },
            containerColor = Color(0xFF1C1C1C),
            dragHandle = {
                Box(
                    Modifier
                        .padding(vertical = 8.dp)
                        .size(width = 36.dp, height = 4.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.3f))
                )
            }
        ) {
            TrackSelectionSheet(
                audioTracks = audioTracks,
                subtitleTracks = subtitleTracks,
                onAudioSelect = { g, t -> viewModel.selectAudioTrack(g, t); showTrackSheet = false },
                onSubtitleSelect = { g, t -> viewModel.selectSubtitleTrack(g, t); showTrackSheet = false },
                onSubtitleOff = { viewModel.disableSubtitles(); showTrackSheet = false }
            )
        }
    }
}

@Composable
private fun PlayerIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    size: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit
) {
    IconButton(onClick = onClick, modifier = Modifier.size(size + 16.dp)) {
        Icon(icon, contentDescription, tint = Color.White, modifier = Modifier.size(size))
    }
}

@Composable
private fun UpNextCard(
    title: String,
    remainingMs: Long,
    onPlayNow: () -> Unit,
    modifier: Modifier = Modifier
) {
    val seconds = TimeUnit.MILLISECONDS.toSeconds(remainingMs)
    Card(
        modifier = modifier.width(260.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xEE1A1A1A)),
        shape = RoundedCornerShape(6.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("Up Next", fontSize = 11.sp, color = Color.Gray)
            Spacer(Modifier.height(3.dp))
            Text(
                title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(6.dp))
            Text("Playing in ${seconds}s", fontSize = 11.sp, color = Color.Gray)
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = onPlayNow,
                colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                shape = RoundedCornerShape(3.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Play Now", fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun TrackSelectionSheet(
    audioTracks: List<TrackInfo>,
    subtitleTracks: List<TrackInfo>,
    onAudioSelect: (Int, Int) -> Unit,
    onSubtitleSelect: (Int, Int) -> Unit,
    onSubtitleOff: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 32.dp)
    ) {
        if (audioTracks.isNotEmpty()) {
            item {
                TrackSectionHeader(icon = Icons.Default.VolumeUp, label = "Audio")
            }
            items(audioTracks) { track ->
                TrackItem(
                    label = track.label,
                    isSelected = track.isSelected,
                    onClick = { onAudioSelect(track.groupIndex, track.trackIndex) }
                )
            }
        }
        if (subtitleTracks.isNotEmpty()) {
            item {
                TrackSectionHeader(icon = Icons.Default.Subtitles, label = "Subtitles")
            }
            item {
                TrackItem(
                    label = "Off",
                    isSelected = subtitleTracks.none { it.isSelected },
                    onClick = onSubtitleOff
                )
            }
            items(subtitleTracks) { track ->
                TrackItem(
                    label = track.label,
                    isSelected = track.isSelected,
                    onClick = { onSubtitleSelect(track.groupIndex, track.trackIndex) }
                )
            }
        }
    }
}

@Composable
private fun TrackSectionHeader(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TrackItem(label: String, isSelected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onClick,
            colors = RadioButtonDefaults.colors(selectedColor = NetflixRed)
        )
        Spacer(Modifier.width(10.dp))
        Text(label, color = if (isSelected) Color.White else Color(0xFFB3B3B3), fontSize = 14.sp)
    }
}

private fun formatMs(ms: Long): String {
    val h = TimeUnit.MILLISECONDS.toHours(ms)
    val m = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
    val s = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private data class QueueConfig(
    val paths: List<String>,
    val contentUris: List<String>,
    val titles: List<String>,
    val startIndex: Int,
    val startPositionMs: Long
)

private fun buildQueue(
    item: MediaItem,
    startPath: String?,
    progressStore: ProgressStore
): QueueConfig {
    return if (item.type == MediaType.SERIES) {
        val episodes = item.allEpisodes
        val paths = episodes.map { it.path }
        val contentUris = episodes.map { it.contentUri }
        val titles = episodes.map { ep ->
            "${item.title} — S%02dE%02d %s".format(ep.season, ep.episode, ep.displayName)
        }
        val startIndex = if (startPath != null) {
            paths.indexOf(startPath).coerceAtLeast(0)
        } else {
            episodes.indexOfLast { ep ->
                progressStore.load(ep.path)?.isResumable == true
            }.takeIf { it >= 0 } ?: 0
        }
        val startPos = progressStore.load(paths.getOrElse(startIndex) { paths[0] })
            ?.positionMs ?: 0L
        QueueConfig(paths, contentUris, titles, startIndex, startPos)
    } else {
        val startPos = progressStore.load(item.filePath)?.positionMs ?: 0L
        QueueConfig(
            paths = listOf(item.filePath),
            contentUris = listOf(item.contentUri),
            titles = listOf(item.title),
            startIndex = 0,
            startPositionMs = startPos
        )
    }
}
