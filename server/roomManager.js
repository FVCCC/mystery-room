/**
 * 房间管理模块
 * 负责创建、加入、离开房间，以及维护房间状态
 */

const { v4: uuidv4 } = (() => {
  // 简单 UUID 生成，不依赖外部库
  const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };
  return { v4: uuidv4 };
})();

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
 * @param {string} creatorSocketId - 房主 socketId
 * @param {object} options - { roomName, theme, maxPlayers }
 * @returns {object} room
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
    players: [],
    status: 'waiting', // waiting | playing | finished
    gameState: null,
    createdAt: Date.now()
  };

  rooms.set(roomId, room);
  return room;
}

/**
 * 玩家加入房间
 * @returns {{ success: boolean, room?: object, error?: string }}
 */
function joinRoom(socketId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.status === 'playing') return { success: false, error: '游戏已开始，无法加入' };
  if (room.players.length >= room.maxPlayers) return { success: false, error: '房间已满' };
  if (room.players.find(p => p.socketId === socketId)) return { success: false, error: '已在房间中' };

  const player = getPlayer(socketId);
  if (!player) return { success: false, error: '玩家信息不存在，请重新进入' };

  room.players.push({
    socketId,
    nickname: player.nickname,
    avatar: player.avatar,
    score: 0,
    answered: false,
    isOwner: room.players.length === 0 // 第一个进入的是房主
  });

  if (player) {
    player.location = roomId;
    player.roomId = roomId;
  }

  return { success: true, room };
}

/**
 * 玩家离开房间
 * @returns {{ success: boolean, room?: object, deleted?: boolean }}
 */
function leaveRoom(socketId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return { success: false };

  room.players = room.players.filter(p => p.socketId !== socketId);

  const player = getPlayer(socketId);
  if (player) {
    player.location = 'lobby';
    player.roomId = null;
  }

  // 房间为空，删除
  if (room.players.length === 0) {
    rooms.delete(roomId);
    return { success: true, deleted: true };
  }

  // 房主离开，转移房主
  if (room.ownerId === socketId && room.players.length > 0) {
    room.ownerId = room.players[0].socketId;
    room.players[0].isOwner = true;
  }

  return { success: true, room };
}

/**
 * 获取房间公开信息列表（大厅显示）
 */
function getRoomList() {
  return Array.from(rooms.values()).map(room => ({
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
 * @param {string} roomId
 * @param {string} socketId - 操作者 socketId
 * @param {string} newName - 新房间名
 * @returns {{ success: boolean, room?: object, error?: string }}
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
