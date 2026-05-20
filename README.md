# EpicHost Server Auto-Renew

🎮 自动续期 GODLIKE 免费 Minecraft 服务器

## 方案说明

### 公开页面版（当前方案）

通过 `godlike.cool/{id}` 公开续期页面续期，**不需要登录面板**。

**原理：**
1. 访问 `godlike.cool/{id}` 公开页面
2. 填写随机 Minecraft 用户名
3. 通过音频识别破解 reCAPTCHA
4. 提交表单续期

**优点：**
- 不依赖面板登录和广告系统
- 有 WARP 换 IP 机制，不怕 reCAPTCHA 封 IP
- reCAPTCHA 被封时自动换 IP 重试，最多 20 次

**缺点：**
- reCAPTCHA 音频识别不稳定，Google 经常改音频挑战
- 依赖较重（Chrome + Xvfb + WARP）

## 🚀 设置步骤

### 1. Fork 本仓库

### 2. 配置 Secrets

进入仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret 名称 | 说明 | 示例 |
|---|---|---|
| `GODLIKE_ID` | godlike.cool 页面 ID，多个用逗号分隔 | `abc123` |
| `TG_BOT_TOKEN` | Telegram Bot Token（用于通知） | `123456:ABC-DEF...` |
| `TG_CHAT_ID` | Telegram Chat ID（接收通知） | `123456789` |

### 3. 获取 GODLIKE_ID

访问你的 GODLIKE 服务器面板，找到公开续期页面 URL：
```
https://godlike.cool/你的ID
```
这个 ID 就是 `GODLIKE_ID` 的值。

### 4. 启用 Actions

进入仓库 **Actions** 页面，点击 **I understand my workflows, go ahead and enable them**

### 5. 运行时间

默认每 **6 小时**自动运行一次。

可手动在 Actions 页面点击 **Run workflow** 触发测试。

## ⚠️ 注意事项

- reCAPTCHA 音频识别成功率不稳定，不一定每次都能成功
- 被 reCAPTCHA 封 IP 时会自动用 WARP 换 IP 重试
- 每个 ID 最多重试 20 次
- 每次续期增加约 **1 小时**，24 小时累积上限
- 截图会保存为 Artifact，方便排查问题

## 📋 通知示例

续期成功后会收到 Telegram 通知：
```
✅ 续订成功

URL: https://godlike.cool/abc123
用户名: Alex1234

Godlike Host Public Page Renew
```

## 🔧 本地测试

```bash
# 安装依赖
pip install -r requirements.txt

# 需要 Chrome 和 Xvfb
sudo apt install google-chrome-stable xvfb ffmpeg

# 配置环境变量
export GODLIKE_ID="你的ID"
export TG_BOT_TOKEN="你的Bot Token"
export TG_CHAT_ID="你的Chat ID"

# 运行
python renew.py
```
