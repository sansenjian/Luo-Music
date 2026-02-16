export function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) {
        return '00:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatTimeDetailed(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) {
        return '00:00.00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function parseTimeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const match = timeStr.match(/(\d+):(\d+)(?:[.:](\d+))?/);
    if (!match) return 0;
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0').substring(0, 3), 10) / 1000 : 0;
    return mins * 60 + secs + ms;
}

export function createAudioPlayer(options = {}) {
    const audio = new Audio();
    const state = {
        isPlaying: false,
        isPaused: false,
        currentTime: 0,
        duration: 0,
        volume: options.volume ?? 1,
        muted: options.muted ?? false,
        loop: options.loop ?? false,
        preload: options.preload ?? 'auto',
    };

    audio.volume = state.volume;
    audio.muted = state.muted;
    audio.loop = state.loop;
    audio.preload = state.preload;

    const listeners = new Map();

    const on = (event, callback) => {
        if (!listeners.has(event)) {
            listeners.set(event, new Set());
        }
        listeners.get(event).add(callback);
        audio.addEventListener(event, callback);
        return () => off(event, callback);
    };

    const off = (event, callback) => {
        if (listeners.has(event)) {
            listeners.get(event).delete(callback);
            audio.removeEventListener(event, callback);
        }
    };

    const emit = (event, data) => {
        if (listeners.has(event)) {
            listeners.get(event).forEach(cb => cb(data));
        }
    };

    const load = (src) => {
        if (!src) return;
        audio.src = src;
        audio.load();
        state.isPlaying = false;
        state.isPaused = false;
    };

    const play = async () => {
        try {
            await audio.play();
            state.isPlaying = true;
            state.isPaused = false;
            emit('play');
        } catch (err) {
            emit('error', err);
            throw err;
        }
    };

    const pause = () => {
        audio.pause();
        state.isPlaying = false;
        state.isPaused = true;
        emit('pause');
    };

    const stop = () => {
        audio.pause();
        audio.currentTime = 0;
        state.isPlaying = false;
        state.isPaused = false;
        state.currentTime = 0;
        emit('stop');
    };

    const seek = (time) => {
        if (audio.duration && time >= 0 && time <= audio.duration) {
            audio.currentTime = time;
            state.currentTime = time;
            emit('seek', time);
        }
    };

    const setVolume = (vol) => {
        const volume = Math.max(0, Math.min(1, vol));
        audio.volume = volume;
        state.volume = volume;
        emit('volumechange', volume);
    };

    const setMuted = (muted) => {
        audio.muted = muted;
        state.muted = muted;
        emit('mutechange', muted);
    };

    const setLoop = (loop) => {
        audio.loop = loop;
        state.loop = loop;
        emit('loopchange', loop);
    };

    audio.addEventListener('timeupdate', () => {
        state.currentTime = audio.currentTime;
        emit('timeupdate', audio.currentTime);
    });

    audio.addEventListener('durationchange', () => {
        state.duration = audio.duration;
        emit('durationchange', audio.duration);
    });

    audio.addEventListener('ended', () => {
        state.isPlaying = false;
        state.isPaused = false;
        emit('ended');
    });

    audio.addEventListener('error', (e) => {
        emit('error', e);
    });

    audio.addEventListener('canplay', () => {
        emit('canplay');
    });

    audio.addEventListener('loadedmetadata', () => {
        state.duration = audio.duration;
        emit('loadedmetadata', audio.duration);
    });

    return {
        get audio() { return audio; },
        get state() { return { ...state }; },
        get currentTime() { return audio.currentTime; },
        get duration() { return audio.duration; },
        get volume() { return audio.volume; },
        get paused() { return audio.paused; },
        get ended() { return audio.ended; },
        on,
        off,
        load,
        play,
        pause,
        stop,
        seek,
        setVolume,
        setMuted,
        setLoop,
        destroy: () => {
            audio.pause();
            audio.src = '';
            listeners.forEach((cbs, event) => {
                cbs.forEach(cb => audio.removeEventListener(event, cb));
            });
            listeners.clear();
            emit('destroy');
        },
    };
}

