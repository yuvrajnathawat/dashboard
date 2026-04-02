/**
 * sidebar.js — Collapsible sidebar toggle with localStorage persistence
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var sidebar = document.querySelector('.sidebar');
    var appLayout = document.querySelector('.app-layout');
    var toggleBtn = document.querySelector('.sidebar-toggle');
    var hamburgerBtn = document.querySelector('.hamburger-btn');
    var overlay = document.querySelector('.sidebar-overlay');

    if (!sidebar) return;

    // ── Desktop collapse state ──────────────────────────────────────────────
    var isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    function applyCollapsed(collapsed) {
      if (collapsed) {
        sidebar.classList.add('sidebar--collapsed');
        if (appLayout) appLayout.classList.add('sidebar-collapsed');
      } else {
        sidebar.classList.remove('sidebar--collapsed');
        if (appLayout) appLayout.classList.remove('sidebar-collapsed');
      }
    }

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

    if (overlay) {
      overlay.addEventListener('click', closeMobileSidebar);
    }

    // Close mobile sidebar on nav link click
    var navLinks = sidebar.querySelectorAll('a');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
          closeMobileSidebar();
        }
      });
    });

    // ── Active link highlighting ────────────────────────────────────────────
    var currentPath = window.location.pathname;
    navLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      if (href && (currentPath === href || (href !== '/' && currentPath.startsWith(href)))) {
        link.classList.add('active');
      }
    });
  });
})();
