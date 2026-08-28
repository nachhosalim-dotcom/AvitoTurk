/* ================= SUPABASE & NETWORK SERVICES ================= */

function fixDirectImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let clean = url.trim();
  
  if (clean.includes('ibb.co/') && !clean.includes('i.ibb.co/')) {
    const id = clean.split('ibb.co/').pop().split('/')[0].split('?')[0];
    if (id) return `https://i.ibb.co/${id}/image.jpg`;
  }
  return clean;
}
// Инициализация Supabase Client
try {
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch(e) { console.warn("Supabase init error:", e); }

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
// Сначала мгновенно загружаем избранное из localStorage (оно маленькое)
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

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

function validateWhatsApp(number) {
  if (!number) return { valid: false, error: 'Укажите номер WhatsApp' };
  const cleaned = number.replace(/[^\d+]/g, '');
  if (cleaned.length < 8) return { valid: false, error: 'Некорректный номер WhatsApp' };
  return { valid: true, number: cleaned };
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

// ==========================================
// БЛОК ОПТИМИЗАЦИИ И ЗАГРУЗКИ ФОТО
// ==========================================

async function compressSingleImageFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, width ? width : 0, 0, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('Canvas toBlob failed'));
          }
          const compressedFile = new File([blob], `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`, {
            type: 'image/webp'
          });
          resolve(compressedFile);
        }, 'image/webp', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadListingImages(filesArray, bucketName = 'listings') {
  if (!filesArray || filesArray.length === 0) return [];
  
  const uploadPromises = Array.from(filesArray).map(async (file) => {
    // Если передан уже готовый URL (строка), не трогаем его
    if (typeof file === 'string') return file;

    const compressed = await compressSingleImageFile(file);
    const filePath = `public/${compressed.name}`;

    const { data, error } = await supabaseClient.storage
      .from(bucketName)
      .upload(filePath, compressed, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Ошибка загрузки в Supabase Storage:', error);
      throw error;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  });

  return await Promise.all(uploadPromises);
}

// ==========================================

async function saveAdToSupabase(ad) {
  if (!supabaseClient) return;
  const dbAd = {
    id: ad.id, title: ad.title, category: ad.category, store_category: ad.storeCategory || '',
    region: ad.region, city: ad.city, is_women_only: !!ad.isWomenOnly, is_free: !!ad.isFree,
    is_negotiable: !!ad.isNegotiable, price: Number(ad.price || 0), old_price: ad.oldPrice !== null && ad.oldPrice !== undefined ? Number(ad.oldPrice) : null, currency: ad.currency,
    description: ad.desc || '', images: ad.images || [], image: ad.image || '',
    lat: Number(ad.lat || 33.5138), lng: Number(ad.lng || 36.2765),
    seller_username: ad.sellerUsername || '', seller_uid: ad.sellerUid || '',
    seller_kunya: ad.sellerKunya || '', seller_whatsapp: ad.sellerWhatsapp || '',
    status: ad.status || 'ACTIVE', created_at: Number(ad.createdAt || Date.now()),
    queue: ad.queue || [], likes: ad.likes || [], views: Number(ad.views || 0)
  };
  await supabaseClient.from('ads').upsert(dbAd);
}

async function _0xSCTransaction(uid, amount, direction) {
  if (!supabaseClient || !uid) throw new Error('Нет соединения с БД');
  const value = _0xSCAmount(amount); 
  if (!value || value <= 0) throw new Error('Некорректная сумма');

  const { data: res, error } = await supabaseClient.rpc('charge_avitocash', {
    p_user_identifier: uid,
    p_amount: value,
    p_action: direction === 'deduct' ? 'DEDUCT' : 'ADD',
    p_reason: direction === 'deduct' ? 'Списание средств' : 'Начисление баланса'
  });

  if (error) throw error;
  if (!res || !res.success) throw new Error(res?.error || 'Сбой биллинговой операции');

  return Number(res.new_balance || 0);
}

async function deductBalance(uid, amount) {
  return await _0xSCTransaction(uid, amount, 'deduct');
}

function addBalance(uid, amount) {
  if (!_0xSCAdmin()) return Promise.reject(new Error('Только Главный Администратор может начислять баланс'));
  return _0xSCTransaction(uid, amount, 'add');
}

async function initSupabaseSync() {
  if (!supabaseClient) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const [usersRes, adsRes, combosRes, catsRes] = await Promise.all([
      supabaseClient.from('users').select('*').abortSignal(controller.signal),
      supabaseClient.from('ads').select('*').order('created_at', { ascending: false }).limit(50).abortSignal(controller.signal),
      supabaseClient.from('combos').select('*').abortSignal(controller.signal),
      supabaseClient.from('categories').select('*').abortSignal(controller.signal)
    ]).catch((err) => {
      console.warn('Background sync aborted or failed:', err?.message || err);
      return [null, null, null, null];
    });
    clearTimeout(timeoutId);
    let dataUpdated = false;
    if (usersRes && usersRes.data && usersRes.data.length > 0) {
      const allParsedUsers = usersRes.data.map(u => ({
        ...u,
        passwordHash: u.password_hash,
        verifiedShop: !!u.verified_shop,
        avitocashBalance: Number(u.avitocash_balance || 0),
        trialBalance: Number(u.trial_balance || 0),
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
          if (Array.isArray(freshMe.favorites)) {
            favorites = [...new Set([...favorites, ...freshMe.favorites])];
            try { localStorage.setItem('bs_favorites', JSON.stringify(favorites)); } catch (e) {}
          }
          currentUser = { ...currentUser, ...freshMe, favorites };
          saveUserSession(currentUser, true);
        }
      }
      dataUpdated = true;
    }
    if (adsRes && adsRes.data) {
      const deletedIds = (typeof getDeletedAdsList === 'function') ? getDeletedAdsList() : [];
      ads = adsRes.data
        .filter(a => !deletedIds.includes(a.id))
        .map(a => {
          const owner = users.find(u =>
            u.uid === a.seller_uid ||
            (u.username && a.seller_username && u.username.toLowerCase() === a.seller_username.toLowerCase())
          );
          return {
            id: a.id, title: a.title, category: a.category, storeCategory: a.store_category,
            region: a.region, city: a.city, isWomenOnly: !!a.is_women_only, isFree: !!a.is_free,
            isNegotiable: !!a.is_negotiable, price: Number(a.price || 0),
            oldPrice: (a.old_price != null) ? Number(a.old_price) : null, currency: a.currency,
            desc: a.description || a.desc || '',
            images: (Array.isArray(a.images) ? a.images : [a.image || '']).map(fixDirectImageUrl),
            image: fixDirectImageUrl(a.image || (Array.isArray(a.images) ? a.images[0] : null)),
            lat: Number(a.lat) || 33.5138, lng: Number(a.lng) || 36.2765,
            sellerUsername: a.seller_username || owner?.username || '',
            sellerUid: a.seller_uid || owner?.uid || '',
            sellerKunya: a.seller_kunya || owner?.kunya || owner?.username || '',
            sellerWhatsapp: a.seller_whatsapp || owner?.whatsapp || '',
            status: a.status || 'ACTIVE', createdAt: Number(a.created_at) || Date.now(),
            queue: Array.isArray(a.queue) ? a.queue : [],
            likes: Array.isArray(a.likes) ? a.likes : [], views: Number(a.views || 0)
          };
        });
      dataUpdated = true;
    }
    if (combosRes && combosRes.data) {
      combos = combosRes.data.map(c => ({
        id: c.id, shopUid: c.shop_uid, sellerUsername: c.seller_username,
        title: c.title, price: Number(c.price || 0),
        items: Array.isArray(c.items) ? c.items : [],
        likes: Array.isArray(c.likes) ? c.likes : [],
        createdAt: Number(c.created_at) || Date.now()
      }));
      dataUpdated = true;
    }
    if (catsRes && catsRes.data && catsRes.data.length) {
      categories = catsRes.data;
      dataUpdated = true;
    }
    if (currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERUSER')) {
      supabaseClient.from('reports').select('*').then(res => {
        if (res && res.data) reports = res.data;
      }).catch(() => {});
    }
    if (dataUpdated) {
      saveCachedAds();
      renderCategoryPills();
      renderAds();
    }
  } catch (error) {
    console.error("Ошибка синхронизации Supabase:", error);
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

    if (!tryVal) {
      const res2 = await fetch(`https://sp-proxy.mikevasovsky3.workers.dev/?_t=${Date.now()}`, { cache: 'no-store' });
      if (res2.ok) {
        const d2 = await res2.json();
        const fx = d2?.overview?.global_fx || d2?.global_fx;
        if (Array.isArray(fx)) {
          const p = fx.find(g => String(g.pair || '').toUpperCase() === 'USD/TRY');
          if (p) tryVal = parseFloat(p.rate);
        }
      }
    }

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

async function translateDynamic(text, targetLang = currentLang) {
  if (!text || typeof text !== 'string') return text;
  const clean = text.trim();
  if (!clean) return text;
  if (DICTIONARY[clean] && targetLang === 'tr') return DICTIONARY[clean];
  
  const cacheKey = `${targetLang}_${clean}`;
  if (TRANSLATE_CACHE[cacheKey]) return TRANSLATE_CACHE[cacheKey];

  const isTurkishText = /[ğüşıöçĞÜŞİÖÇ]/.test(clean);
  if (targetLang === 'tr' && isTurkishText) return clean;
  if (targetLang === 'ru' && !isTurkishText && /[а-яА-ЯёЁ]/.test(clean)) return clean;

  const sl = (targetLang === 'tr') ? 'ru' : 'tr';
  const tl = targetLang === 'tr' ? 'tr' : 'ru';
  
  try {
    const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(googleUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        const result = data[0].map(x => x[0]).join('');
        TRANSLATE_CACHE[cacheKey] = result;
        return result;
      }
    }
  } catch (e) {}

  try {
    const proxyUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean.slice(0, 450))}&langpair=${sl}|${tl}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      if (data?.responseData?.translatedText && !data.responseData.translatedText.includes('QUERY LENGTH LIMIT')) {
        const result = data.responseData.translatedText;
        TRANSLATE_CACHE[cacheKey] = result;
        return result;
      }
    }
  } catch (e) {}

  return clean;
}

