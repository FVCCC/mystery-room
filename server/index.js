/**
 * 幻境密室 — 服务器入口
 * Express + Socket.io
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { registerSocketEvents } = require('./socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// 托管前端静态资源
app.use(express.static(path.join(__dirname, '../public')));

// 默认路由：返回首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 注册 Socket.io 事件
registerSocketEvents(io);

// 启动服务器
server.listen(PORT, () => {
  console.log('');
  console.log('  🎮 幻境密室服务器已启动');
  console.log(`  📡 地址：http://localhost:${PORT}`);
  console.log('  💡 提示：可同时开多个浏览器标签模拟多人游戏');
  console.log('');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n服务器正在关闭...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
