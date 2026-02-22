export const PLAY_MODE = {
    SEQUENTIAL: 0,
    LIST_LOOP: 1,
    SINGLE_LOOP: 2,
    SHUFFLE: 3
}

export const PLAY_MODE_LABELS = {
    [PLAY_MODE.SEQUENTIAL]: '顺序播放',
    [PLAY_MODE.LIST_LOOP]: '列表循环',
    [PLAY_MODE.SINGLE_LOOP]: '单曲循环',
    [PLAY_MODE.SHUFFLE]: '随机播放'
}

export const PLAY_MODE_ICONS = {
    [PLAY_MODE.SEQUENTIAL]: 'mdi-playlist-play',
    [PLAY_MODE.LIST_LOOP]: 'mdi-repeat',
    [PLAY_MODE.SINGLE_LOOP]: 'mdi-repeat-once',
    [PLAY_MODE.SHUFFLE]: 'mdi-shuffle'
}
