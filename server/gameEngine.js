/**
 * 游戏引擎模块
 * 管理游戏状态机、谜题流转、倒计时、计分
 */

const { getPuzzlesForTheme } = require('./data/puzzles');
const roomManager = require('./roomManager');

// 正在进行的游戏计时器 Map<roomId, TimerInfo>
const timers = new Map();

/**
 * 规范化答案（去空格、小写、全角转半角）
 */
function normalizeAnswer(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/　/g, ' ')
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/**
 * 检验答案是否正确
 */
function checkAnswer(userAnswer, correctAnswers) {
  const normalized = normalizeAnswer(userAnswer);
  return correctAnswers.some(a => normalizeAnswer(a) === normalized);
}

/**
 * 计算得分（基于剩余时间）
 */
function calcScore(timeLeft, timeLimit, usedHint) {
  const ratio = timeLeft / timeLimit;
  let score = Math.max(10, Math.round(ratio * 100));
  if (usedHint) score = Math.max(10, score - 20);
  return score;
}

/**
 * 开始一局游戏
 * @param {string} roomId
 * @param {function} emitFn - (event, data, roomId) => void
 * @returns {{ success: boolean, error?: string }}
 */
function startGame(roomId, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.status !== 'waiting') return { success: false, error: '游戏已经开始' };
  if (room.players.length < 2) return { success: false, error: '至少需要2名玩家才能开始' };

  const theme = room.theme === '随机'
    ? ['古堡谜案', '太空迷航', '海底秘密'][Math.floor(Math.random() * 3)]
    : room.theme;

  const puzzleList = getPuzzlesForTheme(theme);

  if (!puzzleList || puzzleList.length === 0) {
    return { success: false, error: '谜题加载失败' };
  }

  const gameState = {
    status: 'playing',
    theme,
    puzzles: puzzleList,
    currentPuzzleIndex: 0,
    totalPuzzles: puzzleList.length,
    startTime: Date.now(),
    hintUsed: false,
    solved: false
  };

  // 重置玩家分数
  room.players.forEach(p => {
    p.score = 0;
    p.answered = false;
  });

  roomManager.updateRoomGameState(roomId, gameState);

  // 推送游戏开始事件
  emitFn('game_start', {
    theme,
    totalPuzzles: puzzleList.length,
    players: room.players.map(p => ({ socketId: p.socketId, nickname: p.nickname, avatar: p.avatar, score: 0 }))
  }, roomId);

  // 推送第一道题
  startPuzzleTimer(roomId, emitFn);

  return { success: true };
}

/**
 * 开始当前谜题的倒计时
 */
function startPuzzleTimer(roomId, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.gameState) return;

  const gs = room.gameState;
  const puzzle = gs.puzzles[gs.currentPuzzleIndex];
  if (!puzzle) {
    endGame(roomId, emitFn);
    return;
  }

  gs.hintUsed = false;
  gs.solved = false;
  gs.puzzleStartTime = Date.now();
  gs.currentTimeLimit = puzzle.timeLimit;

  // 重置玩家本题状态
  room.players.forEach(p => p.answered = false);

  // 推送题目
  emitFn('next_puzzle', {
    puzzleIndex: gs.currentPuzzleIndex,
    totalPuzzles: gs.totalPuzzles,
    scene: puzzle.scene,
    question: puzzle.question,
    timeLimit: puzzle.timeLimit
  }, roomId);

  // 清除旧计时器
  clearRoomTimer(roomId);

  // 设置超时计时器
  const timer = setTimeout(() => {
    // 超时，进入下一题
    const roomNow = roomManager.getRoom(roomId);
    if (!roomNow || !roomNow.gameState || roomNow.gameState.status !== 'playing') return;

    emitFn('puzzle_timeout', {
      puzzleIndex: roomNow.gameState.currentPuzzleIndex,
      answer: puzzle.answers[0] // 超时揭晓答案
    }, roomId);

    // 延迟 2 秒后进入下一题
    const nextTimer = setTimeout(() => {
      nextPuzzle(roomId, emitFn);
    }, 2000);

    timers.set(roomId + '_next', nextTimer);
  }, puzzle.timeLimit * 1000);

  timers.set(roomId, timer);
}

