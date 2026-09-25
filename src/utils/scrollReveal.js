export function initScrollReveal() {
  const elements = document.querySelectorAll('.reveal, .reveal-stagger');
  
  if (elements.length === 0) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(el => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (entry.target.classList.contains('reveal-stagger')) {
          // It's a container, reveal its children
          const children = entry.target.querySelectorAll('.reveal');
          children.forEach(child => child.classList.add('revealed'));
        } else {
          entry.target.classList.add('revealed');
        }
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  });

  elements.forEach(el => observer.observe(el));
}
