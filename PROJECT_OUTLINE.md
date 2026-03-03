# 🎮 幻境密室 — 多人在线聊天冒险游戏
## 项目总体大纲 (Project Outline)

---

## 一、项目概述

**项目名称**：幻境密室 (Mystery Room)  
**核心玩法**：多人实时聊天 + 协作/对抗解谜（文字冒险密室逃脱）  
**登录方式**：游客模式（输入昵称+选择头像，无需注册）  
**架构类型**：前后端分离，全栈 Node.js 工程  

### 游戏玩法简介
- 2~6 名玩家进入同一个主题密室房间
- 通过**实时聊天**讨论与协作
- 主持人（自动轮换或第一个进入的玩家）发布谜题/线索
- 其他玩家在聊天框中提交答案或投票
- 全员协作在限定时间内通关，获得积分（本局有效）
- 支持多个独立主题密室（场景不同，谜题不同）

---

## 二、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML5 + CSS3 + Vanilla JS | 无框架，轻量高效 |
| 实时通信 | Socket.io (客户端) | 聊天/游戏状态同步 |
| 后端运行时 | Node.js | 服务器核心 |
| 后端框架 | Express.js | HTTP路由、静态资源托管 |
| 实时通信 | Socket.io (服务端) | 多人同步引擎 |
| 数据存储 | 内存 (Map/Object) | 游客模式无需持久化 |
| 包管理 | npm | 依赖管理 |

---

## 三、目录结构

```
chat-game/
├── PROJECT_OUTLINE.md          # 本文件（项目大纲）
├── package.json                # Node.js 项目配置
├── server/
│   ├── index.js                # 服务器入口
│   ├── socketHandler.js        # Socket.io 事件处理
│   ├── roomManager.js          # 房间管理逻辑
│   ├── gameEngine.js           # 游戏核心逻辑（谜题/状态机）
│   └── data/
│       └── puzzles.js          # 谜题数据库
├── public/                     # 前端静态资源（Express托管）
│   ├── index.html              # 首页（欢迎+进入入口）
│   ├── lobby.html              # 游戏大厅（房间列表）
│   ├── room.html               # 游戏房间（聊天+游戏区）
│   ├── css/
│   │   ├── global.css          # 全局样式（变量、重置）
│   │   ├── index.css           # 首页样式
│   │   ├── lobby.css           # 大厅样式
│   │   └── room.css            # 房间样式
│   └── js/
│       ├── socket-client.js    # Socket.io 客户端封装
│       ├── index.js            # 首页逻辑（昵称/头像选择）
│       ├── lobby.js            # 大厅逻辑（房间列表/创建）
│       └── room.js             # 房间逻辑（聊天+游戏互动）
└── README.md                   # 项目启动说明
```

---

## 四、功能模块详细说明

### 4.1 首页 (index.html)
**功能**：
- 显示游戏 Logo、标题、简短介绍
- 输入昵称（2-10个字符，必填）
- 选择头像（预设 8 个像素风头像图标）
- 点击"进入游戏"按钮跳转至大厅
- 昵称和头像存入 `sessionStorage`

**UI元素**：
- 全屏背景（神秘暗色星空/迷雾）
- 居中卡片输入框
- 头像选择区（圆形可点击）
- 发光的"进入游戏"按钮

---

### 4.2 游戏大厅 (lobby.html)
**功能**：
- 顶部：显示当前玩家昵称和头像
- 房间列表（从服务器实时获取）：
  - 显示：房间名、主题、当前人数/最大人数、状态（等待中/游戏中）
  - 可点击加入（游戏中的房间不可加入）
- 创建房间弹窗：
  - 输入房间名
  - 选择主题（古堡谜案 / 太空迷航 / 海底秘密 / 随机）
  - 选择最大人数（2~6人）
- 全局大厅聊天区（所有在大厅的玩家可聊天）
- 实时更新房间列表（Socket 推送）

**UI元素**：
- 左侧：房间列表区
- 右侧：大厅聊天区
- 顶部工具栏
- 悬浮"创建房间"按钮

---

### 4.3 游戏房间 (room.html)
**功能区域分为三栏**：

#### 左侧 — 玩家列表
- 显示所有玩家（头像+昵称+状态）
- 房主有皇冠图标
- 已答对的玩家有对勾标记
- 游戏开始按钮（仅房主可见，人数≥2时可点）

#### 中间 — 游戏主区域
**等待阶段**：
- 房间信息（主题、倒计时）
- 等待玩家加入提示

**游戏阶段**：
- 当前谜题编号（如：第 2 关 / 共 5 关）
- 密室主题场景描述（文字+emoji装饰）
- 谜题题目（醒目显示）
- 倒计时进度条
- 提示按钮（消耗提示次数，显示谜题提示）
- 玩家得分排行（本局）

**结算阶段**：
- 通关成功/失败画面
- 各玩家得分展示
- 再来一局按钮（回到等待阶段）

#### 右侧 — 实时聊天区
- 聊天记录（支持系统消息、玩家消息、答案提交消息）
- 消息气泡（自己靠右，他人靠左）
- 底部输入框+发送按钮
- 快捷表情按钮（6个常用表情）
- **提交答案**：在聊天框输入 `/answer 答案` 或点击"提交答案"按钮
- 答对时全频道广播庆祝消息

---

### 4.4 后端模块说明

