// ========== NETWORK MESH CANVAS (homepage hero only) ==========
(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let mouse = { x: null, y: null };
  let time = 0;

  function resizeCanvas() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); initParticles(); });

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.baseY = this.y;
      this.size = Math.random() * 2.5 + 1;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.6 + 0.3;
      this.waveAmp = Math.random() * 30 + 10;
      this.waveFreq = Math.random() * 0.002 + 0.001;
      this.waveOffset = Math.random() * Math.PI * 2;
      this.glowSize = this.size * (Math.random() * 2 + 2);
    }
    update() {
      this.x += this.speedX;
      this.y = this.baseY + Math.sin(this.x * this.waveFreq + time * 0.0008 + this.waveOffset) * this.waveAmp;
      if (this.x < -10) this.x = canvas.width + 10;
      if (this.x > canvas.width + 10) this.x = -10;
      if (mouse.x !== null) {
        const dx = mouse.x - this.x, dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
          this.x -= dx * 0.008;
          this.baseY -= dy * 0.008;
        }
      }
    }
    draw() {
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.glowSize);
      grad.addColorStop(0, `rgba(77, 208, 225, ${this.opacity * 0.9})`);
      grad.addColorStop(0.4, `rgba(30, 136, 229, ${this.opacity * 0.3})`);
      grad.addColorStop(1, 'rgba(30, 136, 229, 0)');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.glowSize, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 230, 255, ${this.opacity})`;
      ctx.fill();
    }
  }

  function initParticles() {
    particles = [];
    const count = Math.min(150, Math.floor(canvas.width * canvas.height / 6000));
    for (let i = 0; i < count; i++) particles.push(new Particle());
  }
  initParticles();

  function connectParticles() {
    const maxDist = 160;
    for (let a = 0; a < particles.length; a++) {
      for (let b = a + 1; b < particles.length; b++) {
        const dx = particles[a].x - particles[b].x, dy = particles[a].y - particles[b].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const alpha = 0.25 * (1 - dist / maxDist);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(30, 136, 229, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(particles[b].x, particles[b].y);
          ctx.stroke();
        }
      }
    }
  }

  function animateParticles() {
    time++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    connectParticles();
    requestAnimationFrame(animateParticles);
  }
  animateParticles();

  document.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
})();
