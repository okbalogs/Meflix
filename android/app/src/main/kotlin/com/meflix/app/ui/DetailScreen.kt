package com.meflix.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.meflix.app.data.model.Episode
import com.meflix.app.data.model.MediaItem
import com.meflix.app.data.model.MediaType
import com.meflix.app.ui.theme.GradientPairs
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.ui.theme.NetflixRed
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

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
        ) {
            // Hero backdrop
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(360.dp)
                ) {
                    val backdropFile = item.backdropPath?.let { File(it) }
                    if (backdropFile?.exists() == true) {
                        SubcomposeAsyncImage(
                            model = backdropFile,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                            error = { GradientHero(gradientPair) }
                        )
                    } else {
                        GradientHero(gradientPair)
                    }
                    // Bottom gradient
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .align(Alignment.BottomCenter)
                            .background(
                                Brush.verticalGradient(listOf(Color.Transparent, NetflixBlack))
                            )
                    )
                }
            }

            // Metadata section
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                ) {
                    Text(
                        text = item.title,
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 28.sp
                    )
                    Spacer(Modifier.height(6.dp))

                    // Metadata row
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        item.year?.let {
                            Text(it, color = Color(0xFF46D369), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        }
                        if (item.type == MediaType.SERIES && item.seasons.isNotEmpty()) {
                            val sc = item.seasons.size
                            val ec = item.allEpisodes.size
                            MetaChip("$sc season${if (sc > 1) "s" else ""}")
                            MetaChip("$ec ep${if (ec > 1) "s" else ""}")
                        } else if (item.durationMs > 0) {
                            MetaChip(formatDuration(item.durationMs))
                        }
                        item.rating?.let {
                            Text("%.1f ★".format(it), color = Color(0xFFFDD835), fontSize = 13.sp)
                        }
                    }

                    if (item.genres.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            item.genres.joinToString(" • "),
                            color = Color(0xFFB3B3B3),
                            fontSize = 12.sp,
                            maxLines = 1
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    // Play button
                    Button(
                        onClick = { onPlay(null) },
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color.Black
                        ),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Play", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }

                    Spacer(Modifier.height(10.dp))

                    // Action icons row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(20.dp)
                    ) {
                        ActionIconButton(icon = Icons.Default.Add, label = "My List") {}
                        ActionIconButton(icon = Icons.Default.ThumbUp, label = "Rate") {}
                    }

                    // Overview
                    item.overview?.let { overview ->
                        Spacer(Modifier.height(16.dp))
                        Text(
                            overview,
                            color = Color(0xFFD2D2D2),
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        )
                    }

                    Spacer(Modifier.height(20.dp))
                }
            }

            // Episodes section for series
            if (item.type == MediaType.SERIES && item.seasons.isNotEmpty()) {
                item {
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        Text(
                            "Episodes",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        if (item.seasons.size > 1) {
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                item.seasons.forEach { s ->
                                    val selected = selectedSeason == s.number
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .clickable { selectedSeason = s.number }
                                            .background(if (selected) NetflixRed else Color(0xFF2D2D2D))
                                            .padding(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text(
                                            "S${s.number}",
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }

                val episodes = item.seasons
                    .find { it.number == selectedSeason }
                    ?.episodes
                    ?.sortedBy { it.episode }
                    ?: emptyList()

                items(episodes) { episode ->
                    EpisodeRow(episode = episode, onPlay = { onPlay(episode.path) })
                    HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
                }
            }

            item { Spacer(Modifier.height(32.dp)) }
        }

        // Back button overlay
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .statusBarsPadding()
                .padding(4.dp)
        ) {
            Icon(
                Icons.Default.ArrowBack,
                contentDescription = "Back",
                tint = Color.White,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
private fun GradientHero(gradientPair: Pair<Color, Color>) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(gradientPair.first, gradientPair.second)))
    )
}

@Composable
private fun MetaChip(label: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(2.dp))
            .background(Color(0xFF2D2D2D))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(label, color = Color(0xFFB3B3B3), fontSize = 11.sp)
    }
}

@Composable
private fun ActionIconButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(24.dp))
        Spacer(Modifier.height(4.dp))
        Text(label, color = Color(0xFFB3B3B3), fontSize = 10.sp)
    }
}

@Composable
private fun EpisodeRow(episode: Episode, onPlay: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Episode number
        Text(
            "%d".format(episode.episode),
            color = Color(0xFF808080),
            fontSize = 18.sp,
            fontWeight = FontWeight.Light,
            modifier = Modifier.width(28.dp)
        )

        Spacer(Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                episode.displayName,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (episode.durationMs > 0) {
                Spacer(Modifier.height(2.dp))
                Text(
                    formatDuration(episode.durationMs),
                    color = Color(0xFF808080),
                    fontSize = 12.sp
                )
            }
        }

        Spacer(Modifier.width(8.dp))
        Icon(
            Icons.Default.PlayArrow,
            contentDescription = "Play",
            tint = Color.White.copy(alpha = 0.5f),
            modifier = Modifier.size(20.dp)
        )
    }
}

private fun formatDuration(ms: Long): String {
    val h = TimeUnit.MILLISECONDS.toHours(ms)
    val m = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
    val s = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
    return if (h > 0) "%dh %02dm".format(h, m) else "%d:%02d".format(m, s)
}
