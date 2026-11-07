/* ================= EVENT HANDLERS & APP CONTROLLER ================= */

// Реестр локально удаленных ID для защиты от возврата при обновлении
function getDeletedAdsList() {
  try {
    return JSON.parse(localStorage.getItem('bs_deleted_ad_ids') || '[]');
  } catch(e) { return []; }
}

function markAdDeletedLocally(adId) {
  try {
    const list = getDeletedAdsList();
    if (!list.includes(adId)) {
      list.push(adId);
      localStorage.setItem('bs_deleted_ad_ids', JSON.stringify(list));
    }
  } catch(e) {}
}

function showToast(message, type = 'info') { 
  const c = byId('toast-container'); 
  if (!c) return; 
  const t = document.createElement('div'); 
  let icon = 'fa-circle-info'; 
  if (type === 'success') icon = 'fa-circle-check'; 
  if (type === 'error') icon = 'fa-circle-xmark'; 
  if (type === 'warning') icon = 'fa-triangle-exclamation'; 
  t.className = 'px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 pointer-events-auto shadow-xl'; 
  t.style.cssText = 'background:#262626;color:#fff;animation:cardIn .25s ease'; 
  const _ic = document.createElement('i'); _ic.className = 'fa-solid ' + icon; const _sp = document.createElement('span'); _sp.textContent = String(message); t.append(_ic, _sp); 
  c.appendChild(t); 
  setTimeout(() => { 
    t.style.opacity = '0'; 
    t.style.transition = 'opacity .3s'; 
    setTimeout(() => t.remove(), 320); 
  }, 3200); 
}

function showConfirmModal(title, msg, onConfirm) { 
  const tTitle = t(title);
  const tMsg = t(msg);
  byId('confirm-modal-title').innerText = tTitle; 
  byId('confirm-modal-msg').innerText = tMsg; 
  const ok = byId('confirm-btn-ok'), cancel = byId('confirm-btn-cancel'); 
  if (ok) ok.innerText = currentLang === 'tr' ? 'Tamam' : 'Да, выполнить';
  if (cancel) cancel.innerText = currentLang === 'tr' ? 'İptal' : 'Отмена';
  openModal('modal-confirm'); 
  const clean = () => { closeModal('modal-confirm'); ok.onclick = null; cancel.onclick = null; }; 
  cancel.onclick = clean; 
  ok.onclick = () => { clean(); if (typeof onConfirm === 'function') onConfirm(); }; 
}

function openModal(id) { 
  const m = byId(id); 
  if (!m) return; 
  m.classList.remove('hidden'); 
  m.style.display = 'flex';
  if (!modalStack.includes(id)) modalStack.push(id); 
  m.style.zIndex = id === 'modal-tg-gender' ? '999999' : String(500 + modalStack.indexOf(id) * 30); 
  document.body.classList.add('overflow-hidden'); 
  try { history.pushState({ appModal: id }, ''); } catch (e) {} 
}

function closeModal(id) { 
  const m = byId(id); 
  if (m) {
    m.classList.add('hidden'); 
    m.style.display = 'none';
  }
  const wasTop = modalStack[modalStack.length - 1] === id; 
  modalStack = modalStack.filter(x => x !== id); 
  if (modalStack.length === 0) document.body.classList.remove('overflow-hidden'); 
  if (wasTop && history.state && history.state.appModal === id) { 
    suppressPop = true; 
    try { history.back(); } catch (e) {} 
  } 
}

window.addEventListener('popstate', function () {
  if (suppressPop) { suppressPop = false; return; }
  if (modalStack.length) {
    const top = modalStack[modalStack.length - 1];
    if (top === 'modal-rules-agreement') return;
    const m = byId(top); if (m) m.classList.add('hidden');
    modalStack.pop();
    if (modalStack.length === 0) document.body.classList.remove('overflow-hidden');
  }
});

function restoreUserSession() { 
  try { 
    const favs = localStorage.getItem('bs_favorites');
    if (favs) {
      favorites = JSON.parse(favs);
    }
  } catch (e) {
    favorites = [];
  }

  try { 
    const s = localStorage.getItem('bs_current_user') || sessionStorage.getItem('bs_current_user'); 
    if (s) { 
      const p = JSON.parse(s); 
      const isArchived = archivedUsers.some(u => (u.uid && p.uid && u.uid === p.uid) || (u.username && p.username && u.username.toLowerCase() === p.username.toLowerCase()));
      if (isArchived) {
        currentUser = null;
        localStorage.removeItem('bs_current_user');
        sessionStorage.removeItem('bs_current_user');
        updateAuthUI();
        return;
      }
      currentUser = users.find(u => u.username && p.username && u.username.toLowerCase() === p.username.toLowerCase()) || p; 
      if (currentUser && Array.isArray(currentUser.favorites)) {
        favorites = [...new Set([...(Array.isArray(favorites) ? favorites : []), ...currentUser.favorites])];
        try { localStorage.setItem('bs_favorites', JSON.stringify(favorites)); } catch (err) {}
      }
    } 
  } catch (e) {} 
  updateAuthUI(); 
}

function saveUserSession(user, remember = true) { 
  currentUser = user; 
  try { 
    const { passwordHash, password_hash, ...safeUser } = user || {}; 
    if (remember) { 
      localStorage.setItem('bs_current_user', JSON.stringify(safeUser)); 
      sessionStorage.removeItem('bs_current_user'); 
    } else { 
      sessionStorage.setItem('bs_current_user', JSON.stringify(safeUser)); 
      localStorage.removeItem('bs_current_user'); 
    } 
  } catch (e) {} 
  updateAuthUI(); 
}

function updateAuthUI() { updateNavState(); renderCategoryPills(); renderAds(); }

function handleNavClick(tab) { 
  LAST_NAV = tab; 
  if (tab === 'home') { selectedCategory = 'all'; resetPageAndRender(); } 
  else if (tab === 'shops') { selectedCategory = 'shops_dir'; resetPageAndRender(); } 
else if (tab === 'create') { 
    openCreateAdModal(); 
  }
  else if (tab === 'favorites') { selectedCategory = 'favorites'; resetPageAndRender(); } 
  else if (tab === 'profile') { 
    if (!currentUser) openAuthModal(); 
    else openProfileModal(); 
  } 
  updateNavState(); 
}

function updateNavState() {
  const map = { home: 'home', shops: 'shops', create: 'create', favorites: 'fav', profile: 'profile' };
  const active = map[LAST_NAV] || 'home';
  const navTitles = {
    home: t('Главная'),
    shops: t('Магазины'),
    create: t('Создать'),
    fav: t('Избранное'),
    profile: t('Профиль')
  };
  const iconFor = key => key === 'home' ? IGSVG.home(active === 'home') : key === 'shops' ? IGSVG.store(active === 'shops') : key === 'create' ? IGSVG.plusSq() : key === 'fav' ? IGSVG.star(active === 'fav') : '';
  [['sb-home', 'bn-home', 'home'], ['sb-shops', 'bn-shops', 'shops'], ['sb-create', 'bn-create', 'create'], ['sb-fav', 'bn-fav', 'fav']].forEach(([sb, bn, key]) => {
    const s = byId(sb), b = byId(bn);
    if (s) { 
      s.querySelector('.nav-ic').innerHTML = iconFor(key); 
      const lbl = s.querySelector('.nav-label');
      if (lbl) lbl.innerText = navTitles[key];
      s.classList.toggle('font-bold', active === key); 
    }
    if (b) b.querySelector('.nav-ic').innerHTML = iconFor(key);
  });
  const spLabel = byId('sb-profile')?.querySelector('.nav-label');
  if (spLabel) spLabel.innerText = navTitles.profile;

if (typeof translateStaticUI === 'function') {
    translateStaticUI(currentLang);
  }

  const avHtml = (currentUser && currentUser.avatar) ? `<img src="${currentUser.avatar}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-user text-xs t2"></i>`;
  const sp = byId('sb-profile'), bp = byId('bn-profile-ic');
  if (sp) { sp.querySelector('.nav-ic').innerHTML = `<span class="w-6 h-6 rounded-full overflow-hidden border b-ig bg-field flex items-center justify-center" style="${active === 'profile' ? 'border-color:#f59e0b' : ''}">${avHtml}</span>`; sp.classList.toggle('font-bold', active === 'profile'); }
  if (bp) { bp.innerHTML = avHtml; if (active === 'profile') bp.style.borderColor = '#f59e0b'; else bp.style.borderColor = ''; }
}

function checkExpiredAdsStatus() {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let changed = false;

  ads.forEach(a => {
    if (a.status === 'ACTIVE' && a.createdAt && (now - a.createdAt > THIRTY_DAYS)) {
      a.status = 'EXPIRED';
      changed = true;
      if (supabaseClient) {
        supabaseClient.from('ads').update({ status: 'EXPIRED' }).eq('id', a.id).then();
      }
    }
  });

  if (changed) saveCachedAds();
}

async function renewAdExpiry(adId) {
  const ad = ads.find(a => a.id === adId);
  if (!ad || !currentUser) return;

  ad.createdAt = Date.now();
  ad.status = 'ACTIVE';

  if (supabaseClient) {
    await supabaseClient.from('ads').update({ created_at: ad.createdAt, status: 'ACTIVE' }).eq('id', ad.id);
  }

  saveCachedAds();
  renderAds();
  renderCategoryPills();
  openProfileModal();
  showToast(t('Объявление успешно продлено и поднято в топ!'), 'success');
}

async function bumpAdToTop(adId) {
  const ad = ads.find(a => a.id === adId);
  if (!ad || !currentUser) return;

  ad.createdAt = Date.now();
  if (supabaseClient) {
    await supabaseClient.from('ads').update({ created_at: ad.createdAt }).eq('id', ad.id);
  }

  // Перемещаем в начало локального массива
  ads = [ad, ...ads.filter(a => a.id !== adId)];
  saveCachedAds();
  renderAds();
  openProfileModal();
  showToast('🚀 Объявление поднято на первое место в ленте!', 'success');
}

// Универсальная чистая нормализация для русского, английского и арабского языков
function normalizeArabicText(str) {
  if (!str || typeof str !== 'string') return '';
  const isArabic = /[\u0600-\u06FF]/.test(str);
  if (!isArabic) {
    return str.toLowerCase().trim();
  }
  return str
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىيئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .trim();
}

function checkUrlHashAdOpen() {
	const hash = window.location.hash || '';
  if (hash.startsWith('#ad-')) {
    const targetAdId = hash.replace('#ad-', '').trim();
    if (targetAdId) {
      setTimeout(() => {
        const targetAd = (typeof ads !== 'undefined' ? ads.find(a => a.id === targetAdId) : null) || 
                         (typeof combos !== 'undefined' ? combos.find(c => c.id === targetAdId) : null);
        if (targetAd && typeof openAdDetail === 'function') {
          openAdDetail(targetAdId);
        }
      }, 150);
    }
  }
}

function requestPushPermission() {
  if (!('Notification' in window)) return;
  if (localStorage.getItem('bs_push_asked')) return;
  if (Notification.permission === 'default') {
    localStorage.setItem('bs_push_asked', 'true');
    Notification.requestPermission();
  } else {
    localStorage.setItem('bs_push_asked', 'true');
  }
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch(e) {}
}

function sendBrowserPush(title, body, icon = null) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(title, {
      body: body,
      icon: icon || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ccircle cx=\'50\' cy=\'50\' r=\'50\' fill=\'%230095f6\'/%3E%3Ctext x=\'50\' y=\'68\' font-family=\'Arial\' font-weight=\'900\' font-size=\'56\' fill=\'%23ffffff\' text-anchor=\'middle\'%3EA%3C/text%3E%3C/svg%3E',
      badge: icon
    });
    playNotificationSound();
  } catch(e) {}
}

function checkFavoritesAndQueueAlerts(oldAd, newAd) {
  if (!currentUser) return;
  if (favorites.includes(newAd.id)) {
    const oldP = adToUSD(oldAd);
    const newP = adToUSD(newAd);
    if (newP < oldP && newP > 0) {
      sendBrowserPush(`🔥 ${t('Снижение цены!')}`, `${t('Цена на товар из избранного снижена до')} $${newP.toFixed(2)}: ${newAd.title}`);
    }
  }
  if (Array.isArray(newAd.queue) && Array.isArray(oldAd.queue)) {
    const oldRank = oldAd.queue.findIndex(q => q.username === currentUser.username) + 1;
    const newRank = newAd.queue.findIndex(q => q.username === currentUser.username) + 1;
    if (oldRank > 1 && newRank === 1) {
      sendBrowserPush(`🎉 ${t('Ваша очередь подошла!')}`, `${t('Вы стали первым в очереди на')} "${newAd.title}". ${t('Свяжитесь с продавцом!')}`);
    }
  }
}

