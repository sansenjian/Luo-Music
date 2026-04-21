# TypeScript、命名与文档规则

## TypeScript

- 新增逻辑优先使用 TypeScript。
- 不要扩散 `any`；优先补接口、类型别名、函数签名。
- 公共模块导出前，保证输入输出类型明确。
- 迁移旧 JS 文件时，先保持行为一致，再做结构优化。
- 临时宽松类型只能局部使用，并在后续继续收紧。

## 类型定义位置

- 实体类型优先放 `src/types/`。
- API 专用类型放到对应文件旁，例如 `xx.types.ts`。
- 组件 Props 类型优先用 `defineProps<...>()` 内联声明或就近提取。

## 命名规则

- 组件：PascalCase，例如 `LyricFloat.vue`
- 组合式函数 / 工具：camelCase，例如 `usePlayer.ts`
- 类型文件：`*.types.ts`
- 常量文件：`*.const.ts`
- 测试文件：与目标文件保持同名语义，使用 `.test.ts` 或 `.test.js`

## 导入与编码

- 导入顺序：框架 / 第三方 -> 内部模块与类型 -> 相对路径与样式
- `src/*` 模块优先用 `@/` 别名，不要继续写 `../../src/*`
- 类型导入优先使用 `import type`
- 文本文件统一 UTF-8（无 BOM）

## 文档组织

- 根目录仅保留 `AGENTS.md` 和 `README.md`
- 其余 Markdown 文档统一放在 `docs/`
- 修改文档结构后，补跑 `npm run docs:build`
