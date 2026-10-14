/**
 * 画廊页：勾选图片，转成 PNG 后用 chrome.downloads 保存。
 */
(function () {
  const STORE_KEY = "imagegrabLatest";
  const state = {
    payload: null,
    items: [],
    downloading: false
  };

  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const count = document.getElementById("count");
  const status = document.getElementById("status");
  const selectAll = document.getElementById("select-all");
  const downloadBtn = document.getElementById("download");
  const progress = document.getElementById("progress");
  const progressBar = document.getElementById("progress-bar");

  function storageArea() {
    return chrome.storage.session || chrome.storage.local;
  }

  function selectedItems() {
    return state.items.filter((item) => item.selected && !item.filtered);
  }

  function updateCount() {
    const selected = selectedItems().length;
    const usable = state.items.filter((item) => !item.filtered).length;
    count.textContent = "已选 " + selected + " / " + usable;
    downloadBtn.disabled = state.downloading || selected === 0;
    selectAll.indeterminate = selected > 0 && selected < usable;
    selectAll.checked = usable > 0 && selected === usable;
  }

  function setStatus(text) {
    status.textContent = text || "";
  }

  function render(payload) {
    state.payload = payload;
    state.items = (payload.images || []).map((image, index) => ({
      ...image,
      index,
      selected: true,
      filtered: false,
      width: image.width || 0,
      height: image.height || 0
    }));

    document.getElementById("platform").textContent = payload.platform || "图提取";
    document.getElementById("page-title").textContent = payload.pageTitle || "提取到的图片";
    const source = document.getElementById("source-link");
    source.href = payload.pageUrl || "#";
    source.textContent = payload.pageUrl ? "打开来源页面" : "无来源页面";

    grid.replaceChildren();
    if (!state.items.length) {
      empty.hidden = false;
      updateCount();
      setStatus("没有可展示的图片。");
      return;
    }
    empty.hidden = true;

    state.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "card selected";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", "选择第 " + (item.index + 1) + " 张图片");
      checkbox.addEventListener("change", () => {
        item.selected = checkbox.checked && !item.filtered;
        card.classList.toggle("selected", item.selected);
        updateCount();
      });

      const meta = document.createElement("div");
      meta.className = "meta";
      const size = document.createElement("span");
      size.textContent = item.width && item.height ? item.width + " × " + item.height : "读取尺寸…";
      const note = document.createElement("span");
      note.textContent = "PNG";

      const img = document.createElement("img");
      img.alt = item.alt || "商品图 " + (item.index + 1);
      img.referrerPolicy = "no-referrer";
      img.src = item.url;
      img.addEventListener("load", () => {
        item.width = img.naturalWidth;
        item.height = img.naturalHeight;
        size.textContent = item.width + " × " + item.height;
        if (item.width < ImageGrab.MIN_EDGE || item.height < ImageGrab.MIN_EDGE) {
          item.filtered = true;
          item.selected = false;
          checkbox.checked = false;
          checkbox.disabled = true;
          card.classList.add("filtered");
          card.classList.remove("selected");
          note.textContent = "小于 100px，已排除";
          updateCount();
        }
      });
      img.addEventListener("error", () => {
        note.textContent = "预览失败，仍可尝试下载";
      });

      meta.append(size, note);
      card.append(checkbox, img, meta);
      grid.appendChild(card);
      item.checkbox = checkbox;
    });

    setStatus("已提取 " + state.items.length + " 张。图标、logo 和占位图已在采集时过滤。");
    updateCount();
  }

  async function loadPayload() {
    const stored = await storageArea().get(STORE_KEY);
    const payload = stored[STORE_KEY];
    if (!payload) {
      empty.hidden = false;
      setStatus("还没有提取记录。请回到商品详情页，点击右下角「获取图片」。");
      return;
    }
    render(payload);
  }

  async function blobFromUrl(url, pageUrl) {
    const response = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!response || !response.ok) {
      throw new Error("图片请求失败 " + (response ? response.status : ""));
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG 转换失败");
    return png;
  }

  function downloadBlob(blob, filename) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: objectUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      }, (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : "下载未开始"));
          return;
        }
        const timeout = window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        function onChanged(delta) {
          if (delta.id !== downloadId || !delta.state) return;
          if (delta.state.current === "complete" || delta.state.current === "interrupted") {
            chrome.downloads.onChanged.removeListener(onChanged);
            window.clearTimeout(timeout);
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            if (delta.state.current === "complete") resolve(downloadId);
            else reject(new Error("下载被中断"));
          }
        }
        chrome.downloads.onChanged.addListener(onChanged);
      });
    });
  }

  async function downloadSelected() {
    const items = selectedItems();
    if (!items.length || state.downloading) return;
    state.downloading = true;
    updateCount();
    progress.hidden = false;
    let success = 0;
    const failures = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const filename = ImageGrab.buildFilename(i + 1);
      setStatus("正在下载 " + (i + 1) + " / " + items.length + " · " + filename);
      progressBar.style.width = Math.round((i / items.length) * 100) + "%";
      try {
        const png = await blobFromUrl(item.url, state.payload && state.payload.pageUrl);
        await downloadBlob(png, filename);
        success += 1;
      } catch (err) {
        failures.push(filename + "：" + (err.message || "失败"));
      }
    }
    progressBar.style.width = "100%";
    state.downloading = false;
    updateCount();
    const failText = failures.length ? "，失败 " + failures.length + "（" + failures.slice(0, 2).join("；") + "）" : "";
    setStatus("下载完成：成功 " + success + " 张 PNG" + failText + "。文件保存在浏览器默认下载目录。");
  }

  document.getElementById("select-all").addEventListener("change", () => {
    const checked = selectAll.checked;
    state.items.forEach((item) => {
      if (item.filtered) return;
      item.selected = checked;
      item.checkbox.checked = checked;
      item.checkbox.closest(".card").classList.toggle("selected", checked);
    });
    updateCount();
  });

  document.getElementById("invert").addEventListener("click", () => {
    state.items.forEach((item) => {
      if (item.filtered) return;
      item.selected = !item.selected;
      item.checkbox.checked = item.selected;
      item.checkbox.closest(".card").classList.toggle("selected", item.selected);
    });
    updateCount();
  });

  downloadBtn.addEventListener("click", () => {
    downloadSelected().catch((err) => {
      state.downloading = false;
      updateCount();
      setStatus(err.message || "下载失败");
    });
  });

  document.getElementById("recollect").addEventListener("click", () => {
    const tabId = state.payload && state.payload.sourceTabId;
    if (!tabId) {
      setStatus("没有可重新获取的来源标签页。");
      return;
    }
    setStatus("正在重新获取…");
    chrome.runtime.sendMessage({ type: "RECOLLECT", tabId }, (response) => {
      if (chrome.runtime.lastError || !response || response.ok === false) {
        setStatus("重新获取失败，来源页可能已经关闭。");
      }
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "GALLERY_REFRESH") loadPayload();
  });

  if (typeof chrome !== "undefined" && chrome.storage) {
    loadPayload().catch((err) => setStatus(err.message || "读取失败"));
  } else {
    empty.hidden = false;
    setStatus("请从插件打开此页面，不要直接双击 gallery.html。");
  }
})();
