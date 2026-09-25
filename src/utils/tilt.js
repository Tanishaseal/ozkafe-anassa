export function initTilt() {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const cards = document.querySelectorAll('.menu-card');
  const maxTilt = 10; // degrees

  cards.forEach(card => {
    card.addEventListener('pointermove', (e) => {
      // Calculate cursor position relative to card center
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const tiltX = ((y - centerY) / centerY) * -maxTilt;
      const tiltY = ((x - centerX) / centerX) * maxTilt;
      
      card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      
      // Update glow position
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });

    card.addEventListener('pointerleave', () => {
      card.style.transform = `perspective(800px) rotateX(0deg) rotateY(0deg)`;
      // Reset glow
      card.style.setProperty('--mouse-x', `-1000px`);
      card.style.setProperty('--mouse-y', `-1000px`);
    });
  });
}