/* ================= MARQUEE FUNCTIONS ================= */
async function updateMarqueeText(text) {
  MARQUEE_SETTINGS.text = text;
  const desktop = byId('desktop-marquee-text');
  const mobile = byId('mobile-marquee-text');
  
let displayText = text;
  if (currentLang === 'tr') {
    displayText = await translateDynamic(text, 'tr');
  } else {
    displayText = await translateDynamic(text, 'ru');
  }
  
  if (desktop) desktop.innerText = displayText;
  if (mobile) mobile.innerText = displayText;
  
  const input = byId('admin-marquee-input');
  if (input && document.activeElement !== input) input.value = text;
  updateMarqueePreview(displayText);
}

function applyMarqueeSettings(settings) {
  MARQUEE_SETTINGS = { ...MARQUEE_SETTINGS, ...settings };
  updateMarqueeText(MARQUEE_SETTINGS.text || '');
  document.querySelectorAll('.marquee-container').forEach(container => {
    container.classList.toggle('marquee-pause-hover', !!MARQUEE_SETTINGS.pauseOnHover);
  });
  document.querySelectorAll('.marquee-content').forEach(content => {
    content.style.setProperty('--marquee-color', MARQUEE_SETTINGS.color || '#a8a8a8');
    content.style.setProperty('--marquee-font-size', `${Number(MARQUEE_SETTINGS.fontSize) || 13}px`);
    const textLen = (content.innerText || '').length;
const baseSpeed = Number(MARQUEE_SETTINGS.speed) || 20;
const dynamicSpeed = Math.max(8, Math.min(60, textLen * 0.35 + baseSpeed * 0.3));
content.style.setProperty('--marquee-speed', `${dynamicSpeed.toFixed(1)}s`);
    content.style.animationDirection = MARQUEE_SETTINGS.direction === 'right' ? 'reverse' : 'normal';
  });
  updateMarqueeControls();
}

