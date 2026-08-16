// js/animation.js
// Scroll reveal animations
document.addEventListener('DOMContentLoaded', () => {
    // Add CSS for reveal animation
    if (!document.getElementById('reveal-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'reveal-animation-styles';
        style.textContent = `
            .reveal-item {
                opacity: 0;
                transform: translateY(20px);
                transition: opacity 0.6s ease, transform 0.6s ease;
            }
            .reveal-item.revealed {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
        `;
        document.head.appendChild(style);
    }

    const revealElements = document.querySelectorAll('.category-card, .feature, .review-card, .about-card');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.05,
        rootMargin: '50px'
    });

    revealElements.forEach(el => {
        el.classList.add('reveal-item');
        const rect = el.getBoundingClientRect();
        // If already in or near viewport, reveal immediately
        if (rect.top < window.innerHeight + 50 && rect.bottom > -50) {
            el.classList.add('revealed');
        } else {
            revealObserver.observe(el);
        }
    });
});



// Parallax effect on hero
window.addEventListener('scroll', () => {
    const hero = document.querySelector('.hero');
    if (hero) {
        const scrolled = window.scrollY;
        hero.style.backgroundPositionY = scrolled * 0.5 + 'px';
    }
});