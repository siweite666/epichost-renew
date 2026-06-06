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

function utcToBeijing(utcStr) {
  try {
    const d = new Date(utcStr);
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return utcStr; }
}

async function getTimer() {
  if (!process.env.GODLIKE_TOKEN) return { raw: 'unknown', beijing: 'unknown' };
  try {
    const { default: fetch } = await import('node-fetch');
    const resp = await fetch(`${API_URL}/api/client/servers/${SERVER_UUID}`, {
      headers: { 'Authorization': `Bearer ${process.env.GODLIKE_TOKEN}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) return { raw: 'unknown', beijing: 'unknown' };
    const data = await resp.json();
    const raw = data.attributes?.free_timer || 'unknown';
    return { raw, beijing: raw === 'unknown' ? 'unknown' : utcToBeijing(raw) };
  } catch { return { raw: 'unknown', beijing: 'unknown' }; }
}

async function doLogin(page) {
  const email = process.env.GODLIKE_EMAIL;
  const password = process.env.GODLIKE_PASSWORD;
  if (!email || !password) throw new Error('未配置 GODLIKE_EMAIL/PASSWORD');

  // Navigate to panel login page
  await page.goto(`${API_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  // Click Authorization button to start OAuth
  const authBtn = await page.$('button:has-text("Authorization"), a:has-text("Authorization")');
  if (authBtn && await authBtn.isVisible()) {
    await authBtn.click();
    await sleep(3000);
  }

  // Wait for the login form to appear
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(2000);

  // Fill credentials - try multiple selectors
  const emailSel = 'input[type="email"], input[name="email"], input[placeholder*="mail"], input[name="username"]';
  const passSel = 'input[type="password"], input[name="password"]';
  
  await page.waitForSelector(emailSel, { timeout: 10000 }).catch(() => {});
  await page.fill(emailSel, email);
  await page.fill(passSel, password);
  await sleep(1000);

  // Click submit
  await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), input[type="submit"]');
  
  // Wait for OAuth callback to complete and redirect to dashboard
  // The flow is: login page -> OAuth provider -> /auth/oauth/whmcs/callback?code=... -> dashboard
  // We need to wait for the final redirect, not just any page load
  try {
    await page.waitForURL(url => {
      const u = url.toString();
      // Success: landed on dashboard (no login/auth paths, except callback which is intermediate)
      return (u.includes(API_URL) && !u.includes('/login') && !u.includes('/auth/oauth'));
    }, { timeout: 30000 });
  } catch {
    // If waitForURL times out, check where we ended up
    const stuckUrl = page.url();
    // Callback page with code means OAuth succeeded but redirect didn't complete
    if (stuckUrl.includes('/auth/oauth/whmcs/callback') && stuckUrl.includes('code=')) {
      console.log('⚠️ OAuth callback 已到达，尝试手动导航到 dashboard...');
      await page.goto(`${API_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000);
      const dashUrl = page.url();
      if (dashUrl.includes('/login')) {
        throw new Error(`登录失败，重定向后仍在登录页: ${dashUrl}`);
      }
      console.log(`✅ 登录完成（手动导航），当前页面: ${dashUrl}`);
      return;
    }
    throw new Error(`登录超时，当前页面: ${stuckUrl}`);
  }

  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(2000);
  console.log(`✅ 登录完成，当前页面: ${page.url()}`);
}

async function main() {
  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`🎮 GODLIKE 续期 (90分钟) 开始 — ${timeCN}`);

  const timerBefore = await getTimer();
  console.log(`📅 当前到期时间: ${timerBefore.beijing}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Login with retry
    console.log('🔐 登录...');
    let loginOk = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await doLogin(page);
        loginOk = true;
        break;
      } catch (e) {
        console.log(`⚠️ 登录尝试 ${attempt}/3 失败: ${e.message}`);
        if (attempt < 3) await sleep(3000);
      }
    }
    if (!loginOk) throw new Error('3次登录尝试全部失败');

    // Navigate to server page
    await page.goto(`${API_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);

    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText.includes('Please wait')) {
      const timerAfter = await getTimer();
      setOutput(`⏳ GODLIKE 已在冷却中\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerAfter.beijing}`);
      await browser.close();
      return;
    }

    // 同时查找两种按钮（Active: Add 90 minutes / Suspended: Renew your server）
    let addBtn = null;
    
    // 先找 "Add 90 minutes"
    addBtn = await page.$('button:has-text("Add 90 minutes")');
    if (!addBtn) {
      for (const btn of await page.$$('button')) {
        const text = await btn.textContent().catch(() => '');
        if (text.includes('90') && text.includes('minute')) { addBtn = btn; break; }
      }
    }
    
    // 没找到就找 "Renew your server"
    if (!addBtn) {
      console.log('未找到 Add 90 minutes，尝试找 Renew your server...');
      addBtn = await page.$('button:has-text("Renew your server")');
      if (!addBtn) {
        for (const btn of await page.$$('button')) {
          const text = await btn.textContent().catch(() => '');
          if (text.toLowerCase().includes('renew') && text.toLowerCase().includes('server')) { addBtn = btn; break; }
        }
      }
      if (addBtn) console.log('✅ 找到 Renew your server 按钮（Suspended 状态）');
    } else {
      console.log('✅ 找到 Add 90 minutes 按钮（Active 状态）');
    }
    
    if (!addBtn || !(await addBtn.isVisible().catch(() => false))) {
      await page.screenshot({ path: '/tmp/godlike-debug.png' }).catch(() => {});
      for (const btn of await page.$$('button')) {
        const text = await btn.textContent().catch(() => '');
        if (text.trim()) console.log(`  按钮: "${text.trim().substring(0, 60)}"`);
      }
      setOutput(`❌ 未找到续期按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}`);
      process.exit(1);
    }
    await addBtn.click();
    await sleep(2000);

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
        setOutput(`⏳ GODLIKE 已在冷却中\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerAfter.beijing}`);
        return;
      }
      setOutput(`❌ 未找到 Watch advertisment 按钮\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}`);
      process.exit(1);
    }

    await watchBtn.click();
    console.log('✅ 已点击 Watch advertisment');
    await sleep(5000);

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
    const timerAfter = await getTimer();

    if (detectedCooldown) {
      setOutput(`✅ GODLIKE 续期成功 (+90分钟)\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerBefore.beijing} → ${timerAfter.beijing}`);
    } else {
      setOutput(`⚠️ GODLIKE 续期结果不确定\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${timerBefore.beijing} → ${timerAfter.beijing}`);
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
