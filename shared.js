/**
 * 图提取 / ImageGrab
 * 纯函数与页面采集逻辑。浏览器里挂到 globalThis.ImageGrab，Node 测试里用 module.exports。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ImageGrab = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MIN_EDGE = 100;
  const EXTRA_SELECTOR = [
    "#description",
    "#J-detail-content",
    "#J_DivItemDesc",
    ".detail-content",
    ".ssd-module-wrap",
    ".goods-detail",
    ".item-desc",
    "[class*='gallery']",
    "[class*='Gallery']",
    "[class*='thumb']",
    "[id*='detail']",
    "[class*='desc']"
  ].join(",");

  const LAZY_ATTRS = [
    "data-zoom-image",
    "data-zoom",
    "data-big",
    "data-large",
    "data-original",
    "data-original-src",
    "data-lazy-src",
    "data-lazyload",
    "data-lazy-img",
    "data-ks-lazyload",
    "data-src",
    "data-img",
    "data-url",
    "data-image",
    "data-fallback-src"
  ];

  function isProductPage(href) {
    let url;
    try {
      url = new URL(href);
    } catch (err) {
      return false;
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const search = url.search.toLowerCase();

    if (host === "127.0.0.1" || host === "localhost") {
      return path.includes("/imagegrab-fixture/product");
    }

    const isTb = host.endsWith(".taobao.com") || host.endsWith(".tmall.com") || host === "taobao.com" || host === "tmall.com";
    const isJd = host.endsWith(".jd.com") || host.endsWith(".jd.hk") || host === "jd.com";
    const isPdd = host.endsWith(".pinduoduo.com") || host.endsWith(".yangkeduo.com") || host === "pinduoduo.com" || host === "yangkeduo.com";
    if (!isTb && !isJd && !isPdd) return false;

    if (isTb) {
      if (path.includes("/item.htm") || path.includes("/item.html") || path.includes("/detail.htm") || path.includes("/detail.html")) {
        return true;
      }
      if (/\/i\d+\.html?$/.test(path)) return true;
      if ((host.startsWith("item.") || host.startsWith("detail.") || host.includes(".detail.")) && (search.includes("id=") || path.includes("item"))) {
        return true;
      }
      return false;
    }

    if (isJd) {
      if (/\/\d+\.html?$/.test(path)) return true;
      if (path.includes("/product/") || path.includes("/item")) return true;
      return false;
    }

    return path.includes("goods.html")
      || path.includes("goods_detail")
      || path.includes("/goods/detail")
      || search.includes("goods_id")
      || search.includes("goodsid");
  }

  function platformName(href) {
    let host = "";
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch (err) {
      return "未知页面";
    }
    if (host.includes("tmall")) return "天猫";
    if (host.includes("taobao")) return "淘宝";
    if (host.includes("jd")) return "京东";
    if (host.includes("pinduoduo") || host.includes("yangkeduo")) return "拼多多";
    if (host === "127.0.0.1" || host === "localhost") return "本地演示";
    return "电商页面";
  }

  function toAbsolute(raw, base) {
    if (!raw) return "";
    const trimmed = String(raw).trim().replace(/^['"]|['"]$/g, "");
    if (!trimmed || /^(data|blob|javascript|about):/i.test(trimmed)) return "";
    try {
      const url = new URL(trimmed, base || "https://example.invalid/");
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      url.hash = "";
      return url.href;
    } catch (err) {
      return "";
    }
  }

  function sizeHint(raw) {
    const text = String(raw || "");
    const pair = text.match(/(\d{2,4})x(\d{2,4})/i);
    if (pair) return Number(pair[1]) * Number(pair[2]);
    const width = text.match(/\/w\/(\d{2,4})/i) || text.match(/[?&]w=(\d{2,4})/i);
    if (width) return Number(width[1]) * 1000;
    return 0;
  }

  function isPlaceholderUrl(raw) {
    const text = String(raw || "");
    if (!text) return true;
    return /spacer|blank\.|placeholder|1x1|pixel\.|grey\.gif|loading\.(gif|png|jpg)|\/tps\/.*-2-2\.png|_\d{1,2}x\d{1,2}\./i.test(text);
  }

  function shouldSkipUrl(raw) {
    const text = String(raw || "");
    if (!text) return true;
    if (/\.svg(\?|$)/i.test(text) || /\.ico(\?|$)/i.test(text) || /\.cur(\?|$)/i.test(text)) return true;
    if (/sprite|favicon|\/logo[._/-]|logo\.(png|gif|jpg|jpeg|webp)|blank\.|spacer\.|placeholder|1x1|pixel\.|loading\.(gif|png)|avatar/i.test(text)) {
      return true;
    }
    return false;
  }

  function upgradeImageUrl(absoluteUrl) {
    let url;
    try {
      url = new URL(absoluteUrl);
    } catch (err) {
      return "";
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    url.hash = "";

    if (/(alicdn|taobaocdn|tbcdn|taobao\.com|tmall\.com)/i.test(host)) {
      url.pathname = url.pathname
        .replace(/_\.webp$/i, "")
        .replace(/\.(jpe?g|png|webp|gif)_(?:\d+x\d+|q\d+|sum|b)(?:q\d+)?\.(jpe?g|png|webp|gif)$/i, ".$1")
        .replace(/[_.](\d+x\d+|q\d+)\.(jpe?g|png|webp)$/i, "")
        .replace(/\.jpg_q\d+\.jpg$/i, ".jpg");
      url.searchParams.delete("x-oss-process");
    }

    if (host.endsWith("360buyimg.com") || host.endsWith(".jd.com") || host === "jd.com") {
      url.pathname = url.pathname
        .replace(/\/n\d+\//i, "/n0/")
        .replace(/\/s\d+x\d+_/gi, "/")
        .replace(/s\d+x\d+_/gi, "")
        .replace(/(\.(?:jpe?g|png|webp))!.*$/i, "$1");
    }

    if (host.includes("pddpic") || host.includes("pinduoduo") || host.includes("yangkeduo")) {
      if (/imageView|imageMogr|thumbnail|imageView2/i.test(url.search)) {
        url.search = "";
      }
    }

    return url.href;
  }

  function pickFromSrcset(srcset, base) {
    if (!srcset) return "";
    const parts = String(srcset).split(",").map((item) => item.trim()).filter(Boolean);
    let best = { url: "", score: -1 };
    parts.forEach((part) => {
      const matched = part.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)?$/i);
      let raw = part.split(/\s+/)[0];
      let score = 1;
      if (matched) {
        raw = matched[1];
        const amount = Number(matched[2]);
        score = (matched[3] || "x").toLowerCase() === "w" ? amount : amount * 10000;
      }
      if (score > best.score) best = { url: raw, score };
    });
    return toAbsolute(best.url, base);
  }

  function extractCssUrls(cssText) {
    if (!cssText || cssText === "none") return [];
    const found = [];
    const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let matched;
    while ((matched = pattern.exec(cssText))) {
      const raw = (matched[2] || "").trim();
      if (raw) found.push(raw);
    }
    return found;
  }

  function chooseCandidate(candidates) {
    const usable = candidates.filter((item) => item && item.url && !isPlaceholderUrl(item.url) && !shouldSkipUrl(item.url));
    if (!usable.length) return "";
    usable.sort((a, b) => {
      if (b.hint !== a.hint) return b.hint - a.hint;
      return a.order - b.order;
    });
    return upgradeImageUrl(usable[0].url) || usable[0].url;
  }

  function pushCandidate(list, raw, base, order) {
    const absolute = toAbsolute(raw, base);
    if (!absolute) return;
    list.push({ url: absolute, hint: sizeHint(raw), order });
  }

  function urlsFromElement(element, base) {
    const candidates = [];
    let order = 0;
    LAZY_ATTRS.forEach((name) => {
      pushCandidate(candidates, element.getAttribute && element.getAttribute(name), base, order);
      order += 1;
    });
    const srcset = (element.getAttribute && (element.getAttribute("srcset") || element.getAttribute("data-srcset"))) || "";
    const fromSrcset = pickFromSrcset(srcset, base);
    if (fromSrcset) candidates.push({ url: fromSrcset, hint: sizeHint(srcset), order });
    order += 1;
    if (element.currentSrc) pushCandidate(candidates, element.currentSrc, base, order);
    order += 1;
    if (element.src) pushCandidate(candidates, element.src, base, order);
    const styleText = (element.getAttribute && element.getAttribute("style")) || "";
    extractCssUrls(styleText).forEach((raw) => {
      order += 1;
      pushCandidate(candidates, raw, base, order);
    });
    return chooseCandidate(candidates);
  }

  function knownSize(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    return { w, h, known: w > 0 && h > 0 };
  }

  function tooSmall(width, height) {
    const size = knownSize(width, height);
    if (!size.known) return false;
    return size.w < MIN_EDGE || size.h < MIN_EDGE;
  }

  function dedupeImages(list) {
    const seen = new Set();
    const output = [];
    (list || []).forEach((item) => {
      if (!item || !item.url) return;
      const key = item.url.split("#")[0];
      if (seen.has(key)) return;
      seen.add(key);
      output.push(item);
    });
    return output;
  }

  function mergeImageLists(lists) {
    const flat = [];
    (lists || []).forEach((list) => {
      (list || []).forEach((item) => flat.push(item));
    });
    return dedupeImages(flat);
  }

  function readBox(element) {
    if (!element || !element.getBoundingClientRect) return { w: 0, h: 0 };
    const rect = element.getBoundingClientRect();
    return { w: Math.round(rect.width || 0), h: Math.round(rect.height || 0) };
  }

  function collectFromDocument(doc, pageUrl) {
    if (!doc || !doc.querySelectorAll) return [];
    const base = pageUrl || (doc.baseURI || "");
    const found = [];

    const media = doc.querySelectorAll("img, source, image");
    media.forEach((element) => {
      const url = urlsFromElement(element, base);
      if (!url || shouldSkipUrl(url)) return;
      const displayed = upgradeImageUrl(toAbsolute(element.currentSrc || element.src || "", base)) || toAbsolute(element.currentSrc || element.src || "", base);
      const width = element.naturalWidth || element.width || 0;
      const height = element.naturalHeight || element.height || 0;
      // 懒加载图常见 1x1 占位 src，尺寸不能用来淘汰 data-src 里的原图。
      if (displayed === url && tooSmall(width, height)) return;
      found.push({
        url,
        width: Number(width) || 0,
        height: Number(height) || 0,
        alt: (element.getAttribute && (element.getAttribute("alt") || element.getAttribute("title"))) || ""
      });
    });

    const styled = doc.querySelectorAll("[style*='url'], [style*='URL']");
    styled.forEach((element) => addBackground(element, base, found));
    collectComputedBackgrounds(doc, base, found);

    const containers = doc.querySelectorAll(EXTRA_SELECTOR);
    containers.forEach((container) => {
      const nodes = [container].concat(Array.from(container.querySelectorAll("*")).slice(0, 400));
      nodes.forEach((element) => {
        if (element === container || element.tagName === "IMG" || element.tagName === "SOURCE") return;
        addBackground(element, base, found, true);
      });
    });

    return dedupeImages(found);
  }

  function collectComputedBackgrounds(doc, base, found) {
    const view = doc.defaultView;
    if (!view || !view.getComputedStyle || !doc.body) return;
    const nodes = doc.body.querySelectorAll("div, li, section, a");
    const limit = Math.min(nodes.length, 600);
    for (let i = 0; i < limit; i += 1) {
      let cssText = "";
      try {
        cssText = view.getComputedStyle(nodes[i]).backgroundImage;
      } catch (err) {
        cssText = "";
      }
      if (!cssText || cssText === "none" || cssText.indexOf("url(") === -1) continue;
      addBackground(nodes[i], base, found, true);
    }
  }

  function addBackground(element, base, found, requireComputed) {
    let cssText = (element.getAttribute && element.getAttribute("style")) || "";
    if (requireComputed && element.ownerDocument && element.ownerDocument.defaultView) {
      try {
        cssText = element.ownerDocument.defaultView.getComputedStyle(element).backgroundImage || cssText;
      } catch (err) {
        cssText = cssText || "";
      }
    }
    extractCssUrls(cssText).forEach((raw) => {
      const absolute = toAbsolute(raw, base);
      const url = absolute ? (upgradeImageUrl(absolute) || absolute) : "";
      if (!url || shouldSkipUrl(url) || isPlaceholderUrl(url)) return;
      const box = readBox(element);
      if (box.w && box.h && (box.w < MIN_EDGE || box.h < MIN_EDGE)) return;
      if (requireComputed && box.w === 0 && box.h === 0) return;
      found.push({ url, width: box.w, height: box.h, alt: "" });
    });
  }

  function buildFilename(index) {
    const number = String(index).padStart(3, "0");
    return "商品图_" + number + ".png";
  }

  return {
    MIN_EDGE,
    isProductPage,
    platformName,
    toAbsolute,
    sizeHint,
    isPlaceholderUrl,
    shouldSkipUrl,
    upgradeImageUrl,
    pickFromSrcset,
    extractCssUrls,
    chooseCandidate,
    urlsFromElement,
    tooSmall,
    dedupeImages,
    mergeImageLists,
    collectFromDocument,
    buildFilename
  };
});
