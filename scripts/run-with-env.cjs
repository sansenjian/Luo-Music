const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

function loadEnvFile(filePath, env) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    console.error(`Environment file not found: ${filePath}`);
    process.exit(1);
  }

  const content = readFileSync(resolvedPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    env[key] = value;
  }
}

function createSpawnTarget(parts) {
  return {
    command: parts[0],
    args: parts.slice(1),
    shell: false,
    windowsVerbatimArguments: false,
  };
}

function parseArgs(rawArgs, env = { ...process.env }) {
  const separatorIndex = rawArgs.indexOf("--");

  if (separatorIndex === -1 || separatorIndex === rawArgs.length - 1) {
    throw new Error(
      "Usage: node scripts/run-with-env.cjs KEY=value [KEY=value ...] -- command [args...]",
    );
  }

  const envInputs = rawArgs.slice(0, separatorIndex);
  const commandParts = rawArgs.slice(separatorIndex + 1);

  for (let index = 0; index < envInputs.length; index += 1) {
    const assignment = envInputs[index];

    if (assignment === "--env-file") {
      const filePath = envInputs[index + 1];
      if (!filePath) {
        throw new Error("Missing value for --env-file");
      }

      loadEnvFile(filePath, env);
      index += 1;
      continue;
    }

    const equalsIndex = assignment.indexOf("=");

    if (equalsIndex <= 0) {
      throw new Error(`Invalid environment assignment: ${assignment}`);
    }

    const key = assignment.slice(0, equalsIndex);
    const value = assignment.slice(equalsIndex + 1);
    env[key] = value;
  }

  return {
    commandParts,
    env,
  };
}

function main(rawArgs = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(rawArgs);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const target = createSpawnTarget(parsed.commandParts);

  const child = spawn(target.command, target.args, {
    stdio: "inherit",
    env: parsed.env,
    shell: target.shell,
    windowsVerbatimArguments: target.windowsVerbatimArguments,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    createSpawnTarget,
    parseArgs,
  };
}
