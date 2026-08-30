// Contact page interactions - ALKEBULAN Store

document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contactForm");
  const formAlert = document.getElementById("formAlert");

  function showFormAlert(message, type) {
    if (!formAlert) return;

    formAlert.textContent = message;
    formAlert.className = `contact-form-alert ${type === "success" ? "is-success" : "is-error"}`;
    formAlert.hidden = false;
    formAlert.focus({ preventScroll: true });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        showFormAlert("Please complete the required fields with valid information.", "error");
        return;
      }

      const subjectSelect = document.getElementById("contactSubject");
      const payload = {
        name: document.getElementById("contactName")?.value.trim() || "",
        email: document.getElementById("contactEmail")?.value.trim() || "",
        subject: subjectSelect?.selectedOptions?.[0]?.textContent?.trim() || "General inquiry",
        message: document.getElementById("contactMessage")?.value.trim() || "",
      };
      const submitButton = contactForm.querySelector(".contact-submit-btn");
      const originalText = submitButton?.textContent || "Send Message";

      if (!window.LuxeContact || typeof window.LuxeContact.submit !== "function") {
        showFormAlert(
          "Messaging is unavailable right now. Please email hello@alkebulan.com or try again later.",
          "error",
        );
        return;
      }

      if (submitButton) {
        submitButton.textContent = "Sending message...";
        submitButton.disabled = true;
      }

      try {
        const result = await window.LuxeContact.submit(payload);
        if (result?.error) throw result.error;

        contactForm.reset();
        showFormAlert(
          "Your message has been received. Client services will reply as soon as possible.",
          "success",
        );
      } catch (error) {
        console.warn("[ALKEBULAN] Contact submission failed:", error?.message || error);
        showFormAlert(
          "We could not send your message right now. Please try again or email hello@alkebulan.com.",
          "error",
        );
      } finally {
        if (submitButton) {
          submitButton.textContent = originalText;
          submitButton.disabled = false;
        }
      }
    });
  }

  const faqItems = Array.from(document.querySelectorAll(".faq-item"));

  function setFaqState(item, expanded) {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    item.classList.toggle("active", expanded);
    question?.setAttribute("aria-expanded", String(expanded));
    if (answer) answer.hidden = !expanded;
  }

  faqItems.forEach((item, index) => {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    if (!question || !answer) return;

    const answerId = answer.id || `contactFaqAnswer${index + 1}`;
    answer.id = answerId;
    question.setAttribute("aria-controls", answerId);
    setFaqState(item, item.classList.contains("active"));

    question.addEventListener("click", () => {
      const shouldOpen = !item.classList.contains("active");
      faqItems.forEach((otherItem) => setFaqState(otherItem, false));
      if (shouldOpen) setFaqState(item, true);
    });
  });
});
