/**
 * ui.js — Global toast notifications and modal dialogs
 * Replaces all browser alert() / confirm() calls
 */
(function (global) {
  'use strict';

  // ── Toast ──────────────────────────────────────────────────────────────────
  var toastContainer = null;

  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.style.cssText =
        'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:360px;width:calc(100% - 40px);pointer-events:none;';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  var iconMap = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  var colorMap = {
    success: { bg: 'rgba(87,242,135,0.12)', border: 'rgba(87,242,135,0.3)', color: '#57F287' },
    error:   { bg: 'rgba(237,66,69,0.12)',  border: 'rgba(237,66,69,0.3)',  color: '#ED4245' },
    warning: { bg: 'rgba(254,231,92,0.12)', border: 'rgba(254,231,92,0.3)', color: '#FEE75C' },
    info:    { bg: 'rgba(88,101,242,0.12)', border: 'rgba(88,101,242,0.3)', color: '#5865F2' },
  };

  function toast(message, type, duration) {
    type = type || 'info';
    duration = duration !== undefined ? duration : 4000;
    var c = colorMap[type] || colorMap.info;
    var icon = iconMap[type] || iconMap.info;
    var container = getToastContainer();

    var el = document.createElement('div');
    el.style.cssText = [
      'display:flex;align-items:flex-start;gap:12px;',
      'background:' + c.bg + ';',
      'border:1px solid ' + c.border + ';',
      'border-radius:10px;padding:14px 16px;',
      'font-size:14px;color:' + c.color + ';',
      'box-shadow:0 8px 32px rgba(0,0,0,0.4);',
      'pointer-events:all;',
      'transform:translateX(120%);transition:transform 0.3s cubic-bezier(.34,1.56,.64,1);',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      'font-family:var(--font-secondary,sans-serif);line-height:1.4;',
    ].join('');

    el.innerHTML = '<span style="flex-shrink:0;margin-top:1px;">' + icon + '</span>' +
      '<span style="flex:1;">' + message + '</span>' +
      '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:currentColor;cursor:pointer;opacity:0.6;font-size:18px;line-height:1;padding:0;flex-shrink:0;margin-top:-1px;">×</button>';

    container.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.style.transform = 'translateX(0)';
      });
    });

    if (duration > 0) {
      setTimeout(function () {
        el.style.transform = 'translateX(120%)';
        setTimeout(function () { el.remove(); }, 300);
      }, duration);
    }
  }

  // ── Confirm Dialog ─────────────────────────────────────────────────────────
  function confirm(message, onConfirm, opts) {
    opts = opts || {};
    var title = opts.title || 'Confirm';
    var confirmText = opts.confirmText || 'Confirm';
    var cancelText = opts.cancelText || 'Cancel';
    var danger = opts.danger !== false;

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

    var box = document.createElement('div');
    box.style.cssText =
      'background:var(--bg-card,#161922);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:28px;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.6);animation:modalIn 0.2s ease;';

    box.innerHTML =
      '<h3 style="font-family:var(--font-primary,sans-serif);font-size:17px;font-weight:600;color:var(--text-primary,#e2e8f0);margin-bottom:10px;">' + title + '</h3>' +
      '<p style="font-size:14px;color:var(--text-muted,#94a3b8);margin-bottom:24px;line-height:1.5;">' + message + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
        '<button id="ui-cancel" style="padding:9px 20px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.08));background:rgba(255,255,255,0.05);color:var(--text-muted,#94a3b8);font-size:14px;cursor:pointer;font-family:inherit;">' + cancelText + '</button>' +
        '<button id="ui-confirm" style="padding:9px 20px;border-radius:8px;border:none;background:' + (danger ? 'var(--danger,#ED4245)' : 'var(--accent,#5865F2)') + ';color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">' + confirmText + '</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }

    box.querySelector('#ui-cancel').addEventListener('click', close);
    box.querySelector('#ui-confirm').addEventListener('click', function () {
      close();
      if (onConfirm) onConfirm();
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  // ── Alert Dialog ───────────────────────────────────────────────────────────
  function alert(message, opts) {
    opts = opts || {};
    var title = opts.title || 'Notice';
    var btnText = opts.btnText || 'OK';

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

    var box = document.createElement('div');
    box.style.cssText =
      'background:var(--bg-card,#161922);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:28px;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.6);animation:modalIn 0.2s ease;';

    box.innerHTML =
      '<h3 style="font-family:var(--font-primary,sans-serif);font-size:17px;font-weight:600;color:var(--text-primary,#e2e8f0);margin-bottom:10px;">' + title + '</h3>' +
      '<p style="font-size:14px;color:var(--text-muted,#94a3b8);margin-bottom:24px;line-height:1.5;">' + message + '</p>' +
      '<div style="display:flex;justify-content:flex-end;">' +
        '<button id="ui-ok" style="padding:9px 24px;border-radius:8px;border:none;background:var(--accent,#5865F2);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">' + btnText + '</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('#ui-ok').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  }

  // Inject animation keyframe once
  if (!document.getElementById('ui-style')) {
    var s = document.createElement('style');
    s.id = 'ui-style';
    s.textContent = '@keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}';
    document.head.appendChild(s);
  }

  global.UI = { toast: toast, confirm: confirm, alert: alert };
})(window);
