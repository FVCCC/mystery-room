/**
 * Socket.io 事件处理模块
 * 所有 WebSocket 事件的监听与分发
 */

const roomManager = require('./roomManager');
const gameEngine = require('./gameEngine');

/**
 * 注册 Socket 事件
 * @param {SocketIO.Server} io
 */
function registerSocketEvents(io) {

  /**
   * 全局 emit 工具函数（供游戏引擎回调使用）
   * @param {string} event 事件名
   * @param {object} data 数据
   * @param {string} roomId 目标房间
   */
  function emitToRoom(event, data, roomId) {
    io.to(roomId).emit(event, data);
  }

  io.on('connection', (socket) => {
    console.log(`[连接] ${socket.id} 已连接`);

    // ─── 进入大厅 ────────────────────────────────────────────
    socket.on('join_lobby', (data) => {
      const { nickname, avatar } = data || {};
      if (!nickname || nickname.trim().length < 1) {
        socket.emit('error_msg', { message: '昵称不能为空' });
        return;
      }

      roomManager.setPlayer(socket.id, {
        nickname: nickname.trim().substring(0, 10),
        avatar: avatar || '🧙'
      });

      socket.join('lobby');
      console.log(`[大厅] ${nickname} (${socket.id}) 进入大厅`);

      // 推送房间列表给新玩家
      socket.emit('room_list_update', { rooms: roomManager.getRoomList() });

      // 广播大厅人数变化
      const player = roomManager.getPlayer(socket.id);
      io.to('lobby').emit('lobby_chat', {
        type: 'system',
        message: `🌟 ${player.nickname} 进入了大厅`,
        time: Date.now()
      });
    });

    // ─── 大厅聊天 ────────────────────────────────────────────
    socket.on('lobby_chat', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player) return;

      const msg = (data.message || '').trim().substring(0, 200);
      if (!msg) return;

      io.to('lobby').emit('lobby_chat', {
        type: 'player',
        socketId: socket.id,
        nickname: player.nickname,
        avatar: player.avatar,
        message: msg,
        time: Date.now()
      });
    });

    // ─── 创建房间 ────────────────────────────────────────────
    socket.on('create_room', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player) {
        socket.emit('error_msg', { message: '请先进入大厅' });
        return;
      }

      const room = roomManager.createRoom(socket.id, {
        roomName: (data.roomName || '').trim().substring(0, 20),
        theme: data.theme || '古堡谜案',
        maxPlayers: data.maxPlayers || 4
      });

      // 创建后直接加入
      const joinResult = roomManager.joinRoom(socket.id, room.roomId);
      if (!joinResult.success) {
        socket.emit('error_msg', { message: joinResult.error });
        return;
      }

      socket.leave('lobby');
      socket.join(room.roomId);

      socket.emit('room_joined', {
        room: getRoomPublicData(joinResult.room),
        mySocketId: socket.id
      });

      // 更新大厅房间列表
      io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });

      console.log(`[房间] ${player.nickname} 创建并加入房间 ${room.roomId}`);
    });

    // ─── 加入房间 ────────────────────────────────────────────
    socket.on('join_room', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player) {
        socket.emit('error_msg', { message: '请先进入大厅' });
        return;
      }

      const { roomId } = data;
      const result = roomManager.joinRoom(socket.id, roomId);

      if (!result.success) {
        socket.emit('error_msg', { message: result.error });
        return;
      }

      socket.leave('lobby');
      socket.join(roomId);

      // 告知加入者房间完整信息
      socket.emit('room_joined', {
        room: getRoomPublicData(result.room),
        mySocketId: socket.id
      });

      // 告知房间内其他人有新玩家
      socket.to(roomId).emit('player_joined', {
        socketId: socket.id,
        nickname: player.nickname,
        avatar: player.avatar
      });

      // 系统消息
      io.to(roomId).emit('room_chat', {
        type: 'system',
        message: `🎉 ${player.nickname} 加入了房间`,
        time: Date.now()
      });

      // 推送最新房间状态给所有人
      io.to(roomId).emit('room_state_update', { room: getRoomPublicData(result.room) });

      // 更新大厅
      io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });

      console.log(`[房间] ${player.nickname} 加入房间 ${roomId}`);
    });

    // ─── 离开房间 ────────────────────────────────────────────
    socket.on('leave_room', (data) => {
      handleLeaveRoom(socket, data && data.roomId);
    });

    // ─── 房间聊天 ────────────────────────────────────────────
    socket.on('room_chat', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const msg = (data.message || '').trim().substring(0, 200);
      if (!msg) return;

      io.to(player.roomId).emit('room_chat', {
        type: 'player',
        socketId: socket.id,
        nickname: player.nickname,
        avatar: player.avatar,
        message: msg,
        time: Date.now()
      });
    });

    // ─── 开始游戏（仅房主） ───────────────────────────────────
    socket.on('start_game', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) {
        socket.emit('error_msg', { message: '你不在任何房间中' });
        return;
      }

      const room = roomManager.getRoom(player.roomId);
      if (!room) {
        socket.emit('error_msg', { message: '房间不存在' });
        return;
      }

      if (room.ownerId !== socket.id) {
        socket.emit('error_msg', { message: '只有房主才能开始游戏' });
        return;
      }

      const result = gameEngine.startGame(player.roomId, emitToRoom);
      if (!result.success) {
        socket.emit('error_msg', { message: result.error });
      } else {
        // 更新大厅
        io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      }
    });

    // ─── 提交答案 ─────────────────────────────────────────────
    socket.on('submit_answer', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const answer = (data.answer || '').trim();
      if (!answer) return;

      // 先在聊天区广播提交的答案（显示为尝试消息）
      io.to(player.roomId).emit('room_chat', {
        type: 'answer',
        socketId: socket.id,
        nickname: player.nickname,
        avatar: player.avatar,
        message: `🔍 尝试答案：${answer}`,
        time: Date.now()
      });

      const result = gameEngine.submitAnswer(player.roomId, socket.id, answer, emitToRoom);

      if (!result.success) {
        socket.emit('error_msg', { message: result.error });
      } else if (!result.correct) {
        // 答错，只告知提交者
        socket.emit('answer_wrong', { answer });
      }
    });

    // ─── 使用提示 ─────────────────────────────────────────────
    socket.on('use_hint', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const room = roomManager.getRoom(player.roomId);
      if (!room) return;

      // 任意玩家都可以请求提示
      const result = gameEngine.useHint(player.roomId, emitToRoom);
      if (!result.success) {
        socket.emit('error_msg', { message: result.error });
      }
    });

    // ─── 再来一局 ─────────────────────────────────────────────
    socket.on('play_again', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const room = roomManager.getRoom(player.roomId);
      if (!room || room.ownerId !== socket.id) {
        socket.emit('error_msg', { message: '只有房主才能重新开始' });
        return;
      }

      if (room.status !== 'finished') return;

      roomManager.resetRoom(player.roomId);

      io.to(player.roomId).emit('room_reset', {
        room: getRoomPublicData(roomManager.getRoom(player.roomId))
      });

      io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
    });

    // ─── 断开连接 ─────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[断开] ${socket.id} 已断开`);
      const player = roomManager.getPlayer(socket.id);
      if (player && player.roomId) {
        handleLeaveRoom(socket, player.roomId);
      }
      roomManager.removePlayer(socket.id);
    });

    // ─── 辅助：处理玩家离开房间 ──────────────────────────────
    function handleLeaveRoom(socket, roomId) {
      if (!roomId) return;
      const player = roomManager.getPlayer(socket.id);
      const nickname = player ? player.nickname : '玩家';

      // 游戏引擎处理断线
      const room = roomManager.getRoom(roomId);
      if (room && room.status === 'playing') {
        gameEngine.onPlayerDisconnect(roomId, socket.id, emitToRoom);
      }

      const result = roomManager.leaveRoom(socket.id, roomId);

      socket.leave(roomId);
      socket.join('lobby');

      if (result.deleted) {
        // 房间已删除
        io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      } else if (result.success && result.room) {
        // 通知房间内其他人
        io.to(roomId).emit('player_left', { socketId: socket.id, nickname });
        io.to(roomId).emit('room_chat', {
          type: 'system',
          message: `👋 ${nickname} 离开了房间`,
          time: Date.now()
        });
        io.to(roomId).emit('room_state_update', { room: getRoomPublicData(result.room) });
        io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      }

      // 给离开者推送大厅房间列表
      socket.emit('room_list_update', { rooms: roomManager.getRoomList() });
    }
  });
}

/**
 * 获取房间的公开数据（用于发送给客户端）
 */
function getRoomPublicData(room) {
  if (!room) return null;
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    theme: room.theme,
    maxPlayers: room.maxPlayers,
    ownerId: room.ownerId,
    status: room.status,
    players: room.players.map(p => ({
      socketId: p.socketId,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      answered: p.answered,
      isOwner: p.socketId === room.ownerId
    }))
  };
}

module.exports = { registerSocketEvents };
