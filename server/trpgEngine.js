/**
 * TRPG 游戏引擎
 * DND 5E 简化规则：种族/职业数据、骰子、点数购买、技能检定
 */

// ── DND 5E 种族数据 ───────────────────────────────────────────
const RACES = {
  human:    { name: '人类',   bonus: { STR:1,DEX:1,CON:1,INT:1,WIS:1,CHA:1 }, trait: '多才多艺：所有属性+1，额外获得一个技能熟练' },
  elf:      { name: '精灵',   bonus: { DEX:2,INT:1 }, trait: '黑暗视觉：黑暗中60尺视野；心灵感应：能感知周围10尺内的意识' },
  dwarf:    { name: '矮人',   bonus: { CON:2,WIS:1 }, trait: '耐毒：对毒素抗性；石工知识：鉴定石质建筑' },
  halfling: { name: '半身人', bonus: { DEX:2,CHA:1 }, trait: '幸运：技能检定骰出1时可重骰；勇气：不易受到恐惧' },
  halforc:  { name: '半兽人', bonus: { STR:2,CON:1 }, trait: '残忍打击：一次/天，HP降至0时变为1HP；狂野打击：暴击时骰伤害骰两次' },
  tiefling: { name: '提夫林', bonus: { CHA:2,INT:1 }, trait: '黑暗视觉；地狱抵抗：对火焰和毒素有抗性；炼狱传承：会施放次元触碰' },
  dragonborn:{ name:'龙裔',  bonus: { STR:2,CHA:1 }, trait: '龙息武器：一次/短休，施放吐息攻击（类型取决于祖先）' },
  gnome:    { name: '侏儒',   bonus: { INT:2,DEX:1 }, trait: '黑暗视觉；侏儒狡诈：对智力/感知/魅力豁免有优势' }
};

// ── DND 5E 职业数据 ───────────────────────────────────────────
const CLASSES = {
  fighter:   { name:'战士',   hpDie:10, primaryStats:['STR','DEX'], armorProf:'所有护甲', feature:'战斗风格 + 第二口气（短休回复1d10+等级HP）' },
  wizard:    { name:'法师',   hpDie:6,  primaryStats:['INT'],        armorProf:'无',       feature:'施法：掌握多种攻击/控制/辅助法术' },
  rogue:     { name:'游荡者', hpDie:8,  primaryStats:['DEX'],        armorProf:'轻甲',     feature:'偷袭：有利时额外伤害；专长：两项技能双倍熟练' },
  cleric:    { name:'牧师',   hpDie:8,  primaryStats:['WIS'],        armorProf:'中甲',     feature:'神域施法；治愈之手：一次/短休，触碰回复HP' },
  ranger:    { name:'游侠',   hpDie:10, primaryStats:['DEX','WIS'],  armorProf:'中甲',     feature:'偏好地形；偏好敌人；施法（追踪/自然类）' },
  barbarian: { name:'野蛮人', hpDie:12, primaryStats:['STR'],        armorProf:'中甲',     feature:'狂暴：次/长休，获得额外攻击和伤害抗性' },
  bard:      { name:'吟游诗人',hpDie:8, primaryStats:['CHA'],        armorProf:'轻甲',     feature:'激励：鼓励队友加骰；施法（魅力类）' },
  paladin:   { name:'圣武士', hpDie:10, primaryStats:['STR','CHA'],  armorProf:'所有护甲', feature:'神圣打击：每次攻击可附加光明伤害；圣疗：触碰治疗' },
  druid:     { name:'德鲁伊', hpDie:8,  primaryStats:['WIS'],        armorProf:'中甲',     feature:'变身：变成动物形态；施法（自然/治疗类）' },
  monk:      { name:'武僧',   hpDie:8,  primaryStats:['DEX','WIS'],  armorProf:'无',       feature:'气功：每回合额外攻击；偏转飞弹；神速' }
};

// ── 背景 ─────────────────────────────────────────────────────
const BACKGROUNDS = {
  acolyte:    { name:'服侍者',   skills:['宗教','洞悉'],      feature:'庇护所信仰：可以在神殿免费获得食宿' },
  criminal:   { name:'罪犯',     skills:['欺骗','隐匿'],      feature:'犯罪联系：认识地下世界的重要人物' },
  folk_hero:  { name:'平民英雄', skills:['驯兽','生存'],      feature:'乡村款待：可以在小镇获得免费食宿' },
  noble:      { name:'贵族',     skills:['历史','说服'],      feature:'特权地位：可以觐见权贵；有私人仆从' },
  outlander:  { name:'流浪者',   skills:['运动','生存'],      feature:'漫游者：总能找到食物和安全的休息地' },
  sage:       { name:'学者',     skills:['奥术','历史'],      feature:'研究专长：对未知问题知道去哪找答案' },
  soldier:    { name:'士兵',     skills:['运动','威吓'],      feature:'军队等级：受到士兵和军官尊重' },
  charlatan:  { name:'骗子',     skills:['欺骗','魔法用具'],  feature:'虚假身份：拥有多个假证件和第二身份' },
  hermit:     { name:'隐士',     skills:['医疗','宗教'],      feature:'神秘发现：了解特别的秘密或神秘知识' },
  sailor:     { name:'水手',     skills:['运动','感知'],      feature:'船员通行：总能在海港找到免费船只' }
};

