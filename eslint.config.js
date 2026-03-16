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
      '.pnpm-store/**',
      '.vite_cache/**',
      'docs/.vitepress/**',
      'src/auto-imports.d.ts',
      'src/components.d.ts',
      'electron/**/*.js',
      'scripts/**',
      'playwright.config.js',
      'vitest.config.js',
      'forge.config.js',
      'forge.config.ts',
      'vite.config.ts',
      'electron.vite.config.ts',
      '**/*.cjs',
      '**/*.mjs',
      '**/vendor-*.js',
      '**/chunk-*.js'
    ]
  },
  // 基础错误预防规则
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  // Prettier 关闭所有与格式化冲突的规则
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
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    rules: {
      // === 错误预防规则 ===
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // preserve-caught-error 太严格，关闭
      'preserve-caught-error': 'off',
      // 关闭格式相关规则（由 Prettier 管理）
      '@typescript-eslint/semi': 'off',
      '@typescript-eslint/quotes': 'off',
      '@typescript-eslint/comma-dangle': 'off',
      '@typescript-eslint/indent': 'off',
      '@typescript-eslint/brace-style': 'off',
      '@typescript-eslint/keyword-spacing': 'off',
      '@typescript-eslint/space-before-function-paren': 'off',
      '@typescript-eslint/object-curly-spacing': 'off',
      '@typescript-eslint/array-bracket-spacing': 'off',
      '@typescript-eslint/space-infix-ops': 'off',
      '@typescript-eslint/member-delimiter-style': 'off',
      '@typescript-eslint/type-annotation-spacing': 'off',
      // Vue 规则 - 只保留错误预防，关闭格式规则
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/max-len': 'off',
      'vue/attributes-order': 'off',
      'vue/no-v-html': 'off',
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
