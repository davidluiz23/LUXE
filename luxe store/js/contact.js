// Contact Page Interactions - LUXE Store

document.addEventListener('DOMContentLoaded', () => {
    // Contact Form Handler
    const contactForm = document.getElementById('contactForm');
    const formAlert = document.getElementById('formAlert');

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMessage').value.trim();

            if (!name || !email || !message) {
                showFormAlert('Please fill in all required fields.', 'error');
                return;
            }

            // Simulate form submission success
            const submitBtn = contactForm.querySelector('.contact-submit-btn');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending Message...';
            submitBtn.disabled = true;

            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                contactForm.reset();
                showFormAlert('Thank you! Your message has been sent successfully. We will reply within 24 hours.', 'success');
            }, 1200);
        });
    }

    function showFormAlert(msg, type) {
        if (!formAlert) return;
        formAlert.textContent = msg;
        formAlert.style.display = 'block';
        formAlert.style.padding = '14px 18px';
        formAlert.style.borderRadius = '10px';
        formAlert.style.marginBottom = '20px';
        formAlert.style.fontSize = '0.9rem';

        if (type === 'success') {
            formAlert.style.backgroundColor = '#d4edda';
            formAlert.style.color = '#155724';
            formAlert.style.border = '1px solid #c3e6cb';
        } else {
            formAlert.style.backgroundColor = '#f8d7da';
            formAlert.style.color = '#721c24';
            formAlert.style.border = '1px solid #f5c6cb';
        }
    }

    // FAQ Accordion Handler
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(otherItem => otherItem.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
});
