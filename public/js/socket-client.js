/**
 * Socket.io 客户端封装
 * 提供统一的连接管理和事件工具
 */

(function (window) {
  'use strict';

  let _socket = null;

  const SocketClient = {

    /** 初始化连接 */
    connect() {
      if (_socket && _socket.connected) return _socket;
      _socket = io(window.location.origin, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1500
      });

      _socket.on('connect', () => {
        console.log('[Socket] 已连接，id:', _socket.id);
      });

      _socket.on('disconnect', (reason) => {
        console.warn('[Socket] 断开连接:', reason);
      });

      _socket.on('connect_error', (err) => {
        console.error('[Socket] 连接错误:', err.message);
        Toast.show('网络连接失败，请刷新页面重试', 'error');
      });

      _socket.on('error_msg', (data) => {
        Toast.show(data.message || '操作失败', 'error');
      });

      return _socket;
    },

    /** 获取 socket 实例 */
    get socket() {
      return _socket;
    },

    /** 发送事件 */
    emit(event, data) {
      if (_socket) _socket.emit(event, data);
    },

    /** 监听事件 */
    on(event, callback) {
      if (_socket) _socket.on(event, callback);
    },

    /** 移除监听 */
    off(event, callback) {
      if (_socket) _socket.off(event, callback);
    },

    /** 获取 socket id */
    get id() {
      return _socket ? _socket.id : null;
    }
  };

  // ── Toast 通知工具 ─────────────────────────────
  const Toast = {
    container: null,

    init() {
      if (this.container) return;
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3000) {
      this.init();
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      this.container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  };

  // ── Session 工具 ────────────────────────────────
  const Session = {
    save(nickname, avatar) {
      sessionStorage.setItem('mr_nickname', nickname);
      sessionStorage.setItem('mr_avatar', avatar);
    },

    get nickname() {
      return sessionStorage.getItem('mr_nickname');
    },

    get avatar() {
      return sessionStorage.getItem('mr_avatar') || '🧙';
    },

    saveRoom(roomId) {
      sessionStorage.setItem('mr_roomId', roomId);
    },

    get roomId() {
      return sessionStorage.getItem('mr_roomId');
    },

    clearRoom() {
      sessionStorage.removeItem('mr_roomId');
    },

    isValid() {
      return !!(this.nickname && this.nickname.trim());
    }
  };

  // ── 时间格式化工具 ──────────────────────────────
  function formatTime(ts) {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // 挂载到 window
  window.SocketClient = SocketClient;
  window.Toast = Toast;
  window.Session = Session;
  window.formatTime = formatTime;

})(window);
