const test = require("node:test");
const assert = require("node:assert/strict");
const ImageGrab = require("../shared.js");

test("只在三个平台的商品详情页显示", () => {
  assert.equal(ImageGrab.isProductPage("https://item.taobao.com/item.htm?id=123"), true);
  assert.equal(ImageGrab.isProductPage("https://detail.tmall.com/item.htm?id=456"), true);
  assert.equal(ImageGrab.isProductPage("https://www.taobao.com/"), false);
  assert.equal(ImageGrab.isProductPage("https://item.jd.com/100012043978.html"), true);
  assert.equal(ImageGrab.isProductPage("https://www.jd.com/"), false);
  assert.equal(ImageGrab.isProductPage("https://mobile.yangkeduo.com/goods.html?goods_id=998"), true);
  assert.equal(ImageGrab.isProductPage("https://mms.pinduoduo.com/goods/goods_detail?goods_id=7"), true);
  assert.equal(ImageGrab.isProductPage("https://example.com/item.htm?id=1"), false);
  assert.equal(ImageGrab.isProductPage("http://127.0.0.1:8765/imagegrab-fixture/product.html"), true);
  assert.equal(ImageGrab.isProductPage("http://127.0.0.1:8765/imagegrab-fixture/other.html"), false);
});

test("相对地址补全，并丢掉 data 与 javascript", () => {
  assert.equal(
    ImageGrab.toAbsolute("//img.alicdn.com/a.jpg", "https://item.taobao.com/item.htm"),
    "https://img.alicdn.com/a.jpg"
  );
  assert.equal(
    ImageGrab.toAbsolute("../pic/a.png", "https://item.jd.com/1.html"),
    "https://item.jd.com/pic/a.png"
  );
  assert.equal(ImageGrab.toAbsolute("data:image/gif;base64,abc", "https://item.jd.com/1.html"), "");
  assert.equal(ImageGrab.toAbsolute("javascript:void(0)", "https://item.jd.com/1.html"), "");
});

test("升级淘宝、京东、拼多多的缩略图地址", () => {
  assert.equal(
    ImageGrab.upgradeImageUrl("https://img.alicdn.com/imgextra/i1/a.jpg_200x200.jpg"),
    "https://img.alicdn.com/imgextra/i1/a.jpg"
  );
  assert.equal(
    ImageGrab.upgradeImageUrl("https://img14.360buyimg.com/n5/s200x200_jfs/t1/demo.jpg"),
    "https://img14.360buyimg.com/n0/jfs/t1/demo.jpg"
  );
  assert.equal(
    ImageGrab.upgradeImageUrl("https://img.pddpic.com/a.jpeg?imageView2/2/w/200"),
    "https://img.pddpic.com/a.jpeg"
  );
});

test("过滤 logo、占位图，保留商品图", () => {
  assert.equal(ImageGrab.shouldSkipUrl("https://cdn.example.com/logo.png"), true);
  assert.equal(ImageGrab.shouldSkipUrl("https://cdn.example.com/blank.gif"), true);
  assert.equal(ImageGrab.shouldSkipUrl("https://img.alicdn.com/item/main.jpg"), false);
  assert.equal(ImageGrab.isPlaceholderUrl("https://cdn.example.com/1x1.png"), true);
});

test("srcset 选择最大的一张", () => {
  const picked = ImageGrab.pickFromSrcset(
    "small.jpg 200w, large.jpg 1200w, mid.jpg 600w",
    "https://item.jd.com/1.html"
  );
  assert.equal(picked, "https://item.jd.com/large.jpg");
});

test("文件名按序号补零", () => {
  assert.equal(ImageGrab.buildFilename(1), "商品图_001.png");
  assert.equal(ImageGrab.buildFilename(12), "商品图_012.png");
});

test("去重时保留先出现的地址", () => {
  const merged = ImageGrab.dedupeImages([
    { url: "https://img.alicdn.com/a.jpg", width: 10 },
    { url: "https://img.alicdn.com/a.jpg#hash", width: 20 },
    { url: "https://img.alicdn.com/b.jpg", width: 30 }
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].width, 10);
});

test("从 img、懒加载属性和背景图收集并过滤小图", () => {
  function element(tag, attrs, extra) {
    return {
      tagName: tag.toUpperCase(),
      attrs,
      children: [],
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      querySelectorAll() {
        return this.children;
      },
      getBoundingClientRect() {
        return { width: extra.width || 0, height: extra.height || 0 };
      },
      ...extra
    };
  }

  const big = element("img", {
    alt: "主图",
    "data-src": "//img.alicdn.com/item/main.jpg_200x200.jpg",
    src: "https://img.alicdn.com/placeholder.gif"
  }, { naturalWidth: 0, naturalHeight: 0, width: 0, height: 0 });
  const logo = element("img", { src: "https://img.alicdn.com/logo.png" }, { naturalWidth: 240, naturalHeight: 80 });
  const tiny = element("img", { src: "https://img.alicdn.com/icon.png" }, { naturalWidth: 32, naturalHeight: 32 });
  const bg = element("div", { style: "background-image: url('https://img.alicdn.com/detail/scene.png')" }, { width: 360, height: 240 });
  const root = {
    baseURI: "https://item.taobao.com/item.htm?id=1",
    querySelectorAll(selector) {
      if (selector.includes("img")) return [big, logo, tiny];
      if (selector.includes("url")) return [bg];
      return [];
    }
  };

  const images = ImageGrab.collectFromDocument(root, "https://item.taobao.com/item.htm?id=1");
  const urls = images.map((item) => item.url);
  assert.ok(urls.includes("https://img.alicdn.com/item/main.jpg"));
  assert.ok(urls.includes("https://img.alicdn.com/detail/scene.png"));
  assert.equal(urls.some((url) => url.includes("logo")), false);
  assert.equal(urls.some((url) => url.includes("icon.png")), false);
});
