/**
 * 快速开始示例 - 最简单的用法
 */

import { connect } from '../cli/src/puppeteer-wrapper.js';

const browser = await connect();
const page = (await browser.pages())[0];

// 导航到网站
await page.goto('https://example.com');

// 等待加载
await page.waitForSelector('h1');

// 获取标题
const title = await page.title();
console.log('Page title:', title);

// 执行 JavaScript
const h1Text = await page.$eval('h1', el => el.textContent);
console.log('H1 text:', h1Text);

// 截图
await page.screenshot({ path: 'example.png' });
console.log('Screenshot saved!');

await browser.close();