// ── 剧情场景模板 ──────────────────────────────────────────────
const STORY_SCENARIOS = [
  {
    id: 'dungeon_classic',
    title: '废弃矿洞的秘密',
    setting: '剑湾城郊外，一座古老的矮人矿洞据说藏有失落的宝藏，但近来频繁出现怪物袭击周边村庄的事件。',
    currentScene: '你们在剑湾城的酒馆接受了一个任务——调查废弃矿洞中的异动，并彻底清除威胁。任务发布者是忧心忡忡的村长格林斯比。',
    chapter: 1,
    tags: ['地下城','经典冒险','初学者友好'],
    difficulty: '普通',
    sessionNotes: '第一章：矿洞入口及浅层区域探索'
  },
  {
    id: 'city_intrigue',
    title: '王都阴谋',
    setting: '繁华的卡里姆帝国首都，一场权力更迭的阴谋在暗中酝酿。三个贵族派系明争暗斗，无辜平民卷入其中。',
    currentScene: '你们作为一群冒险者来到王都寻找机遇，却意外卷入了一名神秘信使的死亡事件。他的遗物中有一封密信，内容让你们不寒而栗。',
    chapter: 1,
    tags: ['政治阴谋','侦探','社交'],
    difficulty: '困难',
    sessionNotes: '第一章：王都调查，寻找幕后黑手的线索'
  },
  {
    id: 'sea_adventure',
    title: '深海遗迹',
    setting: '亘古海洋的深处，一座沉没千年的古代文明遗迹突然浮现在海面上，各方势力蜂拥而至。',
    currentScene: '你们受雇于探险公会，乘坐"海风号"前往遗迹。途中船只遭遇神秘风暴，漂流到一座荒岛上。',
    chapter: 1,
    tags: ['海洋冒险','探索','神秘'],
    difficulty: '普通',
    sessionNotes: '第一章：荒岛求生，寻找前往遗迹的路线'
  },
  {
    id: 'horror',
    title: '诅咒庄园',
    setting: '沉寂在薄雾中的破旧庄园，传说一名贵族因施行禁忌魔法而诅咒了整个家族，此后再无生人从庄园中安全离开。',
    currentScene: '深秋的夜晚，你们寻找庇护所时来到了庄园门口。铁门自动打开，仿佛邀请你们进入。当大门在身后轰然关闭，你们意识到——不管发生什么，今晚必须在这里度过。',
    chapter: 1,
    tags: ['恐怖','解谜','生存'],
    difficulty: '困难',
    sessionNotes: '第一章：庄园探索，揭开诅咒的起源'
  },
  {
    id: 'planar',
    title: '位面旅行者',
    setting: '魔法浩劫将多个平行位面的碎片融合在了一起，产生了不可思议的异常地带，法则在此失效，任何可能皆有可能。',
    currentScene: '一次意外的魔法传送阵故障，将你们送到了一个陌生的位面交汇之地。四周是来自不同世界的混乱碎片，而不知名的生物正在靠近……',
    chapter: 1,
    tags: ['高幻想','位面','创意'],
    difficulty: '极难',
    sessionNotes: '第一章：理解新环境，寻找回归之路或新的目的'
  },
  {
    id: 'custom',
    title: '自定义战役',
    setting: '由玩家和DM共同创建的世界观...',
    currentScene: '战役开始的初始场景...',
    chapter: 1,
    tags: ['自定义'],
    difficulty: '自定义',
    sessionNotes: ''
  }
];

// ── 点数购买费用表 ────────────────────────────────────────────
const POINT_BUY_COST = { 8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9 };
const POINT_BUY_BUDGET = 27;

// ── 技能-属性映射 ─────────────────────────────────────────────
const SKILL_MAP = {
  '运动':'STR',
  '杂技':'DEX','隐匿':'DEX','巧手':'DEX',
  '奥术':'INT','历史':'INT','调查':'INT','自然':'INT','宗教':'INT',
  '驯兽':'WIS','洞悉':'WIS','医疗':'WIS','感知':'WIS','求生':'WIS','生存':'WIS',
  '欺骗':'CHA','威吓':'CHA','表演':'CHA','说服':'CHA','魔法用具':'CHA',
  '运动':'STR','隐秘':'DEX'
};

