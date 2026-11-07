import { createClient } from '@supabase/supabase-js';

// Секреты берутся из переменных окружения Vercel (Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role: только на сервере, никогда в браузере
const TRY_PER_USD = Number(process.env.TRY_PER_USD) || 38.5; // актуальный курс можно менять в Vercel без правки кода

const SITE_URL = 'https://avito-turk.vercel.app';
const OPEN_APP_BUTTON = { reply_markup: { inline_keyboard: [[{ text: '📲 Открыть Avito Türk', web_app: { url: SITE_URL } }]] } };

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export default async function handler(req, res) {
  // Telegram шлет только POST запросы
  if (req.method !== 'POST') {
    return res.status(200).send('OK (Endpoint is live)');
  }

  // Принимаем только запросы, которые реально пришли от Telegram (секрет задаётся в setWebhook)
  if (!WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  const update = req.body;
  const msg = update?.message || update?.channel_post;
  if (!msg) return res.status(200).send('No message');

  const text = (msg.text || msg.caption || '').trim();
  const chatId = msg.chat?.id;

  // Ответ на команду /start
  if (text.startsWith('/start')) {
    await sendTgMessage(chatId, 'Добро пожаловать! Откройте приложение — аккаунт создастся автоматически. После этого присылайте сюда фото товара с описанием и ценой, и оно появится на сайте.', OPEN_APP_BUTTON);
    return res.status(200).send('OK');
  }

  if (!text && !msg.photo) {
    return res.status(200).send('Empty ignored');
  }

  try {
    const fromUser = msg.from || { id: chatId, first_name: 'Пользователь', username: 'tg_user' };

    // 1. Профиль: публиковать могут только зарегистрированные аккаунты
    const { data: userRes, error: userErr } = await supabase.rpc('auth_or_register_telegram', {
      p_tg_id: fromUser.id,
      p_first_name: fromUser.first_name || '',
      p_last_name: fromUser.last_name || '',
      p_username: fromUser.username || null,
      p_photo_url: null
    });
    if (userErr) console.error('auth_or_register_telegram error:', userErr);

    if (!userRes?.success || !userRes?.user?.uid) {
      // новый пользователь (нужен выбор пола) или ошибка — без аккаунта объявление не публикуем
      await sendTgMessage(chatId, '👋 Чтобы публиковать объявления через бота, сначала завершите регистрацию: откройте приложение и выберите пол — аккаунт создастся автоматически. После этого пришлите объявление ещё раз.', OPEN_APP_BUTTON);
      return res.status(200).send('Registration required');
    }
    if (userRes.user.frozen || userRes.user.is_archived) {
      await sendTgMessage(chatId, '⛔ Ваш аккаунт ограничен. Публикация недоступна.');
      return res.status(200).send('Blocked');
    }

    const sellerUid = userRes.user.uid;
    const sellerUsername = userRes.user.username;
    const sellerKunya = userRes.user.kunya || [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || sellerUsername;

    // 2. Скачивание фото из Telegram и сохранение в Supabase Storage
    let imageUrls = [];
    if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
      const bestPhoto = msg.photo[msg.photo.length - 1]; // берем наилучшее разрешение
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${bestPhoto.file_id}`);
      const fileJson = await fileRes.json();

if (fileJson?.result?.file_path) {
        const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileJson.result.file_path}`;
        const imgRes = await fetch(downloadUrl);
        const arrayBuf = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        const filePath = `ad_tg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
        const { data: upData, error: upErr } = await supabase.storage
          .from('listings')
          .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: true });

        if (upErr) {
          console.error('Storage upload error:', upErr);
        } else {
          const { data: pubData } = supabase.storage.from('listings').getPublicUrl(filePath);
          if (pubData?.publicUrl) {
            imageUrls.push(pubData.publicUrl);
          }
        }
      }
    }

    if (!imageUrls.length) {
      imageUrls.push('https://placehold.co/800x1000/1e293b/fff?text=Avito+Türk');
    }

    // 3. Парсинг параметров
    const parsed = parseTelegramText(text);

    // 4. Добавление объявления в базу
    const adId = 'AD-' + Date.now().toString(36).toUpperCase();
    const newAd = {
      id: adId,
      title: parsed.title,
      category: parsed.category,
      store_category: '',
      region: parsed.region,
      city: parsed.city,
      is_women_only: false,
      is_free: parsed.price === 0,
      is_negotiable: parsed.isNegotiable,
      price: parsed.price,
      currency: parsed.currency,
      description: text || parsed.title,
      images: imageUrls,
      image: imageUrls[0],
      lat: parsed.lat,
      lng: parsed.lng,
      seller_username: sellerUsername,
      seller_uid: sellerUid,
      seller_kunya: sellerKunya,
      seller_whatsapp: '',
      status: 'ACTIVE',
      created_at: Date.now(),
      queue: [],
      likes: [],
      views: 0
    };

    const { error: insErr } = await supabase.from('ads').insert(newAd);
    if (insErr) throw insErr;

    // 5. Отправка подтверждения пользователю
    const postUrl = `https://avito-turk.vercel.app/#ad-${adId}`;
    await sendTgMessage(
      chatId,
      `✅ <b>Опубликовано на сайте!</b>\n\n📦 <b>${escapeHtml(parsed.title)}</b>\n💰 <b>Цена:</b> $${parsed.price}\n📍 <b>Город:</b> ${parsed.city}\n\n🔗 <a href="${postUrl}">Посмотреть объявление</a>`
    );

    return res.status(200).send('Published');
  } catch (err) {
    console.error('Webhook error:', err);
    if (chatId) await sendTgMessage(chatId, '❌ Ошибка при публикации. Попробуйте снова.');
    return res.status(200).send('Error');
  }
}

async function sendTgMessage(chatId, textHtml, extra = {}) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: textHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        ...extra
      })
    });
  } catch (e) {}
}