async function processAvatarUpload(e, mode = 'auth') { 
  const f = e.target.files[0]; 
  if (!f) return; 
  try { 
    const d = await processSquareImageCrop(f, 250); 
    byId(mode === 'auth' ? 'auth-avatar-data' : 'edit-profile-avatar-data').value = d; 
    const box = byId(mode === 'auth' ? 'auth-avatar-preview-box' : 'edit-profile-avatar-preview-box'); 
    const img = byId(mode === 'auth' ? 'auth-avatar-preview-img' : 'edit-profile-avatar-preview-img'); 
    if (box && img) { img.src = d; box.classList.remove('hidden'); } 
  } catch (err) { 
    console.warn('Avatar processing error:', err); 
    showToast('Не удалось обработать аватарку', 'error'); 
  } 
}

function removePendingPhoto(mode, index) { 
  (mode === 'create' ? pendingCreateImages : pendingEditImages).splice(index, 1); 
  renderPhotoThumbnailsGrid(mode); 
}

async function processShopLogoUpload(e) { 
  const f = e.target.files[0]; 
  if (!f) return; 
  try { 
    const d = await processSquareImageCrop(f, 300); 
    byId('shop-logo-data').value = d; 
    byId('shop-logo-preview-img').src = d; 
    byId('shop-logo-preview-box').classList.remove('hidden'); 
  } catch (err) {} 
}

function openSupportModal() { 
  const titleEl = byId('support-modal-title');
  const descEl = byId('support-modal-desc');
  const idLbl = byId('support-modal-idlabel');
  const copySpan = byId('support-modal-copybtn')?.querySelector('span');

  if (titleEl) titleEl.innerText = t('Поддержка сервера — ShamCash');
  if (descEl) descEl.innerText = t('Отсканируйте QR-код в приложении ShamCash, чтобы оплатить и поддержать платформу Avito Türk.');
  if (idLbl) idLbl.innerText = t('ID счёта ShamCash');
  if (copySpan) copySpan.innerText = t('Скопировать ID');

  openModal('modal-shamcash-qr'); 
  setTimeout(renderSupportQR, 60); 
  setTimeout(renderSupportQR, 200); 
}

function copyShamCashCode() { 
  const done = () => showToast('ID код ShamCash скопирован!', 'success'); 
  if (navigator.clipboard) navigator.clipboard.writeText(AVITOCASH_ID).then(done).catch(() => fallbackCopy(AVITOCASH_ID, done)); 
  else fallbackCopy(AVITOCASH_ID, done); 
}

function fallbackCopy(text, cb) { 
  const i = document.createElement('input'); 
  i.value = text; 
  document.body.appendChild(i); 
  i.select(); 
  document.execCommand('copy'); 
  i.remove(); 
  if (cb) cb(); 
}

async function shareAd(adId) {
  const ad = (typeof getListingById === 'function') ? getListingById(adId) : (ads.find(a => a.id === adId) || combos.find(x => x.id === adId)); if (!ad) return;
  const base = (location.origin && location.origin !== 'null') ? location.origin + location.pathname : location.href.split('#')[0];
  const url = base + '#ad-' + ad.id;
  let sTitle = ad.title || '';
  if (currentLang === 'tr' && typeof translateDynamic === 'function') {
    sTitle = await translateDynamic(ad.title, 'tr');
  }
  sharePayload = { title: sTitle, text: `${sTitle} — Avito Türk`, url: url };
  const state = byId('share-preview-state'), preview = byId('share-preview-wrap');
  if (state) { state.innerText = 'Генерируем красивую карточку...'; state.classList.remove('hidden'); }
  if (preview) preview.classList.add('hidden');
  openShareSheet();
  showToast('Генерация красивой карточки…', 'info');
  const blob = await generateShareImage(ad);
  lastShareBlob = blob;
  if (lastShareObjectUrl) { URL.revokeObjectURL(lastShareObjectUrl); lastShareObjectUrl = null; }
  if (blob) {
    lastShareObjectUrl = URL.createObjectURL(blob);
    const img = byId('share-preview-image');
    if (img) img.src = lastShareObjectUrl;
    if (preview) preview.classList.remove('hidden');
    if (state) state.classList.add('hidden');
  } else if (state) {
    state.innerText = 'Не удалось создать карточку. Можно отправить ссылку.';
    showToast('Не удалось создать карточку, ссылка доступна ниже', 'warning');
  }
  updateShareActions();
}

function updateShareActions() {
  const sys = byId('share-system');
  if (!sys) return;
  const file = lastShareBlob ? new File([lastShareBlob], 'avito-sham-card.jpg', { type: 'image/jpeg' }) : null;
  const canShareFile = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
  if (navigator.share) { sys.classList.remove('hidden'); sys.classList.add('flex'); } else { sys.classList.add('hidden'); sys.classList.remove('flex'); }
  sys.disabled = !canShareFile && !navigator.share;
}

async function shareImageToApp(app) {
  if (!lastShareBlob) { showToast('Сначала нажмите "Поделиться", чтобы создать картинку', 'warning'); return; }
  const file = new File([lastShareBlob], 'avito-sham-card.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: sharePayload.title, text: sharePayload.text + ' ' + sharePayload.url });
      closeModal('modal-share');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Share failed', err);
    }
  }
  showToast('Браузер не поддерживает отправку файлов, открываю ссылку...', 'warning');
  const enc = encodeURIComponent;
  const u = sharePayload.url, tx = sharePayload.text;
  let link = '';
  if (app === 'whatsapp') link = `https://wa.me/?text=${enc(tx + ' ' + u)}`;
  else if (app === 'telegram') link = `https://t.me/share/url?url=${enc(u)}&text=${enc(tx)}`;
  else if (app === 'viber') link = `viber://forward?text=${enc(tx + ' ' + u)}`;
  if (link) window.open(link, '_blank');
}

async function downloadShareCard() {
  if (!lastShareBlob) { showToast('Карточка еще не готова — нажмите Поделиться сначала', 'warning'); return; }
  const file = new File([lastShareBlob], 'avito-sham-card.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Avito Türk Card' });
      closeModal('modal-share');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    const reader = new FileReader();
    reader.onloadend = function() {
      const link = document.createElement('a');
      link.href = reader.result;
      link.download = 'avito-sham-card.jpg';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Красивая карточка скачана', 'success');
      closeModal('modal-share');
    };
    reader.readAsDataURL(lastShareBlob);
    closeModal('modal-share');
  } catch (e) {
    showToast('Ошибка сохранения', 'error');
  }
}

function openShareSheet() { 
  if (!sharePayload) return; 
  const enc = encodeURIComponent, u = sharePayload.url, tx = sharePayload.text; 
  byId('share-wa-link').href = `https://wa.me/?text=${enc(tx + ' ' + u)}`; 
  const sys = byId('share-system'); 
  if (navigator.share) { sys.classList.remove('hidden'); sys.classList.add('flex'); } else { sys.classList.add('hidden'); sys.classList.remove('flex'); } 
  openModal('modal-share'); 
}

function systemShare() {
  if (!navigator.share || !sharePayload) return;
  const file = lastShareBlob ? new File([lastShareBlob], 'avito-sham-card.jpg', { type: 'image/jpeg' }) : null;
  const data = file && navigator.canShare && navigator.canShare({ files: [file] })
    ? { files: [file], title: sharePayload.title, text: sharePayload.text }
    : sharePayload;
  navigator.share(data).catch(() => {});
}

function copyShareLink() { 
  if (!sharePayload) return; 
  fallbackCopy(sharePayload.url, () => showToast('Ссылка скопирована!', 'success')); 
  closeModal('modal-share'); 
}

function autoPickIcon() { const used = categories.map(c => c.icon); for (const ic of CATEGORY_ICON_POOL) if (!used.includes(ic)) return ic; return 'fa-tag'; }
function pickCatIcon(ic) { catIconChoice = ic; renderAdminTabContent(); }
function startEditCategory(catId) { const c = categories.find(x => x.id === catId); if (!c) return; editingCatId = catId; catNameDraft = c.name; catIconChoice = c.icon; renderAdminTabContent(); const inp = byId('cat-name-input'); if (inp) inp.focus(); }
function cancelEditCategory() { editingCatId = null; catNameDraft = ''; catIconChoice = autoPickIcon(); renderAdminTabContent(); }

function saveCategoryForm() { 
  const inp = byId('cat-name-input'); 
  const name = (inp ? inp.value : catNameDraft).trim(); 
  if (!name) { showToast('Введите название категории', 'warning'); return; } 
  const icon = catIconChoice || autoPickIcon(); 
  if (editingCatId) { 
    const c = categories.find(x => x.id === editingCatId); 
    if (c) { c.name = name; c.icon = icon; } 
    showToast(`Категория "${name}" обновлена!`, 'success'); 
  } else { 
    categories.push({ id: 'cat_' + Date.now(), name, icon }); 
    showToast(`Категория "${name}" добавлена!`, 'success'); 
  } 
  editingCatId = null; 
  catNameDraft = ''; 
  catIconChoice = autoPickIcon(); 
  pushCategoriesToCloud(); 
  renderCategoryPills(); 
  renderAdminTabContent(); 
}

function deleteCategoryWithConfirm(catId) { 
  const c = categories.find(x => x.id === catId); 
  if (!c) return; 
  showConfirmModal('Удаление категории', `Удалить категорию "${c.name}"? Объявления останутся в базе, но категория исчезнет из ленты.`, () => { 
    categories = categories.filter(x => x.id !== catId); 
    pushCategoriesToCloud(); 
    if (selectedCategory === catId) selectedCategory = 'all'; 
    renderCategoryPills(); 
    renderAdminTabContent(); 
    renderAds(); 
    showToast('Категория удалена', 'info'); 
  }); 
}

function loadDraftCheck() { try { const d = localStorage.getItem('bs_ad_draft'); if (d) { byId('draft-restore-banner').classList.remove('hidden'); } } catch(e){} }
function saveDraft() { try { const data = { title: byId('ad-title').value, category: byId('ad-category').value, region: byId('ad-region').value, city: byId('ad-city').value, price: byId('ad-price').value, currency: byId('ad-currency').value, desc: byId('ad-desc').value }; localStorage.setItem('bs_ad_draft', JSON.stringify(data)); } catch(e){} }
function restoreDraft() { try { const d = localStorage.getItem('bs_ad_draft'); if (d) { const data = JSON.parse(d); byId('ad-title').value = data.title || ''; byId('ad-category').value = data.category || 'electronics'; byId('ad-region').value = data.region || 'IST'; byId('ad-city').value = data.city || ''; byId('ad-price').value = data.price || ''; byId('ad-currency').value = data.currency || 'USD'; byId('ad-desc').value = data.desc || ''; byId('draft-restore-banner').classList.add('hidden'); } } catch(e){} }
function clearDraft(silent) { localStorage.removeItem('bs_ad_draft'); byId('draft-restore-banner').classList.add('hidden'); if(!silent) showToast('Черновик удален', 'info'); }

function toggleAdvancedCreateFields() {
  const adv = byId('create-ad-advanced-fields');
  const ic = byId('advanced-toggle-icon');
  if (!adv) return;
  const isHidden = adv.classList.contains('hidden');
  adv.classList.toggle('hidden', !isHidden);
  if (ic) ic.style.transform = isHidden ? 'rotate(180deg)' : 'none';
  if (isHidden) setTimeout(initCreateMap, 150);
}

