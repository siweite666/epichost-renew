import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const ULTRA_URL = 'https://ultra.panel.godlike.host';
const API_URL = 'https://panel.godlike.host/api/v2';
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

async function getServerInfo(token) {
  try {
    const resp = await fetch(`${API_URL}/servers/${SERVER_ID}?locale=en`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) return { timer: 'unknown', status: 'unknown' };
    const data = await resp.json();
    const d = data.data || {};
    return {
      timer: d.free_timer || 'unknown',
      status: d.status || 'unknown',
      is_renewed: d.is_renewed || false,
      can_be_started: d.can_be_started || false
    };
  } catch { return { timer: 'unknown', status: 'unknown' }; }
}

async function doLogin(page) {
  const email = process.env.GODLIKE_EMAIL;
  const password = process.env.GODLIKE_PASSWORD;
  if (!email || !password) throw new Error('未配置 GODLIKE_EMAIL/PASSWORD');

  // Navigate to ultra panel server page (will redirect to login if not authenticated)
  await page.goto(`${ULTRA_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);

  // Check if already logged in (server page loaded with server content)
  const pageText = await page.textContent('body').catch(() => '');
  if (pageText.includes('Sc2mdpUo_436727') || pageText.includes('My Servers')) {
    console.log('✅ 已登录（session 有效）');
    return;
  }

  // Need to login - click "Through Login/Password" button
  const loginPassBtn = await page.$('button:has-text("Through Login/Password")');
  if (loginPassBtn && await loginPassBtn.isVisible().catch(() => false)) {
    console.log('🔐 使用账号密码登录...');
    await loginPassBtn.click();
    await sleep(2000);
  }

  // Fill credentials
  const emailSel = 'input[placeholder*="Email"], input[placeholder*="email"], input[name="email"], input[type="email"]';
  const passSel = 'input[type="password"], input[placeholder*="Password"], input[placeholder*="password"]';

  await page.waitForSelector(emailSel, { timeout: 10000 }).catch(() => {});
  await page.fill(emailSel, email);
  await page.fill(passSel, password);
  await sleep(500);

  // Click Login button
  await page.click('button:has-text("Login")');
  await sleep(5000);

  // Wait for redirect to server page
  try {
    await page.waitForURL(url => {
      const u = url.toString();
      return u.includes('ultra.panel.godlike.host') && !u.includes('/login');
    }, { timeout: 30000 });
  } catch {
    // If direct login didn't work, try OAuth
    console.log('⚠️ 直接登录可能失败，尝试 OAuth...');
    await page.goto(`${ULTRA_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);

    const authBtn = await page.$('a:has-text("Authorization"), button:has-text("Authorization")');
    if (authBtn && await authBtn.isVisible().catch(() => false)) {
      await authBtn.click();
      await sleep(5000);

      // Fill WHMCS credentials
      await page.waitForSelector('input[name="username"], input[type="email"]', { timeout: 10000 }).catch(() => {});
      await page.fill('input[name="username"], input[type="email"], input[placeholder*="Email"]', email);
      await page.fill('input[type="password"]', password);
      await sleep(500);
      await page.click('button:has-text("Login"), input[type="submit"]');
      await sleep(10000);
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(2000);

  const finalText = await page.textContent('body').catch(() => '');
  if (!finalText.includes('Sc2mdpUo_436727') && !finalText.includes('My Servers')) {
    throw new Error(`登录失败，当前页面: ${page.url()}`);
  }
  console.log(`✅ 登录完成，当前页面: ${page.url()}`);
}

async function extractToken(page) {
  // Try to get token from localStorage
  let token = await page.evaluate(() => localStorage.getItem('access_token'));
  if (token) {
    console.log(`🔑 从 localStorage 获取到 token: ${token.substring(0, 10)}...`);
    return token;
  }

  // If not in localStorage, intercept from network requests
  console.log('⏳ 等待 API 请求以捕获 token...');
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('无法获取 token')), 20000);
    page.on('request', req => {
      const auth = req.headers()['authorization'];
      if (auth && auth.startsWith('Bearer ptlc_')) {
        clearTimeout(timeout);
        const tk = auth.replace('Bearer ', '');
        console.log(`🔑 从网络请求捕获到 token: ${tk.substring(0, 10)}...`);
        resolve(tk);
      }
    });
    // Trigger a page reload to generate API requests
    page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  });
}

async function renewViaVideo(token) {
  console.log('🎬 开始视频续期流程...');

  // Step 1: Check if can watch
  const statusResp = await fetch(`${API_URL}/servers/${SERVER_UUID}/free-renewal/video/status?type=youtube_iter1&locale=en`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
  });
  const status = await statusResp.json();
  console.log(`📺 视频续期状态: can_watch=${status.can_watch}`);

  if (!status.can_watch) {
    const waitTime = status.time_until_next_video;
    return { success: false, message: `暂时不能看视频续期，需等待 ${waitTime || '未知时间'}` };
  }

  // Step 2: Start video session
  const startResp = await fetch(`${API_URL}/servers/${SERVER_UUID}/free-renewal/video/start?locale=en`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial_time: 0 })
  });
  const startData = await startResp.json();
  if (!startData.success) {
    return { success: false, message: `启动视频会话失败: ${startData.message}` };
  }
  const renewalUuid = startData.uuid;
  console.log(`✅ 视频会话已启动: ${renewalUuid}`);

  // Step 3: Update video time in 30s increments (server requires ~30s per update)
  let currentTime = 0;
  const milestone = 240; // 4 minutes required

  while (currentTime < milestone) {
    currentTime += 30;
    await sleep(500); // Small delay between requests

    const updateResp = await fetch(`${API_URL}/servers/${SERVER_UUID}/free-renewal/video/update-time?locale=en`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        renewal_uuid: renewalUuid,
        video_time_watched: currentTime,
        time_correction: 0
      })
    });
    const updateData = await updateResp.json();

    if (!updateData.success) {
      return { success: false, message: `上报观看进度失败 (${currentTime}s): ${updateData.message}` };
    }

    console.log(`⏱️ ${currentTime}/${milestone}s - ${updateData.message}`);

    if (updateData.new_free_timer) {
      console.log(`🎉 续期成功! 新到期时间: ${updateData.new_free_timer}`);
      return { success: true, newTimer: updateData.new_free_timer };
    }
  }

  return { success: false, message: '达到里程碑但未收到 new_free_timer' };
}

async function main() {
  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`🎮 GODLIKE 续期 (视频) 开始 — ${timeCN}`);

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

    // Navigate to server page to ensure token is in localStorage
    await page.goto(`${ULTRA_URL}/server/${SERVER_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    // Extract auth token
    const token = await extractToken(page);
    if (!token) throw new Error('无法获取认证 token');

    // Get current timer
    const infoBefore = await getServerInfo(token);
    console.log(`📅 当前到期时间: ${infoBefore.timer}`);

    // Check if server needs renewal
    if (infoBefore.status === null && infoBefore.can_be_started) {
      // Server is active, but let's try renewal anyway (might extend timer)
      console.log('ℹ️ 服务器状态正常，尝试续期延长...');
    }

    // Do the video renewal
    const result = await renewViaVideo(token);

    await browser.close();

    if (result.success) {
      setOutput(`✅ GODLIKE 续期成功 (+24小时)\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n📅 到期: ${infoBefore.timer} → ${result.newTimer}`);
    } else {
      setOutput(`❌ GODLIKE 续期失败\n${result.message}\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}`);
      process.exit(1);
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
