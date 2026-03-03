/**
 * 大厅页逻辑
 * 房间列表、创建房间、大厅聊天
 */

document.addEventListener('DOMContentLoaded', () => {
  // 未登录则回首页
  if (!Session.isValid()) {
    window.location.href = '/';
    return;
  }

  // ── DOM 引用 ────────────────────────────────────
  const myAvatar        = document.getElementById('myAvatar');
  const myNickname      = document.getElementById('myNickname');
  const logoutBtn       = document.getElementById('logoutBtn');
  const createRoomBtn   = document.getElementById('createRoomBtn');
  const roomsList       = document.getElementById('roomsList');
  const roomsEmpty      = document.getElementById('roomsEmpty');
  const chatMessages    = document.getElementById('chatMessages');
  const chatInput       = document.getElementById('chatInput');
  const sendBtn         = document.getElementById('sendBtn');

  // 弹窗
  const createRoomOverlay = document.getElementById('createRoomOverlay');
  const roomNameInput     = document.getElementById('roomNameInput');
  const themeSelect       = document.getElementById('themeSelect');
  const maxPlayersSelect  = document.getElementById('maxPlayersSelect');
  const cancelCreateBtn   = document.getElementById('cancelCreateBtn');
  const confirmCreateBtn  = document.getElementById('confirmCreateBtn');

  // ── 初始化玩家信息显示 ───────────────────────────
  myAvatar.textContent   = Session.avatar;
  myNickname.textContent = Session.nickname;

  // 是否要创建跑团房间（区分跳转目标）
  let wantTrpg = false;

  // 创建跑团按钮
  const createTrpgBtn = document.getElementById('createTrpgBtn');
  if (createTrpgBtn) {
    createTrpgBtn.addEventListener('click', () => {
      wantTrpg = true;
      const roomName = `${Session.nickname}的跑团`;
      SocketClient.emit('create_room', { roomName, theme: 'DND跑团', maxPlayers: 4 });
    });
  }

  // ── 连接服务器 ───────────────────────────────────
  const socket = SocketClient.connect();

  // 连接成功后进入大厅
  socket.on('connect', () => {
    SocketClient.emit('join_lobby', {
      nickname: Session.nickname,
      avatar: Session.avatar
    });
  });

  // ── Socket 事件监听 ──────────────────────────────

  // 房间列表更新
  socket.on('room_list_update', ({ rooms }) => {
    renderRoomList(rooms);
  });

  // 大厅聊天消息
  socket.on('lobby_chat', (msg) => {
    appendLobbyMessage(msg);
  });

  // 成功加入房间 → 跳转
  socket.on('room_joined', ({ room }) => {
    Session.saveRoom(room.roomId);
    SocketClient.emit('navigating_to_room');
    setTimeout(() => {
      // 跑团房间进角色创建页，普通房间进密室页
      window.location.href = wantTrpg ? '/character-create.html' : '/room.html';
    }, 150);
  });

  // ── 房间列表渲染 ─────────────────────────────────
  const themeIcons = {
    '古堡谜案': '🏰',
    '太空迷航': '🚀',
    '海底秘密': '🌊',
    '随机':     '🎲'
  };

  function renderRoomList(rooms) {
    // 移除旧卡片（保留 empty 提示）
    const oldCards = roomsList.querySelectorAll('.room-card');
    oldCards.forEach(c => c.remove());

    if (!rooms || rooms.length === 0) {
      roomsEmpty.style.display = 'flex';
      return;
    }

    roomsEmpty.style.display = 'none';

    rooms.forEach(room => {
      const card = createRoomCard(room);
      roomsList.appendChild(card);
    });
  }

  function createRoomCard(room) {
    const isDisabled = room.status !== 'waiting' || room.currentPlayers >= room.maxPlayers;
    const icon = themeIcons[room.theme] || '🎲';

    const card = document.createElement('div');
    card.className = `room-card${isDisabled ? ' room-card-disabled' : ''}`;
    card.dataset.roomId = room.roomId;

    // 玩家点阵
    let dots = '';
    for (let i = 0; i < room.maxPlayers; i++) {
      dots += `<span class="player-dot${i < room.currentPlayers ? ' filled' : ''}"></span>`;
    }

    const statusText = room.status === 'waiting' ? '等待中' : room.status === 'playing' ? '游戏中' : '已结束';
    const badgeClass = `badge-${room.status}`;

    card.innerHTML = `
      <div class="room-theme-icon">${icon}</div>
      <div class="room-info">
        <div class="room-name">${escapeHtml(room.roomName)}</div>
        <div class="room-meta">
          <span>${room.theme}</span>
          <span class="badge ${badgeClass}">${statusText}</span>
          <span class="room-players">
            <div class="players-bar">${dots}</div>
            ${room.currentPlayers}/${room.maxPlayers}
          </span>
        </div>
      </div>
      ${!isDisabled ? `<button class="btn btn-secondary btn-sm room-join-btn">加入</button>` : ''}
    `;

    if (!isDisabled) {
      card.addEventListener('click', () => joinRoom(room.roomId));
    }

    return card;
  }

  // ── 加入房间 ─────────────────────────────────────
  function joinRoom(roomId) {
    SocketClient.emit('join_room', { roomId });
  }

  // ── 创建房间弹窗 ─────────────────────────────────
  createRoomBtn.addEventListener('click', () => {
    roomNameInput.value = `${Session.nickname}的密室`;
    createRoomOverlay.classList.remove('hidden');
    roomNameInput.focus();
  });

  cancelCreateBtn.addEventListener('click', () => {
    createRoomOverlay.classList.add('hidden');
  });

  createRoomOverlay.addEventListener('click', (e) => {
    if (e.target === createRoomOverlay) createRoomOverlay.classList.add('hidden');
  });

  confirmCreateBtn.addEventListener('click', () => {
    const roomName  = roomNameInput.value.trim() || `${Session.nickname}的密室`;
    const theme     = themeSelect.value;
    const maxPlayers = parseInt(maxPlayersSelect.value);

    SocketClient.emit('create_room', { roomName, theme, maxPlayers });
    createRoomOverlay.classList.add('hidden');
  });

  // ── 大厅聊天 ─────────────────────────────────────
  sendBtn.addEventListener('click', sendLobbyMessage);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendLobbyMessage();
    }
  });

  // 表情按钮
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value += btn.dataset.emoji;
      chatInput.focus();
    });
  });

  function sendLobbyMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    SocketClient.emit('lobby_chat', { message: msg });
    chatInput.value = '';
  }

  function appendLobbyMessage(msg) {
    if (msg.type === 'system') {
      const el = document.createElement('div');
      el.className = 'msg-system';
      el.textContent = msg.message;
      chatMessages.appendChild(el);
    } else {
      const isSelf = msg.socketId === SocketClient.id;
      const bubble = document.createElement('div');
      bubble.className = `msg-bubble${isSelf ? ' self' : ''}`;
      bubble.innerHTML = `
        <div class="msg-avatar-wrap">${escapeHtml(msg.avatar || '🧙')}</div>
        <div class="msg-content">
          <div class="msg-meta">${escapeHtml(msg.nickname)} · ${formatTime(msg.time)}</div>
          <div class="msg-text">${escapeHtml(msg.message)}</div>
        </div>
      `;
      chatMessages.appendChild(bubble);
    }

    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ── 退出 ─────────────────────────────────────────
  logoutBtn.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = '/';
  });

  // ── 工具函数 ─────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
