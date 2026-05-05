export default {
  "*.{ts,vue,js}": ["oxlint --fix -c .oxlintrc.json", "prettier --config .config/prettier.mjs --write"],
  "*.{json,md}": ["prettier --config .config/prettier.mjs --write"],
};
