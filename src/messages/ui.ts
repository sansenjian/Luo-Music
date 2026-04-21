export const uiMessages = {
  settings: {
    dialogButtonLabel: '打开设置',
    dialogTitle: '设置',
    workspaceEyebrow: '工作区设置',
    workspaceTitle: '设置',
    workspaceCaption: '这里和播放器悬浮窗显示的是同一套设置内容。',
    sections: {
      playback: '播放设置',
      lyrics: '歌词设置',
      appearance: '界面设置',
      experimental: '实验功能'
    },
    fields: {
      playMode: '播放模式',
      volume: '音量',
      showTranslation: '显示翻译',
      showRomanizedLyrics: '显示罗马音',
      renderStyle: '渲染风格',
      brandPlacement: '品牌标识位置',
      dockedPlayerLayout: '紧贴底栏播放器布局',
      smtc: 'Windows SMTC（实验）'
    },
    options: {
      playMode: {
        sequential: '顺序播放',
        loop: '列表循环',
        single: '单曲循环',
        shuffle: '随机播放'
      },
      renderStyle: {
        classic: '经典风格',
        brand: '品牌风格'
      },
      brandPlacement: {
        header: '顶栏',
        sidebar: '侧边栏'
      },
      dockedPlayerLayout: {
        full: '铺满底栏',
        withSidebar: '给侧边栏留位'
      }
    }
  },
  home: {
    search: {
      inputLabel: 'Search music',
      placeholder: 'Search songs, artists, or albums',
      submit: 'Search',
      loading: 'Searching'
    },
    tabs: {
      lyric: 'Lyrics',
      playlist: 'Playlist'
    },
    emptyState: {
      lyric: {
        visual: 'LRC',
        title: 'No lyrics yet',
        description: 'Search for a track and start playback to view synced lyrics here.'
      },
      playlist: {
        visual: 'LIST',
        title: 'Your queue is empty',
        description: 'Search for a track to build a playlist or start playback.'
      }
    },
    player: {
      emptyTitle: 'Start playback',
      emptySubtitle: 'Search for a track to begin'
    }
  }
} as const

export type UiMessages = typeof uiMessages
