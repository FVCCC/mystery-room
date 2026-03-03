/**
 * TRPG 战役存档系统
 * 存储为 JSON 文件（saves/ 目录），支持导出可读文本
 */

const fs   = require('fs');
const path = require('path');

const SAVES_DIR = path.join(__dirname, '../saves');

// 确保目录存在
if (!fs.existsSync(SAVES_DIR)) {
  fs.mkdirSync(SAVES_DIR, { recursive: true });
}

// ── 保存战役 ──────────────────────────────────────────────────
function saveCampaign(campaign) {
  try {
    const id   = campaign.campaignId || Date.now().toString();
    const file = path.join(SAVES_DIR, `${id}.json`);
    const data = {
      ...campaign,
      savedAt: Date.now(),
      version: '1.0'
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, file: `${id}.json` };
  } catch (e) {
    console.error('[存档] 保存失败:', e.message);
    return { success: false, error: e.message };
  }
}

// ── 读取战役 ──────────────────────────────────────────────────
function loadCampaign(campaignId) {
  try {
    const file = path.join(SAVES_DIR, `${campaignId}.json`);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[存档] 读取失败:', e.message);
    return null;
  }
}

// ── 列出所有存档 ──────────────────────────────────────────────
function listSaves() {
  try {
    const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const raw  = fs.readFileSync(path.join(SAVES_DIR, f), 'utf8');
        const data = JSON.parse(raw);
        return {
          campaignId: data.campaignId,
          title:      data.title,
          chapter:    data.chapter,
          playerCount: (data.players || []).length,
          savedAt:    data.savedAt,
          status:     data.status
        };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    return [];
  }
}

// ── 删除存档 ─────────────────────────────────────────────────
function deleteSave(campaignId) {
  try {
    const file = path.join(SAVES_DIR, `${campaignId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── 导出可读文本 ──────────────────────────────────────────────
function exportAsText(campaign) {
  const lines = [];
  lines.push(`╔══════════════════════════════════════╗`);
  lines.push(`║   ${campaign.title.padEnd(34)} ║`);
  lines.push(`╚══════════════════════════════════════╝`);
  lines.push('');
  lines.push(`📅 导出时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`📖 当前章节：第 ${campaign.chapter} 章`);
  lines.push(`🌍 世界观：${campaign.setting}`);
  lines.push(`📍 当前场景：${campaign.currentScene}`);
  lines.push('');

  // 角色信息
  lines.push('═══ 冒险者一览 ═══');
  for (const p of campaign.players) {
    if (!p.character) continue;
    const c = p.character;
    lines.push(`\n▸ ${c.name}（${c.race} ${c.className} · Lv.${c.level}）`);
    lines.push(`  HP: ${c.hp.current}/${c.hp.max}  AC: ${c.ac}  熟练: +${c.proficiencyBonus}`);
    lines.push(`  力量${c.stats.STR} 敏捷${c.stats.DEX} 体质${c.stats.CON} 智力${c.stats.INT} 感知${c.stats.WIS} 魅力${c.stats.CHA}`);
    lines.push(`  阵营：${c.alignment}  背景：${c.background}`);
    if (c.backstory) lines.push(`  背景故事：${c.backstory}`);
    if (c.inventory && c.inventory.length) lines.push(`  物品：${c.inventory.join('、')}`);
    lines.push(`  经验值：${c.xp}/${c.xpToNext}`);
  }

  // 战利品
  if (campaign.loot && campaign.loot.length) {
    lines.push('\n═══ 发现的宝物 ═══');
    campaign.loot.forEach(item => lines.push(`  • ${item}`));
  }

  // 对话历史
  if (campaign.history && campaign.history.length) {
    lines.push('\n═══ 冒险记录 ═══\n');
    for (const entry of campaign.history) {
      const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
      if (entry.role === 'dm') {
        lines.push(`【${time}】🎲 DM叙述：`);
        lines.push(entry.content);
        lines.push('');
      } else {
        lines.push(`【${time}】⚔️ ${entry.playerName}：${entry.content}`);
      }
    }
  }

  lines.push('\n─────────────────────────────────');
  lines.push(`幻境密室 · DND AI 跑团系统 导出`);
  return lines.join('\n');
}

module.exports = { saveCampaign, loadCampaign, listSaves, deleteSave, exportAsText };
