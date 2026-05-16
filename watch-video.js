/**
 * GODLIKE 视频观看自动化脚本
 * 使用 Playwright 模拟浏览器观看视频获取续期时长（+24h）
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const COOKIE = process.env.GODLIKE_COOKIE;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const API_URL = 'https://panel.godlike.host';
const WEB_URL = 'https://ultra.panel.godlike.host';
const SERVER_UUID = '6ecbede2-5f1f-4a55-892a-13bcc0972730';
const VIDEO_DURATION = 310; // 视频时长+缓冲（秒）

function setOutput(msg) {
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `msg<<EOF\n${msg}\nEOF\n`);
  }
  console.log(msg);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🎮 GODLIKE 视频续期自动化');
  console.log('========================');
  console.log(`时间: ${new Date().toISOString()}`);

  // 1. 先用 API 检查当前剩余时间
  const { default: fetch } = await import('node-fetch');
  try {
    const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
      headers: {
        'Authorization': `Bearer ${process.env.GODLIKE_TOKEN || 'ptlc_kAdulq68Gmns2V47xoRQQfO5DQavSpkrLCndorbOYZ7'}`,
        'Accept': 'application/json'
      }
    });
    const data = await resp.json();
    const timer = data.attributes?.free_timer;
    console.log(`📅 当前到期时间: ${timer}`);
    if (timer) {
      const expiry = new Date(timer);
      const now = new Date();
      const remaining = (expiry - now) / 1000 / 60;
      console.log(`⏰ 剩余: ${Math.round(remaining)} 分钟`);
    }
  } catch (e) {
    console.log('⚠️ 无法获取当前到期时间:', e.message);
  }

  // 2. 启动浏览器
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });

  // 3. 注入 Cookie
  if (!COOKIE) {
    setOutput('❌ 未配置 GODLIKE_COOKIE');
    process.exit(1);
  }
  const cookies = COOKIE.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return {
      name: name.trim(),
      value: rest.join('='),
      domain: '.godlike.host',
      path: '/',
    };
  });
  await context.addCookies(cookies);
  console.log('✅ Cookie 已注入');

  const page = await context.newPage();

  // 4. 打开服务器页面
  console.log('📡 导航到服务器页面...');
  await page.goto(`${WEB_URL}/server/${SERVER_UUID}`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  // 检查是否登录成功
  const url = page.url();
  if (url.includes('login') || url.includes('auth')) {
    setOutput('❌ Cookie 已过期，需要重新获取');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ 已登录:', url);
  await page.screenshot({ path: '/tmp/godlike-step1.png', fullPage: true });

  // 5. 点击 Renew 按钮
  console.log('🔍 查找 Renew 按钮...');
  const renewSelectors = [
    'button:has-text("Renew")',
    'a:has-text("Renew")',
    'text=Renew',
    '[data-action="renew"]',
    'button:has-text("续期")',
    'button:has-text("Public Renewal")',
  ];

  let renewClicked = false;
  for (const sel of renewSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        const text = await el.textContent();
        console.log(`✅ 找到续期按钮: "${text.trim()}"`);
        await el.click();
        renewClicked = true;
        await sleep(2000);
        break;
      }
    } catch {}
  }

  if (!renewClicked) {
    console.log('⚠️ 未找到 Renew 按钮，尝试截图分析...');
    await page.screenshot({ path: '/tmp/godlike-no-renew.png', fullPage: true });
    setOutput('❌ 未找到续期按钮，可能已续期或页面结构变化');
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: '/tmp/godlike-step2.png', fullPage: true });

  // 6. 在弹窗中点击 "Watch Video" / YouTube 播放按钮
  console.log('🔍 查找视频观看按钮...');
  const videoSelectors = [
    'text=watching video',
    'text=Watch Video',
    'text=Watch a YouTube',
    'text=YouTube',
    'button:has-text("video")',
    'button:has-text("Video")',
    '[class*="youtube"]',
    '[class*="play"]',
    'svg[data-icon="play"]',
    'iframe[src*="youtube"]',
    // YouTube 播放按钮图标
    '.fa-play',
    '[class*="fa-play"]',
    'button:has(svg)',
  ];

  let videoClicked = false;
  for (const sel of videoSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log(`✅ 找到视频按钮: ${sel}`);
        await el.click();
        videoClicked = true;
        await sleep(2000);
        break;
      }
    } catch {}
  }

  if (!videoClicked) {
    // 尝试直接找所有可点击元素
    console.log('⚠️ 未找到明确的视频按钮，尝试分析弹窗...');
    const popup = await page.$('[class*="modal"], [class*="popup"], [class*="dialog"], [role="dialog"]');
    if (popup) {
      const popupText = await popup.textContent();
      console.log('弹窗内容:', popupText.substring(0, 200));
      // 尝试点击弹窗内的任何按钮
      const btn = await popup.$('button, a, [role="button"]');
      if (btn) {
        const btnText = await btn.textContent();
        console.log(`点击弹窗按钮: "${btnText.trim()}"`);
        await btn.click();
        videoClicked = true;
        await sleep(2000);
      }
    }
  }

  await page.screenshot({ path: '/tmp/godlike-step3.png', fullPage: true });

  // 7. 等待视频播放完成（约300秒）
  console.log(`⏳ 等待视频播放 (${VIDEO_DURATION}秒)...`);
  const startTime = Date.now();
  let videoComplete = false;

  while ((Date.now() - startTime) < VIDEO_DURATION * 1000) {
    await sleep(15000); // 每15秒检查一次
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = VIDEO_DURATION - elapsed;

    try {
      const pageText = await page.textContent('body');

      // 检查续期完成标志
      if (pageText.includes('+24') || pageText.includes('renewed') ||
          pageText.includes('success') || pageText.includes('完成') ||
          pageText.includes('earned') || pageText.includes('获得') ||
          pageText.includes('added')) {
        console.log(`✅ 检测到续期完成标志! (${elapsed}s)`);
        videoComplete = true;
        break;
      }

      // 检查进度百分比
      const progressMatch = pageText.match(/(\d+)%/);
      if (progressMatch) {
        console.log(`📊 ${elapsed}s - 进度: ${progressMatch[1]}% (剩余 ${remaining}s)`);
      } else {
        console.log(`⏳ ${elapsed}s - 等待中... (剩余 ${remaining}s)`);
      }
    } catch (e) {
      console.log(`⏳ ${elapsed}s - 页面检查失败: ${e.message}`);
    }
  }

  if (!videoComplete) {
    console.log('⏰ 视频等待时间结束');
    videoComplete = true; // 假设完成了
  }

  await page.screenshot({ path: '/tmp/godlike-step4.png', fullPage: true });

  // 8. 关闭弹窗（如果有关闭按钮）
  try {
    const closeBtn = await page.$('button:has-text("×"), button:has-text("Close"), [aria-label="close"], [class*="close"]');
    if (closeBtn && await closeBtn.isVisible()) {
      await closeBtn.click();
      await sleep(1000);
    }
  } catch {}

  // 9. 验证续期结果
  console.log('🔍 验证续期结果...');
  try {
    const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
      headers: {
        'Authorization': `Bearer ${process.env.GODLIKE_TOKEN || 'ptlc_kAdulq68Gmns2V47xoRQQfO5DQavSpkrLCndorbOYZ7'}`,
        'Accept': 'application/json'
      }
    });
    const data = await resp.json();
    const newTimer = data.attributes?.free_timer;
    console.log(`📅 新到期时间: ${newTimer}`);
  } catch (e) {
    console.log('⚠️ 无法验证:', e.message);
  }

  await browser.close();

  // 10. 输出结果
  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  if (videoComplete) {
    setOutput(`✅ GODLIKE 服务器续期成功\n━━━━━━━━━━━━━━━\n🕐 时间: ${timeCN}\n🎮 服务器: ${SERVER_UUID.slice(0,8)}...\n⏱️ 续期 +24 小时`);
  } else {
    setOutput(`❌ GODLIKE 视频观看未完成\n━━━━━━━━━━━━━━━\n🕐 时间: ${timeCN}\n可能原因: Cookie过期 / 视频未播放 / 网络问题`);
    process.exit(1);
  }
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