function openCreateAdModal() { 
  if (!currentUser) {
    openAuthModal();
    const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
    showToast(isTr ? 'İlan vermek için lütfen giriş yapın veya kayıt olun' : 'Для подачи объявления войдите или зарегистрируйтесь', 'warning');
    return;
  }

  isSubmittingAd = false;
  const submitBtn = byId('create-ad-submit-btn') || document.querySelector('#modal-create-ad button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerText = t('ad_submit_btn');
  }

  pendingCreateImages = []; 
  renderPhotoThumbnailsGrid('create'); 
  fillCategorySelect(byId('ad-category'));
  loadDraftCheck();

  const userBadge = byId('user-logged-badge');
  const userNameEl = byId('user-logged-name');
  if (userBadge) {
    userBadge.classList.remove('hidden');
    if (userNameEl) userNameEl.innerText = `${currentUser.kunya || currentUser.username} (@${currentUser.username})`;
  }
  
// Сброс и подготовка приватного режима геолокации
  sellerGeoMode = 'fuzzy';
  updateLocationSummaryUI();

  const savedLocation = localStorage.getItem('bs_last_seller_location');
  if (savedLocation && (!localStorage.getItem('bs_ad_draft'))) {
    try {
      const loc = JSON.parse(savedLocation);
      if (loc.region && byId('ad-region')) byId('ad-region').value = loc.region;
      if (loc.city && byId('ad-city')) byId('ad-city').value = loc.city;
      if (loc.lat && byId('ad-lat')) byId('ad-lat').value = loc.lat;
      if (loc.lng && byId('ad-lng')) byId('ad-lng').value = loc.lng;
    } catch (e) {}
  } 

  const sc = byId('ad-store-cat-container'), ss = byId('ad-store-category'); 
  if (currentUser && currentUser.shop && currentUser.shop.customCategories && currentUser.shop.customCategories.length > 0) { 
    ss.innerHTML = `<option value="">Без специальной категории магазина</option>` + currentUser.shop.customCategories.map(cat => `<option value="${cat}">${cat}</option>`).join(''); 
    sc.classList.remove('hidden'); 
  } else if (sc) sc.classList.add('hidden'); 

  const wb = byId('women-only-container'); 
  if (currentUser && (currentUser.gender === 'FEMALE' || currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN')) { 
    wb.classList.remove('hidden'); wb.classList.add('flex'); 
  } else if (wb) { 
    wb.classList.add('hidden'); wb.classList.remove('flex'); 
  } 

  const onbC = byId('ad-onbehalf-container'), onbS = byId('ad-post-onbehalf'); 
  if (onbC && onbS) { 
    if (currentUser && (currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN')) { 
      onbS.innerHTML = `<option value="${escapeHTML(currentUser.username)}">Себя — ${escapeHTML(currentUser.kunya || currentUser.username)}</option>` + users.filter(u => u.username !== currentUser.username).map(u => `<option value="${escapeHTML(u.username)}">@${escapeHTML(u.username)} — ${u.kunya || 'без имени'}</option>`).join(''); 
      if (onBehalfPreset) { onbS.value = onBehalfPreset; onBehalfPreset = null; } 
      onbC.classList.remove('hidden'); 
    } else onbC.classList.add('hidden'); 
  } 

openModal('modal-create-ad'); 
  document.querySelectorAll('.draft-field').forEach(el => { 
    el.addEventListener('input', saveDraft); 
    el.addEventListener('change', saveDraft); 
  });

  const titleField = byId('ad-title');
  if (titleField) {
    titleField.oninput = () => {
      saveDraft();
      detectCategoryByTitle(titleField.value);
    };
  }
}

/* ================= ПРИВАТНОСТЬ ГЕОЛОКАЦИИ (РАЙОН VS ТОЧНАЯ) ================= */
let sellerGeoMode = 'fuzzy'; // 'fuzzy' (район 2-3 км) или 'exact' (точная точка)

function updateLocationSummaryUI() {
  const sumEl = byId('ad-location-summary');
  const badgeEl = byId('geo-status-badge');
  const btnFuzzy = byId('btn-geo-fuzzy');
  const btnExact = byId('btn-geo-exact');
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';

  if (btnFuzzy && btnExact) {
    if (sellerGeoMode === 'fuzzy') {
      btnFuzzy.style.background = 'rgba(16,185,129,.15)';
      btnFuzzy.style.color = '#10b981';
      btnFuzzy.style.borderColor = 'rgba(16,185,129,.4)';

      btnExact.style.background = 'var(--ig-card)';
      btnExact.style.color = 'var(--ig-text2)';
      btnExact.style.borderColor = 'var(--ig-border)';
    } else {
      btnExact.style.background = 'rgba(0,149,246,.15)';
      btnExact.style.color = '#0095f6';
      btnExact.style.borderColor = 'rgba(0,149,246,.4)';

      btnFuzzy.style.background = 'var(--ig-card)';
      btnFuzzy.style.color = 'var(--ig-text2)';
      btnFuzzy.style.borderColor = 'var(--ig-border)';
    }
  }

  const curCity = byId('ad-city')?.value || (byId('ad-region')?.value ? getRegionName(byId('ad-region').value) : 'Стамбул');

  if (sumEl) {
    if (sellerGeoMode === 'fuzzy') {
      sumEl.innerHTML = isTr 
        ? `<i class="fa-solid fa-shield-halved text-emerald-500"></i> ${curCity} (Semt / ~2-3 km)` 
        : `<i class="fa-solid fa-shield-halved text-emerald-500"></i> ${curCity} (Район ~2-3 км)`;
      if (badgeEl) badgeEl.innerText = isTr ? 'Gizlilik Aktif' : 'Приватность активна';
    } else {
      sumEl.innerHTML = isTr 
        ? `<i class="fa-solid fa-crosshairs text-blue-500"></i> ${curCity} (Tam Konum)` 
        : `<i class="fa-solid fa-crosshairs text-blue-500"></i> ${curCity} (Точная точка)`;
      if (badgeEl) badgeEl.innerText = isTr ? 'Tam Konum' : 'Точные координаты';
    }
  }
}

function requestSellerLocation(mode = 'fuzzy') {
  sellerGeoMode = mode;
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';

  if (!navigator.geolocation) {
    showToast(isTr ? 'Cihazınızda GPS desteklenmiyor' : 'GPS не поддерживается устройством', 'warning');
    return;
  }

  showToast(isTr ? 'Konum alınıyor...' : 'Определяем местоположение...', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      let lat = pos.coords.latitude;
      let lng = pos.coords.longitude;

      // Если выбран безопасный режим «Район» — размываем координаты на 1.5–2.5 км
      if (mode === 'fuzzy') {
        // 0.015 градуса ≈ 1.6–2.2 км
        const offsetLat = (Math.random() - 0.5) * 0.030;
        const offsetLng = (Math.random() - 0.5) * 0.030;
        lat += offsetLat;
        lng += offsetLng;
      }

      if (byId('ad-lat')) byId('ad-lat').value = lat.toFixed(6);
      if (byId('ad-lng')) byId('ad-lng').value = lng.toFixed(6);

      // Обновляем маркер на мини-карте (если карта инициализирована)
      if (createMap && createMarker) {
        createMap.setView([lat, lng], mode === 'fuzzy' ? 13 : 15);
        createMarker.setLatLng([lat, lng]);
      }

      updateLocationSummaryUI();
      showToast(
        mode === 'fuzzy' 
          ? (isTr ? 'Semt konumu belirlendi (Ev gizlendi)' : 'Указан район (~2-3 км). Ваш точный дом скрыт!') 
          : (isTr ? 'Tam konum belirlendi' : 'Установлена точная геопозиция'),
        'success'
      );
    },
    (err) => {
      console.warn('Geo error:', err);
      showToast(isTr ? 'Konum izni verilmedi. Şehri listeden seçebilirsiniz.' : 'Доступ к геопозиции не предоставлен. Город выбран из списка.', 'warning');
      updateLocationSummaryUI();
    },
    { enableHighAccuracy: mode === 'exact', timeout: 8000 }
  );
}

function detectCategoryByTitle(text) {
  if (!text || typeof text !== 'string') return;
  const q = normalizeArabicText(text);
  const catSel = byId('ad-category');
  if (!catSel) return;

// 1. ЭЛЕКТРОНИКА И ГАДЖЕТЫ (RU, TR, EN, AR)
  if (/iphone|айфон|samsung|самсунг|телефон|telefon|смартфон|ноутбук|laptop|пк|компьютер|bilgisayar|планшет|tablet|часы|saat|наушники|kulaklık|kulaklik|xiaomi|redmi|macbook|монитор|monitör|monitor|видеокарта|принтер|yazıcı|yazici|printer|телевизор|televizyon|tv|колонка|hoparlör|павербанк|powerbank|هاتف|جوال|موبايل|لابتوب|كمبيوتر|شاشة|ساعة|ايباد|راوتر|تلفزيون|سماعات/i.test(q)) {
    catSel.value = 'electronics';
  }
  // 2. ТРАНСПОРТ И ЗАПЧАСТИ
  else if (/машина|авто|автомобиль|bmw|mercedes|kia|hyundai|запчасти|колеса|шины|мото|скутер|диски|аккумулятор|starex|масло|фара|крыло|бампер|сиارة|مركبة|موتور|دراجة|قطع غيار|إطارات|بطارية|محرك|سيارات/i.test(q)) {
    catSel.value = 'transport';
  } 
  // 3. НЕДВИЖИМОСТЬ
  else if (/квартира|дом|аренда|комната|участок|офис|магазин|недвижимость|дача|гараж|شقة|منزل|بيت|أرض|عقار|محل|إيجار|مكتب|فيلا/i.test(q)) {
    catSel.value = 'realestate';
  } 
  // 4. ИНСТРУМЕНТЫ И СТРОЙКА
  else if (/дрель|перфоратор|болгарка|шуруповерт|инструмент|молоток|пила|ключи|сварочный|отвертка|пассатижи|рулетка|шпатель|перфоратор|лестница|منشار|شابور|دريل|صاروخ|مفتاح|عدة|مطرقة|عده|مفك|قاس/i.test(q)) {
    catSel.value = 'tools';
  } 
  // 5. ТОВАРЫ ДЛЯ ДОМА, ПОСУДА, МЕБЕЛЬ
  else if (/диван|стол|стул|шкаф|кровать|мебель|ковер|посуда|лампа|люстра|холодильник|плита|стиралка|матрас|тумба|кресло|кастрюля|сковорода|тарелка|вилка|ложка|стакан|чайник|утюг|пылесос|اثاث|أثاث|طاولة|كرسي|كنبة|خزانة|فرش|سجاد|براد|غسالة|مطبخ|قدر|مخلاة|ملعقة|كأس|غلاية|مكواة|مكنسة/i.test(q)) {
    catSel.value = 'home';
  } 
  // 6. ПРОДУКТЫ ПИТАНИЯ
  else if (/арбуз|картошка|мясо|овощи|фрукты|продукты|мед|молоко|хлеб|рис|сахар|чай|кофе|сыр|масло|яйца|помидор|огурец|лук|чеснок|яблоко|банан|апельсин|курица|рыба|طماطم|بطاطا|بطاطس|لحم|دجاج|خضار|فواكه|بطيخ|عسل|حليب|خبز|طعام|غذاء|أرز|سكر|شاي|قهوة|جبن|زيت|بيض|خيار|بصل|ثوم|تفاح|موز|برتقال|سمك/i.test(q)) {
    catSel.value = 'food';
  } 
  // 7. ОДЕЖДА, ОБУВЬ И АКСЕССУАРЫ
  else if (/куртка|платье|рубашка|обувь|кроссовки|джинсы|костюм|сумка|одежда|брюки|штаны|футболка|свитер|пальто|шапка|шарф|носки|туфли|сандалии|ремень|кошелек|ملابس|قميص|فستان|حذاء|بنطلون|جاكيت|شنطة|حقيبة|أزياء|قميص|بلوزة|تنورة|معطف|قبعة|وشاح|جوارب|حزام|محفظة/i.test(q)) {
    catSel.value = 'fashion';
  } 
  // 8. ДЕТСКИЕ ТОВАРЫ
  else if (/коляска|игрушка|памперс|детск|подгузник|кроватка|самокат|кукла|машинка|конструктор|велосипед|مرحاض|لعبة|حفاضات|أطفال|طفل|مرضعة|لعب|عربة اطفال|سرير أطفال/i.test(q)) {
    catSel.value = 'kids';
  } 
  // 9. УСЛУГИ И СЕРВИС
  else if (/ремонт|услуги|мастер|перевозки|такси|доставка|курсы|уборка|строительство|парикмахер|маникюр|репетитор|чистка|خدمة|خدمات|صيانة|تصليح|معلم|تكسي|شحن|نقل|تعليم|بناء|تنظيف|حلاقة/i.test(q)) {
    catSel.value = 'services';
  }
}

function openCreateAdModalForUser(username) { onBehalfPreset = username; openCreateAdModal(); }

function initCreateMap() { 
  const el = byId('create-map'); 
  if (!el || typeof L === 'undefined') return; 
  const curLat = parseFloat(byId('ad-lat')?.value || 41.0082);
  const curLng = parseFloat(byId('ad-lng')?.value || 28.9784);
  
  if (createMap) {
    createMap.remove();
    createMap = null;
    createMarker = null;
  }

createMap = L.map('create-map').setView([curLat, curLng], 12); 
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: '© Esri'
  }).addTo(createMap);
  createMarker = L.marker([curLat, curLng], { draggable: true }).addTo(createMap);
  
  createMarker.on('dragend', e => { 
    const ll = e.target.getLatLng(); 
    byId('ad-lat').value = ll.lat.toFixed(6); 
    byId('ad-lng').value = ll.lng.toFixed(6); 
  }); 
  
  createMap.on('click', e => { 
    createMarker.setLatLng(e.latlng); 
    byId('ad-lat').value = e.latlng.lat.toFixed(6); 
    byId('ad-lng').value = e.latlng.lng.toFixed(6); 
  });

  setTimeout(() => {
    if (createMap) createMap.invalidateSize();
  }, 100);
}

function handleRegionMapUpdate(code) { 
  const c = REGION_COORDS[code] || [41.0082, 28.9784]; 
  byId('ad-lat').value = c[0]; 
  byId('ad-lng').value = c[1]; 
  if (createMap && createMarker) { 
    createMap.setView(c, 12); 
    createMarker.setLatLng(c); 
  } 
}

