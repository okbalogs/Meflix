package com.meflix.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
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
    width: Dp = 100.dp,
    height: Dp = 150.dp,
    showTitle: Boolean = false
) {
    val gradientPair = GradientPairs[item.gradientIndex]

    Column(modifier = modifier.width(width)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(height)
                .clip(RoundedCornerShape(3.dp))
                .clickable(onClick = onClick)
        ) {
            val posterFile = item.posterPath?.let { File(it) }
            if (posterFile != null && posterFile.exists()) {
                SubcomposeAsyncImage(
                    model = posterFile,
                    contentDescription = item.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                    loading = { CardPlaceholder(item, gradientPair) },
                    error = { CardPlaceholder(item, gradientPair) }
                )
            } else {
                CardPlaceholder(item, gradientPair)
            }
        }

        if (showTitle) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = item.title,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFFB3B3B3),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun CardPlaceholder(item: MediaItem, gradientPair: Pair<Color, Color>) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(gradientPair.first, gradientPair.second))),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = item.title.take(2).uppercase(),
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White.copy(alpha = 0.9f)
        )
    }
}
