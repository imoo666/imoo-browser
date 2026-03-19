/**
 * 认证网站示例 - 展示 imoo-browser 的核心优势
 *
 * 前提：在 Chrome 中手动登录过 GitHub
 *
 * imoo-browser 会自动使用你已登录的浏览器，无需：
 * - 重新登录
 * - 传递 Cookie
 * - 处理 2FA/验证码
 */

import { connect } from '../cli/src/puppeteer-wrapper.js';

async function checkGitHubProfile() {
  const browser = await connect();
  const page = (await browser.pages())[0];

  // 直接访问需要登录的页面
  console.log('Navigating to GitHub settings...');
  await page.goto('https://github.com/settings/profile');

  // 等待页面加载
  await page.waitForSelector('input[name="user[name]"]', { timeout: 10000 });

  // 获取用户信息（需要登录才能访问）
  const username = await page.$eval('input[name="user[name]"]', el => el.value);
  console.log(`✓ Logged in as: ${username}`);

  // 可以直接操作需要认证的 API
  const repos = await page.evaluate(async () => {
    const res = await fetch('https://api.github.com/user/repos', {
      credentials: 'include' // 使用浏览器的认证状态
    });
    if (res.ok) {
      const data = await res.json();
      return data.slice(0, 5).map(r => r.full_name);
    }
    return [];
  });

  console.log('\n✓ Your recent repos:');
  repos.forEach(repo => console.log(`  - ${repo}`));

  await browser.close();
}

// 错误处理
checkGitHubProfile().catch(err => {
  if (err.message.includes('timeout')) {
    console.error('\n❌ Error: Not logged in to GitHub');
    console.error('   Please manually login to GitHub in your Chrome browser first.');
  } else {
    console.error('Error:', err.message);
  }
});
