package com.meflix.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val MeflixDarkColorScheme = darkColorScheme(
    primary = NetflixRed,
    onPrimary = NetflixWhite,
    primaryContainer = NetflixDarkRed,
    onPrimaryContainer = NetflixWhite,
    secondary = NetflixLightGray,
    onSecondary = NetflixWhite,
    secondaryContainer = NetflixMediumGray,
    onSecondaryContainer = NetflixOffWhite,
    tertiary = NetflixYellow,
    onTertiary = NetflixBlack,
    background = NetflixBlack,
    onBackground = NetflixWhite,
    surface = NetflixDarkGray,
    onSurface = NetflixWhite,
    surfaceVariant = NetflixMediumGray,
    onSurfaceVariant = NetflixOffWhite,
    outline = NetflixLightGray,
    outlineVariant = NetflixMediumGray,
    error = Color(0xFFCF6679),
    onError = NetflixWhite,
    inversePrimary = NetflixDarkRed,
    scrim = Color(0x80000000)
)

@Composable
fun MeflixTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MeflixDarkColorScheme,
        typography = MeflixTypography,
        content = content
    )
}
