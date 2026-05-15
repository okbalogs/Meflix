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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val screenHeight = LocalConfiguration.current.screenHeightDp
    val billboardHeight = (screenHeight * 0.72f).dp
    val gradientPair = GradientPairs[item.gradientIndex]
    val backdropFile = item.backdropPath?.let { File(it) }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(billboardHeight)
    ) {
        // Background image
        if (backdropFile != null && backdropFile.exists()) {
            SubcomposeAsyncImage(
                model = backdropFile,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                error = { GradientBackground(gradientPair) }
            )
        } else if (item.posterPath?.let { File(it) }?.exists() == true) {
            SubcomposeAsyncImage(
                model = File(item.posterPath!!),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                error = { GradientBackground(gradientPair) }
            )
        } else {
            GradientBackground(gradientPair)
        }

        // Multi-layer gradient for depth (sides + heavy bottom scrim)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            Color.Black.copy(alpha = 0.3f),
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.3f)
                        )
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, NetflixBlack)
                    )
                )
        )

        // Content at the bottom
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Title
            Text(
                text = item.title,
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 32.sp
            )

            Spacer(Modifier.height(6.dp))

            // Metadata row
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                item.year?.let {
                    Text(it, color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                    if (item.rating != null || item.genres.isNotEmpty()) {
                        Text("  •  ", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
                    }
                }
                item.rating?.let {
                    Text("%.1f ★".format(it), color = Color(0xFFFDD835), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    if (item.genres.isNotEmpty()) {
                        Text("  •  ", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
                    }
                }
                if (item.genres.isNotEmpty()) {
                    Text(
                        item.genres.take(2).joinToString(" • "),
                        color = Color.White.copy(alpha = 0.75f),
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Action buttons
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Button(
                    onClick = onPlayClick,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = Color.Black
                    ),
                    shape = RoundedCornerShape(4.dp),
                    contentPadding = PaddingValues(horizontal = 0.dp, vertical = 10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Play", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }

                OutlinedButton(
                    onClick = onInfoClick,
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color.White.copy(alpha = 0.15f),
                        contentColor = Color.White
                    ),
                    border = null,
                    shape = RoundedCornerShape(4.dp),
                    contentPadding = PaddingValues(horizontal = 0.dp, vertical = 10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("More Info", fontSize = 15.sp)
                }
            }
        }
    }
}

@Composable
private fun GradientBackground(gradientPair: Pair<Color, Color>) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(gradientPair.first, gradientPair.second)))
    )
}
