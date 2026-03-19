# imoo-browser

AI 命令行浏览器控制插件 - 通过 WebSocket 实现 AI 通过命令行控制浏览器、监听控制台、网络请求、错误及页面事件。

## 架构

- **Chrome 扩展** (`extension/`): 注入页面监听 console/network/error，通过 WebSocket 与 CLI 通信
- **CLI** (`cli/`): Node.js 工具，启动 WebSocket 服务，提供 REPL 和单命令模式

## 快速开始

### 1. 安装扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension` 目录

### 2. 启动 CLI

```bash
cd cli && pnpm dev
```

或从项目根目录：

```bash
pnpm cli:dev
```

### 3. 使用

1. 确保 CLI 已启动（WebSocket 服务在 `ws://localhost:53421`）
2. 在 Chrome 中打开任意网页
3. 扩展会自动连接 CLI
4. 在 CLI 中输入命令，例如：

```
navigate https://example.com
click #some-button
type #search-input hello world
evaluate document.title
snapshot
```

## 命令

| 命令 | 说明 |
|------|------|
| `navigate <url>` | 导航到指定 URL |
| `click <selector>` | 点击元素（CSS 选择器） |
| `type <selector> <text>` | 在输入框输入文本 |
| `evaluate <expression>` | 在页面执行 JS 表达式 |
| `snapshot` | 获取简化 DOM 树 |
| `status` | 检查扩展连接状态 |
| `help` | 显示帮助 |
| `exit` | 退出 |

## 单命令模式

```bash
node cli/bin/cli.js --command "navigate https://example.com"
node cli/bin/cli.js --command "evaluate document.title"
# 支持多命令链：用 ; 分隔
node cli/bin/cli.js --command "navigate https://example.com ; wait 3000 ; snapshot"
```

## Daemon 模式（推荐，解决扩展未连接）

单命令模式每次启动新进程，扩展需重连，容易因 Chrome Service Worker 休眠而失败。**建议：后台常驻 daemon，单命令通过连接 daemon 执行。**

```bash
# 终端 1：后台常驻 daemon（保持运行）
pnpm cli:daemon

# 终端 2：单命令会连接 daemon，无需每次等扩展重连
node cli/bin/cli.js --command "navigate https://example.com"
node cli/bin/cli.js --command "snapshot"
```

- daemon 会一直运行 WebSocket 服务器，扩展连接后保持稳定
- 扩展心跳已缩短为 8 秒，减少 Service Worker 休眠
- 若仍出现「Extension not connected」，点击扩展图标 → 重新连接

## 监听数据

扩展会持续推送以下事件到 CLI：

- **console**: `console.log/warn/error/info/debug` 输出
- **network**: Fetch 和 XHR 请求（URL、method、status、duration、body）
- **error**: `window.onerror` 和 `unhandledrejection`

## 注意事项

- 扩展无法在 `chrome://`、`edge://` 等系统页面运行
- 敏感请求头（如 Authorization、Cookie）会被脱敏为 `[REDACTED]`
- 响应体超过 64KB 会被截断
