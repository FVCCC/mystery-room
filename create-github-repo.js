/**
 * 自动创建 GitHub 仓库并推送代码
 * 运行方式：node create-github-repo.js
 */

const https = require('https');
const { execSync } = require('child_process');

const REPO_NAME = 'mystery-room';
const DESCRIPTION = '幻境密室 - 多人在线聊天解谜游戏 (Node.js + Socket.io)';
const USERNAME = 'FVCCC';

// 从 Git 凭证管理器获取 token
function getGitToken() {
  try {
    const input = 'protocol=https\nhost=github.com\n\n';
    const result = execSync('git credential fill', {
      input,
      encoding: 'utf8',
      timeout: 5000
    });
    const match = result.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {}
  return null;
}

// 调用 GitHub API 创建仓库
function createRepo(token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      name: REPO_NAME,
      description: DESCRIPTION,
      private: false,
      auto_init: false
    });

    const options = {
      hostname: 'api.github.com',
      path: '/user/repos',
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'node-git-helper',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (res.statusCode === 201) {
          resolve(json);
        } else if (res.statusCode === 422) {
          // 仓库已存在
          resolve({ already_exists: true, html_url: `https://github.com/${USERNAME}/${REPO_NAME}` });
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🔑 正在从 Git 凭证管理器获取 GitHub token...');
  const token = getGitToken();

  if (!token) {
    console.error('❌ 无法获取 GitHub token。请手动创建仓库：');
    console.error('   👉 https://github.com/new');
    console.error('   仓库名：' + REPO_NAME);
    process.exit(1);
  }

  console.log('✅ Token 获取成功！');
  console.log(`📦 正在创建仓库 ${USERNAME}/${REPO_NAME}...`);

  try {
    const repo = await createRepo(token);

    if (repo.already_exists) {
      console.log('ℹ️  仓库已存在，跳过创建步骤');
    } else {
      console.log(`✅ 仓库创建成功：${repo.html_url}`);
    }

    // 推送代码
    console.log('🚀 正在推送代码到 GitHub...');
    try {
      // 设置带 token 的远程地址
      const remoteUrl = `https://${token}@github.com/${USERNAME}/${REPO_NAME}.git`;
      execSync(`git -C "${__dirname}" remote set-url origin "${remoteUrl}"`, { stdio: 'pipe' });
      execSync(`git -C "${__dirname}" push -u origin main`, { stdio: 'inherit' });
      // 推送成功后恢复普通远程地址（不含 token）
      execSync(`git -C "${__dirname}" remote set-url origin "https://github.com/${USERNAME}/${REPO_NAME}.git"`, { stdio: 'pipe' });
      console.log('');
      console.log('🎉 上传完成！');
      console.log(`📌 项目地址：https://github.com/${USERNAME}/${REPO_NAME}`);
    } catch (pushErr) {
      console.error('❌ 推送失败：', pushErr.message);
      console.log('请手动运行：git push -u origin main');
    }

  } catch (err) {
    console.error('❌ 创建仓库失败：', err.message);
  }
}

main();
