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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Forward10
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.ui.PlayerView
import com.meflix.app.data.ProgressStore
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import com.meflix.app.ui.theme.NetflixBlack
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

    // Lock to landscape and hide system UI
    DisposableEffect(Unit) {
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val window = activity?.window
        if (window != null) {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val controller = WindowInsetsControllerCompat(window, view)
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

            if (window != null) {
                WindowCompat.setDecorFitsSystemWindows(window, true)
                val controller = WindowInsetsControllerCompat(window, view)
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
            viewModel.saveCurrentProgress()
        }
    }

    // Build playback queue
    val progressStore = remember { ProgressStore(context) }
    LaunchedEffect(item, startPath) {
        val (paths, titles, startIndex, startPos) = buildQueue(item, startPath, progressStore)
        viewModel.openMedia(
            paths = paths,
            titles = titles,
            startIndex = startIndex,
            startPositionMs = startPos,
            store = progressStore
        )
    }

    val isPlaying by viewModel.isPlaying.collectAsState()
    val position by viewModel.currentPosition.collectAsState()
    val duration by viewModel.duration.collectAsState()
    val currentIndex by viewModel.currentIndex.collectAsState()
    val queue by viewModel.queue.collectAsState()
    val queueTitles by viewModel.queueTitles.collectAsState()
    val audioTracks by viewModel.audioTracks.collectAsState()
    val subtitleTracks by viewModel.subtitleTracks.collectAsState()
    val showUpNext by viewModel.showUpNext.collectAsState()

    var showControls by remember { mutableStateOf(true) }
    var showTrackSheet by remember { mutableStateOf(false) }

    // Auto-hide controls
    LaunchedEffect(showControls) {
        if (showControls) {
            delay(3_000)
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
            ) {
                showControls = !showControls
            }
    ) {
        // ExoPlayer surface
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false // We use custom controls
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
            // Semi-transparent scrim
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f))
            ) {
                // Top bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopStart)
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                    Text(
                        text = queueTitles.getOrNull(currentIndex)
                            ?: item.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(horizontal = 8.dp)
                    )
                    // Track selector button
                    if (audioTracks.size > 1 || subtitleTracks.isNotEmpty()) {
                        IconButton(onClick = {
                            showTrackSheet = true
                            showControls = true
                        }) {
                            Icon(Icons.Default.Subtitles, "Tracks", tint = Color.White)
                        }
                    }
                }

                // Center play controls
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(24.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { viewModel.skipBackward() },
                        modifier = Modifier.size(52.dp)
                    ) {
                        Icon(
                            Icons.Default.Replay10,
                            "Skip back 10s",
                            tint = Color.White,
                            modifier = Modifier.size(36.dp)
                        )
                    }

                    IconButton(
                        onClick = { viewModel.togglePlayPause() },
                        modifier = Modifier.size(64.dp)
                    ) {
                        Icon(
                            if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            if (isPlaying) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(48.dp)
                        )
                    }

                    IconButton(
                        onClick = { viewModel.skipForward() },
                        modifier = Modifier.size(52.dp)
                    ) {
                        Icon(
                            Icons.Default.Forward10,
                            "Skip forward 10s",
                            tint = Color.White,
                            modifier = Modifier.size(36.dp)
                        )
                    }

                    if (viewModel.hasNext()) {
                        IconButton(
                            onClick = { viewModel.playNext() },
                            modifier = Modifier.size(52.dp)
                        ) {
                            Icon(
                                Icons.Default.SkipNext,
                                "Next",
                                tint = Color.White,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                }

                // Bottom bar: seekbar + time
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    // Time display
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            formatMs(position),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White
                        )
                        Text(
                            formatMs(duration),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White
                        )
                    }

                    // Seek bar
                    Slider(
                        value = if (duration > 0) position.toFloat() / duration.toFloat() else 0f,
                        onValueChange = { fraction ->
                            viewModel.seekTo((fraction * duration).toLong())
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
            val nextTitle = viewModel.nextTitle() ?: "Next Episode"
            val remaining = (duration - position).coerceAtLeast(0L)
            UpNextCard(
                title = nextTitle,
                remainingMs = remaining,
                onPlayNow = { viewModel.playNext() },
                onDismiss = { /* just let it expire */ },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(24.dp)
            )
        }
    }

    // Track selection bottom sheet
    if (showTrackSheet) {
        ModalBottomSheet(
            onDismissRequest = { showTrackSheet = false },
            containerColor = Color(0xFF1C1C1C)
        ) {
            TrackSelectionSheet(
                audioTracks = audioTracks,
                subtitleTracks = subtitleTracks,
                onAudioSelect = { groupIdx, trackIdx ->
                    viewModel.selectAudioTrack(groupIdx, trackIdx)
                    showTrackSheet = false
                },
                onSubtitleSelect = { groupIdx, trackIdx ->
                    viewModel.selectSubtitleTrack(groupIdx, trackIdx)
                    showTrackSheet = false
                },
                onSubtitleOff = {
                    viewModel.disableSubtitles()
                    showTrackSheet = false
                },
                onDismiss = { showTrackSheet = false }
            )
        }
    }
}

@Composable
private fun UpNextCard(
    title: String,
    remainingMs: Long,
    onPlayNow: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val seconds = TimeUnit.MILLISECONDS.toSeconds(remainingMs)
    Card(
        modifier = modifier.width(280.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xDD1A1A1A)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Up Next",
                style = MaterialTheme.typography.labelMedium,
                color = Color.Gray
            )
            Spacer(Modifier.height(4.dp))
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Playing in ${seconds}s",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onPlayNow,
                    colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Text("Play Now", style = MaterialTheme.typography.labelSmall)
                }
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
    onSubtitleOff: () -> Unit,
    onDismiss: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 32.dp)
    ) {
        if (audioTracks.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.VolumeUp, null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Audio", style = MaterialTheme.typography.titleSmall, color = Color.White)
                }
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
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Subtitles, null, tint = Color.White, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Subtitles", style = MaterialTheme.typography.titleSmall, color = Color.White)
                }
            }
            item {
                TrackItem(
                    label = "None (Off)",
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
private fun TrackItem(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
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
        Spacer(Modifier.width(8.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Color.White)
    }
}

private fun formatMs(ms: Long): String {
    val h = TimeUnit.MILLISECONDS.toHours(ms)
    val m = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
    val s = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

// ── Queue builder ─────────────────────────────────────────────────────────────

private data class QueueConfig(
    val paths: List<String>,
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
        val titles = episodes.map { ep ->
            "${item.title} – S%02dE%02d %s".format(ep.season, ep.episode, ep.displayName)
        }
        val startIndex = if (startPath != null) {
            paths.indexOf(startPath).coerceAtLeast(0)
        } else {
            // Find last watched episode
            episodes.indexOfLast { ep ->
                progressStore.load(ep.path)?.isResumable == true
            }.takeIf { it >= 0 } ?: 0
        }
        val startPos = progressStore.load(paths.getOrElse(startIndex) { paths[0] })
            ?.positionMs ?: 0L
        QueueConfig(paths, titles, startIndex, startPos)
    } else {
        val startPos = progressStore.load(item.filePath)?.positionMs ?: 0L
        QueueConfig(
            paths = listOf(item.filePath),
            titles = listOf(item.title),
            startIndex = 0,
            startPositionMs = startPos
        )
    }
}
