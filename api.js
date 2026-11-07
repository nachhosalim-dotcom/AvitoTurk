/* ================= SUPABASE & NETWORK SERVICES ================= */

/* ================= MONOLITHIC SUPABASE & CORE API MODULE ================= */

let currentUser = null;
let pendingRegVerification = null;
let supabaseClient = null;

const _CFG = (typeof window !== 'undefined' && window.AVITO_CONFIG) || {};
const SUPABASE_DIRECT_URL = (_CFG.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = _CFG.SUPABASE_ANON_KEY || '';
const SUPABASE_URL = (_CFG.USE_PROXY && SUPABASE_DIRECT_URL) ? `${window.location.origin}/supabase-api` : SUPABASE_DIRECT_URL;
const SUPABASE_CONFIGURED = !!(SUPABASE_DIRECT_URL && SUPABASE_ANON_KEY);
try {
  if (SUPABASE_CONFIGURED && typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Токен сессии Avito Türk подтверждает личность на сервере (RLS)
        fetch: (input, init = {}) => {
          const headers = new Headers(init.headers || {});
          const tok = (typeof currentUser !== 'undefined' && currentUser && currentUser.session_token) || '';
          if (tok) headers.set('x-avito-token', tok);
          return fetch(input, { ...init, headers });
        }
      }
    });
  }
} catch (e) {
  console.warn("Supabase init error:", e);
}

function fixDirectImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let clean = url.trim();
  if (!/^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,|\/)/i.test(clean)) return '';
  if (clean.includes('ibb.co/') && !clean.includes('i.ibb.co/')) {
    const id = clean.split('ibb.co/').pop().split('/')[0].split('?')[0];
    if (id) return `https://i.ibb.co/${id}/image.jpg`;
  }
  return clean;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function validateWhatsApp(number) {
  if (!number || typeof number !== 'string') {
    return { valid: false, error: typeof currentLang !== 'undefined' && currentLang === 'tr' ? 'WhatsApp numarası gereklidir' : 'Укажите номер WhatsApp' };
  }
  let cleaned = number.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  const digitsOnly = cleaned.replace(/\D/g, '');
  const isValidPattern = /^\+[1-9]\d{9,14}$/.test(cleaned);
  const isDummy = /^(\d)\1+$/.test(digitsOnly);

  if (!isValidPattern || isDummy || digitsOnly.length < 10 || digitsOnly.length > 15) {
    return { 
      valid: false, 
      error: typeof currentLang !== 'undefined' && currentLang === 'tr' 
        ? 'Geçerli bir WhatsApp numarası girin (örn: +905301234567)' 
        : 'Введите реальный номер WhatsApp с кодом страны (напр. +905301234567)' 
    };
  }
  return { valid: true, number: cleaned };
}