#### server/index.js（入口）
- 启动 Express + Socket.io 服务
- 托管 public 目录
- 监听端口（默认 3000）

#### server/roomManager.js（房间管理）
- 维护所有房间的 Map
- 支持：创建房间、加入房间、离开房间、获取房间列表
- 玩家离开时自动清理（房间为空则删除）
- 房主转移（原房主离开时转给下一个玩家）

#### server/gameEngine.js（游戏引擎）
- 游戏状态机：`waiting` → `playing` → `finished`
- 谜题顺序管理（从题库按主题随机抽取 5 道）
- 倒计时管理（每道题 90 秒）
- 答案校验（忽略大小写、全半角）
- 计分规则：
  - 答对：根据剩余时间计分（最高 100 分，最低 10 分）
  - 使用提示：本题最高分 -20
- 进入下一题：答对 or 超时

#### server/socketHandler.js（Socket事件）
- 监听事件清单：
  - `join_lobby` — 进入大厅
  - `create_room` — 创建房间
  - `join_room` — 加入房间
  - `leave_room` — 离开房间
  - `lobby_chat` — 大厅聊天
  - `room_chat` — 房间聊天
  - `start_game` — 开始游戏（房主）
  - `submit_answer` — 提交答案
  - `use_hint` — 使用提示
- 推送事件清单：
  - `room_list_update` — 房间列表更新
  - `room_state_update` — 房间状态更新
  - `game_start` — 游戏开始
  - `next_puzzle` — 新谜题
  - `answer_correct` — 有人答对
  - `game_over` — 游戏结束
  - `chat_message` — 收到聊天消息
  - `player_joined/left` — 玩家进出通知

#### server/data/puzzles.js（谜题数据库）
每个主题包含 8~10 道谜题，每道谜题包含：
```js
{
  id: 1,
  theme: "古堡谜案",
  question: "我有手但不能鼓掌，有面但不能梳妆，我能告诉你时间，却不能告诉你方向。我是什么？",
  hint: "它挂在墙上，滴答滴答响",
  answers: ["钟", "时钟", "挂钟", "clock"],
  timeLimit: 90
}
```

---

## 五、数据流示意图

```
玩家A(浏览器)                  服务器                  玩家B(浏览器)
    |                            |                          |
    |--- join_lobby -----------> |                          |
    |<-- room_list_update ------ |                          |
    |                            |                          |
    |--- create_room ----------> |                          |
    |<-- room_state_update ----- |                          |
    |                            |<--- join_room ---------- |
    |<-- player_joined --------- |                          |
    |                            |--- room_state_update --> |
    |                            |                          |
    |--- start_game -----------> |                          |
    |<-- game_start ------------ | --- game_start --------> |
    |<-- next_puzzle ----------- | --- next_puzzle -------> |
    |                            |                          |
    |--- submit_answer --------> |                          |
    |<-- answer_correct -------- | -- answer_correct -----> |
    |<-- next_puzzle ----------- | -- next_puzzle --------> |
```

---

## 六、UI设计规范

### 色彩方案（神秘暗色风格）
```
--bg-dark:        #0d0d1a   /* 主背景 - 深夜蓝 */
--bg-card:        #1a1a2e   /* 卡片背景 */
--bg-panel:       #16213e   /* 面板背景 */
--accent-primary: #e94560   /* 主强调色 - 霓虹红 */
--accent-second:  #0f3460   /* 次强调色 - 深蓝 */
--neon-blue:      #00d4ff   /* 霓虹蓝（发光效果）*/
--neon-green:     #39ff14   /* 霓虹绿（成功/答对）*/
--text-primary:   #e0e0e0   /* 主文字 */
--text-secondary: #8888aa   /* 次要文字 */
```

### 字体
- 标题：系统中文粗体
- 正文：'Microsoft YaHei', sans-serif
- 游戏场景文字：等宽字体（Courier New）增加代入感

### 动效规范
- 消息气泡：从下方 fadeIn（0.3s）
- 答对效果：全屏绿光闪烁 + 文字弹出
- 倒计时：进度条颜色随时间从绿→黄→红渐变
- 按钮：hover 时发光效果（box-shadow）

---

## 七、开发步骤（按此大纲逐步执行）

### ✅ Step 0: 生成本大纲文件
### ✅ Step 1: 初始化 Node.js 项目（package.json + 安装依赖）
### ✅ Step 2: 编写后端基础框架（index.js + Express静态托管）
### ✅ Step 3: 编写谜题数据库（puzzles.js）
### ✅ Step 4: 编写房间管理模块（roomManager.js）
### ✅ Step 5: 编写游戏引擎模块（gameEngine.js）
### ✅ Step 6: 编写 Socket 事件处理（socketHandler.js）
### ✅ Step 7: 编写前端首页（index.html + index.css + index.js）
### ✅ Step 8: 编写前端大厅页（lobby.html + lobby.css + lobby.js）
### ✅ Step 9: 编写前端房间页（room.html + room.css + room.js）
### ✅ Step 10: 编写全局样式和Socket客户端封装（global.css + socket-client.js）
### ✅ Step 11: 整体联调测试 + 编写 README.md — 服务器运行正常 ✓

---

## 八、启动方式（最终）

```bash
cd chat-game
npm install
npm start
# 浏览器打开 http://localhost:3000
# 可开多个浏览器标签模拟多人
```

---

*大纲版本：v1.0 | 生成日期：2024*
