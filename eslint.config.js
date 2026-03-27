import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: [
      'dist/**',
      'build/**',
      'release/**',
      'node_modules/**',
      '.vite_cache/**',
      'docs/.vitepress/**',
      'src/auto-imports.d.ts',
      'src/components.d.ts',
      'electron/**/*.js',
      'scripts/**',
      'playwright.config.js',
      'vitest.config.js',
      'vitest.config.ts',
      'forge.config.js',
      'forge.config.ts',
      'vite.config.ts',
      'electron.vite.config.ts',
      '**/*.cjs',
      '**/*.mjs',
      '**/vendor-*.js',
      '**/chunk-*.js',
      'coverage/**',
      'config/vite.shared.ts',
      'config/vite.shared.js',
      'docs/injector-example.ts',
      'docs/injector-example.js',
      'electron/external.d.ts',
      'server/index.ts'
    ]
  },
  // 基础错误预防规则
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  // eslint-config-prettier 禁用所有与 Prettier 冲突的 ESLint 规则
  // 必须放在最后以覆盖前面的规则
  eslintConfigPrettier,
  {
    // 浏览器环境全局变量
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        Audio: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        AbortController: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        isFinite: 'readonly',
        Infinity: 'readonly',
        NaN: 'readonly',
        undefined: 'readonly',
        globalThis: 'readonly',
        // Additional browser globals
        confirm: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        FocusEvent: 'readonly',
        InputEvent: 'readonly',
        TouchEvent: 'readonly',
        WheelEvent: 'readonly',
        DragEvent: 'readonly',
        ClipboardEvent: 'readonly',
        ProgressEvent: 'readonly',
        ErrorEvent: 'readonly',
        AnimationEvent: 'readonly',
        TransitionEvent: 'readonly',
        StorageEvent: 'readonly',
        MessageEvent: 'readonly',
        CloseEvent: 'readonly',
        EventTarget: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        SVGElement: 'readonly',
        Document: 'readonly',
        DocumentFragment: 'readonly',
        DOMRect: 'readonly',
        DOMTokenList: 'readonly',
        CSSStyleDeclaration: 'readonly',
        // DOM Element Types (for TypeScript refs in Vue)
        HTMLButtonElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        // Web Animations API
        animate: 'readonly',
        Animation: 'readonly',
        KeyframeEffect: 'readonly',
        AnimationTimeline: 'readonly'
      }
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue']
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
        allowDefaultProject: ['*.ts', '*.js', '*.vue']
      }
    },
    rules: {
      // === 错误预防规则（只保留逻辑相关，格式全部交给 Prettier）===
      // TypeScript 逻辑规则
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // 检测未处理的 Promise（missing await）
      '@typescript-eslint/no-floating-promises': 'error',
      // Vue 逻辑规则（关闭所有格式相关）
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      // 关闭属性顺序规则（由 Prettier 管理）
      'vue/attributes-order': 'off',
      // 必须保留的 Vue 错误预防规则
      'vue/require-v-for-key': 'error',
      'vue/no-use-v-if-with-v-for': 'error',
      'vue/no-dupe-keys': 'error',
      'vue/no-duplicate-attributes': 'error',
      'vue/no-reserved-keys': 'error',
      'vue/no-shared-component-data': 'error',
      'vue/no-side-effects-in-computed-properties': 'error',
      'vue/no-async-in-computed-properties': 'error'
    }
  },
  {
    files: ['playwright.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: null
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off'
    }
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off'
    }
  },
  {
    files: ['electron/**/*.ts', 'server/**/*.ts'],
    rules: {
      'no-console': 'off'
    }
  }
]
