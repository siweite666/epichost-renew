/**
 * GODLIKE 视频观看自动化脚本
 * 使用 Playwright 模拟浏览器观看视频获取续期时长
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const COOKIE = process.env.GODLIKE_COOKIE;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

function setOutput(msg) {
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `msg<<EOF\n${msg}\nEOF\n`);
  }
  console.log(msg);
}
const PANEL_URL = 'https://panel.godlike.host';
const SERVER_UUID = '6ecbede2-5f1f-4a55-892a-13bcc0972730';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('🎮 GODLIKE 视频续期自动化');
  console.log('========================');
  console.log(`时间: ${new Date().toISOString()}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });

  // Set cookies for authentication
  if (COOKIE) {
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
  } else {
    console.error('❌ 未配置 GODLIKE_COOKIE');
    process.exit(1);
  }

  const page = await context.newPage();
  
  // Navigate to server page
  console.log('📡 导航到服务器页面...');
  await page.goto(`${PANEL_URL}/server/${SERVER_UUID}`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  // Check if we're logged in
  const url = page.url();
  if (url.includes('login') || url.includes('auth')) {
    console.error('❌ Cookie 已过期，需要重新获取');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ 已登录，当前页面:', url);

  // Look for video/renewal/earn-time button
  console.log('🔍 查找视频观看入口...');
  
  // Try to find the "Watch Video" or similar button
  const selectors = [
    'text=观看视频', 'text=Watch Video', 'text=Watch', 'text=观看',
    'text=获得时间', 'text=Earn Time', 'text=Get Time',
    'text=续期', 'text=Renew', 'text=Extend',
    '[data-action="watch"]', '[data-action="video"]',
    'button:has-text("video")', 'button:has-text("Video")',
    'a:has-text("video")', 'a:has-text("Video")',
  ];
  
  let found = false;
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.textContent();
        console.log(`✅ 找到按钮: "${text}"`);
        await el.click();
        found = true;
        break;
      }
    } catch {}
  }

  if (!found) {
    // Try clicking on sidebar/menu items that might lead to video page
    console.log('⚠️ 未找到视频按钮，尝试截图分析...');
    await page.screenshot({ path: '/tmp/godlike-server.png', fullPage: true });
    
    // Try navigating to common video/earn URLs
    const videoUrls = [
      `${PANEL_URL}/server/${SERVER_UUID}/video`,
      `${PANEL_URL}/server/${SERVER_UUID}/earn`,
      `${PANEL_URL}/server/${SERVER_UUID}/watch`,
      `${PANEL_URL}/videos`,
      `${PANEL_URL}/earn`,
    ];
    
    for (const vurl of videoUrls) {
      try {
        const resp = await page.goto(vurl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        if (resp && resp.status() === 200 && !page.url().includes('login')) {
          console.log(`✅ 找到视频页面: ${page.url()}`);
          found = true;
          break;
        }
      } catch {}
    }
  }

  if (!found) {
    console.log('⚠️ 无法自动定位视频页面，尝试通用方法...');
  }

  // Now try to start/trigger video watching
  // Look for play buttons, video iframes, etc.
  await sleep(2000);
  
  // Try clicking any play/start buttons
  const playSelectors = [
    'button:has-text("Play")', 'button:has-text("Start")',
    'button:has-text("播放")', 'button:has-text("开始")',
    '[data-action="play"]', '[data-action="start"]',
    '.play-button', '.start-btn', '#play-btn',
    'button:has-text("观看")', 'button:has-text("确认")',
  ];
  
  for (const sel of playSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log(`▶️ 点击: ${sel}`);
        await el.click();
        await sleep(1000);
      }
    } catch {}
  }

  // Wait and monitor for progress/completion
  console.log('⏳ 等待视频播放...');
  let completed = false;
  const maxWait = 10 * 60 * 1000; // 10 minutes max
  const startTime = Date.now();
  
  while (!completed && (Date.now() - startTime) < maxWait) {
    await sleep(10000); // Check every 10 seconds
    
    const pageText = await page.textContent('body');
    
    // Check for completion indicators
    if (pageText.includes('100%') || pageText.includes('完成') || 
        pageText.includes('completed') || pageText.includes('success') ||
        pageText.includes('成功') || pageText.includes('获得') ||
        pageText.includes('earned')) {
      console.log('✅ 视频观看完成!');
      completed = true;
      break;
    }
    
    // Extract progress if visible
    const progressMatch = pageText.match(/(\d+)%/);
    if (progressMatch) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`📊 进度: ${progressMatch[1]}% (${elapsed}s)`);
    }
  }

  // Verify by checking free_timer
  console.log('🔍 检查服务器续期状态...');
  await page.goto(`${PANEL_URL}/api/client/servers/${SERVER_UUID}`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  
  try {
    const bodyText = await page.textContent('body');
    const data = JSON.parse(bodyText);
    console.log(`📅 free_timer: ${data.attributes?.free_timer}`);
  } catch {
    console.log('⚠️ 无法通过页面获取续期状态');
  }

  await page.screenshot({ path: '/tmp/godlike-result.png', fullPage: true });
  await browser.close();

  if (completed) {
    setOutput(`✅ GODLIKE 服务器续期成功\n━━━━━━━━━━━━━━━\n🕐 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  } else {
    setOutput(`❌ GODLIKE 视频观看超时\n━━━━━━━━━━━━━━━\n🕐 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n可能原因: Cookie过期 / 视频页面结构变化 / 网络问题`);
    process.exit(1);
  }
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
