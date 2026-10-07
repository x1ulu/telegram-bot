import { Hono } from 'hono';
import { assert, str } from '../config.js';
import { readJson } from '../body.js';
import { getJson, putJson } from '../kv.js';

/* Public contact form for the portfolio front page (GET / is public/ index.html).
 *
 * Delivery goes through Resend over plain `fetch` — no SDK, so the Worker bundle
 * stays small. The credentials live in Worker secrets, never in the repo:
 *   RESEND_API_KEY      (required — without it the form reports email_not_configured)
 *   CONTACT_TO_EMAIL    (required — inbox that receives the submissions)
 *   CONTACT_FROM_EMAIL  (optional — defaults to Resend's onboarding sender)
 *
 * The endpoint is unauthenticated on purpose, so it is rate limited per client IP
 * through the same KV store the login throttling uses, and it carries a honeypot
 * field: a bot that fills the hidden input gets a plain 200 and no email is sent. */

const r = new Hono();

const RATE_WINDOW_SEC = 600;
const RATE_MAX = 5;
const MAX = { name: 80, email: 160, subject: 120, message: 4000 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clientIp = (c) => (c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

r.post('/', async (c) => {
  const body = await readJson(c);
  const name = str(body.name, MAX.name);
  const email = str(body.email, MAX.email);
  const subject = str(body.subject, MAX.subject);
  const message = str(body.message, MAX.message);

  // Honeypot: reported as success so the bot does not retry, but never delivered.
  if (str(body.company, 100)) return c.json({ ok: true, data: { delivered: false } });

  assert(name.length >= 2, 'invalid_name');
  assert(EMAIL_RE.test(email), 'invalid_email');
  assert(message.length >= 10, 'invalid_message');

  const rateKey = `contact:rl:${clientIp(c)}`;
  const seen = await getJson(c.env, rateKey, { count: 0 });
  assert((seen.count || 0) < RATE_MAX, 'too_many_requests', 429);
  await putJson(c.env, rateKey, { count: (seen.count || 0) + 1 }, { ttl: RATE_WINDOW_SEC });

  const apiKey = c.env.RESEND_API_KEY;
  const to = c.env.CONTACT_TO_EMAIL;
  if (!apiKey || !to) return c.json({ ok: false, error: 'email_not_configured' }, 503);
  const from = c.env.CONTACT_FROM_EMAIL || 'Portfolio <onboarding@resend.dev>';

  const text = [`Name: ${name}`, `Email: ${email}`, `Subject: ${subject || '(none)'}`, '', message].join('\n');
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: subject ? `[Portfolio] ${subject}` : `[Portfolio] Message from ${name}`,
        text,
        html: `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      }),
    });
  } catch (error) {
    console.error('[contact] email provider unreachable', error?.name, String(error?.message).slice(0, 160));
    return c.json({ ok: false, error: 'email_failed' }, 502);
  }
  if (!response.ok) {
    console.error('[contact] email provider rejected the message', response.status, (await response.text().catch(() => '')).slice(0, 200));
    return c.json({ ok: false, error: 'email_failed' }, 502);
  }
  return c.json({ ok: true, data: { delivered: true } });
});

export default r;
