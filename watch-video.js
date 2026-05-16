/**
 * GODLIKE 视频续期 v5
 * panel.godlike.host 账号密码登录 → 看广告续期 +90min
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const PANEL = 'https://panel.godlike.host';
const SERVER = '6ecbede2';
const EMAIL = process.env.GODLIKE_EMAIL;
const PASSWORD = process.env.GODLIKE_PASSWORD;

function setOutput(msg) {
  const gout = process.env.GITHUB_OUTPUT;
  if (gout) appendFileSync(gout, `msg<<EOF\n${msg}\nEOF\n`);
  console.log(msg);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('🎮 GODLIKE 视频续期 v5');

  if (!EMAIL || !PASSWORD) {
    setOutput('❌ 未配置 GODLIKE_EMAIL / GODLIKE_PASSWORD');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // ===== 1. 登录 =====
  console.log('🔐 登录...');
  await page.goto(`${PANEL}/auth/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // 点击 "Authorization" 按钮显示邮箱密码表单
  const authBtn = await page.$('button:has-text("Authorization")');
  if (authBtn) {
    await authBtn.click();
    await sleep(2000);
  }

  // 填写邮箱密码
  const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  const pwInput = await page.$('input[type="password"], input[name="password"]');

  if (!emailInput || !pwInput) {
    await page.screenshot({ path: '/tmp/godlike-no-form.png' });
    setOutput('❌ 未找到登录表单');
    await browser.close();
    process.exit(1);
  }

  await emailInput.fill(EMAIL);
  await pwInput.fill(PASSWORD);
  const loginBtn = await page.$('button:has-text("Login"), button[type="submit"]');
  if (loginBtn) await loginBtn.click();
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await sleep(3000);

  if (page.url().includes('login')) {
    setOutput('❌ 登录失败，请检查账号密码');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ 登录成功');

  // ===== 2. 打开服务器页面 =====
  console.log('📡 打开服务器...');
  await page.goto(`${PANEL}/server/${SERVER}`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);

  // 读取剩余时间
  const bodyText = await page.textContent('body');
  const timeMatch = bodyText.match(/suspended in (.+?)(?:\n|$)/i);
  console.log(`⏰ 剩余: ${timeMatch?.[1] || '未知'}`);

  // ===== 3. 点击 "Add 90 minutes" =====
  console.log('🔍 查找续期按钮...');
  const addBtn = await page.$('button:has-text("Add 90 minutes")');
  if (!addBtn) {
    // 可能还在冷却中
    const waitBtn = await page.$('button:has-text("Please wait")');
    if (waitBtn) {
      const waitText = await waitBtn.textContent();
      console.log(`⏳ 冷却中: ${waitText}`);
      setOutput(`⏳ GODLIKE 续期冷却中\n━━━━━━━━━━━━━━━\n🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n${waitText}`);
      await browser.close();
      return;
    }
    setOutput('❌ 未找到续期按钮');
    await browser.close();
    process.exit(1);
  }

  console.log('✅ 点击 Add 90 minutes');
  await addBtn.click();
  await sleep(2000);

  // ===== 4. 点击 "Watch advertisment" =====
  console.log('🔍 查看广告按钮...');
  const watchBtn = await page.$('button:has-text("Watch advertisment"), button:has-text("Watch advertisement")');
  if (!watchBtn) {
    await page.screenshot({ path: '/tmp/godlike-no-watch.png' });
    setOutput('❌ 未找到观看广告按钮');
    await browser.close();
    process.exit(1);
  }

  console.log('✅ 点击 Watch advertisment');
  await watchBtn.click();
  await sleep(5000);

  // ===== 5. 等待广告播放（约3-5分钟） =====
  console.log('⏳ 等待广告播放...');
  const adStart = Date.now();
  const maxAdWait = 6 * 60 * 1000; // 最多等6分钟

  while ((Date.now() - adStart) < maxAdWait) {
    await sleep(15000);
    const elapsed = Math.round((Date.now() - adStart) / 1000);

    try {
      const txt = await page.textContent('body');

      // 检查是否冷却结束（按钮恢复可点击）
      const waitBtn = await page.$('button:has-text("Please wait")');
      if (!waitBtn) {
        // 检查 "Add 90 minutes" 是否恢复
        const readyBtn = await page.$('button:has-text("Add 90 minutes")');
        if (readyBtn) {
          console.log(`✅ 广告完成! 按钮已恢复 (${elapsed}s)`);
          break;
        }
      }

      // 提取冷却时间
      const waitMatch = txt.match(/Please wait (\d+) minutes?/);
      if (waitMatch) {
        console.log(`⏳ ${elapsed}s - 还需等 ${waitMatch[1]} 分钟`);
      } else {
        console.log(`⏳ ${elapsed}s`);
      }
    } catch {
      console.log(`⏳ ${elapsed}s (检查失败)`);
    }
  }

  await page.screenshot({ path: '/tmp/godlike-done.png' });

  // ===== 6. 验证 =====
  console.log('🔍 验证...');
  await page.goto(`${PANEL}/server/${SERVER}`, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);
  const finalText = await page.textContent('body');
  const finalTime = finalText.match(/suspended in (.+?)(?:\n|$)/i);
  console.log(`📅 新剩余时间: ${finalTime?.[1] || '未知'}`);

  await browser.close();

  const timeCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  setOutput(`✅ GODLIKE 服务器续期成功\n━━━━━━━━━━━━━━━\n🕐 ${timeCN}\n⏰ 剩余: ${finalTime?.[1] || '未知'}\n🎮 +90 分钟`);
}

main().catch(err => {
  setOutput(`❌ GODLIKE 脚本错误: ${err.message}`);
  process.exit(1);
});
