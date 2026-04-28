import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../",
);
const SHOTS = path.join(ROOT, "docs", "screenshots");
const FRAMES = path.join(SHOTS, ".frames");
const BASE_URL = "http://127.0.0.1:4173";
const STATUS_URL = "https://mixnet.dev/status-json.xsl";
const VIEWPORT = { width: 1600, height: 1000 };

const TERMINAL_CAPTURES = [
  { command: "./anal", output: "terminal-anal.png", settleMs: 2000 },
  { command: "./cmatrix", output: "terminal-cmatrix.png", settleMs: 4000 },
  { command: "./eq", output: "terminal-eq.png", settleMs: 2000 },
  { command: "./freecam", output: "terminal-freecam.png", settleMs: 1000 },
  { command: "./fx", output: "terminal-fx.png", settleMs: 1000 },
];

const BOOT_CAPTURES = [
  {
    key: "w",
    name: "windows",
    output: "boot-windows.gif",
    padding: { top: 104, right: 54, bottom: 64, left: 74 },
  },
  {
    key: "m",
    name: "macos",
    output: "boot-macos.gif",
    padding: { top: 74, right: 56, bottom: 20, left: 20 },
  },
  {
    key: "l",
    name: "linux",
    output: "boot-linux.gif",
    padding: { top: 74, right: 60, bottom: 20, left: 124 },
  },
];

const shot = (file, opts = {}) => path.join(SHOTS, file);

function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });
}

function startViteServer() {
  return spawn(
    process.execPath,
    [
      path.join(ROOT, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
      "--strictPort",
    ],
    { cwd: ROOT, stdio: "ignore" },
  );
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isVisible(locator) {
  return (
    (await locator.count()) > 0 &&
    locator
      .first()
      .isVisible()
      .catch(() => false)
  );
}

async function waitForHidden(locator, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isVisible(locator))) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for element to hide");
}

async function ensureCommandTerminal(page) {
  const sel = ".system-terminal--command.visible";
  const terminal = page.locator(sel);
  if (!(await isVisible(terminal))) {
    await page.keyboard.press("c");
    await terminal.waitFor({ state: "visible" });
  }
  return terminal;
}

async function captureTerminalApp(page, { command, output, settleMs }) {
  const terminal = await ensureCommandTerminal(page);
  const input = page.locator(
    ".system-terminal--command.visible .system-terminal__input",
  );
  await input.waitFor({ state: "visible" });
  await input.click();
  await input.fill(command);
  await input.press("Enter");
  await page.waitForFunction(() =>
    document
      .querySelector(".system-terminal--command.visible")
      ?.classList.contains("system-terminal--app-active"),
  );
  await page.waitForTimeout(settleMs);
  await terminal.screenshot({ path: shot(output), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const t = document.querySelector(".system-terminal--command.visible");
    return t && !t.classList.contains("system-terminal--app-active");
  });
  await page.waitForTimeout(150);
}

async function renderGif(framesDir, outputFile, fps = 6) {
  const palette = path.join(framesDir, "palette.png");
  const pattern = path.join(framesDir, "frame-%04d.png");
  const scale = 800;
  const base = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    String(fps),
  ];
  const vf = `fps=${fps},scale=${scale}:-1:flags=lanczos`;

  await runProcess("ffmpeg", [
    ...base,
    "-i",
    pattern,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-vf",
    `${vf},palettegen=stats_mode=diff`,
    palette,
  ]);

  await runProcess("ffmpeg", [
    ...base,
    "-i",
    pattern,
    "-i",
    palette,
    "-filter_complex",
    `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    outputFile,
  ]);
}

async function captureBootGif(page, { key, name, output, padding }) {
  const terminal = page.locator(".system-terminal--boot.visible").last();
  const framesDir = path.join(FRAMES, name);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  await page.keyboard.press(key);
  await terminal.waitFor({ state: "visible" });

  const box = await terminal.boundingBox();
  if (!box) throw new Error(`No bounds for ${name} boot terminal`);

  const x = Math.max(0, Math.floor(box.x - padding.left));
  const y = Math.max(0, Math.floor(box.y - padding.top));
  const clip = {
    x,
    y,
    width: Math.min(
      VIEWPORT.width - x,
      Math.ceil(box.width + padding.left + padding.right),
    ),
    height: Math.min(
      VIEWPORT.height - y,
      Math.ceil(box.height + padding.top + padding.bottom),
    ),
  };

  let i = 0;
  const deadline = Date.now() + 9_000;
  while (Date.now() < deadline && (await isVisible(terminal))) {
    await page.screenshot({
      path: path.join(framesDir, `frame-${String(++i).padStart(4, "0")}.png`),
      clip,
      animations: "disabled",
    });
    await page.waitForTimeout(140);
  }

  if (i === 0) throw new Error(`No frames captured for ${name} boot GIF`);

  await renderGif(framesDir, shot(output));
  await waitForHidden(terminal, 5_000);
  await rm(framesDir, { recursive: true, force: true });
}

async function run() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(FRAMES, { recursive: true });

  const server = startViteServer();
  let browser;

  try {
    await waitForServer(BASE_URL);

    browser = await chromium.launch({
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    await page.route(STATUS_URL, (r) => r.abort());
    await page.addInitScript(() => {
      localStorage.setItem("freeside-dub:boot-shown", "1");
      localStorage.removeItem("freeside-dub:volume");
    });

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
    await page.waitForFunction(() => {
      const btn = document.getElementById("start-btn");
      return btn && !btn.disabled;
    });

    await page
      .locator(".glass-panel")
      .screenshot({ path: shot("launch-overlay.png"), animations: "disabled" });
    await page.click("#start-btn");
    await page.waitForFunction(() => {
      const volume = document.getElementById("volume-control");
      return (
        document.getElementById("ui")?.classList.contains("hidden") &&
        document.querySelector(".runtime-terminal.visible") &&
        volume &&
        !volume.classList.contains("hidden")
      );
    });

    await page.waitForTimeout(400);
    await page.screenshot({
      path: shot("started-scene.png"),
      animations: "disabled",
    });

    for (const capture of BOOT_CAPTURES) await captureBootGif(page, capture);
    for (const capture of TERMINAL_CAPTURES)
      await captureTerminalApp(page, capture);

    await runProcess("optipng", [
      "-quiet",
      "-o2",
      shot("launch-overlay.png"),
      shot("started-scene.png"),
      ...TERMINAL_CAPTURES.map((c) => shot(c.output)),
    ]);

    await context.close();
  } finally {
    await browser?.close();
    if (server.exitCode === null && !server.killed) server.kill("SIGTERM");
    await rm(FRAMES, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