/* --- СИНХРОНИЗАЦИЯ БАЗЫ ДАННЫХ --- */
async function initSupabaseSync() {
  if (!supabaseClient) return;
  try {
    const isAdminUser = !!(currentUser && (currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN'));
    const PUBLIC_USER_COLS = 'uid,username,kunya,gender,whatsapp,avatar,role,verified_shop,show_women_ads,frozen,is_archived,shop,created_at';
    const userQuery = (async () => {
      let rows = [];
      if (isAdminUser) {
        const r = await supabaseClient.rpc('admin_list_users');
        rows = Array.isArray(r.data) ? r.data : [];
      }
      if (!rows.length) {
        const r = await supabaseClient.from('users').select(PUBLIC_USER_COLS);
        rows = r.data || [];
      }
      if (currentUser?.session_token) {
        const me = await supabaseClient.rpc('get_me');
        if (me.data && me.data.uid) {
          rows = rows.filter(x => x.uid !== me.data.uid);
          rows.push(me.data);
        } else if (me.data === null && me.error == null) {
          // токен недействителен или просрочен — выходим из аккаунта
          try { logout(); } catch (e) {}
        }
      }
      else if (currentUser && !currentUser.session_token) {
        // сессия от старой версии без токена — нужен повторный вход
        try { logout(); showToast(currentLang === 'tr' ? 'Lütfen tekrar giriş yapın' : 'Войдите в аккаунт заново', 'info'); } catch (e) {}
      }
      return { data: rows };
    })();

    const [usersRes, adsRes, combosRes, catsRes] = await Promise.allSettled([
      userQuery,
      supabaseClient.from('ads').select('*').order('created_at', { ascending: false }).limit(1000),
      supabaseClient.from('combos').select('*'),
      supabaseClient.from('categories').select('*')
    ]);
	
    let dataUpdated = false;

    if (usersRes.status === 'fulfilled' && usersRes.value.data) {
      const allParsedUsers = usersRes.value.data.map(u => ({
        ...u,
        passwordHash: u.password_hash,
        verifiedShop: !!u.verified_shop,
        showWomenAds: !!u.show_women_ads,
        frozen: !!u.frozen,
        isArchived: !!u.is_archived
      }));
      users = allParsedUsers.filter(u => !u.isArchived);
      archivedUsers = allParsedUsers.filter(u => u.isArchived);
      if (currentUser) {
        const freshMe = allParsedUsers.find(u =>
          (u.uid && u.uid === currentUser.uid) ||
          (u.username && u.username.toLowerCase() === currentUser.username.toLowerCase())
        );
        if (freshMe) {
          currentUser = { ...currentUser, ...freshMe };
          saveUserSession(currentUser, true);
        }
      }
      dataUpdated = true;
    }

    if (adsRes.status === 'fulfilled' && adsRes.value.data) {
      const deletedIds = (typeof getDeletedAdsList === 'function') ? getDeletedAdsList() : [];
      ads = adsRes.value.data
        .filter(a => !deletedIds.includes(a.id))
        .map(a => ({
          id: a.id,
          title: a.title,
          category: a.category,
          storeCategory: a.store_category || '',
          region: a.region || 'IST',
          city: a.city,
          isWomenOnly: !!a.is_women_only,
          isFree: !!a.is_free,
          isNegotiable: !!a.is_negotiable,
          price: Number(a.price || 0),
          oldPrice: (a.old_price != null) ? Number(a.old_price) : null,
          currency: a.currency || 'USD',
          desc: a.description || a.desc || '',
          images: (Array.isArray(a.images) ? a.images : [a.image || '']).map(fixDirectImageUrl),
          image: fixDirectImageUrl(a.image || (Array.isArray(a.images) ? a.images[0] : null)),
          lat: Number(a.lat) || 41.0082,
          lng: Number(a.lng) || 28.9784,
          sellerUsername: a.seller_username,
          sellerUid: a.seller_uid,
          sellerKunya: a.seller_kunya,
          sellerWhatsapp: a.seller_whatsapp,
          status: a.status || 'ACTIVE',
          createdAt: Number(a.created_at) || Date.now(),
          queue: Array.isArray(a.queue) ? a.queue : [],
          likes: Array.isArray(a.likes) ? a.likes : [],
          views: Number(a.views || 0)
        }));
      dataUpdated = true;
    }

    if (combosRes.status === 'fulfilled' && combosRes.value.data) {
      combos = combosRes.value.data.map(c => ({
        id: c.id,
        shopUid: c.shop_uid,
        sellerUsername: c.seller_username,
        title: c.title,
        price: Number(c.price || 0),
        items: Array.isArray(c.items) ? c.items : [],
        likes: Array.isArray(c.likes) ? c.likes : [],
        createdAt: Number(c.created_at) || Date.now()
      }));
      dataUpdated = true;
    }

    if (catsRes.status === 'fulfilled' && catsRes.value.data && catsRes.value.data.length) {
      categories = catsRes.value.data;
      dataUpdated = true;
    }

    if (dataUpdated) {
      if (typeof saveCachedAds === 'function') await saveCachedAds();
      if (typeof renderCategoryPills === 'function') renderCategoryPills();
      if (typeof renderAds === 'function') renderAds();
    }
  } catch (error) {
    console.warn("Ошибка синхронизации Supabase:", error);
  }
}

/* --- СЖАТИЕ И ХРАНИЛИЩЕ STORAGE --- */
async function compressSingleImageFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas toBlob failed'));
          const compressedFile = new File([blob], `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`, { type: 'image/jpeg' });
          resolve(compressedFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadFileToSupabaseStorage(file, bucket = 'listings') {
  const compressed = await compressSingleImageFile(file, 1200, 1200, 0.75);
  const filePath = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
  
  const directClient = supabaseClient;
  if (!directClient) throw new Error('Supabase client не инициализирован');

  const { error: uploadError } = await directClient.storage
    .from(bucket)
    .upload(filePath, compressed, { cacheControl: '31536000', upsert: true });

  if (uploadError) throw uploadError;

  const { data: pubData } = directClient.storage.from(bucket).getPublicUrl(filePath);
  return pubData.publicUrl;
}

async function handleMultiImageCompressUpload(e, mode = 'create') {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const arr = mode === 'create' ? pendingCreateImages : pendingEditImages;
  const slots = 6 - arr.length;
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  if (slots <= 0) { showToast(isTr ? 'Maksimum 6 fotoğraf!' : 'Максимум 6 фотографий!', 'warning'); return; }

  showToast(isTr ? 'Resimler yükleniyor...' : `Загрузка изображений...`, 'info');
  
  for (const f of files.slice(0, slots)) {
    try {
      let uploadedUrl = null;
      if (supabaseClient) {
        try {
          uploadedUrl = await uploadFileToSupabaseStorage(f, 'listings');
        } catch (sErr) {
          console.warn('Storage upload fallback:', sErr);
        }
      }
      if (!uploadedUrl) {
        uploadedUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
      }
      if (uploadedUrl) {
        arr.push(uploadedUrl);
        if (typeof renderPhotoThumbnailsGrid === 'function') renderPhotoThumbnailsGrid(mode);
      }
    } catch (err) {
      console.error('Photo processing error:', err);
      showToast('Ошибка при обработке фото', 'error');
    }
  }
  e.target.value = '';
}

/* --- СОХРАНЕНИЕ ОБЪЯВЛЕНИЙ --- */
async function saveAdToSupabase(ad) {
  if (!supabaseClient) return;
  const dbAd = {
    id: ad.id,
    title: ad.title,
    category: ad.category,
    store_category: ad.storeCategory || '',
    region: ad.region || 'IST',
    city: ad.city,
    is_women_only: !!ad.isWomenOnly,
    is_free: !!ad.isFree,
    is_negotiable: !!ad.isNegotiable,
    price: Number(ad.price || 0),
    old_price: ad.oldPrice !== null && ad.oldPrice !== undefined ? Number(ad.oldPrice) : null,
    currency: ad.currency || 'USD',
    description: ad.desc || '',
    images: Array.isArray(ad.images) ? ad.images : [ad.image || ''],
    image: ad.image || (Array.isArray(ad.images) ? ad.images[0] : ''),
    lat: Number(ad.lat || 41.0082),
    lng: Number(ad.lng || 28.9784),
    seller_username: ad.sellerUsername || '',
    seller_uid: ad.sellerUid || '',
    seller_kunya: ad.sellerKunya || '',
    seller_whatsapp: ad.sellerWhatsapp || '',
    status: ad.status || 'ACTIVE',
    created_at: Number(ad.createdAt || Date.now()),
    queue: ad.queue || [],
    likes: ad.likes || [],
    views: Number(ad.views || 0)
  };
  await supabaseClient.from('ads').upsert(dbAd);
}

function saveBackupsMeta() {
  try {
    localStorage.setItem('bs_backups_meta', JSON.stringify(BACKUPS_META));
  } catch(e) {}
}

function saveCachedCombos() {
  try {
    localStorage.setItem('bs_cached_combos', JSON.stringify(combos));
  } catch(e) {}
}

let _cacheDBPromise = null;
function openCacheDB() {
  if (_cacheDBPromise) return _cacheDBPromise;
  _cacheDBPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('avito_turk_cache', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('ads')) db.createObjectStore('ads');
      if (!db.objectStoreNames.contains('combos')) db.createObjectStore('combos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _cacheDBPromise;
}

async function saveCachedAds() {
  const deletedIds = (typeof getDeletedAdsList === 'function') ? getDeletedAdsList() : [];
  const cleanAds = ads.filter(a => !deletedIds.includes(a.id));
  try {
    const db = await openCacheDB();
    const tx = db.transaction(['ads', 'combos'], 'readwrite');
    await tx.objectStore('ads').put(cleanAds, 'data');
    await tx.objectStore('combos').put(combos, 'data');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) {
    console.warn('IndexedDB save failed, fallback to localStorage:', e);
    try {
      localStorage.setItem('bs_cached_ads', JSON.stringify(cleanAds.slice(0, 50)));
      localStorage.setItem('bs_cached_combos', JSON.stringify(combos));
    } catch (err) {}
  }
}

async function loadCachedAds() {
  try {
    const f = localStorage.getItem('bs_favorites');
    if (f) favorites = JSON.parse(f);
  } catch (e) {}

  try {
    const db = await openCacheDB();
    const tx = db.transaction(['ads', 'combos'], 'readonly');
    const adsReq = tx.objectStore('ads').get('data');
    const combosReq = tx.objectStore('combos').get('data');
    const results = await Promise.all([
      new Promise(res => { adsReq.onsuccess = () => res(adsReq.result); adsReq.onerror = () => res(null); }),
      new Promise(res => { combosReq.onsuccess = () => res(combosReq.result); combosReq.onerror = () => res(null); })
    ]);

    const deletedIds = (typeof getDeletedAdsList === 'function') ? getDeletedAdsList() : [];

    if (results[0] && Array.isArray(results[0])) {
      ads = results[0]
        .filter(a => !deletedIds.includes(a.id))
        .map(a => ({
          ...a,
          images: (Array.isArray(a.images) ? a.images : [a.image || '']).map(fixDirectImageUrl),
          image: fixDirectImageUrl(a.image || (Array.isArray(a.images) ? a.images[0] : null))
        }));
    }
    if (results[1] && Array.isArray(results[1])) {
      combos = results[1];
    }
  } catch (e) {
    console.warn('IndexedDB load failed, fallback to localStorage:', e);
    try {
      const c = localStorage.getItem('bs_cached_ads');
      if (c) {
        const parsed = JSON.parse(c);
        if (Array.isArray(parsed)) {
          const deletedIds = (typeof getDeletedAdsList === 'function') ? getDeletedAdsList() : [];
          ads = parsed
            .filter(a => !deletedIds.includes(a.id))
            .map(a => ({
              ...a,
              images: (Array.isArray(a.images) ? a.images : [a.image || '']).map(fixDirectImageUrl),
              image: fixDirectImageUrl(a.image || (Array.isArray(a.images) ? a.images[0] : null))
            }));
        }
      }
      const cb = localStorage.getItem('bs_cached_combos');
      if (cb) {
        const parsedCombos = JSON.parse(cb);
        if (Array.isArray(parsedCombos)) combos = parsedCombos;
      }
    } catch (err) {}
  }
}

function processSquareImageCrop(file, size = 300) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('img'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function urlToBase64(url) {
  try {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:')) return url;
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    return url;
  }
}

function generateFastThumbnail(base64Data, size = 320) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > h) { h = Math.round(h * (size / w)); w = size; }
      else { w = Math.round(w * (size / h)); h = size; }
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      let d = c.toDataURL('image/webp', 0.55);
      if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', 0.55);
      resolve(d);
    };
    img.onerror = () => resolve(base64Data);
    img.src = base64Data;
  });
}

