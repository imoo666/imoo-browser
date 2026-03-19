# API 文档

## 连接

### `connect(options?)`

连接到 imoo-browser Extension。

```javascript
import { connect } from 'imoo-browser-cli';

const browser = await connect({
  port: 53421,      // WebSocket 端口（默认 53421）
  timeout: 10000    // 连接超时（默认 10000ms）
});
```

**返回**: `Promise<Browser>`

---

## Browser 类

### `browser.pages()`

获取所有页面（当前仅支持单页面）。

```javascript
const pages = await browser.pages();
const page = pages[0];
```

**返回**: `Promise<Page[]>`

### `browser.close()`

关闭连接。

```javascript
await browser.close();
```

---

## Page 类

### 导航

#### `page.goto(url, options?)`

导航到指定 URL。

```javascript
await page.goto('https://example.com');
await page.goto('https://example.com', {
  waitUntil: 'networkidle0',  // 等待网络空闲
  timeout: 30000               // 超时时间
});
```

**参数**:
- `url`: string - 目标 URL
- `options.waitUntil`: 'load' | 'networkidle0' | 'networkidle2' - 等待条件
- `options.timeout`: number - 超时时间（ms）

**返回**: `Promise<{ ok: boolean }>`

#### `page.reload(options?)`

刷新页面。

```javascript
await page.reload();
```

#### `page.goBack()` / `page.goForward()`

前进/后退。

```javascript
await page.goBack();
await page.goForward();
```

#### `page.waitForNavigation(options?)`

等待导航完成。

```javascript
await page.click('a[href="/next"]');
await page.waitForNavigation({ timeout: 5000 });
```

---

### 选择器

#### `page.$(selector)`

查询单个元素。

```javascript
const element = await page.$('button.submit');
if (element) {
  await element.click();
}
```

**返回**: `Promise<ElementHandle | null>`

#### `page.$$(selector)`

查询所有匹配元素。

```javascript
const links = await page.$$('a');
console.log(`Found ${links.length} links`);
```

**返回**: `Promise<ElementHandle[]>`

#### `page.$eval(selector, pageFunction, ...args)`

在元素上执行函数。

```javascript
const text = await page.$eval('h1', el => el.textContent);
const href = await page.$eval('a', (el, suffix) => el.href + suffix, '?utm=test');
```

#### `page.$$eval(selector, pageFunction, ...args)`

在所有匹配元素上执行函数。

```javascript
const texts = await page.$$eval('li', elements =>
  elements.map(el => el.textContent)
);
```

#### `page.waitForSelector(selector, options?)`

等待元素出现。

```javascript
await page.waitForSelector('.content', { timeout: 10000 });
```

**参数**:
- `selector`: string - CSS 选择器
- `options.timeout`: number - 超时时间（默认 30000ms）

---

### 操作

#### `page.click(selector, options?)`

点击元素。

```javascript
await page.click('button#submit');
```

#### `page.type(selector, text, options?)`

在输入框输入文本。

```javascript
await page.type('input[name="username"]', 'admin');
```

#### `page.select(selector, ...values)`

选择下拉框选项。

```javascript
await page.select('select[name="country"]', 'US', 'CN');
```

#### `page.focus(selector)`

聚焦元素。

```javascript
await page.focus('input[name="search"]');
```

---

### JavaScript 执行

#### `page.evaluate(pageFunction, ...args)`

在页面上下文执行 JavaScript。

```javascript
// 无参数
const title = await page.evaluate(() => document.title);

// 带参数
const result = await page.evaluate((a, b) => a + b, 1, 2);

// 返回对象
const info = await page.evaluate(() => ({
  url: location.href,
  userAgent: navigator.userAgent
}));
```

**注意**: pageFunction 在页面上下文执行，无法访问外部变量。

#### `page.evaluateHandle(pageFunction, ...args)`

类似 `evaluate`，但返回句柄。

```javascript
const handle = await page.evaluateHandle(() => document.body);
const json = await handle.jsonValue();
```

---

### 内容

#### `page.content()`

获取页面 HTML。

```javascript
const html = await page.content();
```

**返回**: `Promise<string>`

#### `page.title()`

获取页面标题。

```javascript
const title = await page.title();
```

**返回**: `Promise<string>`

#### `page.url()`

获取当前 URL。

```javascript
const url = await page.url();
```

**返回**: `Promise<string>`

---

### 截图 & PDF

#### `page.screenshot(options?)`

截图。

