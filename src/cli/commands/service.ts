import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { CWD, getImageTag, loadEnvFile } from "../helpers.js";

function getContainerName(envPath: string): string {
  const tag = getImageTag(envPath);
  // Generate container name from project dir + image tag
  // e.g. /opt/pixie + mercury:latest → pixie-mercury-latest
  const projectName = basename(CWD).replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${projectName}-${safeTag}`;
}

function getPort(): string {
  const envPath = join(CWD, ".env");
  if (existsSync(envPath)) {
    const vars = loadEnvFile(envPath);
    if (vars.MERCURY_PORT) return vars.MERCURY_PORT;
  }
  return "3000";
}

export function startAction(): void {
  const envPath = join(CWD, ".env");
  if (!existsSync(envPath)) {
    console.error("Error: .env file not found.");
    console.error("Run 'mercury init' first.");
    process.exit(1);
  }

  const containerName = getContainerName(envPath);
  
  // Stop existing container if running
  spawnSync("docker", ["rm", "-f", containerName], { stdio: "pipe" });

  const tag = getImageTag(envPath);
  const port = getPort();
  const args = [
    "run",
    "-d",
    "--name",
    containerName,
    "--restart",
    "unless-stopped",
    "--cap-add",
    "SYS_ADMIN",
    "--security-opt",
    "seccomp=unconfined",
    "-v",
    `${CWD}:/data`,
    "-p",
    `${port}:${port}`,
  ];

  if (existsSync(envPath)) args.push("--env-file", envPath);
  args.push(tag);

  console.log(`🪽 Starting ${tag}...`);
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Failed to start container");
    process.exit(result.status ?? 1);
  }

  console.log(`\n✓ Mercury started`);
  console.log(`  Container: ${containerName}`);
  console.log(`  Image: ${tag}`);
  console.log(`  Port: ${port}`);
  console.log(`  Logs: mercury logs -f`);
}

export function stopAction(): void {
  const envPath = join(CWD, ".env");
  const containerName = envPath && existsSync(envPath) ? getContainerName(envPath) : "mercury";
  
  const check = spawnSync("docker", ["inspect", containerName], {
    stdio: "pipe",
  });
  if (check.status !== 0) {
    console.log("Mercury is not running.");
    return;
  }

  console.log("Stopping mercury...");
  spawnSync("docker", ["stop", containerName], { stdio: "pipe" });
  spawnSync("docker", ["rm", containerName], { stdio: "pipe" });
  console.log("✓ Mercury stopped");
}

export function restartAction(): void {
  stopAction();

  const envPath = join(CWD, ".env");
  if (!existsSync(envPath)) {
    console.error("Error: .env file not found.");
    process.exit(1);
  }

  // Rebuild
  console.log("\nRebuilding image...\n");
  // Dynamic import to avoid circular deps
  import("./build.js").then(async ({ buildAction }) => {
    await buildAction({});
    console.log();
    startAction();
  });
}

export function logsAction(options: { follow?: boolean }): void {
  const envPath = join(CWD, ".env");
  const containerName = envPath && existsSync(envPath) ? getContainerName(envPath) : "mercury";
  
  const args = ["logs"];
  if (options.follow) args.push("-f");
  args.push(containerName);

  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("Mercury is not running. Start with: mercury start");
    process.exit(1);
  }
}