async function pushCategoriesToCloud() {
  if (supabaseClient) {
    await supabaseClient.from('categories').upsert(categories);
  }
}

async function fetchLiveExchangeRates(manual = false) {
  try {
    let tryVal = null;
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates && data.rates.TRY) {
          tryVal = parseFloat(data.rates.TRY);
        }
      }
    } catch(e) {}

    if (tryVal !== null && !isNaN(tryVal) && tryVal > 10 && tryVal < 100) {
      EXCHANGE_RATES.TRY = +tryVal.toFixed(2);
      lastRatesUpdate = new Date();
      localStorage.setItem('bs_rates', JSON.stringify(EXCHANGE_RATES));
      renderAds();
      if (manual) showToast(`Курс обновлен: $1 = ${EXCHANGE_RATES.TRY} ₺`, 'success');
    } else if (manual) {
      showToast('Используется базовый курс $1 = 38.50 ₺', 'info');
    }
  } catch (err) {
    console.warn('Live rates error:', err);
    if (manual) showToast('Ошибка получения курса валют', 'error');
  }
}

// Загружаем сохраненный кэш переводов из sessionStorage, чтобы не спамить сеть
try {
  const savedTrCache = sessionStorage.getItem('bs_tr_cache');
  if (savedTrCache) Object.assign(TRANSLATE_CACHE, JSON.parse(savedTrCache));
} catch (e) {}

