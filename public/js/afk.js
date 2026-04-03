/**
 * afk.js — AFK ping loop, CAPTCHA challenge UI, and keep-alive
 */
(function () {
  'use strict';

  var PING_INTERVAL_MS = 60000; // 60 seconds
  var pingTimer = null;
  var sessionEarned = 0;
  var rafHandle = null;
  var lastActivity = Date.now();

  // DOM references (set on DOMContentLoaded)
  var coinCounterEl = null;
  var sessionEarnedEl = null;
  var captchaOverlay = null;
  var captchaBtn = null;
  var statusEl = null;

  // ── CSRF token helper ─────────────────────────────────────────────────────
  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    var input = document.querySelector('input[name="_csrf"]');
    if (input) return input.value;
    return '';
  }

  // ── Fetch wrapper ─────────────────────────────────────────────────────────
  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': getCsrfToken(),
      },
      body: JSON.stringify(body || {}),
      credentials: 'same-origin',
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }

  // ── Update coin balance display ───────────────────────────────────────────
  function updateBalance(balance) {
    if (coinCounterEl) {
      coinCounterEl.textContent = balance.toLocaleString();
    }
    // Also update navbar balance if present
    var navBalance = document.querySelector('.navbar-coin-balance');
    if (navBalance) {
      navBalance.textContent = balance.toLocaleString();
    }
  }

  // ── Update session earned counter ─────────────────────────────────────────
  function updateSessionEarned(amount) {
    sessionEarned += amount;
    if (sessionEarnedEl) {
      sessionEarnedEl.textContent = sessionEarned.toLocaleString();
    }
  }

  // ── Show / hide captcha overlay ───────────────────────────────────────────
  function showCaptcha() {
    if (captchaOverlay) {
      captchaOverlay.classList.add('active');
    }
    stopPingLoop();
  }

  function hideCaptcha() {
    if (captchaOverlay) {
      captchaOverlay.classList.remove('active');
    }
  }

  // ── Set status text ───────────────────────────────────────────────────────
  function setStatus(text, type) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'afk-status';
    if (type) statusEl.classList.add('afk-status--' + type);
  }

  // ── Ping loop ─────────────────────────────────────────────────────────────
  function sendPing() {
    postJSON('/afk/ping')
      .then(function (data) {
        if (data.captchaRequired) {
          showCaptcha();
          setStatus('CAPTCHA required — please verify you are here.', 'warning');
          return;
        }

        if (data.limitReached) {
          setStatus('Daily limit reached. Come back tomorrow!', 'info');
          stopPingLoop();
          return;
        }

        if (typeof data.balance === 'number') {
          updateBalance(data.balance);
        }

        var earned = data.earned || 0;
        if (earned > 0) {
          updateSessionEarned(earned);
          setStatus('Earning coins...', 'active');
        }
      })
      .catch(function (err) {
        console.warn('AFK ping failed:', err.message);
        setStatus('Connection issue — retrying...', 'warning');
      });
  }

  function startPingLoop() {
    if (pingTimer) return;
    sendPing(); // immediate first ping
    pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    setStatus('Earning coins...', 'active');
  }

  function stopPingLoop() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // ── Keep-alive via requestAnimationFrame ──────────────────────────────────
  // Prevents browser tab throttling from slowing the ping interval
  function keepAlive() {
    lastActivity = Date.now();
    rafHandle = requestAnimationFrame(keepAlive);
  }

  // ── CAPTCHA verification ──────────────────────────────────────────────────
  function verifyCaptcha() {
    if (captchaBtn) {
      captchaBtn.disabled = true;
      captchaBtn.textContent = 'Verifying...';
    }

    postJSON('/afk/captcha-verify')
      .then(function (data) {
        if (data.success) {
          hideCaptcha();
          startPingLoop();
          setStatus('Earning coins...', 'active');
        } else {
          setStatus('Verification failed. Try again.', 'error');
        }
      })
      .catch(function (err) {
        console.warn('CAPTCHA verify failed:', err.message);
        setStatus('Verification error. Try again.', 'error');
      })
      .finally(function () {
        if (captchaBtn) {
          captchaBtn.disabled = false;
          captchaBtn.textContent = "I'm here";
        }
      });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    coinCounterEl = document.querySelector('.coin-counter');
    sessionEarnedEl = document.querySelector('.session-earned');
    captchaOverlay = document.querySelector('.captcha-overlay');
    captchaBtn = document.querySelector('.captcha-btn');
    statusEl = document.querySelector('.afk-status');

    if (captchaBtn) {
      captchaBtn.addEventListener('click', verifyCaptcha);
    }

    // Start keep-alive loop
    keepAlive();

    // Start ping loop
    startPingLoop();

    // Cleanup on page unload
    window.addEventListener('beforeunload', function () {
      stopPingLoop();
      if (rafHandle) cancelAnimationFrame(rafHandle);
    });
  });
})();
