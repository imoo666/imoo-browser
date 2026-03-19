# imoo-browser

AI 命令行浏览器控制插件 - 通过 WebSocket 实现 AI 通过命令行控制浏览器、监听控制台、网络请求、错误及页面事件。

## 架构

- **Chrome 扩展** (`extension/`): 注入页面监听 console/network/error，通过 WebSocket 与 CLI 通信
- **CLI Daemon** (`cli/`): Node.js WebSocket 服务器，后台常驻，接收命令执行

## 快速开始

### 1. 安装扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `extension` 目录

### 2. 启动 Daemon

```bash
# 从项目根目录启动
pnpm cli
```

或单独启动：

```bash
cd cli && pnpm start
```

Daemon 会在 `ws://localhost:53421` 启动 WebSocket 服务器并保持运行。

### 3. 打开网页

在 Chrome 中打开任意网页，扩展会自动连接到 Daemon。

### 4. 发送命令

在**另一个终端**发送命令：

```bash
# 导航到页面
node cli/bin/cli.js --command "navigate https://example.com"

# 点击元素
node cli/bin/cli.js --command "click #some-button"

# 输入文本
node cli/bin/cli.js --command "type #search-input hello world"

# 执行 JavaScript
node cli/bin/cli.js --command "evaluate document.title"

# 获取页面结构
node cli/bin/cli.js --command "snapshot"
```

## 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `navigate <url>` | 导航到指定 URL | `navigate https://github.com` |
| `click <selector>` | 点击元素 | `click button.submit` |
| `type <selector> <text>` | 在输入框输入文本 | `type #search hello` |
| `evaluate <expression>` | 执行 JavaScript 表达式 | `evaluate document.title` |
| `snapshot` | 获取简化 DOM 树 | `snapshot` |
| `extract <selector>` | 提取元素信息 | `extract .item --attrs id,class` |
| `gethtml <selector>` | 获取元素 HTML | `gethtml body` |
| `gettext <selector>` | 获取元素文本 | `gettext h1 --href` |
| `wait <ms>` | 等待指定毫秒 | `wait 2000` |

## 命令链

使用 `;` 分隔多个命令：

```bash
node cli/bin/cli.js --command "navigate https://example.com ; wait 3000 ; snapshot"
```

## 监听数据

扩展会持续推送以下事件到 CLI（可在代码中监听）：

- **console**: `console.log/warn/error/info/debug` 输出
- **network**: Fetch 和 XHR 请求（URL、method、status、duration、body）
- **error**: `window.onerror` 和 `unhandledrejection`

## 工作原理

1. **启动 Daemon**: 运行 `pnpm cli` 启动 WebSocket 服务器（端口 53421）
2. **扩展连接**: Chrome 扩展自动连接到 Daemon，保持心跳
3. **发送命令**: 通过 `--command` 连接 Daemon 并发送指令
4. **执行操作**: Daemon 转发给扩展，扩展在页面执行并返回结果

## 注意事项

- Daemon 需要持续运行，扩展才能保持连接
- 扩展无法在 `chrome://`、`edge://` 等系统页面运行
- 敏感请求头（如 Authorization、Cookie）会被脱敏为 `[REDACTED]`
- 响应体超过 64KB 会被截断
- 若扩展断连，点击扩展图标即可重新连接
