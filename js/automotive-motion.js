(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('motion-enabled');

  // A short first-visit brand reveal creates a launch-film opening without
  // making repeat visitors sit through it on every page load.
  const intro = document.getElementById('brand-intro');
  let seen = false;
  try { seen = sessionStorage.getItem('cp_intro_seen') === '1'; } catch { /* storage optional */ }
  if (intro) {
    if (reduceMotion || seen) {
      intro.remove();
      document.body.classList.add('page-ready');
    } else {
      requestAnimationFrame(() => intro.classList.add('playing'));
      setTimeout(() => {
        intro.classList.add('leaving');
        document.body.classList.add('page-ready');
        try { sessionStorage.setItem('cp_intro_seen', '1'); } catch { /* noop */ }
      }, 1450);
      setTimeout(() => intro.remove(), 2450);
    }
  } else {
    document.body.classList.add('page-ready');
  }

  const revealTargets = [
    ...document.querySelectorAll('.section-label, .intro h2, .intro-grid > div:last-child, .standards article, .process-heading > *, .process-list li, .services-copy, .service-list > div, .founder-quote, .founder-story, .roadmap-intro, .roadmap-steps li, .updates-card'),
  ];
  revealTargets.forEach((el, index) => {
    el.classList.add('motion-reveal');
    el.style.setProperty('--reveal-delay', `${Math.min(index % 5, 4) * 55}ms`);
  });

  const revealHeadings = [...document.querySelectorAll('.manifesto h2, .cinematic-copy h2, .intro h2, .process-heading h2, .services h2, .founder h2, .opening-roadmap h2, .updates-card h2')];
  revealHeadings.forEach((heading) => heading.classList.add('motion-heading'));

  // IntersectionObserver can miss elements during fast scrolling, history
  // restoration, or a direct jump to an anchor. Never leave passed content
  // hidden: the scroll loop below provides a position-based fallback.
  const revealPassedContent = () => {
    const revealLine = window.innerHeight * 0.98;
    revealTargets.forEach((el) => {
      if (el.getBoundingClientRect().top < revealLine) el.classList.add('is-visible');
    });
    revealHeadings.forEach((heading) => {
      if (heading.getBoundingClientRect().top < revealLine) heading.classList.add('is-unmasked');
    });
  };

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach((el) => observer.observe(el));

    const headingObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-unmasked');
          headingObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -2% 0px' });
    revealHeadings.forEach((heading) => headingObserver.observe(heading));
    requestAnimationFrame(revealPassedContent);
    setTimeout(revealPassedContent, 2600);

    const panels = document.querySelectorAll('.cinematic-panel');
    const panelObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('in-view', entry.isIntersecting));
    }, { threshold: 0.25 });
    panels.forEach((panel) => panelObserver.observe(panel));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-visible'));
    revealHeadings.forEach((heading) => heading.classList.add('is-unmasked'));
  }

  // Full-height navigation choreography with keyboard and focus support.
  const menu = document.getElementById('site-menu');
  const menuToggle = document.getElementById('menu-toggle');
  const menuClose = document.getElementById('menu-close');
  const menuVisual = document.getElementById('menu-visual');
  const menuLinks = menu ? [...menu.querySelectorAll('.menu-nav a')] : [];
  let returnFocus = null;

  function setMenu(open) {
    if (!menu || !menuToggle) return;
    if (open) {
      returnFocus = document.activeElement;
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      menuToggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        menu.classList.add('is-open');
        menuClose?.focus();
      }));
    } else {
      menu.classList.remove('is-open');
      menu.classList.add('is-closing');
      menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      setTimeout(() => {
        menu.hidden = true;
        menu.classList.remove('is-closing');
        menu.setAttribute('aria-hidden', 'true');
        returnFocus?.focus?.();
      }, reduceMotion ? 0 : 720);
    }
  }

  menuToggle?.addEventListener('click', () => setMenu(true));
  menuClose?.addEventListener('click', () => setMenu(false));
  menu?.addEventListener('click', (event) => {
    if (event.target === menu) setMenu(false);
  });
  menuLinks.forEach((link) => {
    const activateScene = () => {
      if (menuVisual) menuVisual.dataset.scene = link.dataset.scene || 'difference';
      menuLinks.forEach((item) => item.classList.toggle('is-active', item === link));
    };
    link.addEventListener('mouseenter', activateScene);
    link.addEventListener('focus', activateScene);
    link.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('keydown', (event) => {
    if (!menu || menu.hidden) return;
    if (event.key === 'Escape') setMenu(false);
    if (event.key === 'Tab') {
      const focusable = [...menu.querySelectorAll('button:not([disabled]), a[href]')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  // Scroll progress and active chapter indicator.
  const rail = document.getElementById('journey-rail');
  const railButtons = rail ? [...rail.querySelectorAll('button[data-target]')] : [];
  const sections = railButtons.map((button) => document.getElementById(button.dataset.target)).filter(Boolean);
  railButtons.forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })));

  let ticking = false;
  function updateScrollEffects() {
    ticking = false;
    revealPassedContent();
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    document.documentElement.style.setProperty('--page-progress', `${Math.min(100, y / max * 100)}%`);
    document.body.classList.toggle('has-scrolled', y > 40);

    let active = 0;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.48) active = index;
    });
    railButtons.forEach((button, index) => button.classList.toggle('active', index === active));

    if (!reduceMotion) {
      const hero = document.querySelector('.hero-cinematic');
      if (hero && y < window.innerHeight * 1.2) {
        hero.style.setProperty('--hero-shift', `${Math.min(7, y * 0.008)}%`);
        hero.style.setProperty('--hero-scale', String(1 + Math.min(.045, y * .00005)));
      }
      document.querySelectorAll('.cinematic-panel.in-view').forEach((panel) => {
        const rect = panel.getBoundingClientRect();
        const shift = ((window.innerHeight / 2 - (rect.top + rect.height / 2)) / window.innerHeight) * 3;
        panel.style.setProperty('--panel-shift', `${shift}%`);
      });
    }
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateScrollEffects); }
  }, { passive: true });
  window.addEventListener('pageshow', revealPassedContent);
  window.addEventListener('resize', revealPassedContent);
  updateScrollEffects();

  // Small pointer response on primary calls-to-action; never applied on touch.
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.button, .header-cta').forEach((button) => {
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect();
        button.style.setProperty('--mag-x', `${(event.clientX - rect.left - rect.width / 2) * .08}px`);
        button.style.setProperty('--mag-y', `${(event.clientY - rect.top - rect.height / 2) * .12}px`);
      });
      button.addEventListener('pointerleave', () => {
        button.style.setProperty('--mag-x', '0px');
        button.style.setProperty('--mag-y', '0px');
      });
    });
  }
})();
