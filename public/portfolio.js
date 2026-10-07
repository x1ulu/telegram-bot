/* Eriss — portfolio interactions.
 *
 * Vanilla, dependency-free and progressive: the page is fully readable without
 * this file, it only adds the mobile menu, smooth scrolling, entrance reveals
 * and the contact form's validation + submit states. */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // The desktop link row is hidden on small screens only when JS can offer the
  // menu button — without JS the links simply stay in the header.
  document.documentElement.classList.add('has-js');

  /* ---------------------------------------------------------------- nav ---- */
  const nav = $('.nav');
  const toggle = $('#nav-toggle');
  const menu = $('#mobile-menu');

  const setMenu = (open) => {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  };

  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 860) setMenu(false); });
  }

  const onScroll = () => { if (nav) nav.classList.toggle('is-stuck', window.scrollY > 6); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ------------------------------------------------------- smooth scroll --- */
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      setMenu(false);
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', hash);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  /* -------------------------------------------------- reveals + nav state -- */
  const revealables = $$('.reveal');
  const sections = $$('main .sec[id]');
  const navLinks = $$('.nav__links a');

  if ('IntersectionObserver' in window && !reduceMotion) {
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: .12 });
    revealables.forEach((el) => revealer.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  if ('IntersectionObserver' in window && sections.length && navLinks.length) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((section) => spy.observe(section));
  }

  /* -------------------------------------------------------------- contact -- */
  const form = $('#contact-form');
  if (!form) return;

  const status = $('#cf-status');
  const submit = $('#cf-submit');
  const label = $('.btn__label', submit);

  const fields = [
    { key: 'name', input: $('#cf-name'), test: (v) => v.trim().length >= 2 },
    { key: 'email', input: $('#cf-email'), test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) },
    { key: 'message', input: $('#cf-message'), test: (v) => v.trim().length >= 10 },
  ];

  const serverMessages = {
    email_not_configured: 'Email delivery is not configured yet — the message was not sent.',
    email_failed: 'The mail service could not send this message. Please try again shortly.',
    too_many_requests: 'Too many messages from this device. Please try again later.',
    invalid_name: 'Please check the highlighted fields.',
    invalid_email: 'Please check the highlighted fields.',
    invalid_message: 'Please check the highlighted fields.',
  };

  const setFieldState = (field, valid) => {
    const wrap = field.input.closest('.field');
    const error = $('.field__error', wrap);
    wrap.classList.toggle('is-invalid', !valid);
    field.input.setAttribute('aria-invalid', String(!valid));
    if (error) error.hidden = valid;
  };

  fields.forEach((field) => {
    if (!field.input) return;
    field.input.addEventListener('blur', () => {
      if (field.input.value.trim()) setFieldState(field, field.test(field.input.value));
    });
    field.input.addEventListener('input', () => {
      if ($('.field.is-invalid', field.input.closest('.field'))) setFieldState(field, field.test(field.input.value));
      if (status.textContent) {
        status.textContent = '';
        status.className = 'form__status';
      }
    });
  });

  const setStatus = (message, kind) => {
    status.textContent = message;
    status.className = 'form__status' + (kind ? ' is-' + kind : '');
  };

  const setBusy = (busy) => {
    submit.disabled = busy;
    submit.setAttribute('aria-busy', String(busy));
    if (label) label.textContent = busy ? 'Sending…' : 'Send Message';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;

    let firstInvalid = null;
    fields.forEach((field) => {
      if (!field.input) return;
      const valid = field.test(field.input.value);
      setFieldState(field, valid);
      if (!valid && !firstInvalid) firstInvalid = field.input;
    });
    if (firstInvalid) {
      setStatus('Please fix the highlighted fields.', 'error');
      firstInvalid.focus();
      return;
    }

    const payload = {
      name: $('#cf-name').value.trim(),
      email: $('#cf-email').value.trim(),
      subject: $('#cf-subject').value.trim(),
      message: $('#cf-message').value.trim(),
      company: $('#cf-company').value.trim(),
    };

    setBusy(true);
    setStatus('Sending message…', null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let body = {};
      try { body = await response.json(); } catch { /* keep the status message generic */ }

      if (response.ok && body.ok) {
        form.reset();
        setStatus('Message sent — thanks for reaching out. I will reply to your email.', 'ok');
      } else {
        setStatus(serverMessages[body.error] || 'The message could not be sent right now. Please try again.', 'error');
      }
    } catch {
      setStatus('Network error — please check your connection and try again.', 'error');
    } finally {
      setBusy(false);
    }
  });
})();
