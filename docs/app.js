/**
 * Zappp Documentation JavaScript
 * Lightweight, zero-dependency interactive docs engine
 */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileMenu();
  initTabs();
  initCopyButtons();
  initCommandPlayground();
  initScrollSpy();
  initSearch();
});

/* ==========================================================================
   1. Theme Management (Dark / Light Mode)
   ========================================================================== */
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const storedTheme = localStorage.getItem('zappp-theme') || 'dark';

  document.documentElement.setAttribute('data-theme', storedTheme);
  updateThemeIcon(storedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('zappp-theme', next);
      updateThemeIcon(next);
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (theme === 'light') {
    // Moon icon for switching back to dark
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" fill="none"/>`;
  } else {
    // Sun icon for switching to light
    icon.innerHTML = `<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>`;
  }
}

/* ==========================================================================
   2. Mobile Drawer Navigation
   ========================================================================== */
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const sidebar = document.querySelector('.docs-sidebar');
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggleBtn) {
      sidebar.classList.remove('open');
    }
  });

  // Close sidebar on link click on mobile
  const links = sidebar.querySelectorAll('.sidebar-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });
}

/* ==========================================================================
   3. Package Manager Tabs
   ========================================================================== */
const tabCommands = {
  install: {
    npm: 'npm install -g zappp',
    pnpm: 'pnpm add -g zappp',
    yarn: 'yarn global add zappp',
    bun: 'bun add -g zappp',
    npx: 'npx zappp'
  },
  local: {
    npm: 'npm install zappp',
    pnpm: 'pnpm add zappp',
    yarn: 'yarn add zappp',
    bun: 'bun add zappp'
  }
};

function initTabs() {
  const tabGroups = document.querySelectorAll('.code-tabs');

  tabGroups.forEach(group => {
    const groupId = group.dataset.group;
    const codeBlock = group.closest('.code-wrapper').querySelector('.code-body code');
    const buttons = group.querySelectorAll('.tab-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const pm = btn.dataset.tab;
        if (tabCommands[groupId] && tabCommands[groupId][pm]) {
          codeBlock.textContent = tabCommands[groupId][pm];
        }
      });
    });
  });
}

/* ==========================================================================
   4. Copy to Clipboard
   ========================================================================== */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll('.copy-btn');

  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      let textToCopy = '';
      const targetId = btn.dataset.target;

      if (targetId) {
        const targetEl = document.getElementById(targetId);
        textToCopy = targetEl ? targetEl.textContent.trim() : '';
      } else {
        const wrapper = btn.closest('.code-wrapper') || btn.closest('.preview-box');
        const codeEl = wrapper ? wrapper.querySelector('code') : null;
        textToCopy = codeEl ? codeEl.textContent.trim() : '';
      }

      if (!textToCopy) return;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
        btn.style.borderColor = 'var(--success)';

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.borderColor = '';
        }, 1800);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    });
  });
}

/* ==========================================================================
   5. Interactive Command Playground
   ========================================================================== */
function initCommandPlayground() {
  const dirInput = document.getElementById('play-dir');
  const portInput = document.getElementById('play-port');
  const hostInput = document.getElementById('play-host');
  const openCheckbox = document.getElementById('play-open');
  const outputCode = document.getElementById('play-output');

  if (!outputCode) return;

  function updateCommand() {
    const parts = ['zappp'];

    const dir = dirInput ? dirInput.value.trim() : '';
    if (dir && dir !== '.' && dir !== './') {
      parts.push(dir);
    }

    const port = portInput ? portInput.value.trim() : '';
    if (port && port !== '3000') {
      parts.push(`-p ${port}`);
    }

    const host = hostInput ? hostInput.value.trim() : '';
    if (host && host !== '0.0.0.0') {
      parts.push(`--host ${host}`);
    }

    if (openCheckbox && openCheckbox.checked) {
      parts.push('-o');
    }

    outputCode.textContent = parts.join(' ');
  }

  [dirInput, portInput, hostInput].forEach(el => {
    if (el) el.addEventListener('input', updateCommand);
  });

  if (openCheckbox) {
    openCheckbox.addEventListener('change', updateCommand);
  }

  updateCommand();
}

/* ==========================================================================
   6. ScrollSpy for Sidebar & Table of Contents
   ========================================================================== */
function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const tocLinks = document.querySelectorAll('.toc-link');

  if (sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');

        sidebarLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });

        tocLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, {
    rootMargin: '-80px 0px -70% 0px',
    threshold: 0
  });

  sections.forEach(section => observer.observe(section));
}

/* ==========================================================================
   7. Instant Search Modal
   ========================================================================== */
function initSearch() {
  const trigger = document.getElementById('search-trigger');
  const modalBackdrop = document.getElementById('search-modal-backdrop');
  const searchInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');

  if (!trigger || !modalBackdrop || !searchInput || !resultsContainer) return;

  // Build search index from all sections
  const index = [];
  document.querySelectorAll('section[id]').forEach(section => {
    const id = section.id;
    const heading = section.querySelector('h2, h3');
    const title = heading ? heading.textContent.trim() : id;
    const paragraphs = Array.from(section.querySelectorAll('p, li, code'))
      .map(el => el.textContent.trim())
      .join(' ')
      .slice(0, 180);

    index.push({ id, title, desc: paragraphs });
  });

  function openSearch() {
    modalBackdrop.classList.add('open');
    searchInput.value = '';
    renderResults('');
    setTimeout(() => searchInput.focus(), 50);
  }

  function closeSearch() {
    modalBackdrop.classList.remove('open');
  }

  function renderResults(query) {
    const q = query.toLowerCase().trim();
    resultsContainer.innerHTML = '';

    const matches = q
      ? index.filter(item => item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q))
      : index.slice(0, 6);

    if (matches.length === 0) {
      resultsContainer.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No results found for "${query}"</div>`;
      return;
    }

    matches.forEach((item, i) => {
      const a = document.createElement('a');
      a.className = `search-result-item ${i === 0 ? 'selected' : ''}`;
      a.href = `#${item.id}`;
      a.innerHTML = `
        <div class="search-result-title">${item.title}</div>
        <div class="search-result-desc">${item.desc}...</div>
      `;
      a.addEventListener('click', () => {
        closeSearch();
      });
      resultsContainer.appendChild(a);
    });
  }

  trigger.addEventListener('click', openSearch);

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeSearch();
  });

  searchInput.addEventListener('input', (e) => {
    renderResults(e.target.value);
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    // Open with Cmd+K or Ctrl+K or '/'
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      modalBackdrop.classList.contains('open') ? closeSearch() : openSearch();
    } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) {
      closeSearch();
    }
  });
}

