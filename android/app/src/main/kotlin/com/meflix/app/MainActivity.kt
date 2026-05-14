package com.meflix.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.meflix.app.data.model.MediaItem
import com.meflix.app.ui.DetailScreen
import com.meflix.app.ui.HomeScreen
import com.meflix.app.ui.PlayerScreen
import com.meflix.app.ui.SettingsScreen
import com.meflix.app.ui.theme.MeflixTheme
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.viewmodel.LibraryViewModel

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MeflixTheme {
                MeflixNavGraph()
            }
        }
    }
}

@Composable
private fun MeflixNavGraph() {
    val navController = rememberNavController()
    // Shared library ViewModel scoped to the nav graph so all screens share state
    val libraryViewModel: LibraryViewModel = viewModel()

    // Shared state for navigation — we pass MediaItem by ID through nav args
    // and look up the item from the shared ViewModel
    NavHost(
        navController = navController,
        startDestination = "home",
        modifier = Modifier
            .fillMaxSize()
            .background(NetflixBlack)
    ) {
        composable("home") {
            HomeScreen(
                onNavigateToDetail = { item ->
                    navController.currentBackStackEntry
                        ?.savedStateHandle
                        ?.set("detail_item", item)
                    navController.navigate("detail")
                },
                onNavigateToPlayer = { item, startPath ->
                    navController.currentBackStackEntry
                        ?.savedStateHandle
                        ?.set("player_item", item)
                    navController.currentBackStackEntry
                        ?.savedStateHandle
                        ?.set("player_start_path", startPath)
                    navController.navigate("player")
                },
                onNavigateToSettings = {
                    navController.navigate("settings")
                },
                viewModel = libraryViewModel
            )
        }

        composable("detail") {
            val item = navController.previousBackStackEntry
                ?.savedStateHandle
                ?.get<MediaItem>("detail_item")

            if (item != null) {
                DetailScreen(
                    item = item,
                    onBack = { navController.popBackStack() },
                    onPlay = { episodePath ->
                        navController.currentBackStackEntry
                            ?.savedStateHandle
                            ?.set("player_item", item)
                        navController.currentBackStackEntry
                            ?.savedStateHandle
                            ?.set("player_start_path", episodePath)
                        navController.navigate("player")
                    }
                )
            } else {
                navController.popBackStack()
            }
        }

        composable("player") {
            val item = navController.previousBackStackEntry
                ?.savedStateHandle
                ?.get<MediaItem>("player_item")
            val startPath = navController.previousBackStackEntry
                ?.savedStateHandle
                ?.get<String>("player_start_path")

            if (item != null) {
                PlayerScreen(
                    item = item,
                    startPath = startPath,
                    onBack = {
                        navController.popBackStack()
                    }
                )
            } else {
                navController.popBackStack()
            }
        }

        composable("settings") {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                libraryViewModel = libraryViewModel
            )
        }
    }
}
