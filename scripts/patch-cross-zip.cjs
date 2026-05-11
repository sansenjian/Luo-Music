const fs = require("fs");
const path = require("path");

const crossZipPath = path.join(__dirname, "..", "node_modules", "cross-zip", "index.js");
const electronWinstallerSignPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "electron-winstaller",
  "lib",
  "sign.js",
);
const electronWinstallerVendorPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "electron-winstaller",
  "vendor",
);
const appBuilderLibNodeModulesCollectorPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "app-builder-lib",
  "out",
  "node-module-collector",
  "nodeModulesCollector.js",
);

function isCiEnvironment() {
  return Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);
}

function handleUnchangedPatch(options) {
  const { alreadyPatched, alreadyPatchedMessage, unsupportedMessage } = options;

  if (alreadyPatched) {
    console.log(alreadyPatchedMessage);
    return;
  }

  console.log(unsupportedMessage);

  if (isCiEnvironment()) {
    throw new Error(`${unsupportedMessage} (failing in CI to surface patch drift)`);
  }
}

function patchCrossZip(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("[patch-cross-zip] cross-zip is not installed, skipping");
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const patched = source
    .replace(
      "fs.rmdir(outPath, { recursive: true, maxRetries: 3 }, doZip2)",
      "fs.rm(outPath, { recursive: true, force: true, maxRetries: 3 }, doZip2)",
    )
    .replace(
      "fs.rmdirSync(outPath, { recursive: true, maxRetries: 3 })",
      "fs.rmSync(outPath, { recursive: true, force: true, maxRetries: 3 })",
    );

  if (patched === source) {
    const alreadyPatched =
      source.includes("fs.rm(outPath, { recursive: true, force: true, maxRetries: 3 }, doZip2)") &&
      source.includes("fs.rmSync(outPath, { recursive: true, force: true, maxRetries: 3 })");

    handleUnchangedPatch({
      alreadyPatched,
      alreadyPatchedMessage: "[patch-cross-zip] cross-zip already patched",
      unsupportedMessage: "[patch-cross-zip] cross-zip unsupported version",
    });
    return;
  }

  fs.writeFileSync(filePath, patched, "utf8");
  console.log("[patch-cross-zip] patched cross-zip to use fs.rm/fs.rmSync");
}

function patchElectronWinstallerSign(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("[patch-cross-zip] electron-winstaller is not installed, skipping");
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const patched = source.replace(
    "if (!fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)) return [3 /*break*/, 3];",
    "if (!BACKUP_SIGN_TOOL_PATH || !fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)) return [3 /*break*/, 3];",
  );

  if (patched === source) {
    const alreadyPatched = source.includes(
      "if (!BACKUP_SIGN_TOOL_PATH || !fs_extra_1.default.existsSync(BACKUP_SIGN_TOOL_PATH)) return [3 /*break*/, 3];",
    );

    handleUnchangedPatch({
      alreadyPatched,
      alreadyPatchedMessage: "[patch-cross-zip] electron-winstaller already patched",
      unsupportedMessage: "[patch-cross-zip] electron-winstaller unsupported version",
    });
    return;
  }

  fs.writeFileSync(filePath, patched, "utf8");
  console.log("[patch-cross-zip] patched electron-winstaller sign.js guard for DEP0187");
}

function patchElectronWinstaller7Zip(vendorPath) {
  if (!fs.existsSync(vendorPath)) {
    console.log("[patch-cross-zip] electron-winstaller vendor directory is not installed, skipping");
    return;
  }

  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const sourceExePath = path.join(vendorPath, `7z-${arch}.exe`);
  const sourceDllPath = path.join(vendorPath, `7z-${arch}.dll`);
  const targetExePath = path.join(vendorPath, "7z.exe");
  const targetDllPath = path.join(vendorPath, "7z.dll");

  if (!fs.existsSync(sourceExePath) || !fs.existsSync(sourceDllPath)) {
    handleUnchangedPatch({
      alreadyPatched: fs.existsSync(targetExePath) && fs.existsSync(targetDllPath),
      alreadyPatchedMessage: "[patch-cross-zip] electron-winstaller 7-Zip files already exist",
      unsupportedMessage: `[patch-cross-zip] electron-winstaller unsupported 7-Zip vendor layout for ${arch}`,
    });
    return;
  }

  fs.copyFileSync(sourceExePath, targetExePath);
  fs.copyFileSync(sourceDllPath, targetDllPath);
  console.log(`[patch-cross-zip] selected electron-winstaller 7-Zip binaries for ${arch}`);
}

