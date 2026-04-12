import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'LUO Music',
  description: 'LUO Music 项目文档站，覆盖开发指南、架构设计、参考资料、方案计划与审查归档。',
  rewrites: {
    'GETTING_STARTED.md': 'guide/getting-started.md',
    'build.md': 'guide/build-and-release.md',
    'testing.md': 'guide/testing.md',
    'vscode-setup.md': 'guide/vscode-setup.md',
    'CHANGELOG.md': 'guide/changelog.md',
    'PROJECT.md': 'architecture/project-overview.md',
    'service-layer.md': 'architecture/service-layer.md',
    'service-manager-architecture.md': 'architecture/service-manager.md',
    'request-usage.md': 'architecture/request-layer.md',
    'error-handling.md': 'architecture/error-handling.md',
    'sandbox-services.md': 'architecture/sandbox-services.md',
    'unified-ipc-implementation.md': 'architecture/unified-ipc.md',
    'dependency-graph.md': 'architecture/dependency-graph.md',
    'di-performance-monitoring.md': 'architecture/di-performance-monitoring.md',
    'QUICK_REFERENCE.md': 'reference/quick-reference.md',
    'api-documentation.md': 'reference/api.md',
    'components-documentation.md': 'reference/components.md',
    'project-er-diagram.md': 'reference/project-er-diagram.md'
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/' },
      { text: '架构', link: '/architecture/' },
      { text: '参考', link: '/reference/' },
      { text: '计划', link: '/plans/' },
      { text: '报告', link: '/reports/' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开发指南',
          items: [
            { text: '总览', link: '/guide/' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '构建与发布', link: '/guide/build-and-release' },
            { text: '测试指南', link: '/guide/testing' },
            { text: 'E2E 测试', link: '/guide/e2e-testing' },
            { text: 'VSCode 配置', link: '/guide/vscode-setup' },
            { text: '更新日志', link: '/guide/changelog' }
          ]
        }
      ],
      '/architecture/': [
        {
          text: '架构与设计',
          items: [
            { text: '总览', link: '/architecture/' },
            { text: '项目概览', link: '/architecture/project-overview' },
            { text: '服务层设计', link: '/architecture/service-layer' },
            { text: 'Service Manager', link: '/architecture/service-manager' },
            { text: '请求层说明', link: '/architecture/request-layer' },
            { text: '错误处理', link: '/architecture/error-handling' },
            { text: 'Sandbox 服务', link: '/architecture/sandbox-services' },
            { text: '统一 IPC', link: '/architecture/unified-ipc' },
            { text: '依赖图', link: '/architecture/dependency-graph' },
            { text: 'DI 性能监控', link: '/architecture/di-performance-monitoring' }
          ]
        }
      ],
      '/reference/': [
        {
          text: '参考资料',
          items: [
            { text: '总览', link: '/reference/' },
            { text: '快速参考', link: '/reference/quick-reference' },
            { text: 'API 文档', link: '/reference/api' },
            { text: '组件文档', link: '/reference/components' },
            { text: 'ER 图', link: '/reference/project-er-diagram' }
          ]
        }
      ],
      '/plans/': [
        {
          text: '方案与计划',
          items: [
            { text: '总览', link: '/plans/' },
            { text: '架构重构计划', link: '/plans/architecture-refactoring-plan' },
            { text: 'DI 优化计划', link: '/plans/di-optimization-plan' },
            { text: 'DI 后续路线图', link: '/plans/di-followup-roadmap' },
            { text: '首页重构计划', link: '/plans/home-refactor-plan' },
            { text: '歌词系统重构', link: '/plans/lyric-system-refactor-process' },
            { text: '桌面歌词优化', link: '/plans/desktop-lyric-optimization' },
            { text: '打包瘦身计划', link: '/plans/packaging-slimming-plan' },
            { text: 'Player Store 重构', link: '/plans/player-store-refactoring' },
            { text: '统一 IPC 方案', link: '/plans/unified-ipc-plan' },
            { text: 'Review Findings 修复计划', link: '/plans/review-findings-fix-plan-2026-03-28' },
            { text: '常量重构', link: '/plans/refactoring/constants-refactoring' }
          ]
        }
      ],
      '/reports/': [
        {
          text: '报告归档',
          items: [
            { text: '总览', link: '/reports/' },
            { text: '多代理审核报告', link: '/reports/multi-agent-review-2026-03-24' },
            { text: '复审报告', link: '/reports/re-audit-report-2026-03-21' },
            { text: '代码审查报告', link: '/reports/code-review-report' },
            { text: 'Review Findings 验证', link: '/reports/review-findings-verification-2026-03-28' },
            { text: 'Review 评论核验', link: '/reports/review-comment-verification-2026-04-12' },
            { text: '优化总结', link: '/reports/optimization-summary' },
            { text: 'VSCode 优化报告', link: '/reports/optimization-report-vscode' },
            { text: '服务层差距报告', link: '/reports/service-layer-gap-report' },
            { text: 'VSCode 差距问题', link: '/reports/vscode-gap-issues' },
            { text: 'CSS 使用审计', link: '/reports/css-usage-audit-2026-04-08' },
            { text: '分析报告 v1', link: '/reports/analysis-report' },
            { text: '分析报告 v2', link: '/reports/analysis-report-v2' },
            { text: '分析报告 v3', link: '/reports/analysis-report-v3' },
            { text: 'IPC 性能监控', link: '/reports/ipc-performance-monitoring' },
            { text: 'IPC 性能实现总结', link: '/reports/ipc-performance-monitoring-implementation' },
            { text: 'IPC 日志优化', link: '/reports/ipc-performance-logging-optimization' },
            { text: '内存审计报告', link: '/reports/MEMORY_AUDIT_REPORT' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/sansenjian/Luo-Music' }],

    footer: {
      message: '文档结构已按开发、架构、参考、计划与报告分层整理',
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
