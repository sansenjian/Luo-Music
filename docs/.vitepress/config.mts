import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'LUO Music',
  description: 'LUO Music 项目文档站，包含开发指南、架构说明、重构计划与审查报告。',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/GETTING_STARTED' },
      { text: '构建', link: '/build' },
      { text: '架构', link: '/service-layer' },
      { text: '计划', link: '/plans/architecture-refactoring-plan' },
      { text: '报告', link: '/reports/multi-agent-review-2026-03-24' }
    ],

    sidebar: [
      {
        text: '开始使用',
        items: [
          { text: '首页', link: '/' },
          { text: '快速开始', link: '/GETTING_STARTED' },
          { text: '项目概览', link: '/PROJECT' },
          { text: '快速参考', link: '/QUICK_REFERENCE' },
          { text: '构建指南', link: '/build' },
          { text: '测试指南', link: '/testing' },
          { text: 'VSCode 配置', link: '/vscode-setup' },
          { text: '更新日志', link: '/CHANGELOG' }
        ]
      },
      {
        text: '参考与架构',
        items: [
          { text: 'API 文档', link: '/api-documentation' },
          { text: '组件文档', link: '/components-documentation' },
          { text: '错误处理', link: '/error-handling' },
          { text: '请求层说明', link: '/request-usage' },
          { text: '服务层设计', link: '/service-layer' },
          { text: '服务管理架构', link: '/service-manager-architecture' },
          { text: '沙箱服务', link: '/sandbox-services' },
          { text: '统一 IPC 实现', link: '/unified-ipc-implementation' },
          { text: '依赖图', link: '/dependency-graph' },
          { text: 'DI 性能监控', link: '/di-performance-monitoring' }
        ]
      },
      {
        text: '方案与计划',
        items: [
          { text: '架构重构计划', link: '/plans/architecture-refactoring-plan' },
          { text: '首页重构计划', link: '/plans/home-refactor-plan' },
          { text: 'Player Store 重构', link: '/plans/player-store-refactoring' },
          { text: '统一 IPC 方案', link: '/plans/unified-ipc-plan' },
          { text: '常量重构', link: '/plans/refactoring/constants-refactoring' }
        ]
      },
      {
        text: '报告归档',
        items: [
          { text: '多代理审核报告', link: '/reports/multi-agent-review-2026-03-24' },
          { text: '复审报告', link: '/reports/re-audit-report-2026-03-21' },
          { text: '代码审查报告', link: '/reports/code-review-report' },
          { text: '优化总结', link: '/reports/optimization-summary' },
          { text: 'VSCode 优化报告', link: '/reports/optimization-report-vscode' },
          { text: '服务层差距报告', link: '/reports/service-layer-gap-report' },
          { text: 'VSCode 差距问题', link: '/reports/vscode-gap-issues' },
          { text: '分析报告 v1', link: '/reports/analysis-report' },
          { text: '分析报告 v2', link: '/reports/analysis-report-v2' },
          { text: '分析报告 v3', link: '/reports/analysis-report-v3' },
          { text: 'IPC 性能监控', link: '/reports/ipc-performance-monitoring' },
          { text: 'IPC 性能实现总结', link: '/reports/ipc-performance-monitoring-implementation' },
          { text: 'IPC 日志优化', link: '/reports/ipc-performance-logging-optimization' }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/sansenjian/luo-music' }],

    footer: {
      message: '项目文档持续整理中',
      copyright: 'Copyright 2024-present sansenjian'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    outline: {
      label: '本页目录'
    },

    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },

    langMenuLabel: '语言',
    returnToTopLabel: '返回顶部',
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
                noResultsText: '没有找到结果',
                resetButtonTitle: '清空查询条件',
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
