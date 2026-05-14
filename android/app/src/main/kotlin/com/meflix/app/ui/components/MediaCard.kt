package com.meflix.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.meflix.app.data.model.MediaItem
import com.meflix.app.ui.theme.GradientPairs
import java.io.File

@Composable
fun MediaCard(
    item: MediaItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Dp = 120.dp,
    height: Dp = 180.dp
) {
    val gradientPair = GradientPairs[item.gradientIndex]

    Box(
        modifier = modifier
            .width(width)
            .height(height)
            .clip(RoundedCornerShape(6.dp))
            .clickable(onClick = onClick)
    ) {
        val posterFile = item.posterPath?.let { File(it) }
        if (posterFile != null && posterFile.exists()) {
            SubcomposeAsyncImage(
                model = posterFile,
                contentDescription = item.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                loading = {
                    GradientPlaceholder(item, gradientPair)
                },
                error = {
                    GradientPlaceholder(item, gradientPair)
                }
            )
        } else {
            GradientPlaceholder(item, gradientPair)
        }

        // Bottom gradient scrim + title
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color(0xCC000000)),
                        startY = 0f,
                        endY = Float.POSITIVE_INFINITY
                    )
                )
                .padding(6.dp)
        ) {
            Text(
                text = item.title,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = Color.White
            )
        }
    }
}

@Composable
private fun GradientPlaceholder(
    item: MediaItem,
    gradientPair: Pair<Color, Color>
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(gradientPair.first, gradientPair.second)
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = item.title.take(2).uppercase(),
            style = MaterialTheme.typography.headlineMedium,
            color = Color.White.copy(alpha = 0.8f)
        )
    }
}
