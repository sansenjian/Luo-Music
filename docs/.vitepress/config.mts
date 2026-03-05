import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Luo Music",
  description: "一个支持网易云音乐和QQ音乐的美观音乐播放器",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/GETTING_STARTED' },
      { text: 'API', link: '/api-documentation' },
      { text: '组件', link: '/components-documentation' }
    ],

    sidebar: [
      {
        text: '介绍',
        items: [
          { text: '快速开始', link: '/GETTING_STARTED' },
          { text: '项目概览', link: '/PROJECT' },
          { text: '分析报告', collapsed: true, items: [
            { text: 'v1', link: '/analysis-report' },
            { text: 'v2', link: '/analysis-report-v2' },
            { text: 'v3', link: '/analysis-report-v3' }
          ]}
        ]
      },
      {
        text: '开发',
        items: [
          { text: 'API 文档', link: '/api-documentation' },
          { text: '组件', link: '/components-documentation' },
          { text: '错误处理', link: '/error-handling' },
          { text: '请求使用说明', link: '/request-usage' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sansenjian/luo-music' }
    ],
    
    footer: {
      message: '基于 MIT 许可发布',
      copyright: '版权所有 © 2024-present sansenjian'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    outline: {
      label: '页面导航'
    },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },

    langMenuLabel: '多语言',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭'
                }
              }
            }
          }
        }
      }
    }
  }
})
