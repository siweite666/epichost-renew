/**
 * GODLIKE 视频观看自动化脚本 v2
 * 使用 Playwright + API Token 注入认证（不依赖 cookie）
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const API_TOKEN = 'ptlc_kAdulq68Gmns2V47xoRQQfO5DQavSpkrLCndorbOYZ7';
const API_URL = 'https://panel.godlike.host';
const WEB_URL = 'https://ultra.panel.godlike.host';
const SERVER_UUID = '6ecbede2-5f1f-4a55-892a-13bcc0972730';
const VIDEO_DURATION = 310;

function setOutput(msg) {
  const gout = process.env.GITHUB_OUTPUT;
  if (gout) appendFileSync(gout, `msg<<EOF\n${msg}\nEOF\n`);
  console.log(msg);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkTimer() {
  try {
    const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Accept': 'application/json' }
    });
    const data = await resp.json();
    const timer = data.attributes?.free_timer;
    const expiry = new Date(timer);
    const remaining = Math.round((expiry - Date.now()) / 60000);
    console.log(`📅 到期: ${timer} (剩余 ${remaining} 分钟)`);
    return { timer, remaining };
  } catch (e) {
    console.log('⚠️ 无法获取到期时间:', e.message);
    return null;
  }
}

async function main() {
  console.log('🎮 GODLIKE 视频续期 v2');
  console.log('====================');
  console.log(`时间: ${new Date().toISOString()}`);

  // 1. 检查当前状态
  const before = await checkTimer();

  // 2. 启动浏览器
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  // 3. 用 API token 注入认证：拦截所有请求加上 Authorization 头
  await page.route('**/*', async (route) => {
    const headers = {
      ...route.request().headers(),
      'Authorization': `Bearer ${API_TOKEN}`,
    };
    await route.continue({ headers });
  });

  // 4. 打开服务器页面（用 panel.godlike.host 作为前端）
  console.log('📡 导航到服务器页面...');
  await page.goto(`${API_URL}/server/${SERVER_UUID}`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  const url = page.url();
  console.log(`📍 当前页面: ${url}`);
  await page.screenshot({ path: '/tmp/godlike-v2-step1.png', fullPage: true });

  // 如果被重定向到登录页，尝试用 API 直接操作
  if (url.includes('login') || url.includes('auth')) {
    console.log('⚠️ 被重定向到登录页，尝试另一种方式...');

    // 关闭路由拦截，直接用 API
    await page.unroute('**/*');

    // 直接通过 API 检查是否有续期端点
    const testEndpoints = [
      `${API_URL}/api/client/freeservers/${SERVER_UUID}/renew`,
      `${API_URL}/api/client/servers/${SERVER_UUID}/renew`,
      `${API_URL}/api/client/servers/${SERVER_UUID}/extend`,
    ];
    
    for (const ep of testEndpoints) {
      try {
        const resp = await fetch(ep, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        const text = await resp.text();
        console.log(`${ep}: ${resp.status} - ${text.substring(0, 100)}`);
        if (resp.ok) {
          setOutput(`✅ GODLIKE 续期成功 (API)\n━━━━━━━━━━━━━━━\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
          await browser.close();
          return;
        }
      } catch (e) {
        console.log(`${ep}: error - ${e.message}`);
      }
    }

    setOutput('❌ Cookie/Token 过期，无法自动续期\n━━━━━━━━━━━━━━━\n请重新获取 Cookie 或检查 API Token');
    await browser.close();
    process.exit(1);
  }

  // 5. 点击 Renew 按钮
  console.log('🔍 查找 Renew 按钮...');
  const renewSelectors = [
    'button:has-text("Renew")',
    'text=Renew',
    'button:has-text("Public Renewal")',
    'button:has-text("续期")',
  ];

  let renewClicked = false;
  for (const sel of renewSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log(`✅ 找到: "${(await el.textContent()).trim()}"`);
        await el.click();
        renewClicked = true;
        await sleep(2000);
        break;
      }
    } catch {}
  }

  if (!renewClicked) {
    await page.screenshot({ path: '/tmp/godlike-v2-no-renew.png', fullPage: true });
    setOutput('❌ 未找到续期按钮');
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: '/tmp/godlike-v2-step2.png', fullPage: true });

  // 6. 点击视频观看按钮
  console.log('🔍 查找视频按钮...');
  const videoSelectors = [
    'text=watching video',
    'text=Watch Video',
    'text=YouTube',
    'button:has-text("video")',
    'button:has-text("Video")',
    'button:has-text("Watch")',
    'button:has-text("watch")',
    '[class*="youtube"]',
    '[class*="play"]',
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

  await page.screenshot({ path: '/tmp/godlike-v2-step3.png', fullPage: true });

  // 7. 等待视频播放完成
  console.log(`⏳ 等待视频播放 (${VIDEO_DURATION}秒)...`);
  const startTime = Date.now();

  while ((Date.now() - startTime) < VIDEO_DURATION * 1000) {
    await sleep(15000);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    try {
      const pageText = await page.textContent('body');

      if (pageText.includes('+24') || pageText.includes('renewed') ||
          pageText.includes('success') || pageText.includes('完成') ||
          pageText.includes('获得') || pageText.includes('earned') ||
          pageText.includes('added')) {
        console.log(`✅ 续期完成! (${elapsed}s)`);
        break;
      }

      const pct = pageText.match(/(\d+)%/);
      console.log(pct ? `📊 ${elapsed}s - ${pct[1]}%` : `⏳ ${elapsed}s`);
    } catch {
      console.log(`⏳ ${elapsed}s`);
    }
  }

  await page.screenshot({ path: '/tmp/godlike-v2-step4.png', fullPage: true });
  await browser.close();

  // 8. 验证结果
  console.log('🔍 验证...');
  const after = await checkTimer();

  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  if (after && before && after.remaining > before.remaining + 600) {
    setOutput(`✅ GODLIKE 服务器续期成功\n━━━━━━━━━━━━━━━\n🕐 时间: ${timeCN}\n⏰ ${before.remaining}分 → ${after.remaining}分 (+${Math.round((after.remaining - before.remaining)/60)}h)`);
  } else {
    setOutput(`⚠️ GODLIKE 续期结果不确定\n━━━━━━━━━━━━━━━\n🕐 时间: ${timeCN}\n请检查面板确认`);
  }
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
