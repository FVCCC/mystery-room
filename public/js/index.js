/**
 * 首页逻辑 — 昵称输入 + 头像选择 + 进入大厅
 */

document.addEventListener('DOMContentLoaded', () => {
  // 若已有会话信息则跳转大厅
  if (Session.isValid()) {
    window.location.href = '/lobby.html';
    return;
  }

  const nicknameInput = document.getElementById('nicknameInput');
  const nicknameHint  = document.getElementById('nicknameHint');
  const avatarGrid    = document.getElementById('avatarGrid');
  const enterBtn      = document.getElementById('enterBtn');

  let selectedAvatar = '🧙';

  // ── 头像选择 ──────────────────────────────────
  avatarGrid.addEventListener('click', (e) => {
    const item = e.target.closest('.avatar-item');
    if (!item) return;
    document.querySelectorAll('.avatar-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    selectedAvatar = item.dataset.avatar;
  });

  // ── 昵称校验 ──────────────────────────────────
  nicknameInput.addEventListener('input', () => {
    const val = nicknameInput.value.trim();
    if (val.length === 0) {
      nicknameHint.textContent = '';
    } else if (val.length < 2) {
      nicknameHint.textContent = '昵称至少需要2个字符';
    } else {
      nicknameHint.textContent = '';
    }
  });

  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterGame();
  });

  // ── 进入游戏 ──────────────────────────────────
  enterBtn.addEventListener('click', enterGame);

  function enterGame() {
    const nickname = nicknameInput.value.trim();
    if (nickname.length < 2) {
      nicknameHint.textContent = '请输入至少2个字符的昵称';
      nicknameInput.focus();
      return;
    }
    if (nickname.length > 10) {
      nicknameHint.textContent = '昵称不能超过10个字符';
      return;
    }

    Session.save(nickname, selectedAvatar);
    window.location.href = '/lobby.html';
  }
});
