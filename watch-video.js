/**
 * GODLIKE 视频观看自动化 v4
 * 账号密码自动登录 → 观看视频 → 续期 +24h
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const WEB_URL = 'https://ultra.panel.godlike.host';
const SERVER_UUID = '6ecbede2-5f1f-4a55-892a-13bcc0972730';
const VIDEO_DURATION = 310;
const EMAIL = process.env.GODLIKE_EMAIL;
const PASSWORD = process.env.GODLIKE_PASSWORD;

function setOutput(msg) {
  const gout = process.env.GITHUB_OUTPUT;
  if (gout) appendFileSync(gout, `msg<<EOF\n${msg}\nEOF\n`);
  console.log(msg);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('🎮 GODLIKE 视频续期 v4 (账号密码登录)');

  if (!EMAIL || !PASSWORD) {
    setOutput('❌ 未配置 GODLIKE_EMAIL 或 GODLIKE_PASSWORD');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // ========== 1. 登录 ==========
  console.log('🔐 登录中...');
  await page.goto(`${WEB_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);
  await page.screenshot({ path: '/tmp/godlike-login.png', fullPage: true });

  // 看看登录页有什么
  const loginText = await page.textContent('body');
  console.log('登录页片段:', loginText.substring(0, 200));

  // 尝试找到 "Through login/password" 按钮并点击
  const pwBtn = await page.$('text=Through login/password') || await page.$('text=login/password') || await page.$('text=Password');
  if (pwBtn) {
    console.log('✅ 切换到密码登录');
    await pwBtn.click();
    await sleep(1000);
  }

  // 填写邮箱和密码
  const emailInput = await page.$('input[type="email"], input[name="email"], input[name="username"], input[placeholder*="email" i], input[placeholder*="Email" i]');
  const pwInput = await page.$('input[type="password"], input[name="password"]');

  if (emailInput && pwInput) {
    console.log('✅ 找到登录表单');
    await emailInput.fill(EMAIL);
    await pwInput.fill(PASSWORD);
    await sleep(500);

    // 点击登录按钮
    const submitBtn = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in"), button:has-text("登录")');
    if (submitBtn) {
      console.log('✅ 提交登录...');
      await submitBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await sleep(3000);
    }
  } else {
    console.log('⚠️ 未找到邮箱/密码输入框');
    // 可能只有 Discord OAuth，尝试其他方式
    const allInputs = await page.$$('input');
    for (const inp of allInputs) {
      const type = await inp.getAttribute('type');
      const name = await inp.getAttribute('name');
      const placeholder = await inp.getAttribute('placeholder');
      console.log(`  input: type=${type} name=${name} placeholder=${placeholder}`);
    }
  }

  const afterLoginUrl = page.url();
  console.log(`📍 登录后: ${afterLoginUrl}`);
  await page.screenshot({ path: '/tmp/godlike-after-login.png', fullPage: true });

  if (afterLoginUrl.includes('login') || afterLoginUrl.includes('auth')) {
    // 登录失败
    const errorText = await page.textContent('body');
    console.log('登录失败页面:', errorText.substring(0, 300));
    setOutput('❌ GODLIKE 登录失败\n━━━━━━━━━━━━━━━\n可能原因: 密码错误 / 只支持Discord登录 / 需要2FA');
    await browser.close();
    process.exit(1);
  }

  console.log('✅ 登录成功!');

  // ========== 2. 导航到服务器 ==========
  console.log('📡 打开服务器页面...');
  await page.goto(`${WEB_URL}/server/${SERVER_UUID}`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  const serverUrl = page.url();
  console.log(`📍 服务器页面: ${serverUrl}`);
  await page.screenshot({ path: '/tmp/godlike-server.png', fullPage: true });

  // ========== 3. 点击 Renew ==========
  console.log('🔍 查找 Renew...');
  let renewClicked = false;
  for (const sel of ['button:has-text("Renew")', 'text=Renew', 'button:has-text("Public Renewal")', 'a:has-text("Renew")']) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log(`✅ 点击: ${(await el.textContent()).trim()}`);
        await el.click();
        renewClicked = true;
        await sleep(2000);
        break;
      }
    } catch {}
  }

  if (!renewClicked) {
    console.log('⚠️ 未找到 Renew 按钮');
    await page.screenshot({ path: '/tmp/godlike-no-renew.png', fullPage: true });
  }

  await page.screenshot({ path: '/tmp/godlike-renew-popup.png', fullPage: true });

  // ========== 4. 点击视频观看 ==========
  console.log('🔍 查找视频按钮...');
  for (const sel of ['text=watching video', 'text=Watch Video', 'text=YouTube', 'text=+24 hours', 'button:has-text("video")', 'button:has-text("Watch")', 'button:has-text("watch")']) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        console.log(`✅ 点击视频: ${sel}`);
        await el.click();
        await sleep(2000);
        break;
      }
    } catch {}
  }

  await page.screenshot({ path: '/tmp/godlike-video-start.png', fullPage: true });

  // ========== 5. 等待视频播放 ==========
  console.log(`⏳ 等待视频 (${VIDEO_DURATION}秒)...`);
  const t0 = Date.now();
  while ((Date.now() - t0) < VIDEO_DURATION * 1000) {
    await sleep(15000);
    const s = Math.round((Date.now() - t0) / 1000);
    try {
      const txt = await page.textContent('body');
      if (txt.includes('+24') || txt.includes('renewed') || txt.includes('success') || txt.includes('完成') || txt.includes('获得') || txt.includes('earned') || txt.includes('added')) {
        console.log(`✅ 续期完成! (${s}s)`);
        break;
      }
      const pct = txt.match(/(\d+)%/);
      console.log(pct ? `📊 ${s}s ${pct[1]}%` : `⏳ ${s}s`);
    } catch { console.log(`⏳ ${s}s`); }
  }

  await page.screenshot({ path: '/tmp/godlike-done.png', fullPage: true });

  // ========== 6. 验证 ==========
  console.log('🔍 验证...');
  await page.goto(`${WEB_URL}/server/${SERVER_UUID}`, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const finalText = await page.textContent('body');
  
  // 提取剩余时间
  const timeMatch = finalText.match(/(\d+h\s*\d+m\s*\d+s)/);
  const timerMatch = finalText.match(/suspended in (.+?)(?:\s|$)/i);
  const remaining = timeMatch?.[1] || timerMatch?.[1] || '未知';
  console.log(`📅 剩余时间: ${remaining}`);

  await browser.close();

  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  setOutput(`✅ GODLIKE 服务器续期成功\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n⏰ 剩余: ${remaining}\n🎮 +24 小时`);
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
