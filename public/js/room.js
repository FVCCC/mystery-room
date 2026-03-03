/**
 * 游戏房间页逻辑
 * 玩家列表、游戏状态机、答案提交、聊天
 */

document.addEventListener('DOMContentLoaded', () => {
  // 未登录或无房间信息则返回
  if (!Session.isValid()) {
    window.location.href = '/';
    return;
  }
  if (!Session.roomId) {
    window.location.href = '/lobby.html';
    return;
  }

  // ── DOM 引用 ─────────────────────────────────────
  const myAvatarEl      = document.getElementById('myAvatar');
  const myNicknameEl    = document.getElementById('myNickname');
  const leaveBtn        = document.getElementById('leaveBtn');
  const roomNameDisplay = document.getElementById('roomNameDisplay');
  const roomThemeDisplay= document.getElementById('roomThemeDisplay');
  const playersList     = document.getElementById('playersList');
  const startArea       = document.getElementById('startArea');
  const startHint       = document.getElementById('startHint');
  const startBtn        = document.getElementById('startBtn');

  // 游戏状态面板
  const stateWaiting  = document.getElementById('stateWaiting');
  const statePlaying  = document.getElementById('statePlaying');
  const stateFinished = document.getElementById('stateFinished');
  const roomIdDisplay = document.getElementById('roomIdDisplay');
  const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');

  // 游戏元素
  const puzzleNum      = document.getElementById('puzzleNum');
  const puzzleTotal    = document.getElementById('puzzleTotal');
  const progressBar    = document.getElementById('progressBar');
  const timerCircle    = document.getElementById('timerCircle');
  const timerNum       = document.getElementById('timerNum');
  const timerBar       = document.getElementById('timerBar');
  const sceneDesc      = document.getElementById('sceneDesc');
  const puzzleQuestion = document.getElementById('puzzleQuestion');
  const hintBtn        = document.getElementById('hintBtn');
  const hintText       = document.getElementById('hintText');
  const answerInput    = document.getElementById('answerInput');
  const submitAnswerBtn= document.getElementById('submitAnswerBtn');
  const scoreList      = document.getElementById('scoreList');

  // 结算
  const resultTheme    = document.getElementById('resultTheme');
  const rankingsList   = document.getElementById('rankingsList');
  const playAgainBtn   = document.getElementById('playAgainBtn');
  const backLobbyBtn   = document.getElementById('backLobbyBtn');

  // 聊天
  const chatMessages   = document.getElementById('chatMessages');
  const chatInput      = document.getElementById('chatInput');
  const sendBtn        = document.getElementById('sendBtn');

  // 特效
  const correctOverlay = document.getElementById('correctOverlay');
  const correctText    = document.getElementById('correctText');
  const correctScore   = document.getElementById('correctScore');

  // ── 状态变量 ─────────────────────────────────────
  let mySocketId    = null;
  let roomData      = null;
  let timerInterval = null;
  let timeLeft      = 90;
  let timeLimit     = 90;
  let isOwner       = false;
  let hasAnswered   = false;

  // ── 初始化显示 ───────────────────────────────────
  myAvatarEl.textContent  = Session.avatar;
  myNicknameEl.textContent = Session.nickname;

  // ── 连接服务器 ───────────────────────────────────
  const socket = SocketClient.connect();

  socket.on('connect', () => {
    mySocketId = socket.id;
    // 重新进入大厅频道，然后加入房间
    SocketClient.emit('join_lobby', {
      nickname: Session.nickname,
      avatar: Session.avatar
    });
    // 等大厅注册完毕后加入房间
    setTimeout(() => {
      SocketClient.emit('join_room', { roomId: Session.roomId });
    }, 300);
  });

  // ── Socket 事件 ──────────────────────────────────

  // 加入房间成功
  socket.on('room_joined', ({ room, mySocketId: sid }) => {
    mySocketId = sid || socket.id;
    updateRoomData(room);
  });

  // 房间状态更新
  socket.on('room_state_update', ({ room }) => {
    updateRoomData(room);
  });

  // 有玩家加入
  socket.on('player_joined', ({ nickname }) => {
    appendChatSystem(`🎉 ${nickname} 加入了房间`);
  });

  // 有玩家离开
  socket.on('player_left', ({ nickname }) => {
    appendChatSystem(`👋 ${nickname} 离开了房间`);
  });

  // 房间聊天
  socket.on('room_chat', (msg) => {
    appendChatMessage(msg);
  });

  // 游戏开始
  socket.on('game_start', ({ theme, totalPuzzles, players }) => {
    Toast.show(`🎮 游戏开始！主题：${theme}`, 'success');
    hasAnswered = false;
    hintText.classList.add('hidden');
    hintBtn.disabled = false;
    answerInput.value = '';
    answerInput.disabled = false;
    submitAnswerBtn.disabled = false;
    showState('playing');
    puzzleTotal.textContent = totalPuzzles;

    // 更新得分列表
    renderScoreList(players);
  });

  // 新谜题
  socket.on('next_puzzle', ({ puzzleIndex, totalPuzzles, scene, question, timeLimit: tl }) => {
    puzzleNum.textContent   = puzzleIndex + 1;
    puzzleTotal.textContent = totalPuzzles;
    sceneDesc.textContent   = scene;
    puzzleQuestion.textContent = question;
    hintText.classList.add('hidden');
    hintBtn.disabled = false;
    answerInput.value   = '';
    answerInput.disabled = false;
    submitAnswerBtn.disabled = false;
    hasAnswered = false;

    // 进度条
    const pct = ((puzzleIndex) / totalPuzzles) * 100;
    progressBar.style.width = pct + '%';

    // 倒计时
    timeLimit = tl || 90;
    startTimer(timeLimit);

    // 系统消息
    appendChatSystem(`📜 第 ${puzzleIndex + 1} 题开始！${tl} 秒内回答`);
  });

  // 有人答对
  socket.on('answer_correct', ({ socketId, nickname, score, totalScore, answer, puzzleIndex }) => {
    // 停止倒计时
    stopTimer();

    // 禁用答题
    answerInput.disabled = true;
    submitAnswerBtn.disabled = true;

    // 更新得分
    if (roomData) {
      const p = roomData.players.find(pl => pl.socketId === socketId);
      if (p) p.score = totalScore;
      renderScoreList(roomData.players);
    }

    // 系统消息
    appendChatSystem(`✅ ${nickname} 答对了！答案是「${answer}」，获得 ${score} 分`, 'success');

    // 若是自己答对，显示特效
    if (socketId === mySocketId) {
      showCorrectEffect(nickname, score);
    } else {
      Toast.show(`${nickname} 答对了！+${score}分`, 'success');
    }
  });

  // 答案错误（只告知自己）
  socket.on('answer_wrong', () => {
    Toast.show('❌ 答案不对，再想想~', 'error');
    answerInput.select();
  });

  // 超时揭晓答案
  socket.on('puzzle_timeout', ({ answer, puzzleIndex }) => {
    stopTimer();
    answerInput.disabled = true;
    submitAnswerBtn.disabled = true;
    appendChatSystem(`⏰ 时间到！本题答案是「${answer}」`, 'timeout');
    Toast.show(`⏰ 时间到！答案是「${answer}」`, 'error');
    timerNum.textContent = '0';
    timerBar.style.width = '0%';
  });

  // 提示揭晓
  socket.on('hint_reveal', ({ hint }) => {
    hintText.textContent = `💡 提示：${hint}`;
    hintText.classList.remove('hidden');
    hintBtn.disabled = true;
    appendChatSystem(`💡 提示已揭晓：${hint}`);
  });

  // 游戏结束
  socket.on('game_over', ({ rankings, theme }) => {
    stopTimer();
    Session.clearRoom();

    resultTheme.textContent = `主题：${theme} | 共 ${rankings.length} 名冒险者参与`;
    renderRankings(rankings);
    showState('finished');

    // 控制"再来一局"按钮
    playAgainBtn.style.display = isOwner ? 'inline-flex' : 'none';

    appendChatSystem('🏁 游戏结束，查看最终排名！');
  });

  // 房间重置（再来一局）
  socket.on('room_reset', ({ room }) => {
    hasAnswered = false;
    hintText.classList.add('hidden');
    hintBtn.disabled = false;
    updateRoomData(room);
    showState('waiting');
    appendChatSystem('🔄 房间已重置，等待开始新一局');
    Toast.show('🔄 准备好迎接新的挑战！', 'success');
  });

  // ── 更新房间数据 ─────────────────────────────────
  function updateRoomData(room) {
    roomData = room;
    roomNameDisplay.textContent = room.roomName;
    roomThemeDisplay.textContent = room.theme;
    roomIdDisplay.textContent   = room.roomId;

    isOwner = (room.ownerId === mySocketId || room.ownerId === socket.id);

    // 玩家列表
    renderPlayerList(room.players, room.ownerId);

    // 开始按钮逻辑
    if (isOwner && room.status === 'waiting') {
      startArea.style.display = 'flex';
      const canStart = room.players.length >= 2;
      startBtn.disabled = !canStart;
      startHint.textContent = canStart
        ? '所有玩家准备好了！'
        : `还需要 ${2 - room.players.length} 名玩家`;
    } else {
      startArea.style.display = 'none';
    }

    // 根据状态显示对应面板
    if (room.status === 'waiting') showState('waiting');
    else if (room.status === 'playing') showState('playing');
    else if (room.status === 'finished') showState('finished');
  }

  // ── 渲染玩家列表 ─────────────────────────────────
  function renderPlayerList(players, ownerId) {
    playersList.innerHTML = '';
    players.forEach(p => {
      const isSelf  = p.socketId === mySocketId || p.socketId === socket.id;
      const isOwnerP= p.socketId === ownerId;

      const item = document.createElement('div');
      item.className = `player-item${isSelf ? ' me' : ''}`;
      item.innerHTML = `
        <div class="player-avatar-lg">
          ${escapeHtml(p.avatar || '🧙')}
          ${isOwnerP ? '<span class="player-crown">👑</span>' : ''}
        </div>
        <div class="player-info">
          <div class="player-nick">${escapeHtml(p.nickname)}${isSelf ? ' (我)' : ''}</div>
          <div class="player-score-sm">${p.score || 0} 分</div>
        </div>
        ${p.answered ? '<span class="player-check">✅</span>' : ''}
      `;
      playersList.appendChild(item);
    });
  }

  // ── 渲染得分榜 ───────────────────────────────────
  function renderScoreList(players) {
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    scoreList.innerHTML = sorted.map((p, i) => `
      <div class="score-item">
        <span class="score-rank">${['🥇','🥈','🥉'][i] || i+1}</span>
        <span class="score-avatar">${escapeHtml(p.avatar || '🧙')}</span>
        <span class="score-name">${escapeHtml(p.nickname)}</span>
        <span class="score-pts">${p.score || 0} 分</span>
      </div>
    `).join('');
  }

  // ── 渲染结算排名 ─────────────────────────────────
  function renderRankings(rankings) {
    const medals = ['🥇','🥈','🥉'];
    rankingsList.innerHTML = rankings.map((p, i) => `
      <div class="rank-item" style="animation-delay:${i*0.1}s">
        <span class="rank-medal">${medals[i] || `#${p.rank}`}</span>
        <span class="rank-avatar">${escapeHtml(p.avatar || '🧙')}</span>
        <span class="rank-name">${escapeHtml(p.nickname)}</span>
        <span class="rank-score">${p.score} 分</span>
      </div>
    `).join('');
  }

  // ── 显示状态面板 ─────────────────────────────────
  function showState(state) {
    stateWaiting.classList.add('hidden');
    statePlaying.classList.add('hidden');
    stateFinished.classList.add('hidden');

    if (state === 'waiting')  stateWaiting.classList.remove('hidden');
    if (state === 'playing')  statePlaying.classList.remove('hidden');
    if (state === 'finished') stateFinished.classList.remove('hidden');
  }

  // ── 倒计时 ───────────────────────────────────────
  function startTimer(total) {
    stopTimer();
    timeLeft = total;
    timeLimit = total;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) stopTimer();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    timerNum.textContent = timeLeft;
    const pct = (timeLeft / timeLimit) * 100;
    timerBar.style.width = pct + '%';

    timerCircle.classList.remove('warn', 'danger');
    if (pct <= 20) {
      timerCircle.classList.add('danger');
      timerBar.style.background = 'var(--accent-primary)';
    } else if (pct <= 40) {
      timerCircle.classList.add('warn');
      timerBar.style.background = 'linear-gradient(90deg, var(--neon-yellow), orange)';
    } else {
      timerBar.style.background = 'linear-gradient(90deg, var(--neon-green), var(--neon-blue))';
    }
  }

  // ── 答对特效 ─────────────────────────────────────
  function showCorrectEffect(nickname, score) {
    correctText.textContent = `${nickname} 答对了！`;
    correctScore.textContent = `+${score} 分`;
    correctOverlay.classList.remove('hidden');
    setTimeout(() => {
      correctOverlay.classList.add('hidden');
    }, 1800);
  }

  // ── 开始游戏 ─────────────────────────────────────
  startBtn.addEventListener('click', () => {
    SocketClient.emit('start_game');
  });

  // ── 提交答案 ─────────────────────────────────────
  submitAnswerBtn.addEventListener('click', submitAnswer);

  answerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAnswer();
  });

  function submitAnswer() {
    const answer = answerInput.value.trim();
    if (!answer) {
      Toast.show('请输入答案', 'error');
      return;
    }
    SocketClient.emit('submit_answer', { answer });
  }

  // ── 使用提示 ─────────────────────────────────────
  hintBtn.addEventListener('click', () => {
    SocketClient.emit('use_hint');
  });

  // ── 复制房间ID ───────────────────────────────────
  copyRoomIdBtn.addEventListener('click', () => {
    const id = roomIdDisplay.textContent;
    navigator.clipboard.writeText(id).then(() => {
      Toast.show('房间ID已复制！', 'success');
    }).catch(() => {
      Toast.show(`房间ID: ${id}`, 'info');
    });
  });

  // ── 再来一局 ─────────────────────────────────────
  playAgainBtn.addEventListener('click', () => {
    SocketClient.emit('play_again');
  });

  // ── 返回大厅 ─────────────────────────────────────
  backLobbyBtn.addEventListener('click', () => {
    leaveRoom();
  });

  leaveBtn.addEventListener('click', () => {
    leaveRoom();
  });

  function leaveRoom() {
    const rid = Session.roomId;
    Session.clearRoom();
    if (rid) SocketClient.emit('leave_room', { roomId: rid });
    window.location.href = '/lobby.html';
  }

  // ── 聊天 ─────────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value += btn.dataset.emoji;
      chatInput.focus();
    });
  });

  function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    SocketClient.emit('room_chat', { message: msg });
    chatInput.value = '';
  }

  function appendChatMessage(msg) {
    if (msg.type === 'system') {
      appendChatSystem(msg.message);
      return;
    }

    const isSelf   = msg.socketId === mySocketId || msg.socketId === socket.id;
    const isAnswer = msg.type === 'answer';

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble${isSelf ? ' self' : ''}${isAnswer ? ' answer' : ''}`;
    bubble.innerHTML = `
      <div class="msg-avatar-wrap">${escapeHtml(msg.avatar || '🧙')}</div>
      <div class="msg-content">
        <div class="msg-meta">${escapeHtml(msg.nickname)} · ${formatTime(msg.time)}</div>
        <div class="msg-text">${escapeHtml(msg.message)}</div>
      </div>
    `;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendChatSystem(text, type = '') {
    const el = document.createElement('div');
    el.className = `msg-system ${type}`;
    el.textContent = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ── 工具 ─────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
});
