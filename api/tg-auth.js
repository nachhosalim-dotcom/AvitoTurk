import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Переменные окружения (Vercel → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const MAX_AGE_SEC = 24 * 60 * 60; // подпись Telegram действительна 24 часа

// Проверка подписи данных мини-приложения Telegram (официальный алгоритм)
function verifyInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;

  try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { initData, gender } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ success: false, error: 'No initData' });
  }

  const tgUser = verifyInitData(initData);
  if (!tgUser || !tgUser.id) {
    return res.status(401).json({ success: false, error: 'Invalid Telegram signature' });
  }

  const { data, error } = await supabase.rpc('auth_or_register_telegram', {
    p_tg_id: tgUser.id,
    p_first_name: tgUser.first_name || '',
    p_last_name: tgUser.last_name || '',
    p_username: tgUser.username || null,
    p_photo_url: tgUser.photo_url || null,
    p_gender: gender === 'MALE' || gender === 'FEMALE' ? gender : null
  });

  if (error) {
    console.error('tg-auth rpc error:', error);
    return res.status(500).json({ success: false, error: 'Auth failed' });
  }
  return res.status(200).json(data);
}
