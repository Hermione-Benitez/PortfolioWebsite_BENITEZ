(() => {
  'use strict';

  function initScrollChrome() {
    const navbar = document.querySelector('.site-navbar');
    const progressBar = document.querySelector('.scroll-progress');
    const backToTop = document.querySelector('.back-to-top');
    const isHeroPage =
      document.body.dataset.hasHero === 'true' ||
      Boolean(document.querySelector('[data-hero-section]'));

    if (navbar && !isHeroPage) {
      navbar.classList.add('navbar-inner');
    }

    let ticking = false;
    function update() {
      const scrollY = window.scrollY || window.pageYOffset;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;

      if (navbar && isHeroPage) {
        navbar.classList.toggle('scrolled', scrollY > 40);
      }

      if (progressBar) {
        const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollY / docHeight) * 100)) : 0;
        progressBar.style.width = pct.toFixed(2) + '%';
      }

      if (backToTop) {
        backToTop.classList.toggle('is-visible', scrollY > 420);
      }

      ticking = false;
    }

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );

    update();

    if (backToTop) {
      backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  function initActiveNav() {
    const rawPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    let activeKey = 'about';

    if (rawPath.includes('achievements')) activeKey = 'experiences';
    else if (rawPath.includes('portfolio')) activeKey = 'portfolio';
    else if (rawPath.includes('contact')) activeKey = 'contact';
    else if (rawPath.includes('privacy')) activeKey = 'privacy';

    document.querySelectorAll('.site-navbar [data-nav]').forEach((link) => {
      const isMatch = link.getAttribute('data-nav') === activeKey;
      link.classList.toggle('active', isMatch);
      if (isMatch) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Auto-close mobile nav drawer after clicking a link
    const collapseEl = document.getElementById('navbarNav');
    if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
      collapseEl.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          if (collapseEl.classList.contains('show')) {
            const bsCollapse = window.bootstrap.Collapse.getOrCreateInstance(collapseEl);
            bsCollapse.hide();
          }
        });
      });
    }
  }

  function initRevealObserver() {
    const targets = document.querySelectorAll('[data-reveal], .timeline-section');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -30px 0px',
      }
    );

    targets.forEach((el) => {
      const delay = el.getAttribute('data-delay');
      if (delay) {
        el.style.setProperty('--reveal-delay', delay + 'ms');
      }
      observer.observe(el);
    });
  }

  function initScrollDynamics() {
    const floatEls = Array.from(document.querySelectorAll('[data-scroll-float]'));
    const timelineRows = Array.from(document.querySelectorAll('.timeline-row'));
    let ticking = false;

    function updateDynamics() {
      const scrollY = window.scrollY || window.pageYOffset;
      const vh = window.innerHeight || 900;
      document.documentElement.style.setProperty('--scroll-y', scrollY.toFixed(1) + 'px');

      floatEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const centerOffset = (rect.top + rect.height * 0.5 - vh * 0.5) / vh;
        const speed = parseFloat(el.getAttribute('data-scroll-float')) || 18;
        const clamped = Math.max(-1, Math.min(1, centerOffset));
        el.style.setProperty('--scroll-offset', (clamped * speed).toFixed(2) + 'px');
      });

      if (timelineRows.length) {
        const focusLine = vh * 0.52;
        let closestRow = null;
        let minDist = Infinity;

        timelineRows.forEach((row) => {
          const rect = row.getBoundingClientRect();
          const mid = rect.top + rect.height * 0.5;
          const dist = Math.abs(mid - focusLine);
          if (rect.bottom > 80 && rect.top < vh - 80 && dist < minDist) {
            minDist = dist;
            closestRow = row;
          }
        });

        timelineRows.forEach((row) => {
          row.classList.toggle('is-in-focus', row === closestRow);
        });
      }

      ticking = false;
    }

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(updateDynamics);
          ticking = true;
        }
      },
      { passive: true }
    );

    updateDynamics();
  }

  function initSpotlightCards() {
    const canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    if (!canHover) return;

    document.querySelectorAll('[data-spotlight]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mx', x + 'px');
        card.style.setProperty('--my', y + 'px');
      });
    });
  }

  function initCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const value = btn.getAttribute('data-copy');
        if (!value) return;

        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const temp = document.createElement('textarea');
          temp.value = value;
          temp.style.position = 'fixed';
          temp.style.opacity = '0';
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
        }

        const labelEl = btn.querySelector('[data-copy-label]') || btn;
        const original = labelEl.textContent;
        btn.classList.add('is-copied');
        labelEl.textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('is-copied');
          labelEl.textContent = original;
        }, 1800);
      });
    });
  }

  function initLightbox() {
    const triggers = Array.from(document.querySelectorAll('[data-lightbox]'));
    if (!triggers.length) return;

    const modal = document.createElement('div');
    modal.className = 'lightbox-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Artwork preview');
    modal.innerHTML = `
      <div class="lightbox-dialog">
        <button type="button" class="lightbox-close-btn" aria-label="Close preview">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
        <div class="lightbox-media">
          <img src="" alt="" />
        </div>
        <div class="lightbox-info">
          <span class="lightbox-category"></span>
          <h2 class="lightbox-title"></h2>
          <p class="lightbox-meta"></p>
          <p class="lightbox-desc"></p>
          <div class="lightbox-controls">
            <button type="button" class="lightbox-nav-btn" data-lb-prev aria-label="Previous item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 18l-6-6 6-6"></path>
              </svg>
            </button>
            <button type="button" class="lightbox-nav-btn" data-lb-next aria-label="Next item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6"></path>
              </svg>
            </button>
            <span class="lightbox-counter"></span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const dialog = modal.querySelector('.lightbox-dialog');
    const imgEl = modal.querySelector('.lightbox-media img');
    const catEl = modal.querySelector('.lightbox-category');
    const titleEl = modal.querySelector('.lightbox-title');
    const metaEl = modal.querySelector('.lightbox-meta');
    const descEl = modal.querySelector('.lightbox-desc');
    const counterEl = modal.querySelector('.lightbox-counter');
    const controlsEl = modal.querySelector('.lightbox-controls');
    const closeBtn = modal.querySelector('.lightbox-close-btn');
    const prevBtn = modal.querySelector('[data-lb-prev]');
    const nextBtn = modal.querySelector('[data-lb-next]');

    let activeList = [];
    let currentIndex = 0;
    let lastFocused = null;

    function renderSlide(idx) {
      if (!activeList.length) return;
      currentIndex = (idx + activeList.length) % activeList.length;
      const el = activeList[currentIndex];
      const src = el.getAttribute('data-lb-src') || '';
      const alt = el.getAttribute('data-lb-alt') || el.getAttribute('data-lb-title') || 'Artwork';
      const title = el.getAttribute('data-lb-title') || '';
      const meta = el.getAttribute('data-lb-meta') || '';
      const desc = el.getAttribute('data-lb-desc') || '';
      const category = el.getAttribute('data-lb-category') || 'Design';

      imgEl.src = src;
      imgEl.alt = alt;
      catEl.textContent = category;
      titleEl.textContent = title;
      metaEl.textContent = meta;
      metaEl.style.display = meta ? 'block' : 'none';
      descEl.textContent = desc;
      descEl.style.display = desc ? 'block' : 'none';
      counterEl.textContent = activeList.length > 1 ? `${currentIndex + 1} / ${activeList.length}` : '';
      controlsEl.style.display = activeList.length > 1 ? 'flex' : 'none';
    }

    function openModal(triggerEl) {
      const group = triggerEl.getAttribute('data-lightbox') || 'default';
      activeList = triggers.filter((el) => {
        const sameGroup = (el.getAttribute('data-lightbox') || 'default') === group;
        const parentCard = el.closest('[data-work-card]');
        const visible = !parentCard || !parentCard.classList.contains('is-filtered-out');
        return sameGroup && visible;
      });

      const idx = Math.max(0, activeList.indexOf(triggerEl));
      dialog.classList.toggle('lightbox-dialog--single', activeList.length <= 1 && !triggerEl.getAttribute('data-lb-desc'));
      lastFocused = document.activeElement;
      renderSlide(idx);
      modal.classList.add('is-open');
      document.body.classList.add('modal-open-lock');
      closeBtn.focus();
    }

    function closeModal() {
      modal.classList.remove('is-open');
      document.body.classList.remove('modal-open-lock');
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
    }

    triggers.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(el);
      });
    });

    closeBtn.addEventListener('click', closeModal);
    prevBtn.addEventListener('click', () => renderSlide(currentIndex - 1));
    nextBtn.addEventListener('click', () => renderSlide(currentIndex + 1));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowLeft' && activeList.length > 1) renderSlide(currentIndex - 1);
      else if (e.key === 'ArrowRight' && activeList.length > 1) renderSlide(currentIndex + 1);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initScrollChrome();
    initActiveNav();
    initRevealObserver();
    initScrollDynamics();
    initSpotlightCards();
    initCopyButtons();
    initLightbox();
  });
})();
