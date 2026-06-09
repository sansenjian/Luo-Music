import { defineConfig } from 'vite-plus'
import type { UserConfig } from 'vite-plus'

const lintConfig = {
  plugins: ['oxc', 'typescript', 'unicorn', 'vue', 'vitest'],
  categories: {
    correctness: 'warn'
  },
  options: {
    typeAware: false
  },
  env: {
    builtin: true
  },
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
    HTMLButtonElement: 'readonly',
    HTMLImageElement: 'readonly',
    HTMLDivElement: 'readonly',
    HTMLInputElement: 'readonly',
    animate: 'readonly',
    Animation: 'readonly',
    KeyframeEffect: 'readonly',
    AnimationTimeline: 'readonly',
    defineProps: 'readonly',
    defineEmits: 'readonly',
    defineModel: 'readonly',
    defineExpose: 'readonly',
    defineOptions: 'readonly',
    defineSlots: 'readonly',
    withDefaults: 'readonly'
  },
  ignorePatterns: [
    '.codex/**',
    '.cache/**',
    'tmp/**',
    '.tmp/**',
    '.claude/**',
    '.codex_tmp/**',
    '.codex-tmp/**',
    '.idea/**',
    '.playwright-mcp/**',
    '.userData/**',
    'dist/**',
    'build/**',
    'out/**',
    'release/**',
    'node_modules/**',
    '.vite_cache/**',
    '.vite/**',
    'docs/.vitepress/**',
    'src/auto-imports.d.ts',
    'src/components.d.ts',
    'electron/**/*.js',
    'scripts/**',
    'playwright.config.js',
    '.config/playwright.config.ts',
    'vitest.config.js',
    '.config/vitest.config.ts',
    'forge.config.js',
    'electron/forge.config.ts',
    'vite.config.js',
    '.config/vite.config.ts',
    'electron.vite.config.ts',
    'electron/vite.config.ts',
    '**/*.cjs',
    '**/*.mjs',
    '**/vendor-*.js',
    '**/chunk-*.js',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'config/vite.shared.ts',
    'config/vite.shared.js',
    'docs/injector-example.ts',
    'docs/injector-example.js',
    'docs/reference/examples/injector-example.ts',
    'docs/reference/examples/injector-example.js',
    'electron/external.d.ts',
    'server/index.ts'
  ],
  rules: {
    'constructor-super': 'error',
    'for-direction': 'error',
    'getter-return': 'error',
    'no-async-promise-executor': 'error',
    'no-case-declarations': 'error',
    'no-class-assign': 'error',
    'no-compare-neg-zero': 'error',
    'no-cond-assign': 'error',
    'no-const-assign': 'error',
    'no-constant-binary-expression': 'error',
    'no-constant-condition': 'error',
    'no-control-regex': 'error',
    'no-debugger': 'error',
    'no-delete-var': 'error',
    'no-dupe-class-members': 'error',
    'no-dupe-else-if': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-empty': 'error',
    'no-empty-character-class': 'error',
    'no-empty-pattern': 'error',
    'no-empty-static-block': 'error',
    'no-ex-assign': 'error',
    'no-extra-boolean-cast': 'error',
    'no-fallthrough': 'error',
    'no-func-assign': 'error',
    'no-global-assign': 'error',
    'no-import-assign': 'error',
    'no-invalid-regexp': 'error',
    'no-irregular-whitespace': 'error',
    'no-loss-of-precision': 'error',
    'no-misleading-character-class': 'error',
    'no-new-native-nonconstructor': 'error',
    'no-nonoctal-decimal-escape': 'error',
    'no-obj-calls': 'error',
    'no-prototype-builtins': 'error',
    'no-redeclare': 'error',
    'no-regex-spaces': 'error',
    'no-self-assign': 'error',
    'no-setter-return': 'error',
    'no-shadow-restricted-names': 'error',
    'no-sparse-arrays': 'error',
    'no-this-before-super': 'error',
    'no-unassigned-vars': 'error',
    'no-undef': 'error',
    'no-unexpected-multiline': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-negation': 'error',
    'no-unsafe-optional-chaining': 'error',
    'no-unused-labels': 'error',
    'no-unused-private-class-members': 'error',
    'no-unused-vars': 'error',
    'no-useless-assignment': 'error',
    'no-useless-backreference': 'error',
    'no-useless-catch': 'error',
    'no-useless-escape': 'error',
    'no-with': 'error',
    'preserve-caught-error': 'error',
    'require-yield': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',
    'no-array-constructor': 'error',
    'no-unused-expressions': 'error',
    'vue/no-arrow-functions-in-watch': 'error',
    'vue/no-deprecated-destroyed-lifecycle': 'error',
    'vue/no-export-in-script-setup': 'error',
    'vue/no-lifecycle-after-await': 'error',
    'vue/prefer-import-from-vue': 'error',
    'vue/valid-define-emits': 'error',
    'vue/valid-define-props': 'error',
    'vue/no-multiple-slot-args': 'warn',
    'vue/no-required-prop-with-default': 'warn',
    'typescript/ban-ts-comment': 'error',
    'typescript/no-duplicate-enum-values': 'error',
    'typescript/no-empty-object-type': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-extra-non-null-assertion': 'error',
    'typescript/no-misused-new': 'error',
    'typescript/no-namespace': 'error',
    'typescript/no-non-null-asserted-optional-chain': 'error',
    'typescript/no-require-imports': 'error',
    'typescript/no-this-alias': 'error',
    'typescript/no-unnecessary-type-constraint': 'error',
    'typescript/no-unsafe-declaration-merging': 'error',
    'typescript/no-unsafe-function-type': 'error',
    'typescript/no-wrapper-object-types': 'error',
    'typescript/prefer-as-const': 'error',
    'typescript/prefer-namespace-keyword': 'error',
    'typescript/triple-slash-reference': 'error'
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      rules: {
        'constructor-super': 'off',
        'getter-return': 'off',
        'no-class-assign': 'off',
        'no-const-assign': 'off',
        'no-dupe-class-members': 'off',
        'no-dupe-keys': 'off',
        'no-func-assign': 'off',
        'no-import-assign': 'off',
        'no-new-native-nonconstructor': 'off',
        'no-obj-calls': 'off',
        'no-redeclare': 'off',
        'no-setter-return': 'off',
        'no-this-before-super': 'off',
        'no-undef': 'off',
        'no-unreachable': 'off',
        'no-unsafe-negation': 'off',
        'no-var': 'error',
        'no-with': 'off',
        'prefer-const': 'error',
        'prefer-rest-params': 'error',
        'prefer-spread': 'error'
      }
    },
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
      rules: {
        'no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_'
          }
        ],
        'typescript/no-explicit-any': 'warn',
        'typescript/explicit-function-return-type': 'off',
        'typescript/explicit-module-boundary-types': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-require-imports': 'off',
        'typescript/no-floating-promises': 'error'
      }
    },
    {
      files: ['.config/playwright.config.ts'],
      rules: {
        'typescript/no-floating-promises': 'off'
      }
    },
    {
      files: ['src/**/*.{ts,tsx,vue}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../*', '../../*', '../../../*', '../../../../*'],
                message: 'Imports inside src should use the @/ alias instead of parent paths.'
              },
              {
                group: [
                  '../electron/*',
                  '../../electron/*',
                  '../../../electron/*',
                  '../../../../electron/*'
                ],
                message:
                  'Renderer code must not import from electron/. Use src/platform/contracts or src/platform instead.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['tests/**/*.ts', 'tests/**/*.js'],
      rules: {
        'no-console': 'off',
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../src/*', '../../src/*', '../../../src/*', '../../../../src/*'],
                message:
                  'Imports that target src should use the @/ alias instead of relative parent paths.'
              }
            ]
          }
        ],
        'no-unused-vars': 'off',
        'typescript/no-explicit-any': 'off',
        'vitest/require-mock-type-parameters': 'off'
      }
    },
    {
      files: ['docs/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../src/*', '../../src/*', '../../../src/*', '../../../../src/*'],
                message:
                  'Documentation examples that target src should use the @/ alias instead of relative parent paths.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['electron/**/*.ts', 'server/**/*.ts'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
} as unknown as NonNullable<UserConfig['lint']>

const fmtConfig = {
  semi: false,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'none',
  printWidth: 100,
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  insertFinalNewline: true,
  vueIndentScriptAndStyle: false,
  htmlWhitespaceSensitivity: 'ignore',
  proseWrap: 'preserve',
  sortPackageJson: false,
  ignorePatterns: [
    'node_modules/**',
    'build/**',
    'dist/**',
    'out/**',
    'release/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'inspection-results/**',
    'src/auto-imports.d.ts',
    'src/components.d.ts'
  ]
} as unknown as NonNullable<UserConfig['fmt']>

const stagedConfig = {
  '*.{ts,vue,js,json,md}': 'vp fmt --write --no-error-on-unmatched-pattern',
  '*.{ts,vue,js}': 'vp lint --fix --no-error-on-unmatched-pattern'
} satisfies NonNullable<UserConfig['staged']>

// Vite+ quality tools discover this root config automatically.
// Web, test, and Electron workflows continue to use their explicit app configs.
export default defineConfig({
  lint: lintConfig,
  fmt: fmtConfig,
  staged: stagedConfig
})