function patchAppBuilderLibNodeModulesCollector(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("[patch-cross-zip] app-builder-lib is not installed, skipping");
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const upstreamSnippet = [
    "        await new Promise((resolve, reject) => {",
    "            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);",
    "            const child = childProcess.spawn(command, args, {",
    "                cwd,",
    '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
    "                shell: true, // `true`` is now required: https://github.com/electron-userland/electron-builder/issues/9488",
    "            });",
  ].join("\n");
  const malformedSnippet = [
    "        await new Promise((resolve, reject) => {",
    "            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);",
    "            const quoteForShell = (part) => {",
    "                if (part.length === 0) {",
    '                    return "\\"";',
    "                }",
    '                return /[\\s"]/u.test(part) && !(part.startsWith("\\"") && part.endsWith("\\""))',
    '                    ? "\\\\"${part.replace(/"/g, \'\\\\\\\\\\"\')}\\\\""',
    "                    : part;",
    "            };",
    '            const shellCommand = [command, ...args].map(quoteForShell).join(" ");',
    "            const child = childProcess.spawn(shellCommand, [], {",
    "                cwd,",
    '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
    "                shell: true, // electron-builder currently requires shell mode here, so pass a single shell command string to avoid DEP0190",
    "            });",
  ].join("\n");
  const unsafePatchedSnippet = [
    "        await new Promise((resolve, reject) => {",
    "            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);",
    "            const quoteForShell = (part) => {",
    "                if (part.length === 0) {",
    "                    return '\"\"';",
    "                }",
    "                if (!(part.startsWith('\"') && part.endsWith('\"')) && /[\\s\"]/u.test(part)) {",
    "                    const escapedPart = part.replace(/\"/g, '\\\\\"');",
    '                    return `"${escapedPart}"`;',
    "                }",
    "                return part;",
    "            };",
    '            const shellCommand = [command, ...args].map(quoteForShell).join(" ");',
    "            const child = childProcess.spawn(shellCommand, [], {",
    "                cwd,",
    '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
    "                shell: true, // electron-builder currently requires shell mode here, so pass a single shell command string to avoid DEP0190",
    "            });",
  ].join("\n");
  const brokenShellFalseSnippet = [
    "        await new Promise((resolve, reject) => {",
    "            const outStream = (0, fs_extra_1.createWriteStream)(tempOutputFile);",
    "            const child = childProcess.spawn(command, args, {",
    "                cwd,",
    '                env: { COREPACK_ENABLE_STRICT: "0", ...process.env }, // allow `process.env` overrides',
    "                shell: false, // pass argv directly to avoid shell-escaping bugs and injection risks",
    "            });",
  ].join("\n");

  const patched = source
    .replace(malformedSnippet, upstreamSnippet)
    .replace(unsafePatchedSnippet, upstreamSnippet)
    .replace(brokenShellFalseSnippet, upstreamSnippet);

  if (patched === source) {
    const alreadyPatched = source.includes(upstreamSnippet);

    handleUnchangedPatch({
      alreadyPatched,
      alreadyPatchedMessage:
        "[patch-cross-zip] app-builder-lib collector shell mode already preserved",
      unsupportedMessage: "[patch-cross-zip] app-builder-lib unsupported version",
    });
    return;
  }

  fs.writeFileSync(filePath, patched, "utf8");
  console.log("[patch-cross-zip] restored app-builder-lib nodeModulesCollector shell mode");
}

function main() {
  patchCrossZip(crossZipPath);
  patchElectronWinstallerSign(electronWinstallerSignPath);
  patchElectronWinstaller7Zip(electronWinstallerVendorPath);
  patchAppBuilderLibNodeModulesCollector(appBuilderLibNodeModulesCollectorPath);
}

if (require.main === module) {
  main();
}

module.exports = {
  handleUnchangedPatch,
  isCiEnvironment,
  main,
  patchAppBuilderLibNodeModulesCollector,
  patchCrossZip,
  patchElectronWinstaller7Zip,
  patchElectronWinstallerSign,
};
