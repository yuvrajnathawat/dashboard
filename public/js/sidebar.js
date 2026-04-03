/**
 * sidebar.js — Collapsible sidebar with proper margin sync
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var sidebar    = document.querySelector('.sidebar');
    var navbar     = document.querySelector('.navbar');
    var mainContent= document.querySelector('.main-content');
    var appLayout  = document.querySelector('.app-layout');
    var toggleBtn  = document.querySelector('.sidebar-toggle');
    var hamburgerBtn = document.querySelector('.hamburger-btn');
    var overlay    = document.querySelector('.sidebar-overlay');

    if (!sidebar) return;

    var SIDEBAR_FULL = 240;
    var SIDEBAR_COLLAPSED = 60;
    var isMobile = function() { return window.innerWidth <= 768; };

    // ── Apply collapsed state ───────────────────────────────────────────────
    function applyCollapsed(collapsed) {
      if (isMobile()) return;
      var w = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL;
      sidebar.style.width = w + 'px';
      if (navbar)      navbar.style.left = w + 'px';
      if (mainContent) mainContent.style.marginLeft = w + 'px';

      if (collapsed) {
        sidebar.classList.add('sidebar--collapsed');
        if (appLayout) appLayout.classList.add('sidebar-collapsed');
      } else {
        sidebar.classList.remove('sidebar--collapsed');
        if (appLayout) appLayout.classList.remove('sidebar-collapsed');
      }
    }

    var isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    applyCollapsed(isCollapsed);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        isCollapsed = !isCollapsed;
        applyCollapsed(isCollapsed);
        localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
      });
    }

    // ── Mobile overlay toggle ───────────────────────────────────────────────
    function openMobileSidebar() {
      sidebar.classList.add('mobile-open');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeMobileSidebar() {
      sidebar.classList.remove('mobile-open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (hamburgerBtn) {
      hamburgerBtn.addEventListener('click', function () {
        if (sidebar.classList.contains('mobile-open')) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      });
    }

    if (overlay) overlay.addEventListener('click', closeMobileSidebar);

    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (isMobile()) closeMobileSidebar();
      });
    });

    // ── Re-apply on resize ──────────────────────────────────────────────────
    window.addEventListener('resize', function () {
      if (isMobile()) {
        if (navbar)      navbar.style.left = '0';
        if (mainContent) mainContent.style.marginLeft = '0';
      } else {
        closeMobileSidebar();
        applyCollapsed(isCollapsed);
      }
    });

    // ── Active link highlighting ────────────────────────────────────────────
    var currentPath = window.location.pathname;
    sidebar.querySelectorAll('a').forEach(function (link) {
      var href = link.getAttribute('href');
      if (href && (currentPath === href || (href !== '/' && currentPath.startsWith(href)))) {
        link.classList.add('active');
      }
    });
  });
})();
