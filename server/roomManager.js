/**
 * 房间管理模块
 * 负责创建、加入、离开房间，以及维护房间状态
 */

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

// 所有房间 Map<roomId, Room>
const rooms = new Map();

// 所有在线玩家 Map<socketId, Player>
const players = new Map();

/**
 * 创建或更新玩家信息
 */
function setPlayer(socketId, playerData) {
  players.set(socketId, { socketId, ...playerData, location: 'lobby' });
}

/**
 * 获取玩家信息
 */
function getPlayer(socketId) {
  return players.get(socketId);
}

/**
 * 删除玩家
 */
function removePlayer(socketId) {
  players.delete(socketId);
}

/**
 * 创建新房间
 */
function createRoom(creatorSocketId, options) {
  const { roomName, theme, maxPlayers = 4 } = options;
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  const creator = getPlayer(creatorSocketId);

  const room = {
    roomId,
    roomName: roomName || `${creator ? creator.nickname : '玩家'}的房间`,
    theme,
    maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 6),
    ownerId: creatorSocketId,
    ownerNickname: creator ? creator.nickname : '', // 记录房主昵称，用于重连时恢复身份
    players: [],
    status: 'waiting',
    gameState: null,
    createdAt: Date.now(),
    _preserveTimer: null
  };

  rooms.set(roomId, room);
  return room;
}

/**
 * 玩家加入房间
 * 支持重连：同昵称玩家加入时更新 socketId 和 ownerId
 */
function joinRoom(socketId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.status === 'playing') return { success: false, error: '游戏已开始，无法加入' };
  if (room.players.find(p => p.socketId === socketId)) return { success: false, error: '已在房间中' };

  const player = getPlayer(socketId);
  if (!player) return { success: false, error: '玩家信息不存在，请重新进入' };

  // 清除保留定时器（有玩家加入了）
  if (room._preserveTimer) {
    clearTimeout(room._preserveTimer);
    room._preserveTimer = null;
  }

  // ── 重连检测：同昵称玩家加入 ──────────────────────
  const existingIdx = room.players.findIndex(p => p.nickname === player.nickname);
  if (existingIdx !== -1) {
    const existing = room.players[existingIdx];
    const wasOwner = room.ownerId === existing.socketId;

    // 用新 socketId 替换旧的
    existing.socketId = socketId;
    existing.score = existing.score || 0;

    if (wasOwner) {
      room.ownerId = socketId;
      room.ownerNickname = player.nickname;
    }

    player.location = roomId;
    player.roomId = roomId;
    return { success: true, room, reconnected: true };
  }

  // ── 原房主重连（曾导航离开导致其 slot 被删除，但 ownerNickname 保留） ──
  if (player.nickname === room.ownerNickname) {
    // 取消宽限期计时器（房主回来了）
    if (room._ownerTimer) {
      clearTimeout(room._ownerTimer);
      room._ownerTimer = null;
    }
    // 恢复房主身份（可超过人数上限让房主回来）
    room.ownerId = socketId;
    room.players.unshift({
      socketId,
      nickname: player.nickname,
      avatar: player.avatar,
      score: 0,
      answered: false,
      isOwner: true
    });
    // 去掉其他人的房主标记
    for (let i = 1; i < room.players.length; i++) room.players[i].isOwner = false;
    player.location = roomId;
    player.roomId = roomId;
    console.log(`[房间] ${player.nickname} 原房主重连，恢复房主权`);
    return { success: true, room, reconnected: true };
  }

  // ── 正常加入 ───────────────────────────────────────
  if (room.players.length >= room.maxPlayers) return { success: false, error: '房间已满' };

  // 如果房间是空的（保留状态），第一个加入的成为房主
  const isFirst = room.players.length === 0;
  if (isFirst) {
    room.ownerId = socketId;
    room.ownerNickname = player.nickname;
  }

  room.players.push({
    socketId,
    nickname: player.nickname,
    avatar: player.avatar,
    score: 0,
    answered: false,
    isOwner: isFirst
  });

  player.location = roomId;
  player.roomId = roomId;

  return { success: true, room };
}

