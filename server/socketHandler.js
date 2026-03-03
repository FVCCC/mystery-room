/**
 * Socket.io 事件处理模块
 * 所有 WebSocket 事件的监听与分发
 */

const roomManager = require('./roomManager');
const gameEngine = require('./gameEngine');

function registerSocketEvents(io) {

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

      // 推送房间列表给新玩家（room.js 依赖此事件触发 join_room）
      socket.emit('room_list_update', { rooms: roomManager.getRoomList() });

      const player = roomManager.getPlayer(socket.id);
      io.to('lobby').emit('lobby_chat', {
        type: 'system',
        message: `🌟 ${player.nickname} 进入了大厅`,
        time: Date.now()
      });
    });

    // ─── 标记：即将跳转到房间页（不要在断开时删除房间）────
    socket.on('navigating_to_room', () => {
      const player = roomManager.getPlayer(socket.id);
      if (player) {
        player.navigatingToRoom = true;
        console.log(`[导航] ${player.nickname} 正在跳转到房间页，保留房间`);
      }
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

      socket.emit('room_joined', {
        room: getRoomPublicData(result.room),
        mySocketId: socket.id
      });

      if (!result.reconnected) {
        // 新玩家加入，通知房间内其他人
        socket.to(roomId).emit('player_joined', {
          socketId: socket.id,
          nickname: player.nickname,
          avatar: player.avatar
        });

        io.to(roomId).emit('room_chat', {
          type: 'system',
          message: `🎉 ${player.nickname} 加入了房间`,
          time: Date.now()
        });
      }

      io.to(roomId).emit('room_state_update', { room: getRoomPublicData(result.room) });
      io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });

      console.log(`[房间] ${player.nickname} ${result.reconnected ? '重连' : '加入'}房间 ${roomId}`);
    });

    // ─── 离开房间 ────────────────────────────────────────────
    socket.on('leave_room', (data) => {
      handleLeaveRoom(socket, data && data.roomId, false);
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
        io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      }
    });

    // ─── 提交答案 ─────────────────────────────────────────────
    socket.on('submit_answer', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const answer = (data.answer || '').trim();
      if (!answer) return;

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
        socket.emit('answer_wrong', { answer });
      }
    });

    // ─── 使用提示 ─────────────────────────────────────────────
    socket.on('use_hint', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const room = roomManager.getRoom(player.roomId);
      if (!room) return;

      const result = gameEngine.useHint(player.roomId, emitToRoom);
      if (!result.success) {
        socket.emit('error_msg', { message: result.error });
      }
    });

    // ─── 修改房间名（仅房主） ──────────────────────────────────
    socket.on('rename_room', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) {
        socket.emit('error_msg', { message: '你不在任何房间中' });
        return;
      }

      const result = roomManager.renameRoom(player.roomId, socket.id, data.newName);
      if (!result.success) {
        socket.emit('error_msg', { message: result.error });
        return;
      }

      io.to(player.roomId).emit('room_renamed', {
        roomName: result.room.roomName
      });

      io.to(player.roomId).emit('room_state_update', {
        room: getRoomPublicData(result.room)
      });

      io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      console.log(`[房间] ${player.nickname} 将房间 ${player.roomId} 改名为「${result.room.roomName}」`);
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
        if (player.navigatingToRoom) {
          // 玩家正在跳转到房间页，保留房间（不广播离开消息）
          roomManager.leaveRoom(socket.id, player.roomId, true /* preserveRoom */);
          console.log(`[导航] ${player.nickname} 跳转中，房间 ${player.roomId} 已保留`);
        } else {
          // 正常断开：处理离开逻辑
          handleLeaveRoom(socket, player.roomId, false);
        }
      }

      roomManager.removePlayer(socket.id);
    });

    // ─── 辅助：处理玩家离开房间 ──────────────────────────────
    function handleLeaveRoom(socket, roomId, preserveRoom = false) {
      if (!roomId) return;
      const player = roomManager.getPlayer(socket.id);
      const nickname = player ? player.nickname : '玩家';

      const room = roomManager.getRoom(roomId);
      if (room && room.status === 'playing') {
        gameEngine.onPlayerDisconnect(roomId, socket.id, emitToRoom);
      }

      const result = roomManager.leaveRoom(socket.id, roomId, preserveRoom);

      socket.leave(roomId);
      socket.join('lobby');

      if (result.deleted) {
        io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      } else if (result.success && result.room) {
        io.to(roomId).emit('player_left', { socketId: socket.id, nickname });
        io.to(roomId).emit('room_chat', {
          type: 'system',
          message: `👋 ${nickname} 离开了房间`,
          time: Date.now()
        });
        io.to(roomId).emit('room_state_update', { room: getRoomPublicData(result.room) });
        io.to('lobby').emit('room_list_update', { rooms: roomManager.getRoomList() });
      }

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