function updateMarqueePreview(text) {
  const preview = byId('admin-marquee-preview');
  const counter = byId('admin-marquee-counter');
  if (preview) preview.innerText = text || 'Предпросмотр появится здесь';
  if (counter) counter.innerText = `${String(text || '').length} символов`;
}

function handleMarqueeInput(input) {
  MARQUEE_SETTINGS.text = input.value;
  updateMarqueePreview(input.value);
}

function updateMarqueeControls() {
  const color = byId('admin-marquee-color');
  const size = byId('admin-marquee-size');
  const speed = byId('admin-marquee-speed');
  const direction = byId('admin-marquee-direction');
  const pause = byId('admin-marquee-pause');
  if (color) color.value = MARQUEE_SETTINGS.color || '#a8a8a8';
  if (size) size.value = MARQUEE_SETTINGS.fontSize || 13;
  if (speed) speed.value = MARQUEE_SETTINGS.speed || 20;
  if (direction) direction.value = MARQUEE_SETTINGS.direction || 'left';
  if (pause) pause.checked = !!MARQUEE_SETTINGS.pauseOnHover;
}

function handleMarqueeSettingsInput() {
  const input = byId('admin-marquee-input');
  MARQUEE_SETTINGS.text = input ? input.value : MARQUEE_SETTINGS.text;
  MARQUEE_SETTINGS.color = byId('admin-marquee-color')?.value || MARQUEE_SETTINGS.color;
  MARQUEE_SETTINGS.fontSize = Number(byId('admin-marquee-size')?.value || MARQUEE_SETTINGS.fontSize);
  MARQUEE_SETTINGS.speed = Number(byId('admin-marquee-speed')?.value || MARQUEE_SETTINGS.speed);
  MARQUEE_SETTINGS.direction = byId('admin-marquee-direction')?.value || MARQUEE_SETTINGS.direction;
  MARQUEE_SETTINGS.pauseOnHover = !!byId('admin-marquee-pause')?.checked;
  applyMarqueeSettings(MARQUEE_SETTINGS);
}

