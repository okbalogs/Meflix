package com.meflix.app.ui.theme

import androidx.compose.ui.graphics.Color

// ─── Netflix-style palette ────────────────────────────────────────────────────
val NetflixRed = Color(0xFFE50914)
val NetflixDarkRed = Color(0xFFB20710)
val NetflixBlack = Color(0xFF141414)
val NetflixDarkGray = Color(0xFF1F1F1F)
val NetflixMediumGray = Color(0xFF2D2D2D)
val NetflixLightGray = Color(0xFF808080)
val NetflixWhite = Color(0xFFFFFFFF)
val NetflixOffWhite = Color(0xFFE5E5E5)
val NetflixYellow = Color(0xFFF5C518) // IMDb-like rating star

// ─── Gradient fallback colors (for items without posters) ────────────────────
val Gradient0Start = Color(0xFF1A237E)  // deep blue
val Gradient0End   = Color(0xFF0D47A1)
val Gradient1Start = Color(0xFF4A148C)  // deep purple
val Gradient1End   = Color(0xFF6A1B9A)
val Gradient2Start = Color(0xFF880E4F)  // deep pink
val Gradient2End   = Color(0xFFAD1457)
val Gradient3Start = Color(0xFF1B5E20)  // deep green
val Gradient3End   = Color(0xFF2E7D32)
val Gradient4Start = Color(0xFFE65100)  // deep orange
val Gradient4End   = Color(0xFFBF360C)

val GradientPairs = listOf(
    Gradient0Start to Gradient0End,
    Gradient1Start to Gradient1End,
    Gradient2Start to Gradient2End,
    Gradient3Start to Gradient3End,
    Gradient4Start to Gradient4End,
)
