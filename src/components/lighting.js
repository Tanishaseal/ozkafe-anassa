export function initLighting() {
  const sections = document.querySelectorAll('.mystic-section');
  const appContainer = document.getElementById('app');
  
  if (sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    let mostVisible = null;
    let highestRatio = 0;

    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio > highestRatio) {
        highestRatio = entry.intersectionRatio;
        mostVisible = entry.target;
      }
    });

    if (mostVisible) {
      const color = mostVisible.getAttribute('data-color');
      if (color) {
        appContainer.style.setProperty('--ambient-color', color);
      }
    }
  }, {
    rootMargin: '-30% 0px -30% 0px',
    threshold: [0, 0.25, 0.5, 0.75, 1]
  });

  sections.forEach(sec => observer.observe(sec));
  
  // Set initial
  if (sections[0]) {
    appContainer.style.setProperty('--ambient-color', sections[0].getAttribute('data-color'));
  }
}
