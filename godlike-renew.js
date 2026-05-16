import { chromium } from 'playwright';
import { appendFileSync, writeFileSync } from 'fs';

const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const API_URL = 'https://panel.godlike.host';
const SERVER_UUID = '6ecbede2-5f1f-4a55-892a-13bcc0972730';
const SERVER_ID = '6ecbede2';

function setOutput(msg) {
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `msg<<EOF\n${msg}\nEOF\n`);
  console.log(msg);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`🎮 GODLIKE 续期 (90分钟) 开始 — ${timeCN}`);

  // Check current expiry via API
  let freeTimer = 'unknown';
  if (process.env.GODLIKE_TOKEN) {
    try {
      const { default: fetch } = await import('node-fetch');
      const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
        headers: { 'Authorization': `Bearer ${process.env.GODLIKE_TOKEN}`, 'Accept': 'application/json' }
      });
      const data = await resp.json();
      freeTimer = data.attributes?.free_timer || 'unknown';
      console.log(`📅 当前到期时间: ${freeTimer}`);
    } catch (e) {
      console.log('⚠️ 无法获取当前到期时间:', e.message);
    }
  } else {
    console.log('⚠️ GODLIKE_TOKEN 未配置，跳过 API 验证');
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Login
    console.log('🔐 登录 panel.godlike.host...');
    await page.goto(`${API_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    const authBtn = await page.$('button:has-text("Authorization"), a:has-text("Authorization")');
    if (authBtn && await authBtn.isVisible()) {
      await authBtn.click();
      await sleep(2000);
      console.log('✅ 点击 Authorization 按钮');
    }

    const email = process.env.GODLIKE_EMAIL;
    const password = process.env.GODLIKE_PASSWORD;
    if (!email || !password) {
      setOutput('❌ 未配置 GODLIKE_EMAIL 或 GODLIKE_PASSWORD');
      process.exit(1);
    }

    await page.fill('input[type="email"], input[name="email"], input[placeholder*="mail"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await sleep(500);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(3000);
    console.log('✅ 登录完成, URL:', page.url());

    // Navigate to server page
    console.log('📡 导航到服务器页面...');
    await page.goto(`${API_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    console.log('✅ 服务器页面:', page.url());

    // Screenshot before clicking
    await page.screenshot({ path: '/tmp/godlike-before.png', fullPage: true });
    console.log('📸 已截图 (before)');

    // Read page text for analysis
    const bodyText = await page.textContent('body').catch(() => '');
    console.log('📄 页面文本 (前500字):', bodyText.substring(0, 500));

    // Check if already on cooldown
    if (bodyText.includes('Please wait')) {
      const waitMatch = bodyText.match(/Please wait (\d+) minutes?/);
      const waitMsg = waitMatch ? waitMatch[0] : 'Please wait';
      setOutput(`⏳ GODLIKE 续期冷却中 — ${waitMsg}\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期时间: ${freeTimer}`);
      await browser.close();
      return;
    }

    // Click "Add 90 minutes"
    console.log('🔍 查找 "Add 90 minutes" 按钮...');
    let addBtn = await page.$('button:has-text("Add 90 minutes"), button:has-text("90 minutes")');
    if (!addBtn) {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.textContent().catch(() => '');
        if (text.includes('90') && text.includes('minute')) {
          addBtn = btn;
          break;
        }
      }
    }

    if (!addBtn || !(await addBtn.isVisible().catch(() => false))) {
      setOutput(`❌ 未找到 "Add 90 minutes" 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n页面文本: ${bodyText.substring(0, 200)}`);
      await page.screenshot({ path: '/tmp/godlike-no-button.png', fullPage: true });
      process.exit(1);
    }

    console.log('✅ 找到按钮，点击...');
    await addBtn.click();
    await sleep(2000);

    // Screenshot after clicking Add 90 min
    await page.screenshot({ path: '/tmp/godlike-after-add.png', fullPage: true });

    // Click "Watch advertisment" (typo is intentional)
    console.log('🔍 查找 "Watch advertisment" 按钮...');
    let watchBtn = await page.$('button:has-text("Watch advertisment")');
    if (!watchBtn) {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.textContent().catch(() => '');
        if (text.toLowerCase().includes('watch') && text.toLowerCase().includes('advertis')) {
          watchBtn = btn;
          break;
        }
      }
    }

    if (!watchBtn || !(await watchBtn.isVisible().catch(() => false))) {
      const afterText = await page.textContent('body').catch(() => '');
      if (afterText.includes('Please wait')) {
        setOutput(`⏳ GODLIKE 广告冷却中\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期时间: ${freeTimer}`);
        return;
      }
      setOutput(`❌ 未找到 "Watch advertisment" 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n弹窗文本: ${afterText.substring(0, 300)}`);
      await page.screenshot({ path: '/tmp/godlike-no-watch.png', fullPage: true });
      process.exit(1);
    }

    console.log('✅ 点击 "Watch advertisment"...');
    await watchBtn.click();
    await sleep(5000);

    // Screenshot after clicking Watch
    await page.screenshot({ path: '/tmp/godlike-after-watch.png', fullPage: true });
    const watchText = await page.textContent('body').catch(() => '');
    console.log('📄 点击后页面文本 (前300字):', watchText.substring(0, 300));

    // Wait for ad to complete (~4 min)
    console.log('⏳ 等待广告播放完成 (约 240 秒)...');
    const startTime = Date.now();
    let detectedCooldown = false;
    let detectedReady = false;

    while ((Date.now() - startTime) < 300000) {
      await sleep(15000);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const bodyText2 = await page.textContent('body').catch(() => '');

      if (bodyText2.includes('Please wait')) {
        detectedCooldown = true;
        const waitMatch = bodyText2.match(/Please wait (\d+) minutes?/);
        console.log(`⏳ ${elapsed}s - 冷却中: ${waitMatch ? waitMatch[0] : 'Please wait'}`);
      } else if (bodyText2.includes('Add 90 minutes')) {
        detectedReady = true;
        console.log(`✅ ${elapsed}s - 按钮恢复可用，续期成功!`);
        break;
      } else {
        console.log(`⏳ ${elapsed}s - 等待中...`);
      }
    }

    // Final screenshot
    await page.screenshot({ path: '/tmp/godlike-final.png', fullPage: true });

    // Determine result
    const success = detectedReady || detectedCooldown;

    // Verify via API if token available
    let newTimer = 'unknown';
    if (process.env.GODLIKE_TOKEN) {
      try {
        const { default: fetch } = await import('node-fetch');
        const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
          headers: { 'Authorization': `Bearer ${process.env.GODLIKE_TOKEN}`, 'Accept': 'application/json' }
        });
        const data = await resp.json();
        newTimer = data.attributes?.free_timer || 'unknown';
        console.log(`📅 新到期时间: ${newTimer}`);
      } catch {}
    }

    if (success) {
      setOutput(`✅ GODLIKE 续期成功 (+90分钟)\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${freeTimer} → ${newTimer}`);
    } else {
      setOutput(`⚠️ GODLIKE 续期结果不确定\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${freeTimer} → ${newTimer}\n检测到冷却: ${detectedCooldown}, 按钮恢复: ${detectedReady}\n请手动检查服务器`);
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
