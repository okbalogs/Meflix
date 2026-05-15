package com.meflix.app.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.BorderStroke
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.edit
import androidx.lifecycle.viewmodel.compose.viewModel
import com.meflix.app.data.TMDB_KEY
import com.meflix.app.data.appDataStore
import com.meflix.app.data.FolderStore
import com.meflix.app.ui.theme.NetflixBlack
import com.meflix.app.ui.theme.NetflixRed
import com.meflix.app.viewmodel.LibraryViewModel
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    libraryViewModel: LibraryViewModel = viewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val uiState by libraryViewModel.uiState.collectAsState()
    val folderStore = remember { FolderStore(context) }
    val scanFolders by folderStore.folders.collectAsState(initial = emptyList())

    val savedApiKey by context.appDataStore.data
        .map { prefs -> prefs[TMDB_KEY] ?: "" }
        .collectAsState(initial = "")

    var apiKeyInput by remember(savedApiKey) { mutableStateOf(savedApiKey) }
    var showApiKey by remember { mutableStateOf(false) }
    var showSavedSnack by remember { mutableStateOf(false) }

    val folderPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        uri?.let {
            context.contentResolver.takePersistableUriPermission(
                it, Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            FolderStore.pathFromTreeUri(it)?.let { path ->
                scope.launch { folderStore.addFolder(path) }
            }
        }
    }

    Scaffold(
        containerColor = NetflixBlack,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = { Text("Settings", color = Color.White, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = NetflixBlack)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(NetflixBlack)
                .padding(padding)
                .navigationBarsPadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {

                // ── Scan Folders ──────────────────────────────────────────────
                SettingsSection(title = "Scan Folders") {
                    Text(
                        "Choose which folders Meflix scans for video files. If no folders are added, all videos on the device will be scanned.",
                        fontSize = 12.sp,
                        color = Color(0xFF808080)
                    )
                    Spacer(Modifier.height(12.dp))

                    if (scanFolders.isEmpty()) {
                        Text(
                            "No folders selected — scanning all videos.",
                            fontSize = 13.sp,
                            color = Color(0xFF808080)
                        )
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            scanFolders.forEach { path ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        path,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        modifier = Modifier.weight(1f)
                                    )
                                    IconButton(
                                        onClick = { scope.launch { folderStore.removeFolder(path) } },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Close,
                                            "Remove",
                                            tint = Color(0xFF808080),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                                HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    OutlinedButton(
                        onClick = { folderPickerLauncher.launch(null) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NetflixRed),
                        border = BorderStroke(1.dp, NetflixRed),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Icon(Icons.Default.CreateNewFolder, null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Add Folder")
                    }
                }

                // ── Library ───────────────────────────────────────────────────
                SettingsSection(title = "Library") {
                    Text(
                        "Scan ${if (scanFolders.isEmpty()) "all videos" else "selected folders"} for media files.",
                        fontSize = 12.sp,
                        color = Color(0xFF808080)
                    )
                    Spacer(Modifier.height(12.dp))

                    if (uiState.isScanning) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = NetflixRed, strokeWidth = 2.dp)
                            Text("Scanning…", color = Color(0xFF808080), fontSize = 13.sp)
                        }
                    } else {
                        Button(
                            onClick = { libraryViewModel.scanLibrary(context) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text("Scan Library")
                        }
                    }
                }

                // ── TMDB API Key ──────────────────────────────────────────────
                SettingsSection(title = "TMDB API Key") {
                    Text(
                        "Add your TMDB API key to fetch posters, ratings, and overviews.",
                        fontSize = 12.sp,
                        color = Color(0xFF808080)
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = apiKeyInput,
                        onValueChange = { apiKeyInput = it },
                        label = { Text("API Key") },
                        placeholder = { Text("Paste your TMDB v3 API key", color = Color(0xFF808080)) },
                        singleLine = true,
                        visualTransformation = if (showApiKey) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        trailingIcon = {
                            IconButton(onClick = { showApiKey = !showApiKey }) {
                                Icon(
                                    if (showApiKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null,
                                    tint = Color(0xFF808080)
                                )
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = NetflixRed,
                            unfocusedBorderColor = Color(0xFF404040),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            cursorColor = NetflixRed,
                            focusedLabelColor = NetflixRed,
                            unfocusedLabelColor = Color(0xFF808080)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = {
                            scope.launch {
                                context.appDataStore.edit { prefs ->
                                    prefs[TMDB_KEY] = apiKeyInput.trim()
                                }
                                showSavedSnack = true
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                        shape = RoundedCornerShape(4.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save API Key") }
                }

                // ── Metadata ──────────────────────────────────────────────────
                SettingsSection(title = "Metadata") {
                    Text(
                        "Fetch poster images, overviews, and ratings for all items in your library.",
                        fontSize = 12.sp,
                        color = Color(0xFF808080)
                    )
                    Spacer(Modifier.height(12.dp))
                    if (uiState.isFetchingMetadata) {
                        val (done, total) = uiState.metadataProgress
                        Column {
                            LinearProgressIndicator(
                                progress = { if (total > 0) done.toFloat() / total else 0f },
                                modifier = Modifier.fillMaxWidth(),
                                color = NetflixRed,
                                trackColor = Color(0xFF2D2D2D)
                            )
                            Spacer(Modifier.height(6.dp))
                            Text("Fetching $done / $total", fontSize = 12.sp, color = Color(0xFF808080))
                        }
                    } else {
                        Button(
                            onClick = { libraryViewModel.fetchMetadata(context, apiKeyInput.trim()) },
                            enabled = apiKeyInput.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = NetflixRed),
                            shape = RoundedCornerShape(4.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Fetch All Metadata") }
                    }
                }

                // ── About ─────────────────────────────────────────────────────
                SettingsSection(title = "About") {
                    InfoRow("App", "Meflix")
                    InfoRow("Version", "1.0.0")
                    InfoRow("Media API", "TMDB")
                    InfoRow("Player", "ExoPlayer (Media3)")
                }

                Spacer(Modifier.height(32.dp))
            }

            if (showSavedSnack) {
                LaunchedEffect(Unit) {
                    kotlinx.coroutines.delay(2000)
                    showSavedSnack = false
                }
                Box(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    contentAlignment = Alignment.BottomCenter
                ) {
                    Surface(shape = RoundedCornerShape(4.dp), color = Color(0xFF323232)) {
                        Text("API key saved", color = Color.White, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            title.uppercase(),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = NetflixRed,
            letterSpacing = 1.sp,
            modifier = Modifier.padding(bottom = 10.dp)
        )
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F1F)),
            shape = RoundedCornerShape(6.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                content = content
            )
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Color(0xFF808080), fontSize = 14.sp)
        Text(value, color = Color.White, fontSize = 14.sp)
    }
}
