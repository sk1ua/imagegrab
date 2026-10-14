# 图提取 / ImageGrab

在淘宝、京东、拼多多商家版的商品详情页提取图片，在新页面里勾选，并批量下载为 PNG。

官网：<https://sk1ua.github.io/imagegrab/>

仓库：<https://github.com/sk1ua/imagegrab>

## 安装

1. 下载 [仓库压缩包](https://github.com/sk1ua/imagegrab/archive/refs/heads/main.zip) 并解压。
2. 打开 Chrome，地址栏输入 `chrome://extensions` 后回车。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压后含有 `manifest.json` 的文件夹。

也可以直接加载本仓库根目录，不必先打包。

## 使用

1. 打开淘宝、天猫、京东或拼多多商家版的商品详情页。
2. 点击页面右下角的「获取图片」。工具栏图标也可以触发同样的操作。
3. 在新打开的预览页勾选图片，点击「下载选中」。
4. 文件保存到浏览器默认下载目录，文件名为 `商品图_001.png`。

其他页面不会出现按钮。图标、logo、占位图和小于 100×100 的图片会被排除。

## 本地检查

```bash
npm test
```

`tests/fixtures/imagegrab-fixture/product.html` 是本地商品页，用来核对按钮、采集、预览和 PNG 下载。启动方式：

```bash
python -m http.server 8765 --directory tests/fixtures
```

然后访问 `http://127.0.0.1:8765/imagegrab-fixture/product.html`。

## 文件

- `manifest.json`：Manifest V3 配置
- `content.js` / `content.css`：右下角按钮
- `shared.js`：地址补全、过滤、去重
- `background.js`：采集所有 frame 并打开预览页
- `gallery.html` / `gallery.js` / `gallery.css`：勾选、转 PNG、下载
- `docs/`：官网，可直接打开 `docs/index.html`
