import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const API_URL = 'https://panel.godlike.host';
const SERVER_ID = '6ecbede2';
const SERVER_UUID = '6ecbede2-5f1f-4a55-892a-13bcc0972730';

function setOutput(msg) {
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `msg<<EOF\n${msg}\nEOF\n`);
  console.log(msg);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTimer() {
  if (!process.env.GODLIKE_TOKEN) return 'unknown';
  try {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
      headers: { 'Authorization': `Bearer ${process.env.GODLIKE_TOKEN}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) return 'unknown';
    const data = await resp.json();
    return data.attributes?.free_timer || 'unknown';
  } catch { return 'unknown'; }
}

async function main() {
  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`🎮 GODLIKE 续期 (90分钟) 开始 — ${timeCN}`);

  // 查当前到期时间
  const timerBefore = await getTimer();
  console.log(`📅 当前到期时间: ${timerBefore}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 登录
    console.log('🔐 登录...');
    await page.goto(`${API_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
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

    // 导航到服务器
    await page.goto(`${API_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    const bodyText = await page.textContent('body').catch(() => '');

    // 检查是否已在冷却中
    if (bodyText.includes('Please wait')) {
      const timerAfter = await getTimer();
      setOutput(`⏳ GODLIKE 已在冷却中 (上次续期后)\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerAfter}`);
      await browser.close();
      return;
    }

    // 点 "Add 90 minutes"
    let addBtn = await page.$('button:has-text("Add 90 minutes"), button:has-text("90 minutes")');
    if (!addBtn) {
      for (const btn of await page.$$('button')) {
        const text = await btn.textContent().catch(() => '');
        if (text.includes('90') && text.includes('minute')) { addBtn = btn; break; }
      }
    }
    if (!addBtn || !(await addBtn.isVisible().catch(() => false))) {
      setOutput(`❌ 未找到 "Add 90 minutes" 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}`);
      process.exit(1);
    }
    await addBtn.click();
    await sleep(2000);

    // 点 "Watch advertisment"
    let watchBtn = await page.$('button:has-text("Watch advertisment")');
    if (!watchBtn) {
      for (const btn of await page.$$('button')) {
        const text = await btn.textContent().catch(() => '');
        if (text.toLowerCase().includes('watch') && text.toLowerCase().includes('advertis')) { watchBtn = btn; break; }
      }
    }
    if (!watchBtn || !(await watchBtn.isVisible().catch(() => false))) {
      const afterText = await page.textContent('body').catch(() => '');
      if (afterText.includes('Please wait')) {
        const timerAfter = await getTimer();
        setOutput(`⏳ GODLIKE 已在冷却中\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerAfter}`);
        return;
      }
      setOutput(`❌ 未找到 "Watch advertisment" 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}`);
      process.exit(1);
    }

    await watchBtn.click();
    console.log('✅ 已点击 Watch advertisment');
    await sleep(5000);

    // 等待广告冷却
    const startTime = Date.now();
    let detectedCooldown = false;

    while ((Date.now() - startTime) < 300000) {
      await sleep(15000);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const text = await page.textContent('body').catch(() => '');
      if (text.includes('Please wait')) {
        detectedCooldown = true;
        console.log(`⏳ ${elapsed}s - 冷却中`);
      } else if (text.includes('Add 90 minutes')) {
        console.log(`✅ ${elapsed}s - 按钮恢复，续期成功!`);
        detectedCooldown = true;
        break;
      }
    }

    await browser.close();

    // 查续期后到期时间
    const timerAfter = await getTimer();

    if (detectedCooldown) {
      setOutput(`✅ GODLIKE 续期成功 (+90分钟)\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerBefore} → ${timerAfter}`);
    } else {
      setOutput(`⚠️ GODLIKE 续期结果不确定\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerBefore} → ${timerAfter}`);
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
