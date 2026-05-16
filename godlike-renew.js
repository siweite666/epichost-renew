import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const PANEL_URL = 'https://panel.godlike.host';
const ULTRA_URL = 'https://ultra.panel.godlike.host';
const SERVER_ID = '6ecbede2';
const VIDEO_DURATION = 300;

function setOutput(msg) {
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `msg<<EOF\n${msg}\nEOF\n`);
  console.log(msg);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`🎮 GODLIKE 24h 续期开始 — ${timeCN}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 步骤1: 登录
    console.log('🔐 步骤1: 登录...');
    await page.goto(`${PANEL_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    const authBtn = await page.$('button:has-text("Authorization"), a:has-text("Authorization")');
    if (authBtn && await authBtn.isVisible()) { await authBtn.click(); await sleep(2000); }

    const email = process.env.GODLIKE_EMAIL;
    const password = process.env.GODLIKE_PASSWORD;
    if (!email || !password) { setOutput('❌ 未配置 GODLIKE_EMAIL/PASSWORD'); process.exit(1); }

    await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await sleep(500);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(3000);
    console.log('✅ 登录完成');

    // 步骤2: 导航到 ultra 面板
    console.log('📡 步骤2: 导航到 ultra 面板...');
    await page.goto(`${ULTRA_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);
    console.log('✅ ultra 面板:', page.url());

    // 关闭可能的弹窗
    for (let i = 0; i < 3; i++) {
      const gotIt = await page.$('button:has-text("Got it"), button:has-text("OK"), button:has-text("Close"), button:has-text("Dismiss")');
      if (gotIt && await gotIt.isVisible().catch(() => false)) {
        await gotIt.click();
        console.log(`✅ 关闭弹窗 #${i+1}`);
        await sleep(1000);
      }
    }

    // 步骤3: 点击 24h 续期按钮
    console.log('🔍 步骤3: 查找 24h 续期按钮...');
    const selectors = [
      'button:has-text("+24")',
      'button:has-text("24 hours")',
      'button:has-text("24h")',
      'button:has-text("FREE Renew")',
      'button:has-text("Renew")',
      'button:has-text("Watch")',
      'button:has-text("Video")',
      'button:has-text("YouTube")',
    ];

    let renewBtn = null;
    for (const sel of selectors) {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible().catch(() => false)) {
        renewBtn = btn;
        const text = await btn.textContent().catch(() => sel);
        console.log(`✅ 找到按钮: "${text.trim()}"`);
        break;
      }
    }

    if (!renewBtn) {
      // 列出所有可见按钮
      const buttons = await page.$$('button');
      const btnTexts = [];
      for (const btn of buttons) {
        const t = await btn.textContent().catch(() => '');
        if (t.trim()) btnTexts.push(t.trim());
      }
      setOutput(`❌ 未找到续期按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n可见按钮: ${btnTexts.join(', ')}`);
      process.exit(1);
    }

    await renewBtn.click();
    await sleep(3000);

    // 步骤4: 监控视频播放
    console.log('⏳ 步骤4: 监控视频播放...');
    const startTime = Date.now();
    let peakProgress = 0;
    let lastCheckTime = 0;

    while ((Date.now() - startTime) < 600000) {
      await sleep(10000);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // 检查 video currentTime
      const videoState = await page.evaluate(() => {
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
          const v = videos[0];
          return { paused: v.paused, currentTime: v.currentTime, duration: v.duration };
        }
        // 尝试 iframe 内的 video
        const iframes = document.querySelectorAll('iframe');
        return { noVideo: true, iframeCount: iframes.length };
      }).catch(() => ({ error: true }));

      if (videoState.error) {
        console.log(`⏳ ${elapsed}s - 获取视频状态失败`);
        continue;
      }

      if (videoState.noVideo) {
        console.log(`⏳ ${elapsed}s - 未找到视频 (iframe: ${videoState.iframeCount})`);
        continue;
      }

      const progress = videoState.duration > 0 ? Math.round((videoState.currentTime / videoState.duration) * 100) : 0;
      if (progress > peakProgress) peakProgress = progress;

      console.log(`⏳ ${elapsed}s/${VIDEO_DURATION}s | 进度: ${progress}% | 峰值: ${peakProgress}% | paused: ${videoState.paused}`);

      // 视频播放完成判断
      if (videoState.currentTime >= VIDEO_DURATION - 5) {
        console.log(`✅ 视频播放完成! currentTime=${videoState.currentTime}`);
        break;
      }

      // 如果视频暂停了，尝试恢复
      if (videoState.paused && videoState.currentTime > 0) {
        await page.evaluate(() => {
          const v = document.querySelector('video');
          if (v) v.play();
        }).catch(() => {});
        console.log(`▶️ 尝试恢复播放`);
      }
    }

    await browser.close();

    if (peakProgress >= 90) {
      setOutput(`✅ GODLIKE 24h 续期成功\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n⏱️ 视频播放完成 (峰值 ${peakProgress}%)`);
    } else {
      setOutput(`⚠️ GODLIKE 24h 续期可能未完成\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📊 峰值进度: ${peakProgress}%\n请手动检查面板`);
    }

  } catch (err) {
    await browser.close();
    throw err;
  }
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
