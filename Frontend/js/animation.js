// Small, progressive motion layer. Content remains visible when motion is
// reduced or IntersectionObserver is unavailable.
(function initializeSubtleMotion() {
    'use strict';

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    document.addEventListener('DOMContentLoaded', () => {
        const selectors = [
            '.category-card',
            '.feature',
            '.review-card',
            '.about-card',
            '.value-card',
            '.stat-item',
            '.section-heading-row',
            '.house-story-copy',
            '.newsletter-box',
            '.support-card',
        ].join(', ');
        const elements = Array.from(document.querySelectorAll(selectors));
        if (!elements.length) return;

        if (!document.getElementById('reveal-animation-styles')) {
            const style = document.createElement('style');
            style.id = 'reveal-animation-styles';
            style.textContent = `
                @media (prefers-reduced-motion: no-preference) {
                    .reveal-item,
                    html.alkebulan-site .reveal-item {
                        opacity: 0;
                        transform: translateY(10px);
                        transition:
                            opacity .68s cubic-bezier(.16, 1, .3, 1),
                            transform .68s cubic-bezier(.16, 1, .3, 1);
                        transition-delay: var(--reveal-delay, 0ms);
                    }
                    .reveal-item.revealed,
                    html.alkebulan-site .reveal-item.revealed {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        if (reducedMotion || !('IntersectionObserver' in window)) {
            elements.forEach(element => element.classList.add('revealed'));
            return;
        }

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -4% 0px',
        });

        elements.forEach((element, index) => {
            element.classList.add('reveal-item');
            element.style.setProperty('--reveal-delay', `${(index % 4) * 36}ms`);
            const rect = element.getBoundingClientRect();
            if (rect.top < window.innerHeight * 1.04 && rect.bottom > 0) {
                element.classList.add('revealed');
            } else {
                observer.observe(element);
            }
        });
    }, { once: true });
})();