function parseTelegramText(rawText) {
  const text = (rawText || '').trim();
  let price = 0;
  let currency = 'USD';
  let isNegotiable = false;

  const usdMatch = text.match(/(?:цена|fiyat|price|стоимость)?\s*[:=\-]?\s*(\d+[\.,]?\d*)\s*(?:\$|usd|долл)/i) || text.match(/\$\s*(\d+[\.,]?\d*)/i);
  const tryMatch = text.match(/(?:цена|fiyat|price|стоимость)?\s*[:=\-]?\s*(\d+[\.,]?\d*)\s*(?:₺|tl|try|лир)/i);

  if (usdMatch) {
    price = parseFloat(usdMatch[1].replace(',', '.'));
  } else if (tryMatch) {
    price = Math.round(parseFloat(tryMatch[1].replace(',', '.')) / TRY_PER_USD);
  } else if (/договор|pazarlık/i.test(text)) {
    isNegotiable = true;
  }

  const cityMap = {
    'istanbul': ['IST', 'İstanbul', 41.0082, 28.9784],
    'стамбул': ['IST', 'İstanbul', 41.0082, 28.9784],
    'ankara': ['ANK', 'Ankara', 39.9334, 32.8597],
    'анкара': ['ANK', 'Ankara', 39.9334, 32.8597],
    'izmir': ['IZM', 'İzmir', 38.4192, 27.1287],
    'измир': ['IZM', 'İzmir', 38.4192, 27.1287],
    'antalya': ['ANT', 'Antalya', 36.8969, 30.7133],
    'анталья': ['ANT', 'Antalya', 36.8969, 30.7133],
    'mersin': ['MER', 'Mersin', 36.8121, 34.6415],
    'мерсин': ['MER', 'Mersin', 36.8121, 34.6415],
    'bursa': ['BUR', 'Bursa', 40.1885, 29.0610],
    'gaziantep': ['GAZ', 'Gaziantep', 37.0662, 37.3833]
  };

  let region = 'IST', city = 'İstanbul', lat = 41.0082, lng = 28.9784;
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(cityMap)) {
    if (lower.includes(key)) {
      [region, city, lat, lng] = val;
      break;
    }
  }

  let category = 'other';
  if (/iphone|samsung|телефон|ноутбук|laptop|xiaomi|планшет|tv|монитор/i.test(lower)) category = 'electronics';
  else if (/машина|авто|колеса|шины|мото|starex|hyundai|mercedes|bmw|запчасти/i.test(lower)) category = 'transport';
  else if (/квартира|дом|аренда|недвижимость|комната|офис|вил/i.test(lower)) category = 'realestate';
  else if (/инструмент|дрель|перфоратор|сварочн|болгарка/i.test(lower)) category = 'tools';
  else if (/диван|стол|мебель|кровать|шкаф|посуда|холодильник/i.test(lower)) category = 'home';
  else if (/куртка|платье|обувь|кроссовки|одежда|сумка/i.test(lower)) category = 'fashion';
  else if (/коляска|игрушка|детск/i.test(lower)) category = 'kids';
  else if (/услуги|мастер|ремонт|такси|перевозк/i.test(lower)) category = 'services';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let title = lines[0] || 'Товар из Telegram';
  title = title.replace(/^(продам|satılık|for sale)[:\-–\s]*/i, '');
  if (title.length > 55) title = title.substring(0, 52) + '...';

  return { title, price, currency, isNegotiable, region, city, lat, lng, category };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
}
