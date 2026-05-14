package com.meflix.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.meflix.app.data.model.Episode
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import com.meflix.app.ui.theme.GradientPairs
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.ui.theme.NetflixDarkGray
import com.meflix.app.ui.theme.NetflixRed
import com.meflix.app.ui.theme.NetflixYellow
import java.io.File
import java.util.concurrent.TimeUnit

@Composable
fun DetailScreen(
    item: MediaItem,
    onBack: () -> Unit,
    onPlay: (episodePath: String?) -> Unit
) {
    val gradientPair = GradientPairs[item.gradientIndex]
    var selectedSeason by remember { mutableIntStateOf(item.seasons.firstOrNull()?.number ?: 1) }

    Scaffold(
        containerColor = NetflixBlack,
        topBar = {
            DetailTopBar(onBack = onBack)
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(NetflixBlack)
                .padding(padding)
        ) {
            // Backdrop hero
            item {
                BackdropSection(item = item, gradientPair = gradientPair)
            }

            // Metadata + Play button
            item {
                MetadataSection(
                    item = item,
                    onPlay = { onPlay(null) }
                )
            }

            // Series: season selector + episode list
            if (item.type == MediaType.SERIES && item.seasons.isNotEmpty()) {
                item {
                    SeasonSelector(
                        seasons = item.seasons.map { it.number },
                        selectedSeason = selectedSeason,
                        onSelect = { selectedSeason = it }
                    )
                }

                val episodes = item.seasons
                    .find { it.number == selectedSeason }
                    ?.episodes
                    ?.sortedBy { it.episode }
                    ?: emptyList()

                items(episodes) { episode ->
                    EpisodeRow(
                        episode = episode,
                        onPlay = { onPlay(episode.path) }
                    )
                    HorizontalDivider(color = Color.White.copy(alpha = 0.08f))
                }
            }

            item { Spacer(Modifier.height(32.dp)) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailTopBar(onBack: () -> Unit) {
    TopAppBar(
        title = {},
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Color.Transparent
        )
    )
}

@Composable
private fun BackdropSection(
    item: MediaItem,
    gradientPair: Pair<Color, Color>
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(280.dp)
    ) {
        val backdropFile = item.backdropPath?.let { File(it) }
        if (backdropFile != null && backdropFile.exists()) {
            SubcomposeAsyncImage(
                model = backdropFile,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                error = {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    listOf(gradientPair.first, gradientPair.second)
                                )
                            )
                    )
                }
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(listOf(gradientPair.first, gradientPair.second))
                    )
            )
        }

        // Bottom scrim
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(listOf(Color.Transparent, NetflixBlack))
                )
        )
    }
}

@Composable
private fun MetadataSection(item: MediaItem, onPlay: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        // Poster + info side by side
        Row(verticalAlignment = Alignment.Top) {
            // Poster
            val posterFile = item.posterPath?.let { File(it) }
            if (posterFile != null && posterFile.exists()) {
                SubcomposeAsyncImage(
                    model = posterFile,
                    contentDescription = null,
                    modifier = Modifier
                        .width(100.dp)
                        .height(150.dp)
                        .clip(RoundedCornerShape(6.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                val grad = GradientPairs[item.gradientIndex]
                Box(
                    modifier = Modifier
                        .width(100.dp)
                        .height(150.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            Brush.verticalGradient(listOf(grad.first, grad.second))
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        item.title.take(2).uppercase(),
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White
                    )
                }
            }

            Spacer(Modifier.width(16.dp))

            // Info column
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.headlineSmall,
                    color = Color.White
                )

                Spacer(Modifier.height(4.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    item.year?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                    }
                    item.rating?.let { r ->
                        Icon(
                            Icons.Default.Star,
                            contentDescription = null,
                            tint = NetflixYellow,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            "%.1f".format(r),
                            style = MaterialTheme.typography.bodySmall,
                            color = NetflixYellow
                        )
                    }
                }

                if (item.genres.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        item.genres.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray,
                        maxLines = 2
                    )
                }

                if (item.type == MediaType.SERIES) {
                    Spacer(Modifier.height(4.dp))
                    val seasonCount = item.seasons.size
                    val episodeCount = item.allEpisodes.size
                    Text(
                        "$seasonCount season${if (seasonCount > 1) "s" else ""} · $episodeCount episode${if (episodeCount > 1) "s" else ""}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.Gray
                    )
                } else {
                    if (item.durationMs > 0) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            formatDuration(item.durationMs),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Play button
        Button(
            onClick = onPlay,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.White,
                contentColor = Color.Black
            ),
            shape = RoundedCornerShape(4.dp)
        ) {
            Icon(Icons.Default.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Play", style = MaterialTheme.typography.labelLarge)
        }

        // Overview
        item.overview?.let { overview ->
            Spacer(Modifier.height(16.dp))
            Text(
                "Overview",
                style = MaterialTheme.typography.titleSmall,
                color = Color.White
            )
            Spacer(Modifier.height(8.dp))
            Text(
                overview,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.LightGray
            )
        }

        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun SeasonSelector(
    seasons: List<Int>,
    selectedSeason: Int,
    onSelect: (Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        Text(
            "Episodes",
            style = MaterialTheme.typography.titleMedium,
            color = Color.White
        )
        Spacer(Modifier.height(8.dp))

        if (seasons.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                seasons.forEach { s ->
                    FilterChip(
                        selected = selectedSeason == s,
                        onClick = { onSelect(s) },
                        label = { Text("Season $s") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = NetflixRed,
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: Episode,
    onPlay: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Episode number badge
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(NetflixDarkGray, RoundedCornerShape(4.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "%02d".format(episode.episode),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White
            )
        }

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                episode.displayName,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (episode.durationMs > 0) {
                Text(
                    formatDuration(episode.durationMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
            }
        }

        Icon(
            Icons.Default.PlayArrow,
            contentDescription = "Play",
            tint = Color.White.copy(alpha = 0.6f),
            modifier = Modifier.size(24.dp)
        )
    }
}

private fun formatDuration(ms: Long): String {
    val hours = TimeUnit.MILLISECONDS.toHours(ms)
    val minutes = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
    val seconds = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
    return if (hours > 0) {
        "%dh %02dm".format(hours, minutes)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}
