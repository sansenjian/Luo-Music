export default {
  '*.{ts,vue,js}': ['eslint --fix', 'prettier --config .config/prettier.mjs --write'],
  '*.{json,md}': ['prettier --config .config/prettier.mjs --write']
}
