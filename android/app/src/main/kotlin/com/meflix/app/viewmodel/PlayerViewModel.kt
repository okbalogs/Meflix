package com.meflix.app.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem as Media3Item
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import com.meflix.app.data.ProgressStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File

data class TrackInfo(
    val groupIndex: Int,
    val trackIndex: Int,
    val label: String,
    val isSelected: Boolean
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {

    // ── ExoPlayer ─────────────────────────────────────────────────────────────

    val player: ExoPlayer = ExoPlayer.Builder(application).build()

    // ── State flows ───────────────────────────────────────────────────────────

    private val _currentPosition = MutableStateFlow(0L)
    val currentPosition: StateFlow<Long> = _currentPosition

    private val _duration = MutableStateFlow(0L)
    val duration: StateFlow<Long> = _duration

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying

    private val _currentIndex = MutableStateFlow(0)
    val currentIndex: StateFlow<Int> = _currentIndex

    private val _queue = MutableStateFlow<List<String>>(emptyList())
    val queue: StateFlow<List<String>> = _queue

    private val _queueTitles = MutableStateFlow<List<String>>(emptyList())
    val queueTitles: StateFlow<List<String>> = _queueTitles

    private val _audioTracks = MutableStateFlow<List<TrackInfo>>(emptyList())
    val audioTracks: StateFlow<List<TrackInfo>> = _audioTracks

    private val _subtitleTracks = MutableStateFlow<List<TrackInfo>>(emptyList())
    val subtitleTracks: StateFlow<List<TrackInfo>> = _subtitleTracks

    private val _showUpNext = MutableStateFlow(false)
    val showUpNext: StateFlow<Boolean> = _showUpNext

    // ── Internal ──────────────────────────────────────────────────────────────

    private var progressJob: Job? = null
    private var progressStore: ProgressStore? = null

    init {
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _isPlaying.value = isPlaying
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) {
                    _duration.value = player.duration.coerceAtLeast(0L)
                    updateTracks()
                }
            }

            override fun onMediaItemTransition(mediaItem: Media3Item?, reason: Int) {
                _currentIndex.value = player.currentMediaItemIndex
                _duration.value = 0L
                _showUpNext.value = false
                updateTracks()
            }

            override fun onTracksChanged(tracks: Tracks) {
                updateTracks()
            }
        })
    }

    // ── Open media ────────────────────────────────────────────────────────────

    fun openMedia(
        paths: List<String>,
        titles: List<String> = emptyList(),
        startIndex: Int = 0,
        startPositionMs: Long = 0L,
        store: ProgressStore? = null
    ) {
        progressStore = store
        _queue.value = paths
        _queueTitles.value = titles

        val mediaItems = paths.map { path ->
            Media3Item.fromUri(Uri.fromFile(File(path)))
        }

        player.setMediaItems(mediaItems, startIndex, startPositionMs)
        player.prepare()
        player.playWhenReady = true

        startPositionTracking()
    }

    // ── Playback controls ─────────────────────────────────────────────────────

    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
    }

    fun seekTo(positionMs: Long) {
        player.seekTo(positionMs)
        _currentPosition.value = positionMs
    }

    fun skipForward(ms: Long = 10_000L) {
        val target = (player.currentPosition + ms).coerceAtMost(player.duration.coerceAtLeast(0L))
        player.seekTo(target)
    }

    fun skipBackward(ms: Long = 10_000L) {
        val target = (player.currentPosition - ms).coerceAtLeast(0L)
        player.seekTo(target)
    }

    fun playNext() {
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem()
            _showUpNext.value = false
        }
    }

    fun hasNext(): Boolean = player.hasNextMediaItem()

    fun nextTitle(): String? {
        val nextIdx = _currentIndex.value + 1
        return _queueTitles.value.getOrNull(nextIdx)
    }

    fun currentTitle(): String? = _queueTitles.value.getOrNull(_currentIndex.value)

    // ── Track selection ───────────────────────────────────────────────────────

    fun selectAudioTrack(groupIndex: Int, trackIndex: Int) {
        val tracks = player.currentTracks
        val group = tracks.groups.getOrNull(groupIndex) ?: return
        val override = TrackSelectionOverride(group.mediaTrackGroup, trackIndex)
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .addOverride(override)
            .build()
        updateTracks()
    }

    fun selectSubtitleTrack(groupIndex: Int, trackIndex: Int) {
        val tracks = player.currentTracks
        val group = tracks.groups.getOrNull(groupIndex) ?: return
        val override = TrackSelectionOverride(group.mediaTrackGroup, trackIndex)
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .addOverride(override)
            .build()
        updateTracks()
    }

    fun disableSubtitles() {
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        updateTracks()
    }

    // ── Progress tracking ─────────────────────────────────────────────────────

    private fun startPositionTracking() {
        progressJob?.cancel()
        progressJob = viewModelScope.launch {
            while (true) {
                delay(1_000L)
                val pos = player.currentPosition.coerceAtLeast(0L)
                val dur = player.duration.coerceAtLeast(0L)
                _currentPosition.value = pos
                if (dur > 0) _duration.value = dur

                // Auto-save every ~5s (we check every 1s, save on multiples of 5)
                if (pos > 0 && pos % 5_000L < 1_100L) {
                    saveCurrentProgress()
                }

                // Up-Next card when 30s remain and there's a next item
                if (dur > 0 && (dur - pos) <= 30_000L && player.hasNextMediaItem()) {
                    _showUpNext.value = true
                } else if (_showUpNext.value && (dur - pos) > 30_000L) {
                    _showUpNext.value = false
                }
            }
        }
    }

    fun saveCurrentProgress() {
        val paths = _queue.value
        val idx = _currentIndex.value
        val path = paths.getOrNull(idx) ?: return
        val pos = player.currentPosition.coerceAtLeast(0L)
        val dur = player.duration.coerceAtLeast(0L)
        if (dur > 0) {
            progressStore?.save(path, pos, dur)
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private fun updateTracks() {
        val tracks = player.currentTracks
        val audio = mutableListOf<TrackInfo>()
        val subtitles = mutableListOf<TrackInfo>()

        for ((gIdx, group) in tracks.groups.withIndex()) {
            val type = group.type
            for (tIdx in 0 until group.length) {
                val format = group.getTrackFormat(tIdx)
                val isSelected = group.isTrackSelected(tIdx)
                val label = buildTrackLabel(format.language, format.label, tIdx)

                when (type) {
                    C.TRACK_TYPE_AUDIO -> audio.add(
                        TrackInfo(gIdx, tIdx, label, isSelected)
                    )
                    C.TRACK_TYPE_TEXT -> subtitles.add(
                        TrackInfo(gIdx, tIdx, label, isSelected)
                    )
                }
            }
        }

        _audioTracks.value = audio
        _subtitleTracks.value = subtitles
    }

    private fun buildTrackLabel(language: String?, label: String?, index: Int): String {
        return when {
            !label.isNullOrBlank() -> label
            !language.isNullOrBlank() -> language.uppercase()
            else -> "Track ${index + 1}"
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCleared() {
        super.onCleared()
        progressJob?.cancel()
        saveCurrentProgress()
        player.release()
    }
}
