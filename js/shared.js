// ========== FULL-PAGE BACKGROUND PARTICLES ==========
(() => {
  const bgCanvas = document.getElementById('bg-canvas');
  if (!bgCanvas) return;
  const bgCtx = bgCanvas.getContext('2d');
  let bgParticles = [];
  let bgTime = 0;
  let pageHeight = 1;

  function resizeBg() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    pageHeight = document.documentElement.scrollHeight;
  }
  resizeBg();
  window.addEventListener('resize', () => { resizeBg(); initBgParticles(); });

  class BgParticle {
    constructor() { this.reset(); }
    reset() {
      const hasHeroCanvas = !!document.getElementById('hero-canvas');
      const startY = hasHeroCanvas ? window.innerHeight : 0;
      this.x = Math.random() * bgCanvas.width;
      this.pageY = startY + Math.random() * (pageHeight - startY);
      this.basePageY = this.pageY;
      this.size = Math.random() * 2 + 0.8;
      this.speedX = (Math.random() - 0.5) * 0.2;
      this.opacity = Math.random() * 0.35 + 0.12;
      this.waveAmp = Math.random() * 15 + 5;
      this.waveFreq = Math.random() * 0.001 + 0.0005;
      this.waveOffset = Math.random() * Math.PI * 2;
    }
    update() {
      this.x += this.speedX;
      this.pageY = this.basePageY + Math.sin(this.x * this.waveFreq + bgTime * 0.0005 + this.waveOffset) * this.waveAmp;
      if (this.x < -5) this.x = bgCanvas.width + 5;
      if (this.x > bgCanvas.width + 5) this.x = -5;
    }
  }

  function initBgParticles() {
    bgParticles = [];
    pageHeight = document.documentElement.scrollHeight;
    const hasHeroCanvas = !!document.getElementById('hero-canvas');
    const startY = hasHeroCanvas ? window.innerHeight : 0;
    const area = Math.max(0, pageHeight - startY);
    const count = Math.min(350, Math.floor(bgCanvas.width * area / 8000));
    for (let i = 0; i < count; i++) bgParticles.push(new BgParticle());
  }
  initBgParticles();

  function animateBg() {
    bgTime++;
    const scrollY = window.scrollY;
    const viewH = window.innerHeight;
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    const visible = [];
    bgParticles.forEach(p => {
      p.update();
      const screenY = p.pageY - scrollY;
      if (screenY > -50 && screenY < viewH + 50) {
        visible.push({ x: p.x, y: screenY, size: p.size, opacity: p.opacity });
      }
    });

    visible.forEach(p => {
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(77, 208, 225, ${p.opacity})`;
      bgCtx.fill();
    });

    const maxDist = 140;
    for (let a = 0; a < visible.length; a++) {
      for (let b = a + 1; b < visible.length; b++) {
        const dx = visible[a].x - visible[b].x;
        const dy = visible[a].y - visible[b].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          bgCtx.beginPath();
          bgCtx.strokeStyle = `rgba(30, 136, 229, ${0.1 * (1 - dist / maxDist)})`;
          bgCtx.lineWidth = 0.5;
          bgCtx.moveTo(visible[a].x, visible[a].y);
          bgCtx.lineTo(visible[b].x, visible[b].y);
          bgCtx.stroke();
        }
      }
    }

    requestAnimationFrame(animateBg);
  }
  animateBg();

  new ResizeObserver(() => {
    pageHeight = document.documentElement.scrollHeight;
  }).observe(document.body);
})();

// ========== CURSOR GLOW ==========
(() => {
  const glow = document.getElementById('cursor-glow');
  if (!glow) return;
  document.addEventListener('mousemove', e => {
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
  });
})();

// ========== NAV DROPDOWN (click-based) ==========
(() => {
  const dropdown = document.querySelector('.nav-dropdown');
  const trigger = document.querySelector('.nav-dropdown-trigger');
  if (!dropdown || !trigger) return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
})();

// ========== NAV SCROLL EFFECT ==========
(() => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  });
})();

// ========== MOBILE MENU ==========
(() => {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!hamburger || !mobileMenu) return;
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
  });
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
    });
  });
})();

// ========== SCROLL ANIMATIONS ==========
(() => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
})();

// ========== ANIMATED COUNTERS ==========
(() => {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const duration = 2000;
        const start = performance.now();
        function update(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.floor(eased * target) + suffix;
          if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));
})();