// ── 职业熟练技能数 ────────────────────────────────────────────
const CLASS_SKILL_COUNT = {
  fighter:2, wizard:2, rogue:4, cleric:2, ranger:3, barbarian:2,
  bard:3, paladin:2, druid:2, monk:2
};

// ── 骰子系统 ─────────────────────────────────────────────────
function rollDice(notation) {
  // 支持：d20、2d6、d20+5、2d6-1、d%（百分骰）
  const match = notation.replace(/\s/g,'').match(/^(\d*)d(\d+|%)([+-]\d+)?$/i);
  if (!match) return null;

  const count    = parseInt(match[1]) || 1;
  const sidesRaw = match[2] === '%' ? 100 : parseInt(match[2]);
  const modifier = parseInt(match[3]) || 0;

  if (count < 1 || count > 20 || sidesRaw < 2 || sidesRaw > 100) return null;

  const rolls = [];
  let total = modifier;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sidesRaw) + 1;
    rolls.push(r);
    total += r;
  }

  return {
    notation: `${count}d${sidesRaw}${modifier > 0 ? '+'+modifier : modifier < 0 ? modifier : ''}`,
    rolls,
    modifier,
    total,
    sides: sidesRaw
  };
}

// 带优势/劣势的 d20 检定
function rollD20(modifier = 0, advantage = 0) {
  const r1 = Math.floor(Math.random() * 20) + 1;
  const r2 = Math.floor(Math.random() * 20) + 1;
  let used, other;
  if (advantage > 0) { used = Math.max(r1, r2); other = Math.min(r1, r2); }
  else if (advantage < 0) { used = Math.min(r1, r2); other = Math.max(r1, r2); }
  else { used = r1; other = null; }
  return {
    roll: used,
    other,
    total: used + modifier,
    modifier,
    isCritical: used === 20,
    isFumble: used === 1,
    advantage
  };
}

// ── 属性修正值 ───────────────────────────────────────────────
function getModifier(score) {
  return Math.floor((score - 10) / 2);
}

// ── 熟练加值（按等级） ────────────────────────────────────────
function getProficiencyBonus(level) {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}

// ── 创建角色 ─────────────────────────────────────────────────
function createCharacter(data) {
  const { name, race, classKey, background, stats, skills, appearance, backstory, alignment } = data;

  const raceData  = RACES[race];
  const classData = CLASSES[classKey];
  const bgData    = BACKGROUNDS[background];

  if (!raceData || !classData) throw new Error('无效的种族或职业');

  // 应用种族加值
  const finalStats = { STR:8, DEX:8, CON:8, INT:8, WIS:8, CHA:8 };
  for (const [k, v] of Object.entries(stats)) finalStats[k] = v;
  for (const [k, v] of Object.entries(raceData.bonus)) finalStats[k] = (finalStats[k] || 0) + v;

  const level = 1;
  const conMod = getModifier(finalStats.CON);
  const maxHP = classData.hpDie + conMod;
  const profBonus = getProficiencyBonus(level);

  // AC 基础计算
  const dexMod = getModifier(finalStats.DEX);
  let ac = 10 + dexMod;
  if (classKey === 'barbarian') ac = 10 + dexMod + getModifier(finalStats.CON);
  if (['fighter','paladin','cleric','ranger'].includes(classKey)) ac = Math.max(ac, 13 + Math.min(dexMod, 2)); // 锁甲

  return {
    name: name.substring(0, 20),
    race: raceData.name,
    raceKey: race,
    className: classData.name,
    classKey,
    background: bgData ? bgData.name : background,
    backgroundKey: background,
    level,
    xp: 0,
    xpToNext: 300,
    alignment: alignment || '中立善良',
    appearance: appearance || '',
    backstory: backstory || '',
    stats: finalStats,
    hp: { max: Math.max(1, maxHP), current: Math.max(1, maxHP) },
    ac,
    proficiencyBonus: profBonus,
    skills: skills || [],
    inventory: [],
    conditions: [],
    hitDice: { type: classData.hpDie, total: level, remaining: level },
    traits: raceData.trait,
    classFeature: classData.feature,
    deathSaves: { successes: 0, failures: 0 },
    isDying: false,
    spellSlots: getInitialSpellSlots(classKey, level),
    notes: ''
  };
}

