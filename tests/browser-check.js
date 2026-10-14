const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const chrome = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const profile = path.join(root, "tests", "output", "chrome-profile");
const downloadDir = path.join(root, "tests", "output", "downloads");
const shotDir = path.join(root, "tests", "output", "shots");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer() {
  const python = "C:\\Users\\15857\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe";
  const child = spawn(python, ["-m", "http.server", "8765", "--directory", path.join(root, "tests", "fixtures")], {
    stdio: "ignore",
    windowsHide: true
  });
  return child;
}

async function waitForFile(dir, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((name) => name.endsWith(".png"));
      if (files.length) return files;
    }
    await sleep(300);
  }
  return [];
}

async function main() {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(shotDir, { recursive: true });
  const server = startServer();
  let context;
  try {
    await sleep(400);
    context = await chromium.launchPersistentContext(profile, {
      executablePath: chrome,
      headless: false,
      viewport: { width: 1280, height: 860 },
      acceptDownloads: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        "--enable-unsafe-extension-debugging",
        "--no-first-run",
        "--disable-popup-blocking"
      ]
    });

    const session = await context.browser().newBrowserCDPSession();
    const loaded = await session.send("Extensions.loadUnpacked", { path: root });
    const extensionId = loaded.id;
    await context.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
    const page = context.pages()[0] || await context.newPage();

    await page.goto("http://127.0.0.1:8765/imagegrab-fixture/other.html", { waitUntil: "domcontentloaded" });
    await sleep(700);
    const hidden = await page.locator("#imagegrab-button").count();
    if (hidden !== 0) throw new Error("非详情页不应出现按钮");

    await page.goto("http://127.0.0.1:8765/imagegrab-fixture/product.html", { waitUntil: "networkidle" });
    await page.locator("#imagegrab-button").waitFor({ timeout: 8000 });
    await page.screenshot({ path: path.join(shotDir, "plugin-button.png") });

    const galleryPromise = context.waitForEvent("page", { timeout: 10000 });
    await page.locator("#imagegrab-button").click();
    const gallery = await galleryPromise;
    await gallery.waitForLoadState("domcontentloaded");
    gallery.on("console", (msg) => console.log("GALLERY", msg.type(), msg.text()));
    gallery.on("pageerror", (err) => console.log("GALLERY ERROR", err.message));
    try {
      await gallery.waitForFunction(() => document.querySelectorAll(".card").length >= 5, null, { timeout: 10000 });
    } catch (err) {
      const debug = await gallery.evaluate(() => ({
        url: location.href,
        status: document.getElementById("status") && document.getElementById("status").textContent,
        cards: document.querySelectorAll(".card").length,
        body: document.body.innerText.slice(0, 800)
      }));
      await gallery.screenshot({ path: path.join(shotDir, "gallery-debug.png") });
      console.log(JSON.stringify(debug, null, 2));
      throw err;
    }
    const countText = await gallery.locator("#count").innerText();
    const cards = await gallery.locator(".card").count();
    await gallery.screenshot({ path: path.join(shotDir, "plugin-gallery.png") });

    await gallery.evaluate(() => {
      const original = chrome.downloads.download;
      window.__downloadCalls = [];
      chrome.downloads.download = (options, callback) => {
        window.__downloadCalls.push({ filename: options.filename, url: options.url.slice(0, 24) });
        return original(options, callback);
      };
    });
    await gallery.locator("#download").click();
    await gallery.waitForFunction(() => (document.getElementById("status").textContent || "").includes("下载完成"), null, { timeout: 20000 });
    const status = await gallery.locator("#status").innerText();
    const downloads = await gallery.evaluate(() => new Promise((resolve) => {
      chrome.downloads.search({ orderBy: ["-startTime"], limit: 10 }, resolve);
    }));
    const files = await waitForFile(downloadDir, 8000);
    const result = {
      extensionId,
      cards,
      countText,
      status,
      downloads: downloads.map((item) => ({ filename: item.filename, state: item.state, mime: item.mime })),
      files
    };
    fs.writeFileSync(path.join(shotDir, "browser-result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    const calls = await gallery.evaluate(() => window.__downloadCalls || []);
    const headers = downloads.slice(0, 5).map((item) => {
      const bytes = fs.readFileSync(item.filename).subarray(0, 8).toString("hex");
      return { bytes };
    });
    result.calls = calls;
    result.headers = headers;
    fs.writeFileSync(path.join(shotDir, "browser-result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    const namesOk = calls.map((item) => item.filename).join(",") === "商品图_001.png,商品图_002.png,商品图_003.png,商品图_004.png,商品图_005.png";
    if (!status.includes("成功 5") || cards < 5 || !namesOk || headers.some((item) => item.bytes !== "89504e470d0a1a0a")) {
      process.exitCode = 1;
    }
  } finally {
    if (context) await context.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
