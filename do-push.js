const { execSync } = require('child_process');

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

const token = getGitToken();
if (!token) {
  console.error('无法获取 token');
  process.exit(1);
}

// 写入 push 批处理脚本
const fs = require('fs');
const bat = `@echo off
cd /d "c:\\Users\\Administrator\\Desktop\\新建文件夹\\chat-game"
git push https://FVCCC:${token}@github.com/FVCCC/mystery-room.git main:main
echo PUSH_DONE
`;
fs.writeFileSync('C:\\temp\\do_push.bat', bat);
console.log('BATCH_READY');