/**
 * 玩家离开房间
 * @param {boolean} preserveRoom - 为 true 时即使房间空了也不立即删除（用于页面导航场景）
 */
function leaveRoom(socketId, roomId, preserveRoom = false) {
  const room = rooms.get(roomId);
  if (!room) return { success: false };

  room.players = room.players.filter(p => p.socketId !== socketId);

  const player = getPlayer(socketId);
  if (player) {
    player.location = 'lobby';
    player.roomId = null;
  }

  // 房间为空
  if (room.players.length === 0) {
    if (preserveRoom) {
      // 保留房间 30 秒，等待玩家用新 socket 重连
      if (room._preserveTimer) clearTimeout(room._preserveTimer);
      room._preserveTimer = setTimeout(() => {
        if (rooms.has(roomId) && rooms.get(roomId).players.length === 0) {
          rooms.delete(roomId);
          console.log(`[房间] ${roomId} 保留超时，已删除`);
        }
      }, 30000);
      return { success: true, preserved: true };
    }

    rooms.delete(roomId);
    return { success: true, deleted: true };
  }

  // 房主离开，转移房主
  if (room.ownerId === socketId && room.players.length > 0) {
    if (preserveRoom) {
      // 导航中：不立即转移房主，保留 ownerNickname 供重连识别
      // 15 秒宽限期后若原房主未重连才真正转移
      if (room._ownerTimer) clearTimeout(room._ownerTimer);
      room._ownerTimer = setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.ownerId === socketId && r.players.length > 0) {
          r.ownerId = r.players[0].socketId;
          r.ownerNickname = r.players[0].nickname;
          r.players[0].isOwner = true;
          console.log(`[房间] ${roomId} 房主重连超时，转移到 ${r.players[0].nickname}`);
        }
        if (r) r._ownerTimer = null;
      }, 15000);
    } else {
      // 永久离开：立即转移
      room.ownerId = room.players[0].socketId;
      room.ownerNickname = room.players[0].nickname;
      room.players[0].isOwner = true;
    }
  }

  return { success: true, room };
}

/**
 * 获取房间公开信息列表（大厅显示）
 * 只显示有玩家在的房间
 */
function getRoomList() {
  return Array.from(rooms.values())
    .filter(room => room.players.length > 0) // 不显示保留中的空房间
    .map(room => ({
      roomId: room.roomId,
      roomName: room.roomName,
      theme: room.theme,
      currentPlayers: room.players.length,
      maxPlayers: room.maxPlayers,
      status: room.status
    }));
}

/**
 * 获取房间完整信息
 */
function getRoom(roomId) {
  return rooms.get(roomId);
}

/**
 * 更新房间游戏状态
 */
function updateRoomGameState(roomId, gameState) {
  const room = rooms.get(roomId);
  if (room) {
    room.gameState = gameState;
    room.status = gameState ? gameState.status : 'waiting';
  }
}

/**
 * 修改房间名称（仅房主可操作）
 */
function renameRoom(roomId, socketId, newName) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.ownerId !== socketId) return { success: false, error: '只有房主才能修改房间名' };
  if (room.status !== 'waiting') return { success: false, error: '游戏进行中无法修改房间名' };

  const trimmed = (newName || '').trim().substring(0, 20);
  if (!trimmed) return { success: false, error: '房间名不能为空' };

  room.roomName = trimmed;
  return { success: true, room };
}

/**
 * 重置房间到等待状态
 */
function resetRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.status = 'waiting';
  room.gameState = null;
  room.players.forEach(p => {
    p.score = 0;
    p.answered = false;
  });
}

module.exports = {
  setPlayer,
  getPlayer,
  removePlayer,
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomList,
  getRoom,
  updateRoomGameState,
  renameRoom,
  resetRoom
};
