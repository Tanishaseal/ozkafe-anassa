export function initParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;

  const particleCount = 40;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    
    // Randomize properties
    const startX = Math.random() * 100;
    const startY = Math.random() * 100;
    const size = Math.random() * 3 + 1;
    const driftX = (Math.random() - 0.5) * 50;
    const driftY = -50 - Math.random() * 100;
    const duration = 10 + Math.random() * 20;
    const delay = Math.random() * 20;
    
    // Apply styles
    particle.style.left = `${startX}vw`;
    particle.style.top = `${startY}vh`;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.opacity = '0';
    
    particle.style.setProperty('--drift-x', `${driftX}px`);
    particle.style.setProperty('--drift-y', `${driftY}px`);
    
    particle.style.animation = `
      particleFloat ${duration}s linear ${delay}s infinite,
      particleGlow ${duration / 2}s ease-in-out ${delay}s infinite alternate
    `;
    
    container.appendChild(particle);
  }
}

export function triggerConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  
  container.innerHTML = '';
  const colors = ['#d4a574', '#e8c49a', '#f5e6d3', '#ffffff'];
  
  for (let i = 0; i < 100; i++) {
    const confetti = document.createElement('div');
    confetti.classList.add('confetti');
    
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const velocity = 50 + Math.random() * 150;
    const x = Math.cos(angle) * velocity;
    const y = Math.sin(angle) * velocity + 100; // slightly downward
    const rotation = Math.random() * 720 - 360;
    const duration = 1 + Math.random();
    
    confetti.style.background = color;
    confetti.style.boxShadow = `0 0 10px ${color}`;
    confetti.style.setProperty('--end-x', `${x}px`);
    confetti.style.setProperty('--end-y', `${y}px`);
    confetti.style.setProperty('--end-r', `${rotation}deg`);
    
    confetti.style.animation = `confettiPiece ${duration}s ease-out forwards`;
    
    container.appendChild(confetti);
  }
}