/**
 * 提交答案
 */
function submitAnswer(roomId, socketId, userAnswer, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.gameState || room.gameState.status !== 'playing') {
    return { success: false, error: '游戏未进行中' };
  }

  const gs = room.gameState;
  const puzzle = gs.puzzles[gs.currentPuzzleIndex];
  const player = room.players.find(p => p.socketId === socketId);

  if (!player) return { success: false, error: '玩家不在房间中' };
  if (player.answered) return { success: false, error: '你已经回答过了' };

  const isCorrect = checkAnswer(userAnswer, puzzle.answers);

  if (isCorrect) {
    const timeLeft = Math.max(0, puzzle.timeLimit - Math.floor((Date.now() - gs.puzzleStartTime) / 1000));
    const score = calcScore(timeLeft, puzzle.timeLimit, gs.hintUsed);
    player.score += score;
    player.answered = true;
    gs.solved = true;

    // 推送答对消息
    emitFn('answer_correct', {
      socketId,
      nickname: player.nickname,
      score,
      totalScore: player.score,
      answer: puzzle.answers[0],
      puzzleIndex: gs.currentPuzzleIndex
    }, roomId);

    // 清除超时计时器，延迟进入下一题
    clearRoomTimer(roomId);
    const nextTimer = setTimeout(() => {
      nextPuzzle(roomId, emitFn);
    }, 2000);
    timers.set(roomId + '_next', nextTimer);

    return { success: true, correct: true, score };
  } else {
    return { success: true, correct: false };
  }
}

/**
 * 使用提示
 */
function useHint(roomId, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.gameState || room.gameState.status !== 'playing') {
    return { success: false, error: '游戏未进行中' };
  }

  const gs = room.gameState;
  if (gs.hintUsed) return { success: false, error: '提示已使用' };

  const puzzle = gs.puzzles[gs.currentPuzzleIndex];
  gs.hintUsed = true;

  emitFn('hint_reveal', {
    hint: puzzle.hint,
    puzzleIndex: gs.currentPuzzleIndex
  }, roomId);

  return { success: true, hint: puzzle.hint };
}

/**
 * 进入下一道题
 */
function nextPuzzle(roomId, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.gameState) return;

  clearRoomTimer(roomId);
  clearRoomTimer(roomId + '_next');

  const gs = room.gameState;
  gs.currentPuzzleIndex++;

  if (gs.currentPuzzleIndex >= gs.totalPuzzles) {
    endGame(roomId, emitFn);
  } else {
    startPuzzleTimer(roomId, emitFn);
  }
}

/**
 * 结束游戏
 */
function endGame(roomId, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  clearRoomTimer(roomId);
  clearRoomTimer(roomId + '_next');

  const gs = room.gameState;
  if (gs) gs.status = 'finished';
  room.status = 'finished';

  // 排行榜
  const rankings = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      socketId: p.socketId,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score
    }));

  emitFn('game_over', { rankings, theme: gs ? gs.theme : '' }, roomId);
}

/**
 * 清除房间计时器
 */
function clearRoomTimer(key) {
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
}

/**
 * 玩家断开时清理计时相关逻辑
 */
function onPlayerDisconnect(roomId, socketId, emitFn) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  // 游戏中如果只剩1人，结束游戏
  if (room.status === 'playing' && room.players.length <= 1) {
    endGame(roomId, emitFn);
  }
}

module.exports = {
  startGame,
  submitAnswer,
  useHint,
  nextPuzzle,
  endGame,
  onPlayerDisconnect,
  clearRoomTimer
};
