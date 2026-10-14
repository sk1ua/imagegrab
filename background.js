/**
 * Service worker：在所有 frame 里采集图片，写入 session，再打开画廊。
 */
importScripts("shared.js");

const STORE_KEY = "imagegrabLatest";

function storageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function collectFrames(tabId, allFrames) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    files: ["shared.js"]
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    func: () => {
      if (!globalThis.ImageGrab || !globalThis.ImageGrab.collectFromDocument) return [];
      return globalThis.ImageGrab.collectFromDocument(document, location.href);
    }
  });
  const lists = (results || []).map((item) => item && item.result).filter(Boolean);
  return ImageGrab.mergeImageLists(lists);
}

async function collectTab(tabId) {
  try {
    return await collectFrames(tabId, true);
  } catch (err) {
    return collectFrames(tabId, false);
  }
}

async function openGallery(payload) {
  await storageArea().set({ [STORE_KEY]: payload });
  const galleryUrl = chrome.runtime.getURL("gallery.html");
  const existing = await chrome.tabs.query({ url: galleryUrl });
  if (existing.length && existing[0].id) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    chrome.tabs.sendMessage(existing[0].id, { type: "GALLERY_REFRESH" }).catch(() => {});
    return existing[0].id;
  }
  const created = await chrome.tabs.create({ url: galleryUrl });
  return created.id;
}

async function collectAndOpen(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.url || !ImageGrab.isProductPage(tab.url)) {
    throw new Error("当前页面不是支持的商品详情页");
  }
  const images = await collectTab(tabId);
  const payload = {
    images,
    pageUrl: tab.url,
    pageTitle: tab.title || "商品详情",
    platform: ImageGrab.platformName(tab.url),
    sourceTabId: tabId,
    collectedAt: Date.now()
  };
  await openGallery(payload);
  return { ok: true, count: images.length };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "COLLECT_AND_OPEN") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "找不到当前标签页" });
      return;
    }
    collectAndOpen(tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message.type === "RECOLLECT") {
    const tabId = Number(message.tabId);
    if (!tabId) {
      sendResponse({ ok: false, error: "缺少来源标签" });
      return;
    }
    collectAndOpen(tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  if (!ImageGrab.isProductPage(tab.url || "")) return;
  collectAndOpen(tab.id).catch(() => {});
});
