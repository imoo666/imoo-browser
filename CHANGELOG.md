# Changelog

## [2.0.0] - 2026-03-19

### 🎉 重大更新：CDP + Puppeteer API

完全重写了 Extension 实现，从基于 content script 的简单操作升级到基于 Chrome DevTools Protocol 的完整浏览器控制。

### ✨ 新增功能

#### Puppeteer API 兼容层
- 提供标准的 Puppeteer API（Browser、Page、ElementHandle）
- 支持 `connect()` 方法连接到 Extension
- 完整的类型兼容，可替代 Puppeteer 使用

#### 完整的浏览器控制能力
- **截图**：`page.screenshot()` 支持全页截图、元素截图、base64 输出
- **PDF**：`page.pdf()` 生成 PDF 文档
- **Cookie 管理**：`page.cookies()`, `page.setCookie()`, `page.deleteCookie()`
- **视口控制**：`page.setViewport()` 设置浏览器视口大小
- **等待机制**：`page.waitForSelector()`, `page.waitForNavigation()`, `page.waitForFunction()`
- **滚动控制**：滚动到元素或指定坐标
- **元素查询**：`page.$()`, `page.$$()`, `page.$eval()`, `page.$$eval()`

### 🔧 改进

#### Extension (background.js)
- 使用 `chrome.debugger` API 获得完整 CDP 能力
- 支持 20+ CDP 命令（Page、DOM、Runtime、Input、Network）
- 自动管理 debugger 连接和分离
- 转发 CDP 事件（console、network、error）

#### Content Script
- 简化为仅负责 injected.js 注入
- 所有操作通过 CDP 执行（更可靠、功能更强）

#### CLI
- 新增 `puppeteer-wrapper.js` 提供 Puppeteer 兼容 API
- package.json 导出配置，支持 ES Module 导入
- 向后兼容原有命令行模式

### 📦 示例

新增 3 个示例文件：
- `examples/quickstart.js` - 最简单的入门示例
- `examples/puppeteer-example.js` - 完整 API 功能演示
- `examples/authenticated-example.js` - 展示认证优势

### ⚠️ Breaking Changes

- Extension 现在需要 `debugger` 权限（manifest.json 已更新）
- 使用 CDP 时标签页会显示「正在调试」提示
- 部分 content script 命令已移除，统一使用 CDP

### 🎯 核心优势保持不变

- ✅ 继续使用用户已登录的浏览器（认证优势）
- ✅ 无需特殊启动 Chrome
- ✅ 实时监听 console/network/error
- ✅ 对用户透明，体验友好

---

## [1.0.0] - Initial Release

### 初始功能

- Chrome Extension + WebSocket 架构
- 基础命令：navigate, click, type, evaluate, snapshot
- Content script 执行 DOM 操作
- 实时监听 console、network、error
- REPL 和单命令模式
- Server 模式
