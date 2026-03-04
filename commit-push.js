const {spawnSync} = require('child_process');
const fs = require('fs');
const tok = fs.readFileSync('C:/temp/gh_token.txt','utf8').trim();
const cwd = __dirname;
const env = Object.assign({}, process.env, { GIT_SSL_NO_VERIFY:'1', GIT_TERMINAL_PROMPT:'0' });

const commit = spawnSync('git', ['commit', '-m', '修复多人跑团无法开始：DND房间加入导航+房主权断线保留'], {cwd, encoding:'utf8'});
console.log(commit.stdout, commit.stderr);
if (commit.status !== 0) { console.log('commit 失败，可能已提交'); }

for (let i = 1; i <= 5; i++) {
  console.log(`[${i}/5] 推送中...`);
  const r = spawnSync('git', ['-c','http.sslVerify=false','push',
    'https://FVCCC:'+tok+'@github.com/FVCCC/mystery-room.git','main:main'],
    {cwd, encoding:'utf8', env, timeout:30000});
  console.log('exit:'+r.status, r.stderr||'', r.stdout||'');
  if (r.status === 0) { console.log('✅ 推送成功！'); break; }
  if (i < 5) spawnSync('ping',['-n','4','127.0.0.1'],{stdio:'ignore'});
}
