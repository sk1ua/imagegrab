/**
 * 只在商品详情页右下角注入「获取图片」。
 * 采集本身由 background 对所有 frame 执行，这样能拿到详情描述 iframe 里的图。
 */
(function () {
  if (window.__imageGrabLoaded) return;
  window.__imageGrabLoaded = true;

  const ROOT_ID = "imagegrab-root";
  let busy = false;

  function api() {
    return globalThis.ImageGrab;
  }

  function ensureButton() {
    const grab = api();
    const shouldShow = Boolean(grab && grab.isProductPage(location.href));
    let root = document.getElementById(ROOT_ID);
    if (!shouldShow) {
      if (root) root.remove();
      return;
    }
    if (root) return;

    root = document.createElement("div");
    root.id = ROOT_ID;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "imagegrab-button";
    button.setAttribute("aria-label", "获取图片");
    button.innerHTML = '<span class="imagegrab-mark" aria-hidden="true"></span><span class="imagegrab-label">获取图片</span>';
    button.addEventListener("click", onClick);
    root.appendChild(button);
    (document.documentElement || document.body).appendChild(root);
  }

  function setBusy(next) {
    busy = next;
    const button = document.getElementById("imagegrab-button");
    if (!button) return;
    button.disabled = next;
    const label = button.querySelector(".imagegrab-label");
    if (label) label.textContent = next ? "提取中…" : "获取图片";
  }

  function onClick() {
    if (busy) return;
    setBusy(true);
    chrome.runtime.sendMessage({ type: "COLLECT_AND_OPEN" }, (response) => {
      const failed = chrome.runtime.lastError || !response || response.ok === false;
      setBusy(false);
      if (failed) {
        const label = document.querySelector("#imagegrab-button .imagegrab-label");
        if (label) label.textContent = "提取失败";
        window.setTimeout(() => {
          const again = document.querySelector("#imagegrab-button .imagegrab-label");
          if (again) again.textContent = "获取图片";
        }, 1600);
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "COLLECT_NOW") return;
    onClick();
    sendResponse({ ok: true });
  });

  function hookHistory() {
    const rawPush = history.pushState;
    const rawReplace = history.replaceState;
    history.pushState = function () {
      const result = rawPush.apply(this, arguments);
      window.setTimeout(ensureButton, 0);
      return result;
    };
    history.replaceState = function () {
      const result = rawReplace.apply(this, arguments);
      window.setTimeout(ensureButton, 0);
      return result;
    };
    window.addEventListener("popstate", ensureButton);
    window.addEventListener("hashchange", ensureButton);
  }

  hookHistory();
  ensureButton();
  window.setInterval(ensureButton, 1200);
})();