export function createPlaylistPlayer(options = {}) {
    const player = createAudioPlayer(options);
    const playlist = {
        list: [],
        currentIndex: -1,
        mode: 'list',
    };

    const modes = ['list', 'single', 'shuffle'];
    let shuffledIndices = [];

    const shuffle = () => {
        const indices = playlist.list.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        shuffledIndices = indices;
    };

    const getNextIndex = () => {
        if (playlist.list.length === 0) return -1;
        const { mode } = playlist;
        const { currentIndex } = playlist;

        if (mode === 'single') {
            return currentIndex;
        }

        if (mode === 'shuffle') {
            if (shuffledIndices.length === 0) shuffle();
            const currentShuffleIndex = shuffledIndices.indexOf(currentIndex);
            const nextShuffleIndex = (currentShuffleIndex + 1) % shuffledIndices.length;
            return shuffledIndices[nextShuffleIndex];
        }

        return (currentIndex + 1) % playlist.list.length;
    };

    const getPrevIndex = () => {
        if (playlist.list.length === 0) return -1;
        const { mode } = playlist;
        const { currentIndex } = playlist;

        if (mode === 'single') {
            return currentIndex;
        }

        if (mode === 'shuffle') {
            if (shuffledIndices.length === 0) shuffle();
            const currentShuffleIndex = shuffledIndices.indexOf(currentIndex);
            const prevShuffleIndex = currentShuffleIndex <= 0 ? shuffledIndices.length - 1 : currentShuffleIndex - 1;
            return shuffledIndices[prevShuffleIndex];
        }

        return currentIndex <= 0 ? playlist.list.length - 1 : currentIndex - 1;
    };

    const playAt = async (index) => {
        if (index < 0 || index >= playlist.list.length) return;
        const item = playlist.list[index];
        playlist.currentIndex = index;
        player.load(item.url || item.src);
        await player.play();
        return item;
    };

    const playNext = () => playAt(getNextIndex());
    const playPrev = () => playAt(getPrevIndex());

    const setPlaylist = (list) => {
        playlist.list = list;
        playlist.currentIndex = -1;
        shuffledIndices = [];
    };

    const addToPlaylist = (item) => {
        playlist.list.push(item);
        shuffledIndices = [];
    };

    const removeFromPlaylist = (index) => {
        if (index < 0 || index >= playlist.list.length) return;
        playlist.list.splice(index, 1);
        if (playlist.currentIndex >= playlist.list.length) {
            playlist.currentIndex = playlist.list.length - 1;
        }
        shuffledIndices = [];
    };

    const clearPlaylist = () => {
        playlist.list = [];
        playlist.currentIndex = -1;
        shuffledIndices = [];
        player.stop();
    };

    const setMode = (mode) => {
        if (modes.includes(mode)) {
            playlist.mode = mode;
            if (mode === 'shuffle') shuffle();
        }
    };

    const cycleMode = () => {
        const currentIdx = modes.indexOf(playlist.mode);
        const nextIdx = (currentIdx + 1) % modes.length;
        setMode(modes[nextIdx]);
        return playlist.mode;
    };

    player.on('ended', () => {
        if (playlist.mode === 'single') {
            player.seek(0);
            player.play();
        } else {
            playNext();
        }
    });

    return {
        ...player,
        playlist,
        modes,
        playAt,
        playNext,
        playPrev,
        setPlaylist,
        addToPlaylist,
        removeFromPlaylist,
        clearPlaylist,
        setMode,
        cycleMode,
        shuffle,
        get current() {
            return playlist.list[playlist.currentIndex] || null;
        },
    };
}

export default {
    formatTime,
    formatTimeDetailed,
    parseTimeToSeconds,
    createAudioPlayer,
    createPlaylistPlayer,
};