function loadMarqueeText() {
  const savedText = localStorage.getItem(MARQUEE_STORAGE_KEY);
  if (savedText) updateMarqueeText(savedText);
}

async function saveMarqueeSettings() {
  const input = byId('admin-marquee-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) { showToast('Введите текст для бегущей строки', 'warning'); return; }
  const settings = { ...MARQUEE_SETTINGS, text };
  localStorage.setItem(MARQUEE_STORAGE_KEY, text);
  applyMarqueeSettings(settings);
  await updateMarqueeText(text);
  showToast('Бегущая строка сохранена и автоматически переведена!', 'success');
}

function translateStaticUI(lang) {
  const isTr = lang === 'tr';
  const navMap = {
    'sb-home': 'Главная', 'sb-shops': 'Магазины', 'sb-create': 'Создать',
    'sb-fav': 'Избранное', 'sb-profile': 'Профиль'
  };
  Object.keys(navMap).forEach(id => {
    const el = byId(id)?.querySelector('.nav-label');
    if (el) el.innerText = isTr ? (DICTIONARY[navMap[id]] || navMap[id]) : navMap[id];
  });

  const supLbl = byId('sb-support-label');
  if (supLbl) supLbl.innerText = isTr ? (DICTIONARY['Техподдержка'] || 'Destek') : 'Техподдержка';

  const thmLbl = byId('sb-theme-label');
  if (thmLbl) thmLbl.innerText = isTr ? (DICTIONARY['Сменить тему'] || 'Temayı Değiştir') : 'Сменить тему';

  const nearLbl = byId('near-me-label');
  if (nearLbl) nearLbl.innerText = activeRadiusKm > 0 ? `${activeRadiusKm} ${t('км')}` : t('Рядом');

  const regLbl = byId('current-region-label');
  if (regLbl) {
    const regVal = byId('region-filter')?.value || 'ALL';
    const rawName = regVal === 'ALL' ? 'Все регионы' : (REGION_NAMES[regVal] || 'Все регионы');
    regLbl.innerText = isTr ? (DICTIONARY[rawName] || rawName) : rawName;
  }

  const sortLbl = byId('current-sort-label');
  if (sortLbl) {
    const sortLabels = { newest: 'Новые', cheapest: 'Дешевые', expensive: 'Дорогие', popular: 'Популярные' };
    const rawSort = sortLabels[currentSortMode] || 'Новые';
    sortLbl.innerText = isTr ? (DICTIONARY[rawSort] || rawSort) : rawSort;
  }

  // Создание объявления
  const createTitle = document.querySelector('#modal-create-ad h3');
  if (createTitle) createTitle.innerText = t('Подача объявления');
  const adPhotoLbl = byId('ad-photos-label');
  if (adPhotoLbl) adPhotoLbl.innerText = t('Фотографии товара (до 6 шт.) *');
  const adUpText = byId('ad-upload-btn-text');
  if (adUpText) adUpText.innerText = t('Выбрать фотографии');
  const adTitleInp = byId('ad-title');
  if (adTitleInp) adTitleInp.placeholder = t('Заголовок объявления *');
  const adPriceInp = byId('ad-price');
  if (adPriceInp) adPriceInp.placeholder = t('Цена, $ *');
  const adFreeLbl = byId('ad-is-free')?.parentElement?.querySelector('span');
  if (adFreeLbl) adFreeLbl.innerText = t('Даром 🎁');
  const adNegLbl = byId('ad-is-negotiable')?.parentElement?.querySelector('span');
  if (adNegLbl) adNegLbl.innerText = t('Договорная 🤝');
  const adWmLbl = byId('ad-is-women-only')?.parentElement?.querySelector('span');
  if (adWmLbl) adWmLbl.innerText = t('Для женщин 🌸');
  const adDescInp = byId('ad-desc');
  if (adDescInp) adDescInp.placeholder = t('Описание и возможные изъяны *');
  const adAdvBtn = byId('create-ad-advanced-fields')?.previousElementSibling?.querySelector('span');
  if (adAdvBtn) adAdvBtn.innerHTML = `<i class="fa-solid fa-sliders text-purple-400"></i> ${t('Расширенные настройки')}`;
  const createSubBtn = document.querySelector('#modal-create-ad button[type="submit"]');
  if (createSubBtn) createSubBtn.innerText = t('Опубликовать объявление');

  // Редактирование объявления
  const editTitle = document.querySelector('#modal-edit-ad h3');
  if (editTitle) editTitle.innerText = t('Редактирование объявления');
  const editTInp = byId('edit-ad-title');
  if (editTInp) editTInp.placeholder = t('Заголовок объявления *');
  const editPInp = byId('edit-ad-price');
  if (editPInp) editPInp.placeholder = t('Цена *');
  const editDInp = byId('edit-ad-desc');
  if (editDInp) editDInp.placeholder = t('Описание и изъяны *');
  const editSubBtn = byId('edit-ad-submit-btn');
  if (editSubBtn) editSubBtn.innerText = t('Сохранить изменения');

// Быстрая скидка
  const qdTitle = byId('quick-discount-modal-title') || byId('modal-quick-discount')?.querySelector('h3');
  if (qdTitle) qdTitle.innerHTML = `<i class="fa-solid fa-tags" style="color:#ef4444"></i> ${t('Установить скидку / Акцию')}`;
  const qdSaveBtn = byId('quick-discount-save-btn') || byId('modal-quick-discount')?.querySelector('button[onclick="saveQuickDiscountSubmit()"]');
  if (qdSaveBtn) qdSaveBtn.innerText = t('Применить скидку');
  const qdRemBtn = byId('quick-discount-remove-btn') || byId('modal-quick-discount')?.querySelector('button[onclick="removeQuickDiscountSubmit()"]');
  if (qdRemBtn) qdRemBtn.innerText = t('Отменить скидку (вернуть старую цену)');
  
  // Конструктор комбо
  const cbTitleInp = byId('combo-title');
  if (cbTitleInp) cbTitleInp.placeholder = t('Название акции (напр.: Комплект солнечной энергетики)');
  const cbPriceInp = byId('combo-price');
  if (cbPriceInp) cbPriceInp.placeholder = t('Специальная цена комплекта, $ *');
  const cbItemsLbl = byId('combo-items-list')?.previousElementSibling;
  if (cbItemsLbl) cbItemsLbl.innerText = t('Товары в комплекте (минимум 2) *');
  const cbSaveBtn = byId('modal-combo-builder')?.querySelector('button[type="submit"]');
  if (cbSaveBtn) cbSaveBtn.innerHTML = `<i class="fa-solid fa-fire"></i> ${t('Сохранить акцию')}`;
}