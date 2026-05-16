import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

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

  // 1. Check current expiry via API
  const { default: fetch } = await import('node-fetch');
  let freeTimer = 'unknown';
  try {
    const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
      headers: { 'Authorization': `Bearer ${process.env.GODLIKE_TOKEN}`, 'Accept': 'application/json' }
    });
    const data = await resp.json();
    freeTimer = data.attributes?.free_timer || 'unknown';
    console.log(`📅 当前到期时间: ${freeTimer}`);
  } catch (e) {
    console.log('⚠️ 无法获取当前到期时间:', e.message);
  }

  // 2. Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 3. Login
    console.log('🔐 登录 panel.godlike.host...');
    await page.goto(`${API_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // Click "Authorization" button to reveal login form
    const authBtn = await page.$('button:has-text("Authorization"), a:has-text("Authorization")');
    if (authBtn && await authBtn.isVisible()) {
      await authBtn.click();
      await sleep(2000);
      console.log('✅ 点击 Authorization 按钮');
    }

    // Fill email/password
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

    // 4. Navigate to server page
    console.log('📡 导航到服务器页面...');
    await page.goto(`${API_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    console.log('✅ 服务器页面:', page.url());

    // 5. Click "Add 90 minutes"
    console.log('🔍 查找 "Add 90 minutes" 按钮...');
    let addBtn = await page.$('button:has-text("Add 90 minutes"), button:has-text("90 minutes")');
    if (!addBtn) {
      // Try text content match
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.textContent().catch(() => '');
        if (text.includes('90') && text.includes('minute')) {
          addBtn = btn;
          break;
        }
      }
    }

    if (!addBtn || !(await addBtn.isVisible())) {
      // Check if already on cooldown
      const bodyText = await page.textContent('body');
      if (bodyText.includes('Please wait')) {
        setOutput(`⏳ GODLIKE 续期冷却中（已等待中）\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期时间: ${freeTimer}`);
        return;
      }
      setOutput(`❌ 未找到 "Add 90 minutes" 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n页面可能已变化`);
      process.exit(1);
    }

    console.log('✅ 找到按钮，点击...');
    await addBtn.click();
    await sleep(2000);

    // 6. Click "Watch advertisment" (note: typo is intentional, match exactly)
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

    if (!watchBtn || !(await watchBtn.isVisible())) {
      // Maybe already showing cooldown
      const bodyText = await page.textContent('body');
      if (bodyText.includes('Please wait')) {
        setOutput(`⏳ GODLIKE 广告冷却中\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期时间: ${freeTimer}`);
        return;
      }
      setOutput(`❌ 未找到 "Watch advertisment" 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}`);
      process.exit(1);
    }

    console.log('✅ 点击 "Watch advertisment"...');
    await watchBtn.click();
    await sleep(3000);

    // 7. Wait for ad to complete (~4 min cooldown)
    console.log('⏳ 等待广告播放完成 (约 240 秒)...');
    const startTime = Date.now();
    let completed = false;

    while ((Date.now() - startTime) < 300000) {
      await sleep(15000);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const bodyText = await page.textContent('body').catch(() => '');

      if (bodyText.includes('Add 90 minutes') && !bodyText.includes('Please wait')) {
        console.log(`✅ 广告完成，续期成功! (${elapsed}s)`);
        completed = true;
        break;
      }

      const waitMatch = bodyText.match(/Please wait (\d+) minutes?/);
      if (waitMatch) {
        console.log(`⏳ ${elapsed}s - 冷却中: 还需等待 ${waitMatch[1]} 分钟`);
      } else {
        console.log(`⏳ ${elapsed}s - 等待中...`);
      }
    }

    // 8. Verify via API
    let newTimer = 'unknown';
    try {
      const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
        headers: { 'Authorization': `Bearer ${process.env.GODLIKE_TOKEN}`, 'Accept': 'application/json' }
      });
      const data = await resp.json();
      newTimer = data.attributes?.free_timer || 'unknown';
      console.log(`📅 新到期时间: ${newTimer}`);
    } catch {}

    if (completed) {
      setOutput(`✅ GODLIKE 续期成功 (+90分钟)\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期时间: ${freeTimer} → ${newTimer}`);
    } else {
      setOutput(`⚠️ GODLIKE 续期可能未完成\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${freeTimer}\n📅 现在: ${newTimer}\n请手动检查`);
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
