# EpicHost Server Auto-Renew

🎮 自动续期 EpicHost 免费 Minecraft 服务器

通过 **GitHub Actions** 定时运行，利用 Pterodactyl API 自动续期，无需浏览器自动化。

## ✨ 特性

- **纯 API 调用** — 不需要 Playwright/Puppeteer，一个 curl 搞定
- **多服务器支持** — 逗号分隔配置多个服务器 UUID
- **零成本** — 利用 GitHub Actions 免费额度（每月 2000 分钟）
- **手动触发** — 支持手动点击运行测试

## 🚀 设置步骤

### 1. Fork 本仓库

### 2. 配置 Secrets

进入仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret 名称 | 说明 | 示例 |
|---|---|---|
| `PANEL_URL` | 面板地址 | `https://panel.epichost.pl` |
| `PTERODACTYL_TOKEN` | API Token（`ptlc_` 开头） | `ptlc_xxxx...` |
| `SERVER_UUIDS` | 服务器 UUID，多个用逗号分隔 | `2d775b58-5256-4b99-xxxx-xxxxxxxxxxxx` |

### 3. 获取 API Token

1. 登录 EpicHost 面板
2. 点击右上角头像 → **Account Settings**
3. 找到 **API Credentials** 标签
4. 点击 **Create API Key**
5. 复制 `ptlc_` 开头的 Token

### 4. 获取服务器 UUID

方法一：在面板的服务器控制台页面可以看到完整 UUID

方法二：用 API 查询：
```bash
curl -s -H "Authorization: Bearer ptlc_你的Token" \
  "https://panel.epichost.pl/api/client" | python3 -m json.tool
```

### 5. 启用 Actions

进入仓库 **Actions** 页面，点击 **I understand my workflows, go ahead and enable them**

### 6. 运行时间

默认每 **7 小时**自动运行一次（UTC 01:00, 08:00, 15:00, 22:00，即北京时间 09:00, 16:00, 23:00, 06:00）。

可手动修改 `.github/workflows/renew.yml` 中的 cron 表达式。

## ⚠️ 注意事项

- 每次续期增加 **8 小时**，每 **7 小时**续一次，留 1 小时余量
- API Token 不要泄露，泄露了立即在面板重新生成
- 如果 GitHub Actions IP 被封，需要配置代理（在 workflow 中添加 proxy 步骤）