function toggleFreePriceField(isFree) { 
  const p = byId('ad-price'), c = byId('price-container'); 
  if (isFree) { 
    if (p) { p.value = '0'; p.removeAttribute('required'); p.disabled = true; } 
    if (c) c.style.opacity = '.4'; 
  } else { 
    if (p) { p.value = ''; p.setAttribute('required', 'required'); p.disabled = false; } 
    if (c) c.style.opacity = '1'; 
  } 
}

function toggleNegotiableField(isNeg) { 
  const p = byId('ad-price'); 
  if (!p) return; 
  if (isNeg) { 
    p.value = '0'; p.removeAttribute('required'); p.disabled = true; 
  } else if (!byId('ad-is-free') || !byId('ad-is-free').checked) { 
    p.value = ''; p.setAttribute('required', 'required'); p.disabled = false; 
  } 
}


let isSubmittingAd = false;

async function handleCreateAdSubmit(e) {
  e.preventDefault();

  // Жесткий флаг: если отправка уже идет, последующие нажатия полностью игнорируются
  if (isSubmittingAd) return;

  if (byId('ad-company-trap')?.value) {
    return;
  }

  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';

  if (!currentUser) {
    openAuthModal();
    showToast(isTr ? 'Lütfen önce giriş yapın' : 'Пожалуйста, сначала войдите в аккаунт', 'warning');
    return;
  }

  let postingUser = currentUser;
  const onbS = byId('ad-post-onbehalf');
  if (onbS && onbS.value && (currentUser && (currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN'))) {
    const tUser = users.find(u => u.username === onbS.value);
    if (tUser) postingUser = tUser;
  }

  const hasShop = !!(postingUser.shop);
  const myActiveAdsCount = ads.filter(a => 
    a.sellerUsername && 
    a.sellerUsername.toLowerCase() === (postingUser.username || '').toLowerCase() && 
    a.status === 'ACTIVE'
  ).length;

  if (hasShop) {
    const shopLimit = postingUser.shop.maxAds || 50;
    if (myActiveAdsCount >= shopLimit) {
      showToast(isTr ? `Mağaza ilan limiti (${shopLimit}) doldu.` : `Лимит объявлений магазина (${shopLimit} шт.) исчерпан.`, 'warning');
      return;
    }
  }

  const submitBtn = byId('create-ad-submit-btn') || document.querySelector('#modal-create-ad button[type="submit"]');
  isSubmittingAd = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${isTr ? 'Yayınlanıyor...' : 'Публикация...'}`;
  }

  const isFree = byId('ad-is-free')?.checked || false;
  const isNegotiable = byId('ad-is-negotiable')?.checked || false;
  const price = (isFree || isNegotiable) ? 0 : parseFloat(byId('ad-price')?.value || 0);

  const imgs = [...pendingCreateImages];
  if (!imgs.length) imgs.push(PLACEHOLDER_IMG);

  const regionVal = byId('ad-region')?.value || 'IST';
  const cityVal = byId('ad-city')?.value.trim() || REGION_NAMES[regionVal] || 'İstanbul';

  const adId = 'AD-' + Date.now().toString(36).toUpperCase();
  const newAd = {
    id: adId,
    title: byId('ad-title').value.trim(),
    category: byId('ad-category').value,
    storeCategory: byId('ad-store-category')?.value || '',
    region: regionVal,
    city: cityVal,
    isWomenOnly: byId('ad-is-women-only')?.checked || false,
    isFree,
    isNegotiable,
    price,
    currency: byId('ad-currency')?.value || 'USD',
    desc: byId('ad-desc').value.trim(),
    images: imgs,
    image: imgs[0],
    lat: parseFloat(byId('ad-lat')?.value || 41.0082),
    lng: parseFloat(byId('ad-lng')?.value || 28.9784),
    sellerUsername: postingUser.username,
    sellerUid: postingUser.uid || '',
    sellerKunya: postingUser.kunya || postingUser.username,
    sellerWhatsapp: postingUser.whatsapp || '',
    status: 'ACTIVE',
    createdAt: Date.now(),
    queue: [],
    likes: [],
    views: 0
  };

  try {
    localStorage.setItem('bs_last_seller_location', JSON.stringify({
      region: newAd.region,
      city: newAd.city,
      lat: newAd.lat,
      lng: newAd.lng
    }));
  } catch(err) {}

  // 1. Мгновенно выводим в ленту, закрываем форму и выводим сообщение (без ожидания сети)
  ads.unshift(newAd);
  saveCachedAds();
  closeModal('modal-create-ad');
  localStorage.removeItem('bs_ad_draft');
  selectedCategory = 'all';
  currentPage = 1;
  renderCategoryPills();
  renderAds();
  showToast(isTr ? 'İlan başarıyla yayınlandı!' : 'Объявление успешно опубликовано!', 'success');

  // 2. Фоновая отправка в базу данных Supabase
  if (supabaseClient) {
    try {
      const { error: insErr } = await supabaseClient.from('ads').insert({
        id: newAd.id,
        title: newAd.title,
        category: newAd.category,
        store_category: newAd.storeCategory,
        region: newAd.region,
        city: newAd.city,
        is_women_only: newAd.isWomenOnly,
        is_free: newAd.isFree,
        is_negotiable: newAd.isNegotiable,
        price: newAd.price,
        currency: newAd.currency,
        description: newAd.desc,
        images: newAd.images,
        image: newAd.image,
        lat: newAd.lat,
        lng: newAd.lng,
        seller_username: newAd.sellerUsername,
        seller_uid: newAd.sellerUid,
        seller_kunya: newAd.sellerKunya,
        seller_whatsapp: newAd.sellerWhatsapp,
        status: newAd.status,
        created_at: newAd.createdAt,
        queue: [],
        likes: [],
        views: 0
      });
      if (insErr) throw insErr;
    } catch (cloudErr) {
      console.error('Не удалось сохранить объявление в базе:', cloudErr);
      // откатываем «призрачное» объявление, чтобы лента не врала
      ads = ads.filter(x => x.id !== newAd.id);
      saveCachedAds();
      renderAds();
      const code = cloudErr && (cloudErr.code || cloudErr.status) ? ` [${cloudErr.code || cloudErr.status}]` : '';
      let hint = '';
      if (!currentUser.session_token) hint = isTr ? ' Lütfen çıkış yapıp tekrar giriş yapın.' : ' Выйдите и войдите в аккаунт заново.';
      else if (cloudErr && (cloudErr.code === '42501')) hint = isTr ? ' Yetki hatası: oturumu yenileyin.' : ' Нет прав: перезайдите в аккаунт.';
      else if (cloudErr && (cloudErr.code === '42P01' || cloudErr.code === 'PGRST205')) hint = isTr ? ' Veritabanı şeması kurulmamış.' : ' В базе нет таблицы: выполните supabase_schema.sql.';
      showToast((isTr ? 'İlan kaydedilemedi' : 'Объявление не сохранено в базе') + code + '.' + hint, 'error');
    }
  }

  isSubmittingAd = false;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerText = t('ad_submit_btn');
  }
}

function openEditAdModal(adId) {
  const ad = ads.find(a => a.id === adId);
  if (!ad) return;
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  const isOwner = currentUser && (currentUser.username.toLowerCase() === (ad.sellerUsername || '').toLowerCase() || currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN');
  if (!isOwner) {
    showToast(isTr ? 'Düzenleme yetkiniz yok!' : 'Нет прав для редактирования!', 'error');
    return;
  }

  const modalTitle = document.querySelector('#modal-edit-ad h3');
  if (modalTitle) modalTitle.innerText = isTr ? 'İlanı Düzenle' : 'Редактирование объявления';

  const tInp = byId('edit-ad-title');
  if (tInp) tInp.placeholder = isTr ? 'İlan Başlığı *' : 'Заголовок объявления *';

  const pInp = byId('edit-ad-price');
  if (pInp) pInp.placeholder = isTr ? 'Fiyat *' : 'Цена *';

  const cInp = byId('edit-ad-city');
  if (cInp) cInp.placeholder = isTr ? 'İlçe / Mahalle *' : 'Город / Населенный пункт *';

  const dInp = byId('edit-ad-desc');
  if (dInp) dInp.placeholder = isTr ? 'Açıklama ve Varsa Kusurları *' : 'Описание и возможные изъяны *';

  const phLabel = byId('edit-photos-label');
  if (phLabel) phLabel.innerText = isTr ? 'Ürün Fotoğrafları (en fazla 6 adet) *' : 'Фотографии товара (до 6 шт.) *';

  const upText = byId('edit-upload-btn-text');
  if (upText) upText.innerText = isTr ? 'Fotoğraf Seç' : 'Выбрать фотографии';

  const subBtn = byId('edit-ad-submit-btn');
  if (subBtn) subBtn.innerText = isTr ? 'Değişiklikleri Kaydet' : 'Сохранить изменения';
  
  const ownerContainer = byId('edit-ad-owner-container');
  const ownerSelect = byId('edit-ad-seller-username');
  if (ownerContainer && ownerSelect) {
    if (currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN') {
      ownerSelect.innerHTML = users.map(u => `<option value="${escapeHTML(u.username)}">@${escapeHTML(u.username)} — ${u.kunya || 'без имени'}</option>`).join('');
      ownerSelect.value = ad.sellerUsername || currentUser.username;
      ownerContainer.classList.remove('hidden');
    } else {
      ownerContainer.classList.add('hidden');
    }
  }

  pendingEditImages = ad.images ? [...ad.images] : [ad.image];
  renderPhotoThumbnailsGrid('edit');
  fillCategorySelect(byId('edit-ad-category'), ad.category);
  byId('edit-ad-id').value = ad.id;
  byId('edit-ad-title').value = ad.title || '';
  byId('edit-ad-region').value = ad.region || 'IST';
  byId('edit-ad-city').value = ad.city || '';
  byId('edit-ad-is-women-only').checked = !!ad.isWomenOnly;
  byId('edit-ad-is-free').checked = !!ad.isFree;
  byId('edit-ad-is-negotiable').checked = !!ad.isNegotiable;
  byId('edit-ad-price').value = ad.price || 0;
  byId('edit-ad-currency').value = ad.currency || 'USD';
  byId('edit-ad-desc').value = ad.desc || '';
  
  const hasDisc = !!(ad.oldPrice && ad.oldPrice > ad.price);
  byId('edit-ad-has-discount').checked = hasDisc;
  byId('discount-fields-wrap').classList.toggle('hidden', !hasDisc);
  byId('edit-ad-old-price').value = hasDisc ? ad.oldPrice : '';
  closeModal('modal-ad-detail');
  openModal('modal-edit-ad');
}

async function handleEditAdSubmit(e) {
  e.preventDefault();
  const adId = byId('edit-ad-id').value;
  const ad = ads.find(a => a.id === adId);
  if (!ad || !currentUser) return;

  const ownerSelect = byId('edit-ad-seller-username');
  let targetUser = currentUser;
  if (ownerSelect && ownerSelect.value && (currentUser.role === 'SUPERUSER' || currentUser.role === 'ADMIN')) {
    const found = users.find(u => u.username && u.username.toLowerCase() === ownerSelect.value.toLowerCase());
    if (found) targetUser = found;
  }

  const imgs = [...pendingEditImages];
  if (!imgs.length) imgs.push(PLACEHOLDER_IMG);

  const isDisc = byId('edit-ad-has-discount')?.checked;
  const oldPriceVal = isDisc ? parseFloat(byId('edit-ad-old-price').value || 0) : null;

  const updatedData = {
    id: adId,
    title: byId('edit-ad-title').value.trim(),
    category: byId('edit-ad-category').value,
    storeCategory: ad.storeCategory || '',
    region: byId('edit-ad-region').value,
    city: byId('edit-ad-city').value.trim(),
    isWomenOnly: byId('edit-ad-is-women-only').checked,
    isFree: byId('edit-ad-is-free').checked,
    isNegotiable: byId('edit-ad-is-negotiable')?.checked || false,
    price: (byId('edit-ad-is-free').checked || byId('edit-ad-is-negotiable')?.checked) ? 0 : parseFloat(byId('edit-ad-price').value || 0),
    oldPrice: oldPriceVal,
    currency: byId('edit-ad-currency').value,
    desc: byId('edit-ad-desc').value.trim(),
    images: imgs,
    image: imgs[0],
    sellerUsername: targetUser.username,
    sellerUid: targetUser.uid || '',
    sellerKunya: targetUser.kunya || targetUser.username,
    sellerWhatsapp: targetUser.whatsapp || '',
    queue: ad.queue || []
  };

  checkFavoritesAndQueueAlerts(ad, updatedData);
  
  if (supabaseClient) {
    const dbPayload = {
      title: updatedData.title,
      category: updatedData.category,
      store_category: updatedData.storeCategory,
      region: updatedData.region,
      city: updatedData.city,
      is_women_only: updatedData.isWomenOnly,
      is_free: updatedData.isFree,
      is_negotiable: updatedData.isNegotiable,
      price: updatedData.price,
      old_price: updatedData.oldPrice,
      currency: updatedData.currency,
      description: updatedData.desc,
      images: updatedData.images,
      image: updatedData.image,
      seller_username: updatedData.sellerUsername,
      seller_uid: updatedData.sellerUid,
      seller_kunya: updatedData.sellerKunya,
      seller_whatsapp: updatedData.sellerWhatsapp
    };

    supabaseClient.from('ads').update(dbPayload).eq('id', adId).then().catch(err => console.warn('Supabase background sync:', err));
  }

  Object.assign(ad, updatedData);
  saveCachedAds();
  closeModal('modal-edit-ad');
  renderCategoryPills();
  renderAds();
  showToast('Объявление обновлено!', 'success');
}

async function setAdStatusSecure(adId, newStatus, successMsg) {
  const ad = ads.find(a => a.id === adId);
  if (!ad) return;

  // 1. Мгновенно меняем статус локально и принудительно ставим ACTIVE для возврата
  ad.status = newStatus;
  saveCachedAds();
  
  closeModal('modal-ad-detail');
  closeModal('modal-my-shop');
  
  renderAds();
  renderCategoryPills();
  if (typeof SYSTEM_CONFIG !== 'undefined' && SYSTEM_CONFIG.adminTab === 'ads') {
    renderAdminTabContent();
  }
  showToast(successMsg, 'success');

  // 2. Отправляем обновление в Supabase (и в RPC, и напрямую в таблицу для 100% гарантии)
  if (supabaseClient) {
    try {
      await supabaseClient.from('ads').update({ status: newStatus }).eq('id', adId);
      
      if (currentUser) {
        supabaseClient.rpc('secure_manage_ad', {
          p_ad_id: adId,
          p_caller_id: currentUser.uid || currentUser.username,
          p_action: 'SET_STATUS',
          p_status: newStatus
        }).then().catch(() => {});
      }
    } catch (err) {
      console.warn('Status update sync error:', err);
    }
  }
}

function doToggleLike(adId) { 
  if (!currentUser) { openAuthModal(); showToast('Войдите в аккаунт, чтобы ставить лайки', 'warning'); return false; } 
  const isCombo = typeof adId === 'string' && adId.startsWith('COMBO-');
  const target = isCombo ? combos.find(c => c.id === adId) : ads.find(a => a.id === adId);
  if (!target) return false; 

  if (!Array.isArray(target.likes)) target.likes = []; 
  const i = target.likes.indexOf(currentUser.username); 
  if (i === -1) target.likes.push(currentUser.username); 
  else target.likes.splice(i, 1); 

  saveCachedAds(); 
  if (typeof saveCachedCombos === 'function') saveCachedCombos();

  if (supabaseClient) {
    const table = isCombo ? 'combos' : 'ads';
    supabaseClient.from(table).update({ likes: target.likes }).eq('id', adId).then(({ error }) => {
      if (error) console.warn('Sync like error:', error);
    });
  }
  return true; 
}

function toggleLike(adId, e) { if (e) e.stopPropagation(); if (!doToggleLike(adId)) return; renderAds(); }
function toggleLikeDetail(adId) { if (!doToggleLike(adId)) return; renderAds(); openAdDetail(adId, false); }

function toggleFavorite(adId, e) { 
  if (e) e.stopPropagation(); 
  if (!Array.isArray(favorites)) favorites = [];
  if (favorites.includes(adId)) { 
    favorites = favorites.filter(i => i !== adId); 
    showToast('Удалено из избранного', 'info'); 
  } else { 
    favorites.push(adId); 
    showToast('Добавлено в избранное!', 'success'); 
  } 
  try { localStorage.setItem('bs_favorites', JSON.stringify(favorites)); } catch (err) {} 
  if (currentUser) {
    currentUser.favorites = favorites;
    saveUserSession(currentUser, true);
    if (supabaseClient) {
      const query = currentUser.uid 
        ? supabaseClient.from('users').update({ favorites: favorites }).eq('uid', currentUser.uid)
        : supabaseClient.from('users').update({ favorites: favorites }).eq('username', currentUser.username);
      query.then().catch(() => {});
    }
  }
  renderCategoryPills(); 
  renderAds(); 
}

async function joinQueue(adId) { 
  if (!currentUser) { openAuthModal(); return; } 
  const ad = ads.find(a => a.id === adId); 
  if (!ad) return; 
  if (!ad.queue) ad.queue = []; 
  if (ad.queue.some(q => q.username === currentUser.username)) return; 

  const queueItem = { 
    username: currentUser.username, 
    kunya: currentUser.kunya || currentUser.username, 
    whatsapp: currentUser.whatsapp || '', 
    timestamp: Date.now() 
  }; 

  ad.queue.push(queueItem); 
  saveCachedAds(); 
  openAdDetail(adId, false); 
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  showToast(isTr ? 'Sıraya başarıyla girdiniz!' : 'Вы успешно заняли очередь!', 'success'); 

  if (supabaseClient) {
    try {
      const { data: res, error } = await supabaseClient.rpc('join_ad_queue', { p_ad_id: adId });
      if (!error && res && res.success && Array.isArray(res.queue)) {
        ad.queue = res.queue;
        saveCachedAds();
      }
    } catch (err) {
      console.warn('RPC queue join warning:', err);
    }
  }
}

async function leaveQueue(adId) { 
  if (!currentUser) return; 
  const ad = ads.find(a => a.id === adId); 
  if (!ad) return; 
  if (!ad.queue) ad.queue = []; 
  ad.queue = ad.queue.filter(q => q.username !== currentUser.username); 
  saveCachedAds(); 
  openAdDetail(adId, false); 
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  showToast(isTr ? 'Sıradan çıktınız' : 'Вы вышли из очереди', 'info'); 

  if (supabaseClient) {
    try {
      const { data: res, error } = await supabaseClient.rpc('leave_ad_queue', { p_ad_id: adId });
      if (!error && res && res.success && Array.isArray(res.queue)) {
        ad.queue = res.queue;
        saveCachedAds();
      }
    } catch (err) {
      console.warn('RPC queue leave warning:', err);
    }
  }
}

async function queueToggleCard(adId) { 
  if (!currentUser) { openAuthModal(); return; } 
  const ad = ads.find(a => a.id === adId); 
  if (!ad) { openAdDetail(adId); return; } 
  if (!ad.queue) ad.queue = []; 
  const idx = ad.queue.findIndex(q => q.username === currentUser.username); 
  if (idx !== -1) { 
    await leaveQueue(adId);
  } else { 
    await joinQueue(adId);
  } 
  renderAds(); 
}

function changePage(p) { currentPage = p; renderAds(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function resetPageAndRender() { currentPage = 1; renderAds(); }

function toggleTheme() { 
  document.body.classList.toggle('light-mode'); 
  localStorage.setItem('bs_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark'); 
  const ic = byId('sb-theme-ic'); 
  if (ic) ic.innerHTML = document.body.classList.contains('light-mode') ? IGSVG.moon() : IGSVG.sun(); 
  if (!byId('modal-profile').classList.contains('hidden')) openProfileModal(); 
}

function changeLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('bs_app_lang', lang);
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = lang;
  translateStaticUI(lang);
  renderCategoryPills();
  renderAds();
  updateNavState();
  if (!byId('modal-profile').classList.contains('hidden')) openProfileModal();
  showToast(lang === 'tr' ? 'Dil Türkçe olarak değiştirildi' : 'Язык переключен на русский', 'info');
}

function openAuthModal() {
  const l = byId('tab-login'), r = byId('tab-register'), b = byId('auth-submit-btn');
  if (l) l.innerText = t('login_tab');
  if (r) r.innerText = t('register_tab');
  const isRegActive = !byId('reg-fields')?.classList.contains('hidden');
  if (b) b.innerText = isRegActive ? t('btn_register') : t('btn_login');
  
  const uInp = byId('auth-username'), pInp = byId('auth-password');
  if (uInp) uInp.placeholder = t('login_ph');
  if (pInp) pInp.placeholder = t('password_ph');

  const regU = byId('reg-username'), regP = byId('reg-password'), regP2 = byId('reg-password-confirm'), regK = byId('reg-kunya'), regW = byId('reg-whatsapp');
  if (regU) regU.placeholder = t('reg_login_ph');
  if (regP) regP.placeholder = t('reg_pass_ph');
  if (regP2) regP2.placeholder = t('reg_pass2_ph');
  if (regK) regK.placeholder = t('reg_kunya_ph');
  if (regW) regW.placeholder = t('reg_wa_ph');
  
  const genderLabel = byId('reg-gender-label');
  if (genderLabel) genderLabel.innerText = t('reg_gender_title');
  const maleLbl = byId('label-gender-male');
  const femaleLbl = byId('label-gender-female');
  if (maleLbl) maleLbl.innerText = t('gender_male');
  if (femaleLbl) femaleLbl.innerText = t('gender_female');

  const remLbl = byId('auth-remember-label');
  if (remLbl) remLbl.innerText = t('remember_me');
  openModal('modal-auth');
}

function switchAuthTab(tab) {
  const l = byId('tab-login'), r = byId('tab-register'), f = byId('reg-fields'), lf = byId('login-fields'), b = byId('auth-submit-btn');
  if (tab === 'login') {
    l.style.borderColor = '#0095f6'; l.style.color = '#0095f6';
    r.style.borderColor = 'transparent'; r.style.color = 'var(--ig-text2)';
    if (lf) lf.classList.remove('hidden');
    if (f) f.classList.add('hidden');
    if (b) b.innerText = t('Войти');
  } else {
    r.style.borderColor = '#0095f6'; r.style.color = '#0095f6';
    l.style.borderColor = 'transparent'; l.style.color = 'var(--ig-text2)';
    if (lf) lf.classList.add('hidden');
    if (f) f.classList.remove('hidden');
    if (b) b.innerText = t('Зарегистрироваться');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const isReg = !byId('reg-fields').classList.contains('hidden');
  const remember = byId('auth-remember-me').checked;
  const btn = byId('auth-submit-btn');
  const originalText = btn.innerText;
  btn.disabled = true;

  if (isReg) {
    // === ОБЫЧНАЯ СТРОГАЯ РЕГИСТРАЦИЯ ===
    const username = byId('reg-username')?.value.trim();
    const passwordRaw = byId('reg-password')?.value;
    const passwordConfirm = byId('reg-password-confirm')?.value;
    const kunya = byId('reg-kunya')?.value.trim();
    const whatsappRaw = byId('reg-whatsapp')?.value.trim();
    const genderRadio = document.querySelector('input[name="auth-gender"]:checked');

    if (!username) {
      showToast(currentLang === 'tr' ? 'Lütfen bir kullanıcı adı girin' : 'Введите логин', 'warning');
      btn.disabled = false; return;
    }
    if (username.length < 3) {
      showToast(currentLang === 'tr' ? 'Kullanıcı adı en az 3 karakter olmalıdır' : 'Логин должен быть не менее 3 символов', 'warning');
      btn.disabled = false; return;
    }
    if (!passwordRaw || passwordRaw.length < 6) {
      showToast(currentLang === 'tr' ? 'Şifre en az 6 karakter olmalıdır' : 'Пароль должен быть не менее 6 символов', 'warning');
      btn.disabled = false; return;
    }
    if (passwordRaw.trim() !== passwordConfirm.trim()) {
      showToast(currentLang === 'tr' ? 'Şifreler eşleşmiyor' : 'Пароли не совпадают', 'error');
      btn.disabled = false; return;
    }
    if (!genderRadio) {
      showToast(currentLang === 'tr' ? 'Lütfen cinsiyetinizi seçiniz' : 'Выберите ваш пол', 'warning');
      btn.disabled = false; return;
    }
    if (!whatsappRaw) {
      showToast(currentLang === 'tr' ? 'WhatsApp numarası zorunludur' : 'Обязательно введите номер WhatsApp', 'warning');
      btn.disabled = false; return;
    }

    const waCheck = validateWhatsApp(whatsappRaw);
    if (!waCheck.valid) {
      showToast(waCheck.error, 'error');
      btn.disabled = false; return;
    }

    btn.innerText = currentLang === 'tr' ? 'Kaydediliyor...' : 'Регистрация...';
    const passHash = await sha256(passwordRaw);
    const uid = 'u_' + Date.now();
    let regSuccessUser = null;

    if (supabaseClient) {
      try {
        const { data: regRes, error: regErr } = await supabaseClient.rpc('register_new_user', {
          p_uid: uid,
          p_username: username,
          p_password_hash: passHash,
          p_kunya: kunya || username,
          p_gender: genderRadio.value,
          p_whatsapp: waCheck.number,
          p_avatar: null
        });

if (regRes && regRes.success && regRes.user) {
          regSuccessUser = {
            ...regRes.user,
            passwordHash: regRes.user.password_hash,
            favorites: []
          };
        } else if (regRes && !regRes.success && regRes.error) {
          showToast(regRes.error, 'error');
          btn.disabled = false; btn.innerText = originalText; return;
        } else if (regErr) {
          console.error('register_new_user error:', regErr);
          showToast((currentLang === 'tr' ? 'Kayıt başarısız: ' : 'Регистрация не удалась: ') + (regErr.message || regErr.code || 'ошибка базы') +
            (regErr.code === 'PGRST202' || /function/i.test(regErr.message || '') ? (currentLang === 'tr' ? ' (veritabanı şeması kurulmamış)' : ' — в базе не выполнен supabase_schema.sql') : ''), 'error');
          btn.disabled = false; btn.innerText = originalText; return;
        }

        if (false && !regSuccessUser) {
          const newDbUser = {
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

          const { data: insData, error: insErr } = await supabaseClient.from('users').insert(newDbUser).select().single();
          if (!insErr && insData) {
            regSuccessUser = {
              ...insData,
              passwordHash: insData.password_hash,
              avitocashBalance: Number(insData.avitocash_balance || 0),
              trialBalance: Number(insData.trial_balance || 10),
              favorites: []
            };
          } else if (insErr && (insErr.message.includes('duplicate') || insErr.message.includes('unique'))) {
            showToast(currentLang === 'tr' ? 'Bu kullanıcı adı zaten kayıtlı' : 'Такой логин уже занят', 'error');
            btn.disabled = false; btn.innerText = originalText; return;
          }
        }
      } catch (cloudErr) {
        console.warn('Direct registration cloud sync warning:', cloudErr);
      }
    }

    if (!regSuccessUser && supabaseClient) {
      showToast(currentLang === 'tr' ? 'Sunucuya ulaşılamadı. Tekrar deneyin.' : 'Нет связи с сервером. Попробуйте ещё раз.', 'error');
      btn.disabled = false; btn.innerText = originalText; return;
    }
if (!regSuccessUser) {
      regSuccessUser = {
        uid: uid,
        username: username,
        passwordHash: passHash,
        kunya: kunya || username,
        gender: genderRadio.value,
        whatsapp: waCheck.number,
        avatar: null,
        role: 'USER',
        favorites: []
      };
    }

    const idx = users.findIndex(u => u.uid === regSuccessUser.uid || (u.username && u.username.toLowerCase() === regSuccessUser.username.toLowerCase()));
    if (idx !== -1) users[idx] = regSuccessUser;
    else users.push(regSuccessUser);

    saveUserSession(regSuccessUser, remember);
    closeModal('modal-auth');
    showToast(currentLang === 'tr' ? `Kayıt başarılı! Hoş geldiniz, ${regSuccessUser.kunya || regSuccessUser.username}!` : `Регистрация завершена! Добро пожаловать, ${regSuccessUser.kunya || regSuccessUser.username}!`, 'success');
    btn.disabled = false; btn.innerText = originalText;

  } else {
    // === ВХОД ===
    const loginIdentifier = byId('auth-username').value.trim();
    const rawPassword = byId('auth-password').value;

    if (!loginIdentifier || !rawPassword) {
      showToast(currentLang === 'tr' ? 'Kullanıcı adı ve şifre girin' : 'Введите логин и пароль', 'warning');
      btn.disabled = false; return;
    }

    btn.innerText = currentLang === 'tr' ? 'Giriş yapılıyor...' : 'Вход...';
    const password = await sha256(rawPassword);

    try {
      let foundUser = null;
      if (supabaseClient) {
        const { data: res, error } = await supabaseClient.rpc('verify_user_login', {
          p_username: loginIdentifier,
          p_password_hash: password
        });
if (res && res.success && res.user) {
          foundUser = {
            ...res.user,
            passwordHash: res.user.password_hash
          };
        } else if (res && res.error) {
          showToast(res.error, 'error'); btn.disabled = false; btn.innerText = originalText; return;
        } else if (error) {
          showToast((currentLang === 'tr' ? 'Giriş hatası: ' : 'Ошибка входа: ') + (error.message || error.code) + (error.code === 'PGRST202' ? ' — в базе не выполнен supabase_schema.sql' : ''), 'error');
          btn.disabled = false; btn.innerText = originalText; return;
        }
      }

      if (!foundUser && !supabaseClient) {
        foundUser = users.find(u => 
          ((u.username && u.username.toLowerCase() === loginIdentifier.toLowerCase()) || 
           (u.whatsapp && u.whatsapp.replace(/\D/g, '') === loginIdentifier.replace(/\D/g, ''))) &&
          u.passwordHash === password
        );
      }

      if (foundUser) {
        if (foundUser.is_archived || foundUser.isArchived) {
          showToast(currentLang === 'tr' ? 'Hesap arşivlendi' : 'Аккаунт в архиве', 'error');
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
        showToast(currentLang === 'tr' ? `Tekrar hoş geldiniz, ${foundUser.kunya || foundUser.username}!` : `С возвращением, ${foundUser.kunya || foundUser.username}!`, 'success');
      } else {
        showToast(currentLang === 'tr' ? 'Geçersiz kullanıcı adı veya şifre' : 'Неверный логин или пароль', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(currentLang === 'tr' ? 'Giriş hatası' : 'Ошибка входа', 'error');
    }
    btn.disabled = false; btn.innerText = originalText;
  }
}

function logout() {
  try { if (supabaseClient && currentUser && currentUser.session_token) supabaseClient.rpc('logout').then(() => {}, () => {}); } catch (e) {}
  currentUser = null;
  localStorage.removeItem('bs_current_user');
  sessionStorage.removeItem('bs_current_user');
  closeModal('modal-profile');
  updateAuthUI();
  showToast('Вы вышли из аккаунта', 'info');
}

/* ================= INITIALIZATION AT STARTUP ================= */
document.addEventListener('DOMContentLoaded', async () => {
  // Включение прокрутки колесиком мыши для горизонтальных списков на ПК
  const catScroll = byId('categories-container');
  if (catScroll) {
    catScroll.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        catScroll.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

if (localStorage.getItem('bs_theme') === 'light') {
document.body.classList.add('light-mode');
}
// Принудительно обновляем иконку темы при загрузке
const themeIcon = byId('sb-theme-ic');
if (themeIcon) {
    themeIcon.innerHTML = document.body.classList.contains('light-mode') ? IGSVG.moon() : IGSVG.sun();
}
if (currentLang === 'tr') {
document.documentElement.dir = 'ltr';
document.documentElement.lang = 'tr';
}
  
  window.addEventListener('scroll', () => {
    const btn = byId('btn-scroll-top');
    if (btn) {
      if (window.scrollY > 300) btn.classList.add('visible');
      else btn.classList.remove('visible');
    }
  });

// Показываем спиннер вместо черного экрана пока грузится кэш
const grid = byId('listings-view');
if (grid && ads.length === 0) {
    const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
    grid.innerHTML = `<div class="col-span-full py-20 text-center t2"><i class="fa-solid fa-spinner fa-spin text-4xl mb-3 block opacity-50"></i>${isTr ? 'Yükleniyor...' : 'Загрузка...'}</div>`;
}

// Ждем загрузки кэша из IndexedDB
await loadCachedAds();

// Если кэш есть — сразу рисуем объявления (пользователь видит контент, а не черный экран)
if (ads.length > 0 || combos.length > 0) {
    renderCategoryPills();
    renderAds();
}

restoreUserSession();
await handleTelegramAutoLogin();

// Запускаем обновление из сети в фоне (не блокирует экран)
initSupabaseSync();
fetchLiveExchangeRates();
  setInterval(fetchLiveExchangeRates, 5 * 60 * 1000);
  setInterval(checkExpiredAdsStatus, 60 * 60 * 1000);
  requestPushPermission();
  checkUrlHashAdOpen();
});
window.addEventListener('hashchange', checkUrlHashAdOpen);

// Безопасная конвертация цены объявления в USD
function adToUSD(ad) {
  if (!ad) return 0;
  const rawPrice = typeof ad.price === 'number' ? ad.price : parseFloat(ad.price);
  if (isNaN(rawPrice) || rawPrice <= 0) return 0;
  const curr = (ad.currency || 'USD').toUpperCase();
  if (curr === 'USD') return rawPrice;
  const fallbackRates = { USD: 1, SYP: 14000, TRY: 33, SAR: 3.75 };
  const activeRates = (typeof EXCHANGE_RATES !== 'undefined' && EXCHANGE_RATES) ? EXCHANGE_RATES : fallbackRates;
  const rate = parseFloat(activeRates[curr] || fallbackRates[curr]);
  if (!rate || isNaN(rate) || rate <= 0) return rawPrice;
  return rawPrice / rate;
}

// 1. Расчет расстояния между точками (для фильтра «Рядом»)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
	if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 2. Навигация по фотографиям прямо в ленте карточки (Instagram-стиль)
function cardNav(event, adId, dir) {
  if (event) event.stopPropagation();
  
  const isCombo = typeof adId === 'string' && (adId.startsWith('COMBO-') || adId.includes('COMBO'));
  
  if (isCombo) {
    const v = (typeof getListingById === 'function') ? getListingById(adId) : null;
    if (!v || !v.comboItems || v.comboItems.length < 2) return;
    
    const itemLeft = v.comboItems[0];
    const itemRight = v.comboItems[1];
    
    const imgsLeft = (itemLeft.images && itemLeft.images.length) ? itemLeft.images : [itemLeft.image || PLACEHOLDER_IMG];
    const imgsRight = (itemRight.images && itemRight.images.length) ? itemRight.images : [itemRight.image || PLACEHOLDER_IMG];
    
    if (dir === -1) {
      const key = `${adId}_left`;
      if (cardPhotoIndex[key] === undefined) cardPhotoIndex[key] = 0;
      cardPhotoIndex[key] = (cardPhotoIndex[key] + 1) % imgsLeft.length;
      const leftEl = byId(`cimg-left-${adId}`);
      if (leftEl) leftEl.src = imgsLeft[cardPhotoIndex[key]];
    } else {
      const key = `${adId}_right`;
      if (cardPhotoIndex[key] === undefined) cardPhotoIndex[key] = 0;
      cardPhotoIndex[key] = (cardPhotoIndex[key] + 1) % imgsRight.length;
      const rightEl = byId(`cimg-right-${adId}`);
      if (rightEl) rightEl.src = imgsRight[cardPhotoIndex[key]];
    }
    return;
  }

  const ad = ads.find(a => a.id === adId);
  if (!ad) return;
  const imgs = (ad.images && ad.images.length) ? ad.images : [ad.image || PLACEHOLDER_IMG];
  if (imgs.length <= 1) return;
  
  if (cardPhotoIndex[adId] === undefined) cardPhotoIndex[adId] = 0;
  cardPhotoIndex[adId] = (cardPhotoIndex[adId] + dir + imgs.length) % imgs.length;
  
  const imgEl = byId(`cimg-${adId}`);
  const dotsEl = byId(`cdot-${adId}`);
  const bgEl = byId(`cbg-${adId}`);
  
  const idx = cardPhotoIndex[adId];
  if (imgEl) imgEl.src = imgs[idx];
  if (bgEl) bgEl.style.backgroundImage = `url('${imgs[idx]}')`;
  if (dotsEl) {
    dotsEl.innerHTML = imgs.map((_, i) => `<span class="w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-white' : 'bg-white/40'}"></span>`).join('');
  }
}

// 3. Смена статуса продавцом: «Продано»
function markAdSold(adId) {
  setAdStatusSecure(adId, 'SOLD', 'Объявление отмечено как проданное');
}

// 4. Смена статуса продавцом: «Передумал»
function markAdWithdrawn(adId) {
  setAdStatusSecure(adId, 'WITHDRAWN', 'Статус изменен: передумал продавать');
}

// 5. Архивация объявления с подтверждением
function archiveAdWithConfirm(adId) {
  showConfirmModal('Архивация', 'Перенести объявление в архив?', () => {
    setAdStatusSecure(adId, 'ARCHIVED', 'Объявление перенесено в архив');
  });
}

// 6. Восстановление объявления из архива
function restoreAd(adId) {
  setAdStatusSecure(adId, 'ACTIVE', 'Объявление успешно восстановлено');
}

// Универсальная нормализация для русского, английского и арабского языков
function normalizeArabicText(str) {
  if (!str || typeof str !== 'string') return '';
  const isArabic = /[\u0600-\u06FF]/.test(str);
  if (!isArabic) {
    return str.toLowerCase().trim(); // Для русского и английского — точный поиск по символам
  }
  return str
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Удаление харакатов и татвиля
    .replace(/[أإآٱ]/g, 'ا') // Выравнивание алифов
    .replace(/ة/g, 'ه')     // Та-марбута
    .replace(/[ىيئ]/g, 'ي')  // Я и алиф максура
    .replace(/ؤ/g, 'و')     // Вав с хамзой
    .trim();
}

// Обработчик живого поиска и синхронизации Desktop / Mobile инпутов
let searchDebounceTimer = null;
function onSearchInput(el) {
  const val = (el ? el.value : '').trim();
  const desktop = byId('search-input-desktop');
  const mobile = byId('search-input');
  if (desktop && desktop !== el) desktop.value = el.value;
  if (mobile && mobile !== el) mobile.value = el.value;
  searchQuery = val;
  
  renderSearchSuggestions(val);

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    resetPageAndRender();
  }, 120);
}

async function renderSearchSuggestions(query) {
  const listDesktop = byId('search-suggestions-desktop');
  const listMobile = byId('search-suggestions-mobile');
  if (!query || query.trim().length < 1) {
    if (listDesktop) listDesktop.classList.add('hidden');
    if (listMobile) listMobile.classList.add('hidden');
    return;
  }
  const cleanQ = query.toLowerCase().trim();
  const isTr = currentLang === 'tr';
  const matches = [];
  for (const a of ads) {
    if (a.status !== 'ACTIVE') continue;
    let titleNorm = (a.title || '').toLowerCase();
    let descNorm = (a.desc || '').toLowerCase();
    let cityNorm = (a.city || '').toLowerCase();
    let idNorm = (a.id || '').toLowerCase();
    let matched = titleNorm.includes(cleanQ) || descNorm.includes(cleanQ) || cityNorm.includes(cleanQ) || idNorm.includes(cleanQ);
    if (!matched) {
      const catObj = categories.find(c => c.id === a.category);
      if (catObj) {
        const catNameRu = (catObj.name || '').toLowerCase();
        const catNameTr = (t(catObj.name) || '').toLowerCase();
        if (catNameRu.includes(cleanQ) || catNameTr.includes(cleanQ)) {
          matched = true;
        }
      }
    }
    if (!matched && isTr) {
      const regionName = t(REGION_NAMES[a.region] || '').toLowerCase();
      if (regionName.includes(cleanQ)) matched = true;
    }
    if (matched) {
      matches.push(a);
      if (matches.length >= 8) break;
    }
  }
  if (matches.length === 0) {
    if (listDesktop) listDesktop.classList.add('hidden');
    if (listMobile) listMobile.classList.add('hidden');
    return;
  }
const itemsHtml = await Promise.all(matches.map(async a => {
    let displayTitle = a.title;
    if (typeof translateDynamic === 'function') {
      displayTitle = await translateDynamic(a.title, currentLang);
    }
    const catObj = categories.find(c => c.id === a.category);
    const catLabel = catObj ? t(catObj.name) : '';
    return `<div onclick="openAdDetail('${a.id}'); renderSearchSuggestions('');" class="px-3 py-2 text-xs t1 hover:bg-field cursor-pointer flex items-center justify-between border-b b-ig last:border-0"><div class="min-w-0 flex-1"><span class="truncate font-semibold block">${displayTitle}</span>${catLabel ? `<span class="text-[9px] t2 truncate block">${catLabel} • ${a.city || ''}</span>` : ''}</div><span class="text-[10px] text-blue-500 shrink-0 font-bold ml-2">$${Number(a.price || 0).toFixed(2)}</span></div>`;
  }));
  const html = itemsHtml.join('');
  [listDesktop, listMobile].forEach(l => {
    if (l) {
      l.innerHTML = html;
      l.classList.remove('hidden');
    }
  });
}

function selectSearchSuggestion(title) {
  const desktop = byId('search-input-desktop');
  const mobile = byId('search-input');
  if (desktop) desktop.value = title;
  if (mobile) mobile.value = title;
  searchQuery = title;
  renderSearchSuggestions('');
  resetPageAndRender();
}

// 6.1. Полное удаление объявления (с подтверждением и защитой от возврата)
function deleteAdWithConfirm(adId) {
  const ad = ads.find(a => a.id === adId);
  if (!ad) return;

  const isOwner = currentUser && (
    (ad.sellerUsername && currentUser.username && ad.sellerUsername.toLowerCase() === currentUser.username.toLowerCase()) ||
    currentUser.role === 'SUPERUSER' || 
    currentUser.role === 'ADMIN'
  );

  if (!isOwner) {
    const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
    showToast(isTr ? 'Bu ilanı silme yetkiniz yok!' : 'У вас нет прав на удаление этого объявления!', 'error');
    return;
  }

  showConfirmModal('Удаление объявления', 'Удалить объявление навсегда из базы данных?', async () => {
    markAdDeletedLocally(adId);
    ads = ads.filter(a => a.id !== adId);
    saveCachedAds();

    if (supabaseClient) {
      try {
        await supabaseClient.from('ads').delete().eq('id', adId);
      } catch (err) {
        console.warn('Supabase delete error:', err);
      }
    }

    closeModal('modal-ad-detail');
    renderAds();
    renderCategoryPills();
    if (typeof renderAdminTabContent === 'function' && !byId('modal-admin-panel')?.classList.contains('hidden')) {
      renderAdminTabContent();
    }
    showToast('Объявление удалено навсегда', 'info');
  });
}

function toggleRegionMenu() {
  const m = byId('region-menu-overlay');
  const list = byId('region-list-container');
  if (!m || !list) return;
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  const curReg = byId('region-filter')?.value || 'ALL';
  
  const titleEl = m.querySelector('.text-center');
  if (titleEl) titleEl.innerText = isTr ? 'İl Seçiniz' : 'Выберите регион';

  let html = `<button onclick="selectRegionFilter('ALL')" class="w-full text-left p-3 rounded-xl ig-hover t1 text-sm font-semibold flex justify-between"><span>${isTr ? 'Tüm İller (Türkiye)' : 'Все регионы (Турция)'}</span> ${curReg === 'ALL' ? '<i class="fa-solid fa-check text-blue-500"></i>' : ''}</button>`;
  
  Object.keys(REGION_NAMES).forEach(code => {
    const name = getRegionName(code);
    html += `<button onclick="selectRegionFilter('${code}')" class="w-full text-left p-3 rounded-xl ig-hover t1 text-sm font-semibold flex justify-between"><span>${name}</span> ${curReg === code ? '<i class="fa-solid fa-check text-blue-500"></i>' : ''}</button>`;
  });
  
  const closeBtn = m.querySelector('button:last-child');
  if (closeBtn) closeBtn.innerText = isTr ? 'Kapat' : 'Закрыть';

  list.innerHTML = html;
  m.classList.remove('hidden');
}

function closeRegionMenu() {
  byId('region-menu-overlay')?.classList.add('hidden');
}

function selectRegionFilter(code) {
  const sel = byId('region-filter');
  if (sel) sel.value = code;
  updateRegionLabel();
  closeRegionMenu();
  resetPageAndRender();
}

function updateRegionLabel() {
  const regVal = byId('region-filter')?.value || 'ALL';
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  const lbl = byId('current-region-label');
  if (lbl) {
    lbl.innerText = regVal === 'ALL' ? (isTr ? 'Tüm İller' : 'Все регионы') : getRegionName(regVal);
  }
  
  // Синхронизация названий внутри скрытого селекта region-filter
  const regionSel = byId('region-filter');
  if (regionSel && regionSel.options.length > 0) {
    regionSel.options[0].text = isTr ? 'Tüm İller (Türkiye)' : 'Все регионы (Турция)';
    Object.keys(REGION_NAMES_TR).forEach((code, idx) => {
const opt = regionSel.querySelector(`option[value="${code}"]`);
      if (opt) {
        opt.text = getRegionName(code);
      }
    });
  }
}

function openRadiusMenu() {
	const m = byId('radius-menu-overlay');
  if (!m) return;
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';

  const titleEl = m.querySelector('h3') || m.querySelector('.font-bold');
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-location-crosshairs text-blue-500"></i> ${isTr ? 'Arama Yarıçapı' : 'Поиск в радиусе'}`;

  [5, 15, 30, 50].forEach(r => {
    const btn = byId(`radius-btn-${r}`) || m.querySelector(`button[onclick*="setRadiusFilter(${r})"]`);
    if (btn) {
      const span = btn.querySelector('span') || btn;
      span.innerText = `${r} ${isTr ? 'km' : 'км'}`;
    }
    const chk = byId(`radius-check-${r}`);
    if (chk) chk.classList.toggle('hidden', activeRadiusKm !== r);
  });

  const disableBtn = m.querySelector('button[onclick*="setRadiusFilter(0)"]');
  if (disableBtn) {
    disableBtn.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${isTr ? 'Yakınımda aramasını kapat' : 'Отключить поиск рядом'}`;
  }

  if (!userCurrentCoords && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      userCurrentCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }, () => {});
  }
  m.classList.remove('hidden');
}

function closeRadiusMenu() {
  byId('radius-menu-overlay')?.classList.add('hidden');
}

function setRadiusFilter(km) {
  activeRadiusKm = km;
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
  const lbl = byId('near-me-label');
  if (lbl) {
    lbl.innerText = km > 0 ? `${km} ${isTr ? 'km' : 'км'}` : (isTr ? 'Yakınımda' : 'Рядом');
  }
  closeRadiusMenu();
  resetPageAndRender();
}

function toggleSortMenu() {
  const m = byId('sort-menu-overlay');
  if (m) {
    ['newest', 'cheapest', 'expensive', 'popular'].forEach(mode => {
      const chk = byId(`sort-check-${mode}`);
      if (chk) chk.classList.toggle('hidden', currentSortMode !== mode);
    });
    m.classList.remove('hidden');
  }
}

function closeSortMenu() {
  byId('sort-menu-overlay')?.classList.add('hidden');
}

function applySort(mode) {
  currentSortMode = mode;
  localStorage.setItem('bs_sort_mode', mode);
  const sortLabels = { newest: 'Новые', cheapest: 'Дешевые', expensive: 'Дорогие', popular: 'Популярные' };
  const lbl = byId('current-sort-label');
  if (lbl) lbl.innerText = t(sortLabels[mode] || 'Новые');
  closeSortMenu();
  resetPageAndRender();
}

// Обработка горизонтального свайпа фотографий на смартфонах
let touchStartX = 0;
let touchStartY = 0;

function handleTouchSwipeStart(e) {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}

function handleTouchSwipeEnd(e, callback) {
  const diffX = e.changedTouches[0].screenX - touchStartX;
  const diffY = e.changedTouches[0].screenY - touchStartY;
  
  if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
    if (diffX < 0) {
      callback(1);
    } else {
      callback(-1);
    }
  }
}

async function cleanUnusedStorageImagesAdmin() {
  if (!currentUser || (currentUser.role !== 'SUPERUSER' && currentUser.role !== 'ADMIN')) {
    showToast('Доступ запрещен', 'error');
    return;
  }
  if (!supabaseClient) return;

  showToast('Проверка хранилища на неиспользуемые фото...', 'info');

  try {
    const { data: storageFiles } = await supabaseClient.storage.from('listings').list('public', { limit: 1000 });
    if (!storageFiles || !storageFiles.length) {
      showToast('В хранилище нет файлов для очистки', 'info');
      return;
    }

    const [{ data: adsData }, { data: usersData }] = await Promise.all([
      supabaseClient.from('ads').select('images, image'),
      supabaseClient.from('users').select('avatar, shop')
    ]);

    const usedFileNames = new Set();

    (adsData || []).forEach(ad => {
      const allImgs = Array.isArray(ad.images) ? ad.images : [ad.image].filter(Boolean);
      allImgs.forEach(url => {
        if (typeof url === 'string' && url.includes('/storage/v1/object/public/listings/')) {
          const fn = url.split('/listings/public/').pop().split('/listings/').pop();
          if (fn) usedFileNames.add(fn.replace('public/', ''));
        }
      });
    });

    (usersData || []).forEach(u => {
      if (u.avatar && typeof u.avatar === 'string' && u.avatar.includes('/storage/v1/object/public/listings/')) {
        const fn = u.avatar.split('/listings/public/').pop().split('/listings/').pop();
        if (fn) usedFileNames.add(fn.replace('public/', ''));
      }
      if (u.shop?.logo && typeof u.shop.logo === 'string' && u.shop.logo.includes('/storage/v1/object/public/listings/')) {
        const fn = u.shop.logo.split('/listings/public/').pop().split('/listings/').pop();
        if (fn) usedFileNames.add(fn.replace('public/', ''));
      }
    });

    const filesToDelete = storageFiles
      .filter(f => f.name && !usedFileNames.has(f.name))
      .map(f => `public/${f.name}`);

    if (!filesToDelete.length) {
      showToast('Лишних неиспользуемых фото не обнаружено', 'success');
      return;
    }

    showConfirmModal('Очистка хранилища', `Найдено ${filesToDelete.length} неиспользуемых фото. Удалить их из Supabase Storage?`, async () => {
      const { error: delErr } = await supabaseClient.storage.from('listings').remove(filesToDelete);
      if (delErr) {
        showToast('Ошибка очистки хранилища', 'error');
      } else {
        showToast(`Удалено ${filesToDelete.length} неиспользуемых фото!`, 'success');
      }
    });
  } catch (e) {
    console.error(e);
    showToast('Ошибка при сканировании хранилища', 'error');
  }
}

// Автоматический оверлей при потере связи
function updateNetworkStatus() {
  const offlineScreen = document.getElementById('offline-screen');
  if (!offlineScreen) return;

  if (navigator.onLine) {
    offlineScreen.classList.add('hidden');
    offlineScreen.classList.remove('flex');
  } else {
    offlineScreen.classList.remove('hidden');
    offlineScreen.classList.add('flex');
  }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
document.addEventListener('DOMContentLoaded', updateNetworkStatus);

// Открытие конструктора акции «Товар + Подарок» для конкретного товара
function openGiftForSpecificAd(adId) {
  const mainAd = ads.find(a => a.id === adId);
  if (!mainAd) return;

  openComboBuilder(currentUser ? currentUser.uid : null);

  setTimeout(() => {
    const titleInp = byId('combo-title');
    const priceInp = byId('combo-price');
    if (titleInp) titleInp.value = `🎁 АКЦИЯ: ${mainAd.title} + Подарок!`;
    if (priceInp) priceInp.value = mainAd.price || '';

    const checkMain = byId(`combo-item-${mainAd.id}`);
    if (checkMain) {
      checkMain.checked = true;
      if (typeof updateComboSummary === 'function') updateComboSummary();
    }
    showToast('Выберите из списка второй товар, который пойдет в подарок!', 'info');
  }, 200);
}
/* ================= SMART WHATSAPP / TELEGRAM PARSER & PRICE RANGE ================= */

function toggleSmartPasteBlock() {
  const body = byId('smart-paste-body');
  const chev = byId('smart-paste-chevron');
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chev) chev.style.transform = isHidden ? 'rotate(180deg)' : 'none';
  if (isHidden) {
    setTimeout(() => byId('smart-paste-textarea')?.focus(), 100);
  }
}

function applySmartPasteText() {
  const ta = byId('smart-paste-textarea');
  if (!ta) return;
  const text = ta.value.trim();
  const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';

  if (!text || text.length < 5) {
    showToast(isTr ? 'Lütfen ilan metnini yapıştırın' : 'Вставьте текст объявления для распознавания', 'warning');
    return;
  }

  // 1. Поиск цены и валюты ($ или TL / TRY)
  let detectedPrice = null;
  let detectedCurrency = 'USD';

  const usdMatch = text.match(/(?:цена|fiyat|fiyatı|price|стоимость)?\s*[:=\-]?\s*(\d+[\.,]?\d*)\s*(?:\$|usd|долл|долларов)/i) ||
                   text.match(/\$\s*(\d+[\.,]?\d*)/i);
  const tryMatch = text.match(/(?:цена|fiyat|fiyatı|price|стоимость)?\s*[:=\-]?\s*(\d+[\.,]?\d*)\s*(?:₺|tl|try|лир|лиры)/i);
  const plainNumMatch = text.match(/(?:цена|fiyat|price)[:=\-\s]+(\d+[\.,]?\d*)/i);

  if (usdMatch) {
    detectedPrice = parseFloat(usdMatch[1].replace(',', '.'));
    detectedCurrency = 'USD';
  } else if (tryMatch) {
    detectedPrice = parseFloat(tryMatch[1].replace(',', '.'));
    detectedCurrency = 'TRY';
  } else if (plainNumMatch) {
    detectedPrice = parseFloat(plainNumMatch[1].replace(',', '.'));
    detectedCurrency = 'USD';
  }

  // 2. Распознавание турецких городов
  const cityMap = {
    'istanbul': 'IST', 'стамбул': 'IST', 'ankara': 'ANK', 'анкара': 'ANK',
    'izmir': 'IZM', 'измир': 'IZM', 'bursa': 'BUR', 'бурса': 'BUR',
    'antalya': 'ANT', 'анталья': 'ANT', 'анталия': 'ANT', 'gaziantep': 'GAZ',
    'газиантеп': 'GAZ', 'hatay': 'HAT', 'хатай': 'HAT', 'mersin': 'MER',
    'мерсин': 'MER', 'urfa': 'URF', 'şanlıurfa': 'URF', 'шанлыурфа': 'URF',
    'konya': 'KON', 'конья': 'KON', 'adana': 'ADA', 'адана': 'ADA',
    'kayseri': 'KAY', 'кайсери': 'KAY', 'samsun': 'SAM', 'самсун': 'SAM',
    'trabzon': 'TRA', 'трабзон': 'TRA'
  };

  const lowerText = text.toLowerCase();
  for (const [cityName, regCode] of Object.entries(cityMap)) {
    if (lowerText.includes(cityName)) {
      if (byId('ad-region')) byId('ad-region').value = regCode;
      if (byId('ad-city')) byId('ad-city').value = cityName.charAt(0).toUpperCase() + cityName.slice(1);
      if (typeof handleRegionMapUpdate === 'function') handleRegionMapUpdate(regCode);
      break;
    }
  }

  // 3. Выделение заголовка и описания
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let firstLine = lines[0] || '';
  firstLine = firstLine.replace(/^(продам|satılık|satilik|продает|for sale)[:\-–\s]*/i, '');
  if (firstLine.length > 60) firstLine = firstLine.substring(0, 58) + '...';

  if (byId('ad-title')) byId('ad-title').value = firstLine;
  if (byId('ad-desc')) byId('ad-desc').value = text;

  if (detectedPrice !== null && !isNaN(detectedPrice)) {
    if (byId('ad-price')) byId('ad-price').value = detectedPrice;
    if (byId('ad-currency')) byId('ad-currency').value = detectedCurrency;
  }

  if (typeof detectCategoryByTitle === 'function') {
    detectCategoryByTitle(text);
  }

  if (typeof saveDraft === 'function') saveDraft();

  toggleSmartPasteBlock();
  showToast(isTr ? 'Bilgiler otomatik dolduruldu!' : 'Данные успешно распознаны и заполнены!', 'success');
}

let priceRangeDebounce = null;
function handlePriceRangeFilter() {
  clearTimeout(priceRangeDebounce);
  priceRangeDebounce = setTimeout(() => {
    const minVal = parseFloat(byId('min-price-input')?.value);
    const maxVal = parseFloat(byId('max-price-input')?.value);

    minPriceFilter = (!isNaN(minVal) && minVal > 0) ? minVal : null;
    maxPriceFilter = (!isNaN(maxVal) && maxVal > 0) ? maxVal : null;

    if (typeof resetPageAndRender === 'function') {
      resetPageAndRender();
    }
  }, 250);
}
/* ================= TELEGRAM ONBOARDING (LANG + RULES + GENDER) ================= */
let pendingTelegramUser = null;
let tgOnboardSelectedLang = (typeof currentLang !== 'undefined' && currentLang === 'tr') ? 'tr' : 'ru';

function setTgOnboardingLang(lang) {
  tgOnboardSelectedLang = lang;
  if (typeof changeLanguage === 'function') {
    changeLanguage(lang);
  }

  const bRu = byId('tg-onboard-lang-ru');
  const bTr = byId('tg-onboard-lang-tr');
  if (bRu && bTr) {
    if (lang === 'ru') {
      bRu.className = 'px-3 py-1 rounded-lg text-xs font-bold transition-all bg-blue-500 text-white shadow-sm';
      bTr.className = 'px-3 py-1 rounded-lg text-xs font-bold transition-all t2 hover:text-white';
    } else {
      bTr.className = 'px-3 py-1 rounded-lg text-xs font-bold transition-all bg-blue-500 text-white shadow-sm';
      bRu.className = 'px-3 py-1 rounded-lg text-xs font-bold transition-all t2 hover:text-white';
    }
  }

  const isTr = lang === 'tr';
  const uName = pendingTelegramUser ? (pendingTelegramUser.first_name || '') : '';

  const titleEl = byId('tg-onboard-title');
  if (titleEl) titleEl.innerText = isTr ? `Hoş geldiniz${uName ? ', ' + uName : ''}!` : `Добро пожаловать${uName ? ', ' + uName : ''}!`;

  const rulesTitle = byId('tg-onboard-rules-title');
  if (rulesTitle) rulesTitle.innerText = isTr ? 'Platformun Kesin Kuralları:' : 'Строгие правила площадки:';

const rulesText = byId('tg-onboard-rules-text');
  if (rulesText) {
    rulesText.innerHTML = isTr
      ? 'Her türlü <b>silah, mühimmat, uyuşturucu, yasa dışı madde ve kaçak ürünlerin</b> yayınlanması kesinlikle yasaktır. Kuralları ihlal eden hesaplar kalıcı olarak engellenir. Bu servis yalnızca sivil bir seri ilan platformudur.'
      : 'Категорически <b>запрещена</b> публикация любого оружия, боеприпасов, комплектующих, запрещенных веществ, наркотиков и контрабанды. Нарушители блокируются навсегда. Сервис является исключительно гражданской торговой площадкой.';
  }

  const genderPrompt = byId('tg-onboard-gender-prompt');
  if (genderPrompt) genderPrompt.innerText = isTr ? 'Girişi tamamlamak için cinsiyetinizi seçin:' : 'Выберите ваш пол для завершения входа:';

  const genderSub = byId('tg-onboard-gender-sub');
  if (genderSub) genderSub.innerText = isTr ? '(Kadınlara özel ilanların gizliliği için zorunludur)' : '(Необходимо для разделения закрытых женских объявлений)';

const btnMale = byId('tg-onboard-btn-male');
  if (btnMale) btnMale.innerText = isTr ? 'Erkek' : 'Мужской';

  const btnFemale = byId('tg-onboard-btn-female');
  if (btnFemale) btnFemale.innerText = isTr ? 'Kadın' : 'Женский';

  const footNote = byId('tg-onboard-footer-note');
  if (footNote) footNote.innerText = isTr ? 'Cinsiyet seçerek platform kurallarını kabul etmiş olursunuz.' : 'Нажимая на кнопку пола, вы подтверждаете соблюдение правил площадки.';
}

async function handleTelegramAutoLogin(selectedGender = null) {
  if (typeof window.Telegram === 'undefined' || !window.Telegram.WebApp) return;

  const tg = window.Telegram.WebApp;
  try {
    tg.ready();
    tg.expand();
  } catch (e) {}

  const tgUser = tg.initDataUnsafe?.user;
  if (!tgUser || !tgUser.id) return;

  if (currentUser && currentUser.shop?.telegram_id === String(tgUser.id)) return;

  let attempts = 0;
  while (!supabaseClient && attempts < 10) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  if (!supabaseClient) return;

  try {
    const payload = {
      p_tg_id: tgUser.id,
      p_first_name: tgUser.first_name || '',
      p_last_name: tgUser.last_name || '',
      p_username: tgUser.username || null,
      p_photo_url: tgUser.photo_url || null,
      p_gender: selectedGender
    };

    const { data: res, error } = await supabaseClient.rpc('auth_or_register_telegram', payload);

    if (res && res.need_gender) {
      pendingTelegramUser = tgUser;
      // Если язык пользователя Telegram турецкий — ставим TR по умолчанию, иначе RU
      const tgLangCode = (tgUser.language_code || '').toLowerCase();
      const initialLang = tgLangCode.startsWith('tr') ? 'tr' : 'ru';
      setTgOnboardingLang(initialLang);
      openModal('modal-tg-gender');
      return;
    }

    if (error || !res || !res.success) {
      console.warn('Telegram auth error:', error || res?.error);
      return;
    }

    const authUser = {
      ...res.user,
      passwordHash: res.user.password_hash,
      favorites: Array.isArray(res.user.favorites) ? res.user.favorites : []
    };

    const idx = users.findIndex(u => u.uid === authUser.uid);
    if (idx !== -1) users[idx] = authUser;
    else users.push(authUser);

    saveUserSession(authUser, true);
    closeModal('modal-auth');
    closeModal('modal-tg-gender');
    updateAuthUI();

    const isTr = typeof currentLang !== 'undefined' && currentLang === 'tr';
    const welcomeName = authUser.kunya || authUser.username;
    showToast(isTr ? `Giriş yapıldı: ${welcomeName}` : `Вы вошли как ${welcomeName}`, 'success');
  } catch (err) {
    console.error('Telegram auto-login fail:', err);
  }
}

async function submitTelegramGender(gender) {
  if (!gender || (gender !== 'MALE' && gender !== 'FEMALE')) return;
  const isTr = tgOnboardSelectedLang === 'tr';
  showToast(isTr ? 'Hesap oluşturuluyor...' : 'Создаем профиль...', 'info');
  await handleTelegramAutoLogin(gender);
}