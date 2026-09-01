/* ================= SUPABASE & NETWORK SERVICES ================= */

/* ================= MONOLITHIC SUPABASE & CORE API MODULE ================= */

let currentUser = null;
let pendingRegVerification = null;
let supabaseClient = null;

// Обращение через прокси для обхода блокировок сети
// Исправленный рабочий URL и ключ
// Обращение через прокси для обхода блокировок сети
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SUPABASE_URL = isLocal 
  ? "https://mmespmwztxkjxhwmsgjn.supabase.co" 
  : `${window.location.origin}/supabase-api`;

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tZXNwbXd6dHhranhod21zZ2puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzY5MzgsImV4cCI6MjEwMzUxMjkzOH0.wz8lllymLmmleherQwR2oqcYQbtXz8P_VqUU8xVhxE4";
try {
  if (typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
} catch (e) {
  console.warn("Supabase init error:", e);
}

function fixDirectImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let clean = url.trim();
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
    const [usersRes, adsRes, combosRes, catsRes] = await Promise.allSettled([
      supabaseClient.from('users').select('*'),
      supabaseClient.from('ads').select('*').order('created_at', { ascending: false }).limit(100),
      supabaseClient.from('combos').select('*'),
      supabaseClient.from('categories').select('*')
    ]);

    let dataUpdated = false;

    if (usersRes.status === 'fulfilled' && usersRes.value.data) {
      const allParsedUsers = usersRes.value.data.map(u => ({
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
          region: a.region,
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
          lat: Number(a.lat) || 33.5138,
          lng: Number(a.lng) || 36.2765,
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
  
  const directClient = (typeof window.supabase !== 'undefined')
    ? window.supabase.createClient("https://mmespmwztxkjxhwmsgjn.supabase.co", SUPABASE_ANON_KEY)
    : supabaseClient;

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
  if (slots <= 0) { showToast('Максимум 6 фотографий!', 'warning'); return; }

  showToast(`Загрузка изображений...`, 'info');

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

/* --- АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ --- */
async function handleAuthSubmit(e) {
  e.preventDefault();
  const isReg = !byId('reg-fields').classList.contains('hidden');
  const remember = byId('auth-remember-me') ? byId('auth-remember-me').checked : true;
  const btn = byId('auth-submit-btn');
  const originalText = btn.innerText;
  btn.disabled = true;

  if (isReg) {
    const username = byId('reg-username')?.value.trim();
    const passwordRaw = byId('reg-password')?.value;
    const passwordConfirm = byId('reg-password-confirm')?.value;
    const kunya = byId('reg-kunya')?.value.trim();
    const whatsappRaw = byId('reg-whatsapp')?.value.trim();
    const genderRadio = document.querySelector('input[name="auth-gender"]:checked');

    if (!username || username.length < 3) {
      showToast('Логин должен быть не менее 3 символов', 'warning');
      btn.disabled = false; return;
    }
    if (!passwordRaw || passwordRaw.length < 6 || passwordRaw !== passwordConfirm) {
      showToast('Пароли не совпадают или короче 6 символов', 'warning');
      btn.disabled = false; return;
    }
    if (!genderRadio) {
      showToast('Выберите ваш пол', 'warning');
      btn.disabled = false; return;
    }

    const waCheck = validateWhatsApp(whatsappRaw);
    if (!waCheck.valid) {
      showToast(waCheck.error, 'error');
      btn.disabled = false; return;
    }

    btn.innerText = 'Регистрация...';
    const passHash = await sha256(passwordRaw);
    const uid = 'u_' + Date.now();

    const newUserPayload = {
      uid: uid,
      username: username,
      password_hash: passHash,
      kunya: kunya || username,
      gender: genderRadio.value,
      whatsapp: waCheck.number,
      avatar: null,
      role: 'USER',
      avitocash_balance: 0,
      trial_balance: 10,
      favorites: []
    };

    let regSuccessUser = null;

    if (supabaseClient) {
      try {
        const { data: insData, error: insErr } = await supabaseClient
          .from('users')
          .insert([newUserPayload])
          .select()
          .single();

        if (insErr) {
          if (insErr.code === '23505' || insErr.message.includes('unique')) {
            showToast('Логин или номер уже зарегистрирован', 'error');
            btn.disabled = false; btn.innerText = originalText; return;
          }
          console.warn('Direct user insert warning:', insErr.message);
        } else if (insData) {
          regSuccessUser = {
            ...insData,
            passwordHash: insData.password_hash,
            avitocashBalance: Number(insData.avitocash_balance || 0),
            trialBalance: Number(insData.trial_balance || 10)
          };
        }
      } catch (cloudErr) {
        console.warn('Registration cloud sync error:', cloudErr);
      }
    }

    if (!regSuccessUser) {
      regSuccessUser = {
        ...newUserPayload,
        passwordHash: passHash,
        avitocashBalance: 0,
        trialBalance: 10
      };
    }

    const idx = users.findIndex(u => u.uid === regSuccessUser.uid || u.username.toLowerCase() === regSuccessUser.username.toLowerCase());
    if (idx !== -1) users[idx] = regSuccessUser;
    else users.push(regSuccessUser);

    saveUserSession(regSuccessUser, remember);
    closeModal('modal-auth');
    showToast(`Регистрация завершена! Добро пожаловать, ${regSuccessUser.kunya || regSuccessUser.username}!`, 'success');
    btn.disabled = false; btn.innerText = originalText;

  } else {
    const loginIdentifier = byId('auth-username').value.trim();
    const rawPassword = byId('auth-password').value;

    if (!loginIdentifier || !rawPassword) {
      showToast('Введите логин и пароль', 'warning');
      btn.disabled = false; return;
    }

    btn.innerText = 'Вход...';
    const password = await sha256(rawPassword);
    let foundUser = null;

    if (supabaseClient) {
      try {
        const cleanWa = loginIdentifier.replace(/\D/g, '');
        const { data: foundRows, error: findErr } = await supabaseClient
          .from('users')
          .select('*')
          .or(`username.ilike.${loginIdentifier},whatsapp.ilike.%${cleanWa ? cleanWa : 'NOMATCH'}%`)
          .eq('password_hash', password)
          .limit(1);

        if (!findErr && foundRows && foundRows.length > 0) {
          const u = foundRows[0];
          foundUser = {
            ...u,
            passwordHash: u.password_hash,
            avitocashBalance: Number(u.avitocash_balance || 0),
            trialBalance: Number(u.trial_balance || 0),
            favorites: Array.isArray(u.favorites) ? u.favorites : []
          };
        }
      } catch (err) {
        console.warn("Supabase auth check err:", err);
      }
    }

    if (!foundUser) {
      foundUser = users.find(u => 
        ((u.username && u.username.toLowerCase() === loginIdentifier.toLowerCase()) || 
         (u.whatsapp && u.whatsapp.replace(/\D/g, '') === loginIdentifier.replace(/\D/g, ''))) &&
        u.passwordHash === password
      );
    }

    if (foundUser) {
      if (foundUser.is_archived || foundUser.isArchived) {
        showToast('Аккаунт в архиве', 'error');
        btn.disabled = false; btn.innerText = originalText; return;
      }
      const idx = users.findIndex(u => u.uid === foundUser.uid);
      if (idx !== -1) users[idx] = foundUser;
      else users.push(foundUser);

      if (Array.isArray(foundUser.favorites)) {
        favorites = [...new Set([...(Array.isArray(favorites) ? favorites : []), ...foundUser.favorites])];
        try { localStorage.setItem('bs_favorites', JSON.stringify(favorites)); } catch (err) {}
      }
      saveUserSession(foundUser, remember);
      closeModal('modal-auth');
      showToast(`С возвращением, ${foundUser.kunya || foundUser.username}!`, 'success');
    } else {
      showToast('Неверный логин или пароль', 'error');
    }

    btn.disabled = false; btn.innerText = originalText;
  }
}

/* --- СОХРАНЕНИЕ ОБЪЯВЛЕНИЙ --- */
async function saveAdToSupabase(ad) {
  if (!supabaseClient) return;
  const dbAd = {
    id: ad.id,
    title: ad.title,
    category: ad.category,
    store_category: ad.storeCategory || '',
    region: ad.region,
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
    lat: Number(ad.lat || 33.5138),
    lng: Number(ad.lng || 36.2765),
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
  if (targetLang === 'ru') return clean;

  const cacheKey = `${targetLang}_${clean}`;
  if (TRANSLATE_CACHE[cacheKey]) return TRANSLATE_CACHE[cacheKey];

  // 1. Быстрый словарь популярных слов
  const quickWords = {
    'телефон': 'telefon',
    'новый': 'yeni',
    'отличное состояние': 'mükemmel durumda',
    'хорошее состояние': 'iyi durumda',
    'б/у': 'ikinci el',
    'договорная': 'pazarlıklı',
    'бесплатно': 'ücretsiz'
  };
  if (quickWords[clean.toLowerCase()]) {
    const res = quickWords[clean.toLowerCase()];
    TRANSLATE_CACHE[cacheKey] = res;
    return res;
  }

  // 2. Онлайн-переводчик Google
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        const result = data[0].map(x => x[0]).join('');
        if (result) {
          TRANSLATE_CACHE[cacheKey] = result;
          return result;
        }
      }
    }
  } catch (e) {}

  // 3. Резервный переводчик MyMemory
  try {
    const res2 = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=ru|tr`);
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2?.responseData?.translatedText) {
        const result2 = data2.responseData.translatedText;
        TRANSLATE_CACHE[cacheKey] = result2;
        return result2;
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
  // Навигация
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
    regLbl.innerText = regVal === 'ALL' ? t('all_regions') : (REGION_NAMES[regVal] || t('all_regions'));
  }

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
  
  // Перевод элементов внутри модального меню сортировки
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
  const adPhotoLbl = byId('ad-photos-label');
  if (adPhotoLbl) adPhotoLbl.innerText = t('ad_photos_label');
  const adUpText = byId('ad-upload-btn-text');
  if (adUpText) adUpText.innerText = t('ad_photos_btn');
  const adTitleInp = byId('ad-title');
  if (adTitleInp) adTitleInp.placeholder = t('ad_title_ph');
  const adPriceInp = byId('ad-price');
  if (adPriceInp) adPriceInp.placeholder = t('ad_price_ph');
  const adFreeLbl = byId('ad-is-free')?.parentElement?.querySelector('span');
  if (adFreeLbl) adFreeLbl.innerText = t('ad_free_label');
  const adNegLbl = byId('ad-is-negotiable')?.parentElement?.querySelector('span');
  if (adNegLbl) adNegLbl.innerText = t('ad_negotiable_label');
  const adWmLbl = byId('ad-is-women-only')?.parentElement?.querySelector('span');
  if (adWmLbl) adWmLbl.innerText = t('ad_women_label');
  const adDescInp = byId('ad-desc');
  if (adDescInp) adDescInp.placeholder = t('ad_desc_ph');
  const adAdvBtn = byId('create-ad-advanced-fields')?.previousElementSibling?.querySelector('span');
  if (adAdvBtn) adAdvBtn.innerHTML = `<i class="fa-solid fa-sliders text-purple-400"></i> ${t('ad_advanced_btn')}`;
  const createSubBtn = document.querySelector('#modal-create-ad button[type="submit"]');
  if (createSubBtn) createSubBtn.innerText = t('ad_submit_btn');

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

// Поиск
  const sDesk = byId('search-input-desktop');
  if (sDesk) sDesk.placeholder = t('search');
  const sMob = byId('search-input');
  if (sMob) sMob.placeholder = t('search');

  // Бегущая строка
  const marqueeDesktop = byId('desktop-marquee-text');
  const marqueeMobile = byId('mobile-marquee-text');
  const defaultMarqueeTr = "🔥 Avito Türk'e Hoş Geldiniz! • 🇹🇷 Türkiye'nin Güvenilir Seri İlan Platformu • 💰 Güncel Döviz Kurları • 🚀 Mağazanızı Açın ve Hızlı Satın • 🔍 Araç, Emlak ve İkinci El Ürünleri Keşfedin";
  const defaultMarqueeRu = "🔥 Добро пожаловать на Avito Türk! • 🇹🇷 Лучшая доска объявлений Турции • 💰 Курсы валют обновляются автоматически • 🚀 Создавайте магазины и продавайте быстрее • 🔍 Ищите авто, товары и недвижимость";
  
  if (marqueeDesktop && !MARQUEE_SETTINGS.text) marqueeDesktop.innerText = isTr ? defaultMarqueeTr : defaultMarqueeRu;
  if (marqueeMobile && !MARQUEE_SETTINGS.text) marqueeMobile.innerText = isTr ? defaultMarqueeTr : defaultMarqueeRu;

  // Футер
  const devLbl = byId('ft-dev-label');
  if (devLbl) devLbl.innerText = isTr ? 'Geliştirici:' : 'Разработчик:';
}