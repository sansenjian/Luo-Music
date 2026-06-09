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
      experimental: '实验功能',
      plugins: '插件管理'
    },
    fields: {
      playMode: '播放模式',
      volume: '音量',
      enableDesktopLyric: '启用桌面歌词',
      desktopLyricAlwaysOnTop: '启用歌词总在最前',
      showTranslation: '外文歌词显示翻译',
      showRomanizedLyrics: '外文歌词显示音译',
      lyricFont: '字体',
      lyricFontSize: '字号',
      lyricFontWeight: '字粗',
      lyricStrokeStyle: '描边',
      lyricLineMode: '调整排版样式',
      lyricFlowDirection: '显示方向',
      lyricTextAlign: '文本对齐',
      lyricColorPreset: '更改配色方案',
      lyricPlayedColor: '已播放',
      lyricUnplayedColor: '未播放',
      lyricPreview: '预览',
      renderStyle: '渲染风格',
      brandPlacement: '品牌标识位置',
      dockedPlayerLayout: '紧贴底栏播放器布局',
      smtc: 'Windows SMTC',
      waveform: '进度条波形可视化（实验）',
      coverSwipe: '滑动封面切歌',
      pluginInstallPath: '插件目录 / manifest.json / zip 路径',
      pluginVersion: '版本',
      pluginStatus: '状态',
      pluginNetworkDomains: '网络白名单',
      pluginStorage: '本地存储',
      pluginPermissions: '权限声明',
      pluginCircuitTripped: '已熔断',
      pluginFailCount: '连续失败',
      pluginGranted: '已授权'
    },
    options: {
      playMode: {
        sequential: '顺序播放',
        loop: '列表循环',
        single: '单曲循环',
        shuffle: '随机播放'
      },
      brandPlacement: {
        header: '顶栏',
        sidebar: '侧边栏'
      },
      dockedPlayerLayout: {
        full: '铺满底栏',
        withSidebar: '给侧边栏留位'
      },
      lyricFontWeight: {
        standard: '标准',
        bold: '加粗',
        heavy: '厚重'
      },
      lyricStrokeStyle: {
        outline: '有描边',
        none: '无描边'
      },
      lyricLineMode: {
        'single-line': '单行显示',
        'double-line': '双行显示'
      },
      lyricFlowDirection: {
        horizontal: '横排显示',
        vertical: '竖排显示'
      },
      lyricTextAlign: {
        left: '居左',
        center: '居中',
        right: '居右'
      }
    },
    actions: {
      installPlugin: '安装插件',
      confirmInstallPlugin: '确认安装',
      cancelInstallPlugin: '取消',
      installingPlugin: '安装中…',
      browsePluginPackage: '选择 zip…',
      browsePluginFolder: '选择文件夹…',
      refreshPlugins: '刷新列表',
      enablePlugin: '启用',
      disablePlugin: '停用',
      uninstallPlugin: '卸载',
      saveSettings: '保存设置'
    },
    states: {
      loadingPlugins: '正在加载插件列表…',
      noPluginsInstalled: '当前还没有可管理的插件。',
      noPluginDescription: '暂无插件描述',
      pluginReady: 'ready',
      pluginDisabled: 'disabled',
      pluginError: 'error'
    },
    dialogs: {
      pluginInstallConfirmTitle: '确认安装插件',
      pluginInstallConfirmDescription:
        '请确认插件来源可信。安装后插件会加入本地插件管理，并可访问它声明的平台能力。',
      pluginInstallConfirmPathLabel: '待安装路径',
      pluginInstallConfirmCloseLabel: '关闭确认安装插件弹窗'
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
    overview: {
      title: '主页',
      description: '欢迎回来，从这里开始探索音乐。'
    },
    discover: {
      title: '每日推荐',
      description: '根据你的听歌偏好，为你精选推荐。'
    },
    roaming: {
      title: '漫游',
      description: '探索新音乐，发现更多可能。'
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
