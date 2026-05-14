package com.meflix.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.viewmodel.compose.viewModel
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.ui.theme.NetflixRed
import com.meflix.app.viewmodel.LibraryViewModel
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

// DataStore singleton extension
private val android.content.Context.dataStore: DataStore<Preferences>
    by preferencesDataStore(name = "meflix_settings")

val TMDB_API_KEY_KEY = stringPreferencesKey("tmdb_api_key")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    libraryViewModel: LibraryViewModel = viewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by libraryViewModel.uiState.collectAsState()

    // Load saved API key from DataStore
    val savedApiKey by context.dataStore.data
        .map { prefs -> prefs[TMDB_API_KEY_KEY] ?: "" }
        .collectAsState(initial = "")

    var apiKeyInput by remember(savedApiKey) { mutableStateOf(savedApiKey) }
    var showApiKey by remember { mutableStateOf(false) }
    var showSavedSnack by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = NetflixBlack,
        topBar = {
            TopAppBar(
                title = {
                    Text("Settings", color = Color.White)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NetflixBlack)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(NetflixBlack)
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // TMDB API Key section
            SettingsSection(title = "TMDB API Key") {
                Text(
                    "Enter your TMDB API key to fetch movie/series metadata (posters, overviews, ratings).",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = apiKeyInput,
                    onValueChange = { apiKeyInput = it },
                    label = { Text("API Key") },
                    placeholder = { Text("Paste your TMDB v3 API key here", color = Color.Gray) },
                    singleLine = true,
                    visualTransformation = if (showApiKey) VisualTransformation.None
                                           else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    trailingIcon = {
                        IconButton(onClick = { showApiKey = !showApiKey }) {
                            Icon(
                                if (showApiKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (showApiKey) "Hide" else "Show",
                                tint = Color.Gray
                            )
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = NetflixRed,
                        unfocusedBorderColor = Color.Gray,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        cursorColor = NetflixRed,
                        focusedLabelColor = NetflixRed,
                        unfocusedLabelColor = Color.Gray
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        scope.launch {
                            context.dataStore.edit { prefs ->
                                prefs[TMDB_API_KEY_KEY] = apiKeyInput.trim()
                            }
                            showSavedSnack = true
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save API Key")
                }
            }

            // Fetch metadata section
            SettingsSection(title = "Metadata") {
                Text(
                    "Fetch poster images, overviews, and ratings for all items in your library.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
                Spacer(Modifier.height(12.dp))

                if (uiState.isFetchingMetadata) {
                    val (done, total) = uiState.metadataProgress
                    Column {
                        LinearProgressIndicator(
                            progress = { if (total > 0) done.toFloat() / total else 0f },
                            modifier = Modifier.fillMaxWidth(),
                            color = NetflixRed
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Fetching $done / $total…",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray
                        )
                    }
                } else {
                    Button(
                        onClick = {
                            libraryViewModel.fetchMetadata(context, apiKeyInput.trim())
                        },
                        enabled = apiKeyInput.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Fetch All Metadata")
                    }
                }
            }

            // Library section
            SettingsSection(title = "Library") {
                Text(
                    "Rescan your device for new video files.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.Gray
                )
                Spacer(Modifier.height(12.dp))

                if (uiState.isScanning) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = NetflixRed
                        )
                        Text("Scanning…", color = Color.Gray)
                    }
                } else {
                    OutlinedButton(
                        onClick = { libraryViewModel.scanLibrary(context) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NetflixRed)
                    ) {
                        Text("Rescan Library")
                    }
                }
            }

            // App info section
            SettingsSection(title = "About") {
                SettingsInfoRow("App", "Meflix")
                SettingsInfoRow("Version", "1.0.0")
                SettingsInfoRow("Media API", "TMDB")
                SettingsInfoRow("Player", "ExoPlayer (Media3)")
            }

            Spacer(Modifier.height(32.dp))
        }

        // Saved snackbar
        if (showSavedSnack) {
            LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(2000)
                showSavedSnack = false
            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                contentAlignment = Alignment.BottomCenter
            ) {
                Snackbar {
                    Text("API key saved")
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = NetflixRed,
            modifier = Modifier.padding(bottom = 12.dp)
        )
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F1F)),
            shape = MaterialTheme.shapes.medium
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                content = content
            )
        }
    }
}

@Composable
private fun SettingsInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Color.Gray)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Color.White)
    }
}
