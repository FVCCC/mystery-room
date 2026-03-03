/**
 * AI 地下城主 (DM) 模块
 * 支持 OpenAI / DeepSeek / 任何 OpenAI 兼容接口
 *
 * 环境变量配置：
 *   AI_API_KEY   - API 密钥（必填）
 *   AI_BASE_URL  - API 地址，默认 https://api.deepseek.com
 *   AI_MODEL     - 模型名称，默认 deepseek-chat
 */

const https = require('https');
const http = require('http');

const AI_CONFIG = {
  apiKey:  process.env.AI_API_KEY  || '',
  baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com',
  model:   process.env.AI_MODEL    || 'deepseek-chat',
  maxTokens: 600,
  temperature: 0.85
};

// ── DM 系统提示词 ────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `你是一位经验丰富的地下城主（DM），主持基于 DND 5E 规则的多人桌游跑团。

【你的职责】
1. 用生动的文字描述场景、NPC 对话和事件，每次叙述 120-200 字
2. 根据玩家行动自然推进剧情，保持故事连贯性和悬念感
3. 当玩家行动需要检定时，用以下格式触发掷骰：
   [检定:技能名称:DC难度] 示例：[检定:感知:12] [检定:运动:15]
4. 战斗遭遇用：[战斗:怪物名:HP:AC] 示例：[战斗:哥布林:7:13]
5. 奖励经验时用：[经验:数值] 示例：[经验:150]
6. 发现宝物时用：[战利品:物品描述] 示例：[战利品:精灵弓+1]
7. 对于"一定成功"的行动直接描述结果，不需要掷骰

【DND 5E 核心规则】
- 技能检定：1d20 + 属性修正 + 熟练加值 ≥ DC → 成功
- 攻击：1d20 + 攻击加值 ≥ 目标AC → 命中
- 暗骰（玩家不知结果）：直接描述感知到的结果
- 濒死：HP≤0 进入濒死，需要三次死亡豁免
- 短休：30分钟，可花费生命骰回复 HP
- 长休：8小时，回复全部 HP 和所有生命骰

【语气风格】
- 史诗奇幻风格，营造紧张感和神秘感
- 适当加入环境细节（光线、气味、声音）
- 尊重玩家选择，允许创意性行动
- 用"你们"或"你"来称呼玩家角色`;

// ── 构建带有战役上下文的系统提示 ─────────────────────────
function buildSystemPrompt(campaign) {
  let prompt = BASE_SYSTEM_PROMPT + '\n\n';

  prompt += `【当前战役】${campaign.title}\n`;
  prompt += `【世界观设定】${campaign.setting}\n`;
  prompt += `【当前场景】${campaign.currentScene}\n`;
  prompt += `【章节进度】第 ${campaign.chapter} 章\n\n`;

  prompt += '【玩家角色一览】\n';
  for (const pc of campaign.players) {
    if (!pc.character) continue;
    const c = pc.character;
    const mods = getModifiers(c.stats);
    prompt += `▸ ${c.name}（${c.race}·${c.className}·${c.level}级）`;
    prompt += ` HP:${c.hp.current}/${c.hp.max} AC:${c.ac}\n`;
    prompt += `  力${c.stats.STR}(${fmt(mods.STR)}) 敏${c.stats.DEX}(${fmt(mods.DEX)}) 体${c.stats.CON}(${fmt(mods.CON)}) `;
    prompt += `智${c.stats.INT}(${fmt(mods.INT)}) 感${c.stats.WIS}(${fmt(mods.WIS)}) 魅${c.stats.CHA}(${fmt(mods.CHA)})\n`;
    if (c.backstory) prompt += `  背景：${c.backstory.substring(0, 80)}\n`;
  }

  if (campaign.sessionNotes) {
    prompt += `\n【本次要点】${campaign.sessionNotes}\n`;
  }

  return prompt;
}

function getModifiers(stats) {
  const result = {};
  for (const [key, val] of Object.entries(stats)) {
    result[key] = Math.floor((val - 10) / 2);
  }
  return result;
}

function fmt(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ── 调用 AI API ───────────────────────────────────────────────
function callAI(messages) {
  return new Promise((resolve, reject) => {
    if (!AI_CONFIG.apiKey) {
      resolve('⚠️ **AI DM 未配置**\n\n请联系服务器管理员配置 `AI_API_KEY` 环境变量。\n\n可在 Railway 的 Variables 页面添加：\n- `AI_API_KEY` = 你的 API 密钥\n- `AI_BASE_URL` = https://api.deepseek.com（DeepSeek）或 https://api.openai.com\n- `AI_MODEL` = deepseek-chat 或 gpt-4o-mini');
      return;
    }

    const body = JSON.stringify({
      model: AI_CONFIG.model,
      messages,
      max_tokens: AI_CONFIG.maxTokens,
      temperature: AI_CONFIG.temperature,
      stream: false
    });

    const baseUrl = new URL(AI_CONFIG.baseUrl);
    const isHttps = baseUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (isHttps ? 443 : 80),
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0] && json.choices[0].message) {
            resolve(json.choices[0].message.content.trim());
          } else if (json.error) {
            reject(new Error(`AI错误: ${json.error.message}`));
          } else {
            reject(new Error(`未知响应: ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`解析失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(45000, () => {
      req.destroy();
      reject(new Error('AI 请求超时（45秒），请检查网络或 API 地址'));
    });

    req.write(body);
    req.end();
  });
}

// ── 主函数：获取 DM 回应 ─────────────────────────────────────
async function getDMResponse(campaign, playerAction, playerName) {
  const systemPrompt = buildSystemPrompt(campaign);

  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // 最近的 12 条历史（保持上下文）
  const recent = (campaign.history || []).slice(-12);
  for (const entry of recent) {
    if (entry.role === 'dm') {
      messages.push({ role: 'assistant', content: entry.content });
    } else {
      messages.push({ role: 'user', content: `[${entry.playerName}]: ${entry.content}` });
    }
  }

  // 当前玩家行动
  messages.push({ role: 'user', content: `[${playerName}]: ${playerAction}` });

  const response = await callAI(messages);
  return response;
}

// ── 生成开场白 ────────────────────────────────────────────────
async function getOpeningNarration(campaign) {
  const systemPrompt = buildSystemPrompt(campaign);

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `请为这场战役写一段精彩的开场白，介绍世界观和玩家们所处的初始场景"${campaign.currentScene}"，结尾要给出第一个关键选择或行动提示。大约200字。`
    }
  ];

  return await callAI(messages);
}

// ── NPC 即兴生成 ──────────────────────────────────────────────
async function generateNPC(campaign, npcHint) {
  const messages = [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `在战役"${campaign.title}"中，生成一个NPC：${npcHint}。包括：名字、种族职业、外貌特征（2句）、性格（1句）、密秘或动机（1句）。格式简洁。`
    }
  ];
  return await callAI(messages);
}

module.exports = {
  getDMResponse,
  getOpeningNarration,
  generateNPC,
  AI_CONFIG
};
