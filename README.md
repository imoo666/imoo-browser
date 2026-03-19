# imoo-browser

**AI 命令行浏览器控制工具** - 通过 WebSocket + Chrome DevTools Protocol 实现完整的浏览器控制能力，同时保留用户的认证状态。

## ✨ 核心优势

- ✅ **保留登录态**：控制用户已登录的浏览器，无需重新登录、传递 Cookie 或处理验证码
- ✅ **完整的 CDP 能力**：截图、PDF、Cookie 管理、网络拦截等所有浏览器操作
- ✅ **Puppeteer API 兼容**：提供标准 Puppeteer API，学习成本低
- ✅ **实时监听**：自动捕获 console、network、error 事件
- ✅ **零配置**：用户无需特殊启动浏览器

## 🏗️ 架构

```
┌─────────────────────┐
│  Puppeteer API      │  标准 API（page.click(), page.screenshot()）
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  WebSocket CLI      │  命令转发和事件监听
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Chrome Extension   │  CDP 执行（chrome.debugger API）
│  + DevTools Protocol│  保留用户认证状态
└─────────────────────┘
```

## 🚀 快速开始

### 1. 安装扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension` 目录

### 2. 启动 Server（推荐）

```bash
# 在一个终端保持运行
pnpm cli:server
```

### 3. 使用 Puppeteer API

创建 `test.js`:

```javascript
import { connect } from 'imoo-browser-cli';

const browser = await connect();
const page = (await browser.pages())[0];

// 导航
await page.goto('https://github.com');

// 等待元素
await page.waitForSelector('input[name="q"]');

// 获取标题
const title = await page.title();
console.log('Title:', title);

// 截图
await page.screenshot({ path: 'screenshot.png' });

await browser.close();
```

运行：

```bash
node test.js
```

## 📚 Puppeteer API 支持

### 导航

```javascript
await page.goto(url, options)
await page.waitForNavigation(options)
await page.reload(options)
await page.goBack()
await page.goForward()
```

### 选择器

```javascript
const element = await page.$(selector)        // 单个元素
const elements = await page.$$(selector)      // 多个元素
await page.$eval(selector, fn, ...args)       // 在元素上执行函数
await page.$$eval(selector, fn, ...args)      // 在多个元素上执行函数
await page.waitForSelector(selector, options) // 等待元素出现
```

### 操作

```javascript
await page.click(selector)
await page.type(selector, text)
await page.select(selector, ...values)
await page.focus(selector)
```

### JavaScript 执行

```javascript
const result = await page.evaluate(pageFunction, ...args)
const handle = await page.evaluateHandle(pageFunction, ...args)
```

### 内容

```javascript
const html = await page.content()
const title = await page.title()
const url = await page.url()
```

### 截图 & PDF

```javascript
// 截图
await page.screenshot({ path: 'screenshot.png' })
await page.screenshot({ path: 'full.png', fullPage: true })
const buffer = await page.screenshot({ encoding: 'base64' })

// PDF
await page.pdf({ path: 'page.pdf', format: 'A4' })
```

### Cookie 管理

```javascript
const cookies = await page.cookies()
await page.setCookie({ name: 'token', value: 'xxx', domain: '.example.com' })
await page.deleteCookie({ name: 'token' })
```

### 视口

```javascript
await page.setViewport({ width: 1920, height: 1080 })
const viewport = await page.viewport()
```

### 等待

```javascript
await page.waitForTimeout(1000)
await page.waitForFunction(() => document.querySelector('.loaded'))
```

## 🔥 核心优势示例

### 访问需要登录的网站

**传统 Puppeteer**：需要重新登录、处理验证码、传递 Cookie

```javascript
// ❌ 麻烦：需要登录流程
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('https://github.com/login');
await page.type('#login_field', 'username');
await page.type('#password', 'password');
await page.click('[name="commit"]');
// 还要处理 2FA...
```

**imoo-browser**：直接使用已登录的浏览器

```javascript
// ✅ 简单：自动使用登录态
const browser = await connect();
const page = (await browser.pages())[0];
await page.goto('https://github.com/settings/profile');
// 已经登录了！
```

### 真实场景：GitLab 自动化

```javascript
import { connect } from 'imoo-browser-cli';

// 手动在 Chrome 登录 GitLab 一次后，脚本可以永久使用
const browser = await connect();
const page = (await browser.pages())[0];

// 访问需要认证的 API
await page.goto('https://gitlab.company.com/api/v4/projects');
const projects = await page.evaluate(() =>
  JSON.parse(document.body.textContent)
);

console.log('Your projects:', projects);
```

## 🎮 命令行模式（向后兼容）

仍然支持原有的命令行模式：

```bash
# REPL 模式
pnpm cli:dev

# 单命令
node cli/bin/cli.js --command "navigate https://example.com"
node cli/bin/cli.js --command "screenshot"
```

可用命令：

| 命令 | 说明 |
|------|------|
| `navigate <url>` | 导航到 URL |
| `click <selector>` | 点击元素 |
| `type <selector> <text>` | 输入文本 |
| `evaluate <expression>` | 执行 JS |
| `screenshot` | 截图 |
| `status` | 检查连接状态 |

## 📦 集成到项目

### 安装

```bash
# 从本地路径
npm install ./path/to/imoo-browser/cli

# 或 workspace
pnpm add imoo-browser-cli --workspace
```

### 使用

```javascript
import { connect } from 'imoo-browser-cli';

const browser = await connect();
// ... 使用 Puppeteer API
```

## 🔍 实时监听

Extension 会自动捕获并推送事件到 CLI：

- **console**: `console.log/warn/error`
- **network**: Fetch 和 XHR 请求
- **error**: JavaScript 错误

这些事件在 server 模式下会实时显示。

## ⚙️ CDP 能力

通过 `chrome.debugger` API，Extension 拥有完整的 Chrome DevTools Protocol 能力：

- ✅ Page: 导航、截图、PDF、生命周期事件
- ✅ DOM: 元素查询、操作、属性获取
- ✅ Runtime: JavaScript 执行、对象序列化
- ✅ Input: 鼠标、键盘、触摸事件
- ✅ Network: Cookie、请求拦截、响应修改
- ✅ Emulation: 视口、User-Agent、设备模拟

## ⚠️ 注意事项

- Extension 无法在 `chrome://`、`edge://` 等系统页面运行
- 使用 CDP 时浏览器标签页会显示「正在调试」提示
- 同一时间只能有一个 debugger 连接到标签页

## 🆚 对比

| 特性 | imoo-browser | Puppeteer |
|------|--------------|-----------|
| 保留登录态 | ✅ 完美 | ❌ 需重新登录 |
| CDP 能力 | ✅ 完整 | ✅ 完整 |
| API 风格 | ✅ Puppeteer 兼容 | ✅ 标准 |
| 用户可见 | ✅ 真实浏览器 | ⚠️ 无头/新实例 |
| 启动方式 | ✅ 连接现有 Chrome | ⚠️ 启动新进程 |
| 配置复杂度 | ✅ 零配置 | ⚠️ 需特殊启动参数 |

## 📖 示例

查看 `examples/` 目录：

- `quickstart.js` - 最简单的用法
- `puppeteer-example.js` - 完整 API 演示
- `authenticated-example.js` - 展示认证优势

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 License

MIT
