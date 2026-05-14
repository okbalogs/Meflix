package com.meflix.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.meflix.app.data.model.MediaItem
import com.meflix.app.ui.theme.GradientPairs
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.ui.theme.NetflixRed
import java.io.File

@Composable
fun BillboardHeader(
    item: MediaItem,
    onPlayClick: () -> Unit,
    onInfoClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val gradientPair = GradientPairs[item.gradientIndex]
    val backdropFile = item.backdropPath?.let { File(it) }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(480.dp)
    ) {
        // Background image (backdrop)
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
                                    colors = listOf(gradientPair.first, gradientPair.second)
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
                        Brush.verticalGradient(
                            colors = listOf(gradientPair.first, gradientPair.second)
                        )
                    )
            )
        }

        // Bottom fade scrim into background
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, NetflixBlack)
                    )
                )
        )

        // Content overlay
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 16.dp, vertical = 24.dp)
                .fillMaxWidth()
        ) {
            // Title
            Text(
                text = item.title,
                style = MaterialTheme.typography.headlineMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = Color.White
            )

            Spacer(Modifier.height(4.dp))

            // Year + Rating
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                item.year?.let { year ->
                    Text(
                        text = year,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f)
                    )
                }
                item.rating?.let { rating ->
                    Text(
                        text = "%.1f ★".format(rating),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                }
                if (item.genres.isNotEmpty()) {
                    Text(
                        text = item.genres.take(2).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.7f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // Buttons
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onPlayClick,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = Color.Black
                    ),
                    shape = RoundedCornerShape(4.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)
                ) {
                    Icon(
                        Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("Play", style = MaterialTheme.typography.labelLarge)
                }

                OutlinedButton(
                    onClick = onInfoClick,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(4.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("More Info", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}
