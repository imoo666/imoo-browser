/**
 * Puppeteer API 使用示例
 *
 * 运行前确保：
 * 1. 在 Chrome 加载了 Extension
 * 2. 运行 server: pnpm cli:server
 * 3. 在 Chrome 中打开任意网页
 *
 * 运行: node examples/puppeteer-example.js
 */

import { connect } from '../cli/src/puppeteer-wrapper.js';

async function main() {
  console.log('Connecting to imoo-browser...');
  const browser = await connect();
  console.log('✓ Connected!');

  const page = (await browser.pages())[0];

  // 导航
  console.log('\n1. Navigating to GitHub...');
  await page.goto('https://github.com');
  await page.waitForSelector('input[name="q"]');
  console.log('✓ Page loaded');

  // 获取标题
  const title = await page.title();
  console.log(`\n2. Page title: ${title}`);

  // 执行 JavaScript
  const info = await page.evaluate(() => ({
    url: location.href,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  }));
  console.log('\n3. Page info:', info);

  // 操作元素
  console.log('\n4. Typing in search box...');
  await page.type('input[name="q"]', 'imoo-browser');
  console.log('✓ Text typed');

  // 等待元素
  console.log('\n5. Waiting for search suggestions...');
  try {
    await page.waitForSelector('.header-search-input', { timeout: 5000 });
    console.log('✓ Element found');
  } catch {
    console.log('⚠ Timeout (expected if no suggestions)');
  }

  // 截图
  console.log('\n6. Taking screenshot...');
  await page.screenshot({ path: 'github-screenshot.png', fullPage: false });
  console.log('✓ Screenshot saved to github-screenshot.png');

  // 获取 Cookie
  console.log('\n7. Getting cookies...');
  const cookies = await page.cookies();
  console.log(`✓ Found ${cookies.length} cookies`);

  // 获取页面内容（前500字符）
  console.log('\n8. Getting page HTML...');
  const html = await page.content();
  console.log(`✓ HTML length: ${html.length} chars`);
  console.log(`   Preview: ${html.slice(0, 100)}...`);

  // 关闭连接
  await browser.close();
  console.log('\n✓ All done!');
}

main().catch(console.error);