function getInitialSpellSlots(classKey, level) {
  const casters = ['wizard','cleric','druid','bard','paladin','ranger'];
  if (!casters.includes(classKey)) return {};
  if (level >= 1) return { '1': { total: 2, remaining: 2 } };
  return {};
}

// ── 伤害处理 ──────────────────────────────────────────────────
function applyDamage(character, damage) {
  character.hp.current = Math.max(0, character.hp.current - damage);
  if (character.hp.current <= 0) {
    character.isDying = true;
  }
  return character;
}

function healCharacter(character, amount) {
  if (character.isDying && amount > 0) character.isDying = false;
  character.hp.current = Math.min(character.hp.max, character.hp.current + amount);
  return character;
}

// ── 升级 ─────────────────────────────────────────────────────
function levelUp(character) {
  if (character.level >= 20) return { leveled: false, reason: '已达最高等级' };

  character.level++;
  const classData = CLASSES[character.classKey];
  const conMod = getModifier(character.stats.CON);
  const hpGain = Math.floor(classData.hpDie / 2) + 1 + conMod;
  character.hp.max += Math.max(1, hpGain);
  character.hp.current += Math.max(1, hpGain);
  character.proficiencyBonus = getProficiencyBonus(character.level);
  character.xpToNext = getXPThreshold(character.level + 1);
  character.hitDice.total++;
  character.hitDice.remaining++;

  // 更新法术位
  const newSlots = getInitialSpellSlots(character.classKey, character.level);
  for (const [tier, slot] of Object.entries(newSlots)) {
    character.spellSlots[tier] = slot;
  }

  const xpThresholds = [0,300,900,2700,6500,14000,23000,34000,48000,64000];
  character.xpToNext = xpThresholds[character.level] || 999999;

  return { leveled: true, level: character.level, hpGain: Math.max(1, hpGain) };
}

function getXPThreshold(level) {
  const thresholds = [0,300,900,2700,6500,14000,23000,34000,48000,64000,85000];
  return thresholds[level] || 999999;
}

// ── 战役状态管理 ──────────────────────────────────────────────
function createCampaign(scenario, roomId, creatorNickname) {
  const s = STORY_SCENARIOS.find(s => s.id === scenario) || STORY_SCENARIOS[STORY_SCENARIOS.length - 1];
  return {
    campaignId: roomId,
    title: s.title,
    setting: s.setting,
    currentScene: s.currentScene,
    chapter: s.chapter,
    sessionNotes: s.sessionNotes,
    players: [],
    history: [],
    combatState: null,
    loot: [],
    npcs: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    status: 'waiting' // waiting | playing | ended
  };
}

// ── 解析 AI 返回的特殊指令 ───────────────────────────────────
function parseAIDirectives(text) {
  const directives = [];

  // [检定:技能:DC]
  const checkReg = /\[检定:([^:]+):(\d+)\]/g;
  let m;
  while ((m = checkReg.exec(text)) !== null) {
    directives.push({ type: 'check', skill: m[1], dc: parseInt(m[2]) });
  }

  // [战斗:怪物名:HP:AC]
  const combatReg = /\[战斗:([^:]+):(\d+):(\d+)\]/g;
  while ((m = combatReg.exec(text)) !== null) {
    directives.push({ type: 'combat', name: m[1], hp: parseInt(m[2]), ac: parseInt(m[3]) });
  }

  // [经验:值]
  const xpReg = /\[经验:(\d+)\]/g;
  while ((m = xpReg.exec(text)) !== null) {
    directives.push({ type: 'xp', amount: parseInt(m[1]) });
  }

  // [战利品:描述]
  const lootReg = /\[战利品:([^\]]+)\]/g;
  while ((m = lootReg.exec(text)) !== null) {
    directives.push({ type: 'loot', item: m[1] });
  }

  return directives;
}

// 清理 AI 回应中的指令标签（显示给玩家时去除）
function cleanAIResponse(text) {
  return text
    .replace(/\[检定:[^\]]+\]/g, '')
    .replace(/\[战斗:[^\]]+\]/g, '')
    .replace(/\[经验:\d+\]/g, '')
    .replace(/\[战利品:[^\]]+\]/g, '')
    .trim();
}

module.exports = {
  RACES,
  CLASSES,
  BACKGROUNDS,
  STORY_SCENARIOS,
  POINT_BUY_COST,
  POINT_BUY_BUDGET,
  SKILL_MAP,
  CLASS_SKILL_COUNT,
  rollDice,
  rollD20,
  getModifier,
  getProficiencyBonus,
  createCharacter,
  applyDamage,
  healCharacter,
  levelUp,
  createCampaign,
  parseAIDirectives,
  cleanAIResponse
};
