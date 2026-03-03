/**
 * Socket.io 事件处理模块
 * 所有 WebSocket 事件的监听与分发
 */

const roomManager = require('./roomManager');
const gameEngine  = require('./gameEngine');
const aiMaster    = require('./aiMaster');
const trpgEngine  = require('./trpgEngine');
const trpgSave    = require('./trpgSave');

// 战役状态 Map<roomId, campaign>
const campaigns = new Map();

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

    // ════════════════════════════════════════════════════════
    //  TRPG / DND AI 跑团 事件
    // ════════════════════════════════════════════════════════

    // 获取可选场景+种族+职业数据
    socket.on('trpg_get_data', () => {
      socket.emit('trpg_data', {
        scenarios: trpgEngine.STORY_SCENARIOS,
        races:     trpgEngine.RACES,
        classes:   trpgEngine.CLASSES,
        backgrounds: trpgEngine.BACKGROUNDS,
        pointBuyCost: trpgEngine.POINT_BUY_COST,
        pointBuyBudget: trpgEngine.POINT_BUY_BUDGET,
        skillMap: trpgEngine.SKILL_MAP,
        classSkillCount: trpgEngine.CLASS_SKILL_COUNT
      });
    });

    // 创建跑团战役（房主选定场景后触发）
    socket.on('trpg_create', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const room = roomManager.getRoom(player.roomId);
      if (!room || room.ownerId !== socket.id) {
        socket.emit('error_msg', { message: '只有房主才能创建战役' });
        return;
      }
      const campaign = trpgEngine.createCampaign(data.scenarioId || 'dungeon_classic', player.roomId, player.nickname);
      campaigns.set(player.roomId, campaign);
      room.roomType = 'trpg';

      // 自动把已有 pendingCharacter 的成员写入战役
      (room.players || []).forEach(rp => {
        const rPlayer = roomManager.getPlayer(rp.socketId);
        if (rPlayer && rPlayer.pendingCharacter) {
          campaign.players.push({
            socketId: rp.socketId,
            nickname: rPlayer.nickname,
            avatar: rPlayer.avatar,
            character: rPlayer.pendingCharacter
          });
          console.log(`[TRPG] 自动载入 ${rPlayer.nickname} 的角色 ${rPlayer.pendingCharacter.name}`);
        }
      });

      io.to(player.roomId).emit('trpg_campaign_created', { campaign: sanitizeCampaign(campaign) });
      console.log(`[TRPG] ${player.nickname} 创建战役「${campaign.title}」，已载入 ${campaign.players.length} 个角色`);
    });

    // 提交角色创建（允许在战役创建前提交，会暂存到 player.pendingCharacter）
    socket.on('trpg_set_character', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      try {
        const character = trpgEngine.createCharacter(data);
        // 无论战役是否存在，先把角色暂存到玩家对象
        player.pendingCharacter = character;

        const campaign = campaigns.get(player.roomId);
        if (campaign) {
          // 战役已存在，直接写入
          const idx = campaign.players.findIndex(p => p.socketId === socket.id);
          if (idx !== -1) {
            campaign.players[idx].character = character;
            campaign.players[idx].nickname  = player.nickname;
          } else {
            campaign.players.push({ socketId: socket.id, nickname: player.nickname, avatar: player.avatar, character });
          }
          io.to(player.roomId).emit('trpg_campaign_updated', { campaign: sanitizeCampaign(campaign) });
        }
        // 无论如何都回复成功，让角色创建页可以正常跳转
        socket.emit('trpg_character_set', { character });
        console.log(`[TRPG] ${player.nickname} 创建角色：${character.name}（战役${campaign ? '已存在' : '待创建'}）`);
      } catch (e) {
        socket.emit('error_msg', { message: e.message });
      }
    });

    // 开始战役（房主触发，AI生成开场白）
    socket.on('trpg_start', async () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign) return;
      const room = roomManager.getRoom(player.roomId);
      if (!room || room.ownerId !== socket.id) { socket.emit('error_msg', { message: '只有房主才能开始' }); return; }

      campaign.status = 'playing';
      io.to(player.roomId).emit('trpg_started', { campaign: sanitizeCampaign(campaign) });
      io.to(player.roomId).emit('trpg_dm_typing', { typing: true });

      try {
        const opening = await aiMaster.getOpeningNarration(campaign);
        campaign.history.push({ role:'dm', content: opening, time: Date.now() });
        campaign.lastActivity = Date.now();
        io.to(player.roomId).emit('trpg_dm_message', { content: opening, time: Date.now() });
      } catch (e) {
        io.to(player.roomId).emit('trpg_dm_message', { content: `⚠️ AI DM 连接失败：${e.message}`, time: Date.now() });
      } finally {
        io.to(player.roomId).emit('trpg_dm_typing', { typing: false });
      }
    });

    // 玩家行动（AI回应）
    socket.on('trpg_action', async (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign || campaign.status !== 'playing') return;

      const action = (data.action || '').trim().substring(0, 500);
      if (!action) return;

      // 广播玩家行动给所有人
      io.to(player.roomId).emit('trpg_player_action', {
        socketId: socket.id, nickname: player.nickname, avatar: player.avatar,
        action, time: Date.now()
      });

      campaign.history.push({ role:'player', playerName: player.nickname, content: action, time: Date.now() });

      // 找角色信息（用于PC名称）
      const pc = campaign.players.find(p => p.socketId === socket.id);
      const charName = pc && pc.character ? pc.character.name : player.nickname;

      io.to(player.roomId).emit('trpg_dm_typing', { typing: true });

      try {
        const response = await aiMaster.getDMResponse(campaign, action, charName);
        const cleaned  = trpgEngine.cleanAIResponse(response);
        const directives = trpgEngine.parseAIDirectives(response);

        campaign.history.push({ role:'dm', content: cleaned, time: Date.now() });
        campaign.lastActivity = Date.now();

        // 处理指令
        for (const d of directives) {
          if (d.type === 'xp') {
            campaign.players.forEach(p => {
              if (p.character) { p.character.xp += d.amount; checkLevelUp(p.character, player.roomId, io); }
            });
          }
          if (d.type === 'loot') campaign.loot.push(d.item);
          if (d.type === 'check') {
            io.to(player.roomId).emit('trpg_check_required', { skill: d.skill, dc: d.dc, requestedBy: player.roomId });
          }
        }

        io.to(player.roomId).emit('trpg_dm_message', { content: cleaned, directives, time: Date.now() });

        // 每 5 条自动保存
        if (campaign.history.length % 5 === 0) trpgSave.saveCampaign(campaign);

      } catch (e) {
        io.to(player.roomId).emit('trpg_dm_message', { content: `⚠️ AI 响应失败：${e.message}`, time: Date.now() });
      } finally {
        io.to(player.roomId).emit('trpg_dm_typing', { typing: false });
      }
    });

    // 掷骰子（/roll d20+5 等）
    socket.on('trpg_roll', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;

      const notation = (data.notation || 'd20').trim();
      const result   = trpgEngine.rollDice(notation);
      if (!result) { socket.emit('error_msg', { message: `无效骰子格式：${notation}` }); return; }

      // 暴击/大失败判断
      let special = '';
      if (result.sides === 20 && result.rolls[0] === 20) special = '暴击！';
      if (result.sides === 20 && result.rolls[0] === 1)  special = '大失败！';

      io.to(player.roomId).emit('trpg_dice_result', {
        socketId: socket.id, nickname: player.nickname, avatar: player.avatar,
        notation: result.notation, rolls: result.rolls, modifier: result.modifier,
        total: result.total, special, time: Date.now()
      });
    });

    // 技能检定（带修正）
    socket.on('trpg_skill_check', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);

      const pc = campaign && campaign.players.find(p => p.socketId === socket.id);
      const char = pc && pc.character;
      const skill = data.skill || '感知';
      const stat  = trpgEngine.SKILL_MAP[skill] || 'WIS';
      const isProficient = char && char.skills && char.skills.includes(skill);
      const modifier = char
        ? trpgEngine.getModifier(char.stats[stat]) + (isProficient ? char.proficiencyBonus : 0)
        : 0;

      const r = trpgEngine.rollD20(modifier, data.advantage || 0);
      const dc = data.dc || 0;
      const success = dc === 0 ? null : r.total >= dc;

      io.to(player.roomId).emit('trpg_check_result', {
        socketId: socket.id, nickname: player.nickname, avatar: player.avatar,
        skill, stat, modifier, roll: r.roll, total: r.total,
        dc, success, isCritical: r.isCritical, isFumble: r.isFumble, time: Date.now()
      });
    });

    // 手动保存战役
    socket.on('trpg_save', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign) return;
      const res = trpgSave.saveCampaign(campaign);
      socket.emit('trpg_saved', res);
    });

    // 导出战役文本
    socket.on('trpg_export', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign) return;
      const text = trpgSave.exportAsText(campaign);
      socket.emit('trpg_export_data', { text, title: campaign.title });
    });

    // DM 更新场景描述
    socket.on('trpg_update_scene', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign) return;
      const room = roomManager.getRoom(player.roomId);
      if (room && room.ownerId !== socket.id) return;

      campaign.currentScene  = (data.scene  || campaign.currentScene).substring(0, 200);
      campaign.sessionNotes  = (data.notes  || campaign.sessionNotes).substring(0, 500);
      if (data.chapter) campaign.chapter = parseInt(data.chapter) || campaign.chapter;

      io.to(player.roomId).emit('trpg_scene_updated', {
        scene: campaign.currentScene, notes: campaign.sessionNotes, chapter: campaign.chapter
      });
    });

    // HP 修改
    socket.on('trpg_hp_change', (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign) return;
      const pc = campaign.players.find(p => p.socketId === socket.id);
      if (!pc || !pc.character) return;

      if (data.type === 'damage') trpgEngine.applyDamage(pc.character, parseInt(data.amount) || 0);
      if (data.type === 'heal')   trpgEngine.healCharacter(pc.character, parseInt(data.amount) || 0);
      if (data.type === 'set')    pc.character.hp.current = Math.max(0, Math.min(pc.character.hp.max, parseInt(data.amount) || 0));

      io.to(player.roomId).emit('trpg_campaign_updated', { campaign: sanitizeCampaign(campaign) });
    });

    // 生成 NPC
    socket.on('trpg_gen_npc', async (data) => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (!campaign) return;

      try {
        const npc = await aiMaster.generateNPC(campaign, data.hint || '一个神秘的路人');
        campaign.npcs.push({ name: data.hint, description: npc, addedAt: Date.now() });
        socket.emit('trpg_npc_generated', { npc });
      } catch (e) {
        socket.emit('error_msg', { message: `NPC生成失败：${e.message}` });
      }
    });

    // 获取战役当前状态
    socket.on('trpg_get_campaign', () => {
      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) return;
      const campaign = campaigns.get(player.roomId);
      if (campaign) socket.emit('trpg_campaign_created', { campaign: sanitizeCampaign(campaign) });
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

// ── TRPG 辅助函数 ─────────────────────────────────────────────

// 清理战役数据（去掉循环引用等）
function sanitizeCampaign(c) {
  return {
    campaignId:   c.campaignId,
    title:        c.title,
    setting:      c.setting,
    currentScene: c.currentScene,
    chapter:      c.chapter,
    sessionNotes: c.sessionNotes,
    status:       c.status,
    loot:         c.loot,
    npcs:         c.npcs,
    createdAt:    c.createdAt,
    lastActivity: c.lastActivity,
    players: (c.players || []).map(p => ({
      socketId:  p.socketId,
      nickname:  p.nickname,
      avatar:    p.avatar,
      character: p.character || null
    }))
  };
}

// 检查是否升级
function checkLevelUp(character, roomId, io) {
  const { levelUp } = require('./trpgEngine');
  const xpThresholds = [0,300,900,2700,6500,14000,23000,34000,48000,64000];
  const nextLevel = character.level + 1;
  if (nextLevel <= 20 && character.xp >= (xpThresholds[nextLevel - 1] || Infinity)) {
    const result = levelUp(character);
    if (result.leveled) {
      io.to(roomId).emit('trpg_level_up', {
        characterName: character.name,
        newLevel: result.level,
        hpGain: result.hpGain
      });
    }
  }
}

module.exports = { registerSocketEvents };
