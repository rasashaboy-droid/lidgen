'use strict';

const nodemailer = require('nodemailer');

const QUESTIONS = {
  q1: 'Сколько объектов готовы делать в месяц',
  q2: 'А сколько делаете сейчас',
  q3: 'Где удобнее общаться',
};

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildCorsHeaders(event) {
  const allowed = getAllowedOrigins();
  const reqOrigin =
    (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  // если список не задан — разрешаем всем (на этапе настройки)
  let allowOrigin = '';
  if (allowed.length === 0) {
    allowOrigin = '*';
  } else if (allowed.includes(reqOrigin)) {
    allowOrigin = reqOrigin;
  }
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return { headers, originAllowed: !!allowOrigin };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports.handler = async (event) => {
  const method = (event.httpMethod || '').toUpperCase();
  const { headers: CORS_HEADERS, originAllowed } = buildCorsHeaders(event);

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (method !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
    };
  }

  // Запрос из непозволенного источника — отказ
  if (!originAllowed) {
    return {
      statusCode: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Forbidden' }),
    };
  }

  let data;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '');
    data = JSON.parse(rawBody || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' }),
    };
  }

  // Honeypot: реальные пользователи это поле не заполнят, боты часто да.
  // Тихо отдаём ok:true, чтобы бот не понял, что отбит.
  if ((data.website || '').toString().trim().length > 0) {
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  }

  const phone = (data.phone || '').toString().trim();
  const q1 = (data.q1 || '').toString().trim();
  const q2 = (data.q2 || '').toString().trim();
  const q3 = (data.q3 || '').toString().trim();

  if (phone.length < 5) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Phone is required' }),
    };
  }

  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const text = [
    'Новая заявка с сайта (септики)',
    '',
    `${QUESTIONS.q1}: ${q1 || '—'}`,
    `${QUESTIONS.q2}: ${q2 || '—'}`,
    `${QUESTIONS.q3}: ${q3 || '—'}`,
    `Телефон: ${phone}`,
    '',
    `Время (МСК): ${time}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2 style="margin:0 0 14px;color:#fe634e">Новая заявка с сайта (септики)</h2>
      <table style="border-collapse:collapse">
        <tr><td style="padding:6px 16px 6px 0;color:#777">${escapeHtml(QUESTIONS.q1)}:</td><td style="padding:6px 0"><b>${escapeHtml(q1) || '—'}</b></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#777">${escapeHtml(QUESTIONS.q2)}:</td><td style="padding:6px 0"><b>${escapeHtml(q2) || '—'}</b></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#777">${escapeHtml(QUESTIONS.q3)}:</td><td style="padding:6px 0"><b>${escapeHtml(q3) || '—'}</b></td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#777">Телефон:</td><td style="padding:6px 0"><b>${escapeHtml(phone)}</b></td></tr>
      </table>
      <p style="color:#999;font-size:12px;margin-top:18px">Время (МСК): ${escapeHtml(time)}</p>
    </div>
  `;

  const port = Number(process.env.SMTP_PORT) || 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mail.ru',
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Лидген сайт" <${process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO || process.env.SMTP_USER,
      subject: 'Новая заявка с сайта (септики)',
      text,
      html,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('SMTP error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Mail send failed' }),
    };
  }
};