```javascript
// 保存到文件
await page.screenshot({ path: 'screenshot.png' });

// 全页截图
await page.screenshot({ path: 'full.png', fullPage: true });

// 获取 base64
const base64 = await page.screenshot({ encoding: 'base64' });

// 获取 Buffer
const buffer = await page.screenshot();
```

**参数**:
- `options.path`: string - 保存路径
- `options.fullPage`: boolean - 是否全页截图
- `options.encoding`: 'base64' | 'binary' - 编码方式

**返回**: `Promise<Buffer | string>`

#### `page.pdf(options?)`

生成 PDF。

```javascript
await page.pdf({ path: 'page.pdf', format: 'A4' });
```

**参数**:
- `options.path`: string - 保存路径
- `options.format`: 'A4' | 'Letter' | ... - 纸张格式
- 其他标准 PDF 选项

**返回**: `Promise<Buffer>`

---

### Cookie

#### `page.cookies(...urls)`

获取 Cookie。

```javascript
// 所有 Cookie
const cookies = await page.cookies();

// 指定 URL 的 Cookie
const cookies = await page.cookies('https://example.com');
```

**返回**: `Promise<Cookie[]>`

#### `page.setCookie(...cookies)`

设置 Cookie。

```javascript
await page.setCookie({
  name: 'token',
  value: 'abc123',
  domain: '.example.com',
  path: '/',
  expires: Date.now() / 1000 + 86400,  // 1 天后过期
  httpOnly: true,
  secure: true
});
```

#### `page.deleteCookie(...cookies)`

删除 Cookie。

```javascript
await page.deleteCookie({ name: 'token' });
```

---

### 视口

#### `page.setViewport(viewport)`

设置视口大小。

```javascript
await page.setViewport({
  width: 1920,
  height: 1080,
  deviceScaleFactor: 2,
  isMobile: false
});
```

#### `page.viewport()`

获取当前视口。

```javascript
const viewport = await page.viewport();
console.log(viewport.width, viewport.height);
```

---

### 等待

#### `page.waitForTimeout(milliseconds)`

等待指定时间。

```javascript
await page.waitForTimeout(2000);  // 等待 2 秒
```

#### `page.waitForFunction(pageFunction, options?, ...args)`

等待函数返回 true。

```javascript
// 等待元素可见
await page.waitForFunction(
  selector => {
    const el = document.querySelector(selector);
    return el && el.offsetParent !== null;
  },
  { timeout: 5000 },
  'button.submit'
);
```

---

## ElementHandle 类

### `element.click()`

点击元素。

```javascript
const button = await page.$('button');
await button.click();
```

### `element.type(text)`

输入文本。

```javascript
const input = await page.$('input');
await input.type('hello');
```

### `element.screenshot(options?)`

截取元素截图。

```javascript
const element = await page.$('.card');
await element.screenshot({ path: 'card.png' });
```

---

## 事件监听

Extension 会自动捕获并推送以下事件（在 server 模式下显示）：

- **console**: `console.log/warn/error/info/debug`
- **network**: Fetch 和 XHR 请求/响应
- **error**: JavaScript 错误和 unhandled rejection

---

## 与标准 Puppeteer 的差异

### 不支持的功能

- `browser.newPage()` - 当前仅支持单页面
- `page.hover()` - 尚未实现
- `page.coverage` - 代码覆盖率
- `page.tracing` - 性能追踪
- 某些高级选项

### 实现差异

- **连接方式**: 使用 `connect()` 而非 `launch()`
- **认证**: 自动使用用户已登录的浏览器
- **可见性**: 操作在真实可见的浏览器中执行

---

## 错误处理

```javascript
try {
  await page.goto('https://example.com');
  await page.waitForSelector('.content', { timeout: 5000 });
} catch (err) {
  if (err.message.includes('timeout')) {
    console.error('Element not found within timeout');
  } else if (err.message.includes('Connection')) {
    console.error('Extension not connected');
  } else {
    throw err;
  }
}
```

常见错误：
- `Connection timeout`: Extension 未连接或 server 未运行
- `Element not found`: 选择器错误或元素不存在
- `Timeout`: 操作超时
- `Debugger detached`: CDP 连接断开

---

## 最佳实践

1. **使用 server 模式**：后台运行 WebSocket 服务，避免频繁重连
2. **合理设置超时**：根据网络情况调整 timeout
3. **错误处理**：始终使用 try-catch 处理可能的异常
4. **选择器优先级**：ID > data-* > class > tag
5. **等待机制**：优先使用 `waitForSelector` 而非固定 `waitForTimeout`