const _pendingTranslations = {};

async function translateDynamic(text, targetLang = currentLang) {
  if (!text || typeof text !== 'string') return text;
  const clean = text.trim();
  if (!clean || clean.length < 2) return text;

  const cyrillicCount = (clean.match(/[а-яёА-ЯЁ]/g) || []).length;
  const turkishChars = /[ğüşıöçĞÜŞİÖÇ]/.test(clean);
  const latinCount = (clean.match(/[a-zA-ZğüşıöçĞÜŞİÖÇ]/g) || []).length;

  // Пропускаем перевод только если весь текст уже полностью на целевом языке
  if (targetLang === 'ru' && cyrillicCount > latinCount && !turkishChars) return clean;
  if (targetLang === 'tr' && cyrillicCount === 0) return clean;

  const cacheKey = `${targetLang}_${clean}`;
  if (TRANSLATE_CACHE[cacheKey]) return TRANSLATE_CACHE[cacheKey];
  if (_pendingTranslations[cacheKey]) return _pendingTranslations[cacheKey];

  const quickWords = {
    'телефон': 'telefon',
    'новый': 'yeni',
    'отличное состояние': 'mükemmel durumda',
    'хорошее состояние': 'iyi durumda',
    'б/у': 'ikinci el',
    'договорная': 'pazarlıklı',
    'бесплатно': 'ücretsiz'
  };
  if (targetLang === 'tr' && quickWords[clean.toLowerCase()]) {
    const res = quickWords[clean.toLowerCase()];
    TRANSLATE_CACHE[cacheKey] = res;
    return res;
  }

  _pendingTranslations[cacheKey] = (async () => {
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data[0]) {
          const result = data[0].map(x => x[0]).join('');
          if (result) {
            TRANSLATE_CACHE[cacheKey] = result;
            try { sessionStorage.setItem('bs_tr_cache', JSON.stringify(TRANSLATE_CACHE)); } catch(e) {}
            return result;
          }
        }
      }
    } catch (e) {}

    try {
      const sourceLang = targetLang === 'tr' ? 'ru' : 'tr';
      const res2 = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${sourceLang}|${targetLang}`);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2?.responseData?.translatedText) {
          const result2 = data2.responseData.translatedText;
          TRANSLATE_CACHE[cacheKey] = result2;
          try { sessionStorage.setItem('bs_tr_cache', JSON.stringify(TRANSLATE_CACHE)); } catch(e) {}
          return result2;
        }
      }
    } catch (e) {}

    return clean;
  })().finally(() => {
    delete _pendingTranslations[cacheKey];
  });

  return _pendingTranslations[cacheKey];
}

function translateStaticUI(lang) {
  const navMap = {
    'sb-home': t('nav_home'),
    'sb-shops': t('nav_shops'),
    'sb-create': t('nav_create'),
    'sb-fav': t('nav_favorites'),
    'sb-profile': t('nav_profile')
  };
  Object.keys(navMap).forEach(id => {
    const el = byId(id)?.querySelector('.nav-label');
    if (el) el.innerText = navMap[id];
  });

  const isTr = lang === 'tr';
  const supLbl = byId('sb-support-label');
  if (supLbl) supLbl.innerText = t('support');

  const waSupportText = isTr 
    ? encodeURIComponent('Merhaba! Avito Türk hakkında yardıma ihtiyacım var.')
    : encodeURIComponent('Здравствуйте! Мне нужна помощь по сервису Avito Türk.');

  const sidebarSupportLink = supLbl?.closest('a');
  if (sidebarSupportLink) {
    sidebarSupportLink.href = `https://wa.me/447887280238?text=${waSupportText}`;
  }

  const floatingSupportLink = document.querySelector('a[title="Destek WhatsApp"], a[aria-label="Destek WhatsApp"]');
  if (floatingSupportLink) {
    floatingSupportLink.href = `https://wa.me/447887280238?text=${waSupportText}`;
  }
  
  const thmLbl = byId('sb-theme-label');
  if (thmLbl) thmLbl.innerText = t('change_theme');

  const nearLbl = byId('near-me-label');
  if (nearLbl) nearLbl.innerText = activeRadiusKm > 0 ? `${activeRadiusKm} ${t('km')}` : t('near_me');

  const regLbl = byId('current-region-label');
  if (regLbl) {
    const regVal = byId('region-filter')?.value || 'ALL';
    regLbl.innerText = regVal === 'ALL' ? t('all_regions') : (getRegionName(regVal) || t('all_regions'));
  }

  const minPrInp = byId('min-price-input');
  if (minPrInp) minPrInp.placeholder = t('price_from_ph');
  const maxPrInp = byId('max-price-input');
  if (maxPrInp) maxPrInp.placeholder = t('price_to_ph');

  const sortLbl = byId('current-sort-label');
  if (sortLbl) {
    const sortLabels = { 
      newest: isTr ? 'En Yeniler' : 'Новые', 
      cheapest: isTr ? 'En Ucuzlar' : 'Дешевые', 
      expensive: isTr ? 'En Pahalılar' : 'Дорогие', 
      popular: isTr ? 'Popülerler' : 'Популярные' 
    };
    sortLbl.innerText = sortLabels[currentSortMode] || (isTr ? 'En Yeniler' : 'Новые');
  }
  
  const sortTitle = byId('sort-menu-overlay')?.querySelector('.text-center');
  if (sortTitle) sortTitle.innerText = isTr ? 'Sıralama:' : 'Сортировать по:';
  
  const sortBtnNew = byId('sort-check-newest')?.previousElementSibling;
  if (sortBtnNew) sortBtnNew.innerText = isTr ? '🕒 Önce En Yeniler' : '🕒 Сначала новые';

  const sortBtnCheap = byId('sort-check-cheapest')?.previousElementSibling;
  if (sortBtnCheap) sortBtnCheap.innerText = isTr ? '💰 Önce En Ucuzlar' : '💰 Сначала дешевые';

  const sortBtnExp = byId('sort-check-expensive')?.previousElementSibling;
  if (sortBtnExp) sortBtnExp.innerText = isTr ? '💎 Önce En Pahalılar' : '💎 Сначала дорогие';

  const sortBtnPop = byId('sort-check-popular')?.previousElementSibling;
  if (sortBtnPop) sortBtnPop.innerText = isTr ? '🔥 Popülerler' : '🔥 Популярные';

  const sortCloseBtn = byId('sort-menu-overlay')?.querySelector('button:last-child');
  if (sortCloseBtn) sortCloseBtn.innerText = isTr ? 'Kapat' : 'Закрыть';
  
  // Модалка создания объявления
  const createTitle = document.querySelector('#modal-create-ad h3');
  if (createTitle) createTitle.innerText = t('ad_create_title');
  const smartBtn = byId('smart-paste-toggle-btn');
  if (smartBtn) smartBtn.innerText = t('smart_paste_btn');
  const smartTa = byId('smart-paste-textarea');
  if (smartTa) smartTa.placeholder = t('smart_paste_ph');
  const smartApply = byId('smart-paste-apply-btn');
  if (smartApply) smartApply.innerText = t('smart_paste_apply');

  const adPhotoLbl = byId('ad-photos-label');
  if (adPhotoLbl) adPhotoLbl.innerText = t('ad_photos_label');
  const adUpText = byId('ad-upload-btn-text');
  if (adUpText) adUpText.innerText = t('ad_photos_btn');
  const adTitleInp = byId('ad-title');
  if (adTitleInp) adTitleInp.placeholder = t('ad_title_ph');
  const adPriceInp = byId('ad-price');
  if (adPriceInp) adPriceInp.placeholder = t('ad_price_ph');
  const adFreeLbl = byId('ad-is-free')?.parentElement?.querySelector('span');
  if (adFreeLbl) adFreeLbl.innerText = isTr ? 'Ücretsiz (Hediye) 🎁' : 'Даром 🎁';
  const adNegLbl = byId('ad-is-negotiable')?.parentElement?.querySelector('span');
  if (adNegLbl) adNegLbl.innerText = isTr ? 'Fiyat Pazarlıklı 🤝' : 'Договорная 🤝';
  const adWmLbl = byId('ad-is-women-only')?.parentElement?.querySelector('span');
  if (adWmLbl) adWmLbl.innerText = isTr ? 'Sadece Kadınlara Özel 🌸' : 'Для женщин 🌸';
  const adDescInp = byId('ad-desc');
  if (adDescInp) adDescInp.placeholder = t('ad_desc_ph');
  const adAdvBtn = byId('create-ad-advanced-fields')?.previousElementSibling?.querySelector('span');
  if (adAdvBtn) adAdvBtn.innerHTML = `<i class="fa-solid fa-sliders text-purple-400"></i> ${t('ad_advanced_btn')}`;
  const createSubBtn = document.querySelector('#modal-create-ad button[type="submit"]');
  if (createSubBtn) createSubBtn.innerText = t('ad_submit_btn');

  // Баннер черновика
  const draftBanner = byId('draft-restore-banner');
  if (draftBanner) {
    const dSpan = draftBanner.querySelector('span');
    if (dSpan) dSpan.innerHTML = `<i class="fa-solid fa-rotate-left"></i> ${isTr ? 'Taslak bulundu' : 'Найден черновик'}`;
    const dRestBtn = draftBanner.querySelector('button[onclick="restoreDraft()"]');
    if (dRestBtn) dRestBtn.innerText = isTr ? 'Geri Yükle' : 'Восстановить';
    const dDelBtn = draftBanner.querySelector('button[onclick="clearDraft(true)"]');
    if (dDelBtn) dDelBtn.innerText = isTr ? 'Sil' : 'Удалить';
  }

  // Модалка магазина
  const shopNameInp = byId('shop-name');
  if (shopNameInp) shopNameInp.placeholder = t('shop_name_ph');
  const shopSloganInp = byId('shop-slogan');
  if (shopSloganInp) shopSloganInp.placeholder = t('shop_slogan_ph');
  const shopAddrInp = byId('shop-address');
  if (shopAddrInp) shopAddrInp.placeholder = t('shop_address_ph');
  const shopHoursInp = byId('shop-hours');
  if (shopHoursInp) shopHoursInp.placeholder = t('shop_hours_ph');
  const shopWaInp = byId('shop-whatsapp');
  if (shopWaInp) shopWaInp.placeholder = t('shop_whatsapp_ph');
  const shopDescInp = byId('shop-desc');
  if (shopDescInp) shopDescInp.placeholder = t('shop_desc_ph');

  const shopMapLbl = document.querySelector('#modal-create-shop label[for="shop-create-map"]') || document.querySelector('#modal-create-shop label:has(+ #shop-create-map)');
  if (shopMapLbl) shopMapLbl.innerText = t('shop_map_label');

  const shopLogoLbl = document.querySelector('#modal-create-shop label[for="shop-logo-file"]') || document.querySelector('#modal-create-shop label:has(+ #shop-logo-file)');
  if (shopLogoLbl) shopLogoLbl.innerText = t('shop_logo_label');

  const shopNotice = document.querySelector('#modal-create-shop .bg-field.t2');
  if (shopNotice) shopNotice.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${t('shop_admin_notice')}`;

  const shopCatSel = byId('shop-category');
  if (shopCatSel && shopCatSel.options.length >= 7) {
    shopCatSel.options[0].text = isTr ? 'Mağaza Kategorisi *' : 'Категория магазина *';
    shopCatSel.options[1].text = isTr ? 'Elektronik ve Teknoloji' : 'Электроника и Техника';
    shopCatSel.options[2].text = isTr ? 'Vasıta & Yedek Parça' : 'Авто & Запчасти';
    shopCatSel.options[3].text = isTr ? 'Emlak' : 'Недвижимость';
    shopCatSel.options[4].text = isTr ? 'Ev & Yaşam' : 'Товары для дома';
    shopCatSel.options[5].text = isTr ? 'Hizmetler & Servis' : 'Услуги & Сервис';
    shopCatSel.options[6].text = isTr ? 'Diğer' : 'Разное';
  }
  
  // Поиск
  const sDesk = byId('search-input-desktop');
  if (sDesk) sDesk.placeholder = t('search');
  const sMob = byId('search-input');
  if (sMob) sMob.placeholder = t('search');

  // Футер
  const devLbl = byId('ft-dev-label');
  if (devLbl) devLbl.innerText = isTr ? 'Geliştirici:' : 'Разработчик:';

  // Расширенные поля подачи объявления
  const cityInp = byId('ad-city');
  if (cityInp) cityInp.placeholder = isTr ? 'İlçe / Mahalle' : 'Город/район';

  const advFieldsWrap = byId('create-ad-advanced-fields');
  if (advFieldsWrap) {
    const labels = advFieldsWrap.querySelectorAll('label');
    if (labels.length >= 4) {
      labels[0].innerText = isTr ? 'İl / Bölge' : 'Регион вручную';
      labels[1].innerText = isTr ? 'İlçe / Mahalle' : 'Точный город/район';
      labels[2].innerText = isTr ? 'Para Birimi' : 'Валюта';
      labels[3].innerText = isTr ? 'Haritada Konumu Belirleyin (isteğe bağlı)' : 'Уточнить точку на карте (необязательно)';
    }
  }

  const autoBadge = document.querySelector('#modal-create-ad .text-emerald-500');
  if (autoBadge) autoBadge.innerText = isTr ? 'Otomatik' : 'Автоматически';

  // Панель администратора
  const adminPanel = byId('modal-admin-panel');
  if (adminPanel) {
    const headerTitle = adminPanel.querySelector('h3');
    if (headerTitle) headerTitle.innerText = isTr ? 'Yönetici Kontrol Paneli' : 'Панель управления Главного Администратора';
    
    const tabOverview = byId('atab-overview');
    if (tabOverview) tabOverview.innerText = isTr ? 'Genel Bakış' : 'Обзор';
    
    const tabUsers = byId('atab-users');
    if (tabUsers) tabUsers.innerText = isTr ? 'Kullanıcılar' : 'Пользователи';
    
    const tabAds = byId('atab-ads');
    if (tabAds) tabAds.innerText = isTr ? 'İlanlar' : 'Объявления';
  }
  
  // Модальное окно жалобы
  const repModal = byId('modal-report-ad');
  if (repModal) {
    const repTitle = repModal.querySelector('h3');
    if (repTitle) repTitle.innerText = isTr ? 'İlanı Şikayet Et' : 'Пожаловаться на объявление';
    const repDesc = repModal.querySelector('p');
    if (repDesc) repDesc.innerText = isTr ? 'Bu ilanı kurallara uygunluk açısından inceleyeceğiz.' : 'Мы проверим это объявление на нарушение правил.';
    const repSel = byId('report-reason');
    if (repSel && repSel.options.length >= 6) {
      repSel.options[0].text = isTr ? 'Sebep seçin...' : 'Выберите причину...';
      repSel.options[1].text = isTr ? 'Dolandırıcılık / Sahtekarlık' : 'Мошенничество / Скам';
      repSel.options[2].text = isTr ? 'Sahte Ürün / Yanıltıcı Fotoğraf' : 'Фейковый товар / Фото';
      repSel.options[3].text = isTr ? 'Yasaklı Ürün' : 'Запрещенный товар';
      repSel.options[4].text = isTr ? 'Spam / Tekrarlanan İlan' : 'Спам / Дубликат';
      repSel.options[5].text = isTr ? 'Diğer' : 'Другое';
    }
    const repComm = byId('report-comment');
    if (repComm) repComm.placeholder = isTr ? 'Açıklama (isteğe bağlı)' : 'Комментарий (необязательно)';
    const repBtn = repModal.querySelector('button[type="submit"]');
    if (repBtn) repBtn.innerText = isTr ? 'Şikayeti Gönder' : 'Отправить жалобу';
  }

  // Модальное окно правил
  const rulesModal = byId('modal-rules-agreement');
  if (rulesModal) {
    const rulesTitle = rulesModal.querySelector('h2');
    if (rulesTitle) rulesTitle.innerText = isTr ? 'Avito Türk Kullanım Kuralları' : 'Правила и рекомендации Avito Türk';
    const rulesSub = rulesModal.querySelector('p.text-xs.font-semibold');
    if (rulesSub) rulesSub.innerText = isTr ? 'Ticareti dürüst yapın • Bol kazançlar!' : 'اتَّقُوا اللَّهَ فِي التِّجَارَةِ • Бойтесь Аллаха в торговле!';
    const rulesBody = rulesModal.querySelector('.modal-scroll-body');
    if (rulesBody) {
      rulesBody.innerHTML = isTr ? `
        <div class="border-b b-ig pb-3 mb-2 space-y-2">
          <div class="font-bold flex items-center gap-1.5"><i class="fa-solid fa-lightbulb" style="color:#d69e2e"></i><span>Başarılı işlemler için 3 önemli tavsiye:</span></div>
          <p>1. <strong>Dürüst açıklama ve kusurlar:</strong> Tüm kusurları belirtin. Şeffaflık satışı hızlandırır.</p>
          <p>2. <strong>Güvenli buluşma noktaları:</strong> Kalabalık ve bilinen halka açık yerlerde buluşun.</p>
          <p>3. <strong>Sıra sistemini kullanın:</strong> Ürünleri ayırtmak için «Sıraya Gir» butonunu kullanın.</p>
        </div>
        <p>1. <strong>Dürüstlük ve şeffaflık:</strong> Ürünün kusurlarını veya hasarlarını gizlemek kesinlikle yasaktır.</p>
        <p>2. <strong>Yasaklı ürünler:</strong> Silah, mühimmat, yasadışı maddeler ve kaçak ürünlerin yayınlanması kesinlikle yasaktır.</p>
        <p>3. <strong>Sivil platform:</strong> Platform yalnızca sivil bir seri ilan ve ticaret alanıdır.</p>
      ` : `
        <div class="border-b b-ig pb-3 mb-2 space-y-2">
          <div class="font-bold flex items-center gap-1.5"><i class="fa-solid fa-lightbulb" style="color:#d69e2e"></i><span>3 главных совета для удачных сделок:</span></div>
          <p>1. <strong>Честное описание и изъяны:</strong> Указывайте все дефекты. Прозрачность ускоряет продажу.</p>
          <p>2. <strong>Безопасные места встреч:</strong> Встречайтесь в людных и известных публичных местах.</p>
          <p>3. <strong>Используйте Очередь:</strong> Нажимайте «Занять очередь» для бронирования товаров.</p>
        </div>
        <p>1. <strong>Честность и прозрачность:</strong> Категорически запрещено скрывать дефекты, изъяны или повреждения товара.</p>
        <p>2. <strong>Запрещенные товары:</strong> Строго запрещена публикация любого оружия, боеприпасов, нелегальных веществ и контрабанды.</p>
        <p>3. <strong>Гражданский ресурс:</strong> Платформа является исключительно гражданской торговой площадкой.</p>
      `;
    }
    const rulesBtn = byId('rules-accept-btn');
    if (rulesBtn) rulesBtn.innerText = isTr ? 'Şartları Kabul Ediyorum' : 'Я подтверждаю и принимаю условия';
  }
  
  // Модальное окно "Поделиться"
  const shareModal = byId('modal-share');
  if (shareModal) {
    const shareTitle = shareModal.querySelector('.text-center.font-bold');
    if (shareTitle) shareTitle.innerText = isTr ? 'İlanı Paylaş' : 'Поделиться объявлением';
    const cancelBtn = shareModal.querySelector('button[onclick*="closeModal"]');
    if (cancelBtn) cancelBtn.innerText = isTr ? 'İptal' : 'Отмена';
  }

  // Оффлайн экран
  const offScreen = byId('offline-screen');
  if (offScreen) {
    const offTitle = offScreen.querySelector('h2');
    if (offTitle) offTitle.innerText = isTr ? 'İnternet Bağlantısı Yok' : 'Нет подключения к сети';
    const offText = offScreen.querySelector('p');
    if (offText) offText.innerText = isTr ? 'İnternet bağlantınızı kontrol edin. Bağlantı sağlandığında uygulama otomatik olarak çalışmaya devam edecektir.' : 'Проверьте интернет-соединение. Приложение автоматически продолжит работу, как только связь восстановится.';
    const offWait = offScreen.querySelector('.animate-ping')?.parentElement;
    if (offWait) offWait.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>${isTr ? 'Ağ bekleniyor...' : 'Ожидание сети...'}`;
  }

  // Скрытые надписи в подаче объявления (Админ, Магазин)
  const userLoggedBadge = byId('user-logged-badge');
  if (userLoggedBadge) {
    const badgeSpan = userLoggedBadge.querySelector('span');
    if (badgeSpan) badgeSpan.childNodes[0].nodeValue = isTr ? 'Şu hesap adına yayınlanıyor: ' : 'Публикация от имени: ';
  }

  const adOnBehalf = byId('ad-onbehalf-container');
  if (adOnBehalf) {
    const onbLbl = adOnBehalf.querySelector('label');
    if (onbLbl) onbLbl.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${isTr ? 'Kullanıcı adına yayınla (Admin)' : 'От имени пользователя (Админ)'}`;
  }

  const adStoreCat = byId('ad-store-cat-container');
  if (adStoreCat) {
    const catLbl = adStoreCat.querySelector('label');
    if (catLbl) catLbl.innerHTML = `<i class="fa-solid fa-tags"></i> ${isTr ? 'Mağaza Kategorisi' : 'Категория магазина'}`;
  }
}