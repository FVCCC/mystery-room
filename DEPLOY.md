# 🚀 幻境密室 — 服务器部署指南

本项目是一个 Node.js 应用，支持多种部署方式。以下从简单到专业分三种方案介绍。

---

## 方案一：云服务器部署（推荐 · 完全控制）

适合：有 Linux 云服务器（阿里云/腾讯云/华为云等）

### 第一步：购买云服务器

推荐配置（够用）：
- **系统**：Ubuntu 22.04 LTS
- **CPU**：1核
- **内存**：1GB
- **带宽**：1Mbps
- **费用**：约 ¥40~80/月

> 安全组/防火墙需要开放 **3000 端口**（TCP）

---

### 第二步：连接服务器

用 SSH 工具连接（推荐 [FinalShell](http://www.hostbuf.com/) 或 [MobaXterm](https://mobaxterm.mobatek.net/)）

```bash
ssh root@你的服务器IP
```

---

### 第三步：安装 Node.js

```bash
# 更新包列表
apt update

# 安装 Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 验证安装
node -v    # 应显示 v18.x.x
npm -v     # 应显示 9.x.x
```

---

### 第四步：上传项目文件

**方式A：使用 FinalShell 直接拖拽上传**
1. 打开 FinalShell，连接服务器
2. 在下方文件面板，导航到 `/var/www/`
3. 把本地 `chat-game` 文件夹整体拖拽上传

**方式B：使用 SCP 命令（Windows 命令行）**
```bash
# 在本机 cmd 中运行
scp -r "C:\Users\Administrator\Desktop\新建文件夹\chat-game" root@你的IP:/var/www/
```

**方式C：使用 Git（推荐）**
```bash
# 服务器上运行
mkdir -p /var/www
cd /var/www
git clone https://github.com/你的用户名/mystery-room.git chat-game
```

---

### 第五步：安装依赖并测试运行

```bash
cd /var/www/chat-game
npm install
node server/index.js
```

看到 `🎮 幻境密室服务器已启动` 说明正常！  
此时可通过 `http://你的IP:3000` 访问游戏（临时测试）。

按 `Ctrl+C` 停止。

---

### 第六步：安装 PM2（后台持久运行）

PM2 可以让应用在后台持续运行，服务器重启后自动恢复。

```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start /var/www/chat-game/server/index.js --name mystery-room

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status          # 查看运行状态
pm2 logs mystery-room  # 查看日志
pm2 restart mystery-room  # 重启
pm2 stop mystery-room     # 停止
```

---

### 第七步：配置 Nginx 反向代理（可选但推荐）

安装 Nginx 后可以用 80 端口访问，并支持绑定域名。

```bash
# 安装 Nginx
apt install -y nginx

# 创建配置文件
nano /etc/nginx/sites-available/mystery-room
```

粘贴以下内容（将 `你的域名` 替换为实际域名或服务器IP）：

```nginx
server {
    listen 80;
    server_name 你的域名;   # 或者填写 _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 启用配置
ln -s /etc/nginx/sites-available/mystery-room /etc/nginx/sites-enabled/
nginx -t         # 测试配置
systemctl restart nginx  # 重启 Nginx
```

完成后可直接用 `http://你的域名` 访问！

---

### 第八步：配置 HTTPS（强烈推荐）

使用 Let's Encrypt 免费证书（需要先绑定域名）：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d 你的域名
```

之后就可以用 `https://你的域名` 访问了！

---

## 方案二：免费云平台部署（无需购买服务器）

适合：个人测试/展示，免费但有限制

### Railway（推荐）

Railway 支持 Node.js，免费额度每月 $5。

1. 访问 [railway.app](https://railway.app) 并注册
2. 新建项目 → `Deploy from GitHub`
3. 连接你的 GitHub 仓库（需先上传代码）
4. 添加环境变量：`PORT = 3000`
5. 部署完成后会自动生成 HTTPS 域名

### Render（备选）

1. 访问 [render.com](https://render.com) 并注册
2. 新建 Web Service → 连接 GitHub 仓库
3. **Build Command**: `npm install`
4. **Start Command**: `node server/index.js`
5. 选择免费套餐，点击部署

> ⚠️ 免费套餐会在30分钟无访问后自动休眠，首次访问较慢

---

## 方案三：上传到 GitHub，手动在服务器拉取

```bash
# 本地操作（先安装 Git）
cd "C:\Users\Administrator\Desktop\新建文件夹\chat-game"
git init
git add .
git commit -m "初始提交：幻境密室游戏"
git remote add origin https://github.com/你的账号/mystery-room.git
git push -u origin main

# 服务器操作
cd /var/www
git clone https://github.com/你的账号/mystery-room.git chat-game
cd chat-game
npm install
pm2 start server/index.js --name mystery-room
```

---

## 部署后更新代码

```bash
# 服务器上执行
cd /var/www/chat-game
git pull              # 拉取最新代码
npm install           # 如果依赖有变化
pm2 restart mystery-room  # 重启服务
```

---

## 环境变量配置（可选）

可以在服务器上创建 `.env` 文件：

```bash
nano /var/www/chat-game/.env
```

内容：
```
PORT=3000
NODE_ENV=production
```

在 `server/index.js` 开头加一行：
```js
require('dotenv').config();
```

---

## 常见问题

### Q: 访问不了，提示连接超时？
A: 检查云服务器的**安全组/防火墙**是否开放了 3000 端口（或80端口）

### Q: 用了 Nginx 后 Socket.io 断线？
A: 确保 Nginx 配置中包含了 `Upgrade` 和 `Connection` 头，参考上方配置。

### Q: 如何让多人从外网访问？
A: 必须部署到**公网服务器**，本地运行只能局域网访问。

### Q: 免费方案稳定吗？
A: 免费方案有流量和并发限制，小规模使用没问题，正式运营建议购买云服务器。

---

## 推荐部署流程（速查）

```
买云服务器 → 安装 Node.js → 上传代码 → npm install → pm2 start → 配置 Nginx → 申请 HTTPS
```

**最快上手**：直接用 Railway，10分钟完成部署，无需购买服务器。  
**最稳定**：阿里云/腾讯云 2核2G 服务器 + Nginx + PM2 + HTTPS。

---

*如有问题，可根据错误日志排查，或参考各云平台官方文档。*
