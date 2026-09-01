/* ================= STATE & CONFIGURATION ================= */

const _savedLayout = localStorage.getItem('bs_feed_layout') || 'instagram';
const _isDesktopInit = typeof window !== 'undefined' && window.innerWidth >= 1024;
let selectedCategory = 'all', currentPage = 1, itemsPerPage = _savedLayout === 'list' ? (_isDesktopInit ? 18 : 10) : (_savedLayout === 'grid' ? (_isDesktopInit ? 24 : 12) : (_isDesktopInit ? 16 : 8)), favorites = [];
let adminAdsTab = 'active', LAST_NAV = 'home', searchQuery = '';
let currentSortMode = localStorage.getItem('bs_sort_mode') || 'newest';
let createMap = null, createMarker = null, detailMap = null, shopCreateMap = null, shopCreateMarker = null, showcaseMap = null;
let pendingCreateImages = [], pendingEditImages = [];
let cardPhotoIndex = {}, currentDetailPhotoIndex = 0;
let shopEditTargetUid = null, onBehalfPreset = null;
let editingCatId = null, catNameDraft = '', catIconChoice = 'fa-mobile-screen';
let comboBuilderAds = [], comboSelectedIds = [], comboOwnerCache = null;
let lastRatesUpdate = null, sharePayload = null, modalStack = [];
let reports = [];
let lastReportCount = 0;
let lastShareBlob = null;
let lastShareObjectUrl = null;
let hasCloudMarqueeSettings = false;
let MARQUEE_SETTINGS = { text: '', color: '#a8a8a8', fontSize: 13, speed: 20, direction: 'left', pauseOnHover: false };
let BACKUPS_META = {};
try {
  const savedBackups = localStorage.getItem('bs_backups_meta');
  if (savedBackups) BACKUPS_META = JSON.parse(savedBackups);
} catch(e) {}

let AVITOCASH_PRICES = { adPrice: 1, shopSubscription: 5, editPrice: 0, freeAdsCount: 0 };
let AVITOCASH_RATE = 1;
let TOPUP_REQUESTS = {};
try {
  const savedReqs = localStorage.getItem('bs_topup_requests');
  if (savedReqs) TOPUP_REQUESTS = JSON.parse(savedReqs);
} catch(e) {}
let GIFT_CODES = {};
let TRANSACTIONS = {};
const MARQUEE_STORAGE_KEY = 'bs_marquee_text';
const AVITOCASH_ID = '3adfe36abcbe52f1a4b008cd324082fb';
const PLACEHOLDER_IMG = 'https://placehold.co/800x1000/1e293b/fff?text=Avito+Türk';
let EXCHANGE_RATES = { TRY: 38.50 };
let SYSTEM_CONFIG = { rulesAccepted: false, adminTab: 'overview' };
const REGION_NAMES = { 
  'IST': 'İstanbul', 'ANK': 'Ankara', 'IZM': 'İzmir', 'BUR': 'Bursa', 
  'ANT': 'Antalya', 'GAZ': 'Gaziantep', 'HAT': 'Hatay', 'MER': 'Mersin', 
  'URF': 'Şanlıurfa', 'KON': 'Konya', 'ADA': 'Adana', 'KAY': 'Kayseri', 
  'SAM': 'Samsun', 'TRA': 'Trabzon' 
};

const REGION_NAMES_RU = { 
  'IST': 'Стамбул', 'ANK': 'Анкара', 'IZM': 'Измир', 'BUR': 'Бурса', 
  'ANT': 'Анталья', 'GAZ': 'Газиантеп', 'HAT': 'Хатай', 'MER': 'Мерсин', 
  'URF': 'Шанлыурфа', 'KON': 'Конья', 'ADA': 'Адана', 'KAY': 'Кайсери', 
  'SAM': 'Самсун', 'TRA': 'Трабзон' 
};

function getRegionName(code) {
  if (!code || code === 'ALL') return (typeof currentLang !== 'undefined' && currentLang === 'tr') ? 'Tüm İller' : 'Все регионы';
  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'tr';
  if (lang === 'ru') {
    return REGION_NAMES_RU[code] || REGION_NAMES[code] || code;
  }
  return REGION_NAMES[code] || code;
}
const REGION_COORDS = { 
  'IST': [41.0082, 28.9784], 'ANK': [39.9334, 32.8597], 'IZM': [38.4192, 27.1287], 
  'BUR': [40.1885, 29.0610], 'ANT': [36.8969, 30.7133], 'GAZ': [37.0662, 37.3833], 
  'HAT': [36.2023, 36.1606], 'MER': [36.8121, 34.6415], 'URF': [37.1674, 38.7955], 
  'KON': [37.8746, 32.4932], 'ADA': [36.9914, 35.3308], 'KAY': [38.7205, 35.4826], 
  'SAM': [41.2867, 36.3300], 'TRA': [41.0027, 39.7168] 
};
let categories = [];
const CATEGORY_ICON_POOL = ['fa-mobile-screen','fa-laptop','fa-car','fa-house','fa-couch','fa-wrench','fa-boxes-stacked','fa-shirt','fa-baby','fa-utensils','fa-book','fa-futbol','fa-gamepad','fa-tractor','fa-truck','fa-gem','fa-paw','fa-seedling','fa-motorcycle','fa-camera','fa-tv','fa-blender','fa-chair','fa-hammer','fa-paint-roller','fa-plug','fa-scissors','fa-briefcase','fa-bicycle','fa-ring'];
let users = [];
let archivedUsers = [];
let combos = [];
let ads = [];
let paymentSearchQuery = '';
let suppressPop = false;
let userCurrentCoords = null;
let activeRadiusKm = 0;
let currentDiscountTargetAd = null;

/* ================= INSTAGRAM SVG ICONS ================= */
const IGSVG = {
  home: f => f ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10.2 12 2.6l9 7.6V22h-6.4v-6.2a2.6 2.6 0 0 0-5.2 0V22H3Z"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10.2 12 2.6l9 7.6V22h-6.4v-6.2a2.6 2.6 0 0 0-5.2 0V22H3Z"/></svg>',
  store: f => f ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4.2 5.5 3 9.3c0 1.4 1 2.6 2.4 2.9V21h13.2v-8.8c1.4-.3 2.4-1.5 2.4-2.9l-1.2-3.8c-.3-.9-1.1-1.5-2-1.5H6.2c-.9 0-1.7.6-2 1.5ZM8.4 13.7h7.2V21H8.4Zm2.1-9.5h3l.7 2.3h-4.4Z"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4.2 5.5 3 9.3c0 1.4 1 2.6 2.4 2.9V21h13.2v-8.8c1.4-.3 2.4-1.5 2.4-2.9l-1.2-3.8c-.3-.9-1.1-1.5-2-1.5H6.2c-.9 0-1.7.6-2 1.5Z"/><path d="M8.4 21v-7.3h7.2V21"/></svg>',
  plusSq: () => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  heart: f => f ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="#ed4956"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938Z"/></svg>',
  comment: () => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z"/></svg>',
  send: () => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M22 3 9.218 10.083"/><path d="M11.698 20.334 22 3H2l7.218 7.083 2.48 10.251Z"/></svg>',
  bookmark: f => f ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 21 12 13.44 4 21V3h16Z"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 21 12 13.44 4 21V3h16Z"/></svg>',
  chevL: () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>',
  chevR: () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  search: () => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/></svg>',
  moon: () => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  sun: () => '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  verified: () => '<svg width="14" height="14" viewBox="0 0 24 24" class="inline-block"><path fill="#0095f6" d="M12 1.8l2.5 2.4 3.4-.6.6 3.4 3.1 1.5-1.5 3.1 1.5 3.1-3.1 1.5-.6 3.4-3.4-.6-2.5 2.4-2.5-2.4-3.4.6-.6-3.4-3.1-1.5 1.5-3.1-1.5-3.1 3.1-1.5.6-3.4 3.4.6Z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m8.6 12.2 2.3 2.3 4.3-5"/></svg>',
  star: f => f ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
};

/* ================= BASIC HELPERS ================= */
const byId = id => document.getElementById(id);
const _0xSCAdmin = () => !!(currentUser && currentUser.role === 'SUPERUSER');
const _0xSCAmount = value => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const _0xSCCode = () => 'SHAM-' + Math.random().toString(36).slice(2, 8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase().slice(-4);
const _0xSCBalance = uid => { const u = users.find(x => x.uid === uid) || (currentUser && currentUser.uid === uid ? currentUser : null); return Number(u?.avitocashBalance ?? u?.shamcashBalance ?? 0); };
const _0xGiftCode = () => 'GIFT-' + Math.random().toString(36).slice(2, 7).toUpperCase() + '-' + Date.now().toString(36).slice(-5).toUpperCase();
const _0xSCPrices = () => ({ adPrice: _0xSCAmount(AVITOCASH_PRICES.adPrice), shopSubscription: _0xSCAmount(AVITOCASH_PRICES.shopSubscription), editPrice: _0xSCAmount(AVITOCASH_PRICES.editPrice) });

/* ================= LOCALIZATION DICTIONARY & I18N ================= */
let currentLang = localStorage.getItem('bs_app_lang') || 'tr';
const TRANSLATE_CACHE = {};

const I18N = {
  ru: {
    nav_home: 'Главная',
    nav_shops: 'Магазины',
    nav_create: 'Создать',
    nav_favorites: 'Избранное',
    nav_profile: 'Профиль',
    support: 'Техподдержка',
    change_theme: 'Сменить тему',
    search: 'Поиск',
    near_me: 'Рядом',
    all_regions: 'Все регионы',
    sort_newest: 'Новые',
    sort_cheapest: 'Дешевые',
    sort_expensive: 'Дорогие',
    sort_popular: 'Популярные',
    shop_title_new: 'Открытие нового магазина',
    shop_title_edit: 'Редактирование магазина',
    shop_name_ph: 'Название магазина *',
    shop_slogan_ph: 'Слоган / краткое описание *',
    shop_category_ph: 'Категория магазина *',
    shop_region_ph: 'Регион *',
    shop_address_ph: 'Точный физический адрес *',
    shop_hours_ph: 'Часы работы (напр. Сб–Чт 09:00–20:00)',
    shop_whatsapp_ph: 'WhatsApp магазина * (+90…)',
    shop_desc_ph: 'Подробная информация о магазине *',
    shop_map_label: 'Расположение на карте * (клик — установить метку)',
    shop_logo_label: 'Логотип магазина (1:1) *',
    shop_admin_notice: 'Магазин будет отправлен на проверку администратору.',
    shop_btn_create: 'Создать магазин',
    shop_btn_save: 'Сохранить изменения магазина',
    ad_create_title: 'Подача объявления',
    ad_photos_label: 'Фотографии товара (до 6 шт.) *',
    ad_photos_btn: 'Выбрать фотографии',
    ad_title_ph: 'Заголовок объявления *',
    ad_category_ph: 'Категория *',
    ad_price_ph: 'Цена, $ *',
    ad_free_label: 'Даром 🎁',
    ad_negotiable_label: 'Договорная 🤝',
    ad_women_label: 'Для женщин 🌸',
    ad_desc_ph: 'Описание и возможные изъяны *',
    ad_submit_btn: 'Опубликовать объявление',
    ad_advanced_btn: 'Расширенные настройки',
    guest_contact_label: 'Контакт для связи (профиль создастся автоматически):',
    guest_wa_ph: 'Ваш номер WhatsApp (+90…)*',
    confirm_title: 'Подтверждение действия',
    confirm_cancel: 'Отмена',
    confirm_ok: 'Да, выполнить',
    login_tab: 'Вход',
    register_tab: 'Регистрация',
    login_ph: 'Логин или WhatsApp *',
    password_ph: 'Пароль *',
    reg_login_ph: 'Логин *',
    reg_pass_ph: 'Пароль (мин. 6 символов) *',
    reg_pass2_ph: 'Повторите пароль *',
    reg_kunya_ph: 'Имя / Кунья',
    reg_wa_ph: 'WhatsApp номер * (+905...)',
    reg_gender_title: 'Выберите ваш пол *',
    gender_male: 'Мужчина',
    gender_female: 'Женщина 🌸',
    remember_me: 'Запомнить мой вход на этом устройстве',
    btn_login: 'Войти',
    btn_register: 'Зарегистрироваться',
    empty_ads: 'Объявлений пока нет. Будьте первым!',
    queue_label: 'В очереди:',
    queue_join: 'Занять очередь',
    queue_leave: 'Выйти из очереди',
    contact_wa: 'Связаться через WhatsApp',
    share: 'Поделиться',
    report: 'Пожаловаться',
    negotiate: 'Торг',
    offer_ph: 'Предложить цену ($)',
    desc_label: 'Описание и изъяны',
    sold: 'Продано',
    withdrawn: 'Передумал',
    edit: 'Редактировать',
    to_archive: 'В архив',
    delete_forever: 'Удалить навсегда',
    cat_all: 'Все',
    cat_women: 'Для женщин 🌸',
    cat_free: 'Даром 🎁',
    cat_discounts: 'Скидки',
    cat_combos: 'Акции',
    quick_discount_title: 'Установить скидку / Акцию',
    quick_discount_apply: 'Применить скидку',
    quick_discount_remove: 'Отменить скидку (вернуть старую цену)'
  },
  tr: {
    nav_home: 'Ana Sayfa',
    nav_shops: 'Mağazalar',
    nav_create: 'İlan Ver',
    nav_favorites: 'Favoriler',
    nav_profile: 'Profilim',
    support: 'Destek',
    change_theme: 'Temayı Değiştir',
    search: 'Arama...',
    near_me: 'Yakınımda',
    all_regions: 'Tüm İller',
    sort_newest: 'En Yeniler',
    sort_cheapest: 'En Ucuzlar',
    sort_expensive: 'En Pahalılar',
    sort_popular: 'Popülerler',
    shop_title_new: 'Yeni Mağaza Aç',
    shop_title_edit: 'Mağazayı Düzenle',
    shop_name_ph: 'Mağaza Adı *',
    shop_slogan_ph: 'Slogan / Kısa Açıklama *',
    shop_category_ph: 'Mağaza Kategorisi *',
    shop_region_ph: 'İl / Bölge *',
    shop_address_ph: 'Açık Adres *',
    shop_hours_ph: 'Çalışma Saatleri (örn. Cmt-Per 09:00-20:00)',
    shop_whatsapp_ph: 'Mağaza WhatsApp * (+90…)',
    shop_desc_ph: 'Mağaza Hakkında Detaylı Bilgi *',
    shop_map_label: 'Haritada Konum * (konumu seçmek için tıklayın)',
    shop_logo_label: 'Mağaza Logosu (1:1) *',
    shop_admin_notice: 'Mağaza onay için yöneticiye iletilecektir.',
    shop_btn_create: 'Mağazayı Aç',
    shop_btn_save: 'Değişiklikleri Kaydet',
    ad_create_title: 'Yeni İlan Ver',
    ad_photos_label: 'Ürün Fotoğrafları (en fazla 6 adet) *',
    ad_photos_btn: 'Fotoğraf Seç',
    ad_title_ph: 'İlan Başlığı *',
    ad_category_ph: 'Kategori *',
    ad_price_ph: 'Fiyat, $ *',
    ad_free_label: 'Ücretsiz (Hediye) 🎁',
    ad_negotiable_label: 'Fiyat Pazarlıklı 🤝',
    ad_women_label: 'Sadece Kadınlara Özel 🌸',
    ad_desc_ph: 'Açıklama ve Varsa Kusurları *',
    ad_submit_btn: 'İlanı Yayınla',
    ad_advanced_btn: 'Gelişmiş Ayarlar',
    guest_contact_label: 'İletişim Numarası (Hesap otomatik oluşturulacaktır):',
    guest_wa_ph: 'WhatsApp Numaranız (+90…)*',
    confirm_title: 'İşlemi Onayla',
    confirm_cancel: 'İptal',
    confirm_ok: 'Tamam',
    login_tab: 'Giriş Yap',
    register_tab: 'Kayıt Ol',
    login_ph: 'Kullanıcı Adı veya WhatsApp *',
    password_ph: 'Şifre *',
    reg_login_ph: 'Kullanıcı Adı *',
    reg_pass_ph: 'Şifre (en az 6 karakter) *',
    reg_pass2_ph: 'Şifreyi Tekrar Girin *',
    reg_kunya_ph: 'İsim / Lakap',
    reg_wa_ph: 'WhatsApp Numarası * (+905...)',
    reg_gender_title: 'Cinsiyetinizi Seçin *',
    gender_male: 'Erkek',
    gender_female: 'Kadın 🌸',
    remember_me: 'Beni bu cihazda hatırla',
    btn_login: 'Giriş Yap',
    btn_register: 'Kayıt Ol',
    empty_ads: 'Henüz ilan yok. İlk ilanı siz verin!',
    queue_label: 'Sırada:',
    queue_join: 'Sıraya Gir',
    queue_leave: 'Sıradan Çık',
    contact_wa: 'WhatsApp ile İletişim',
    share: 'Paylaş',
    report: 'Şikayet Et',
    negotiate: 'Pazarlık',
    offer_ph: 'Fiyat Teklif Et ($)',
    desc_label: 'Açıklama ve Kusurlar',
    sold: 'Satıldı',
    withdrawn: 'Vazgeçtim',
    edit: 'Düzenle',
    to_archive: 'Arşive Kaldır',
    delete_forever: 'Kalıcı Olarak Sil',
    cat_all: 'Tümü',
    cat_women: 'Kadınlara Özel 🌸',
    cat_free: 'Ücretsiz 🎁',
    cat_discounts: 'İndirimler',
    cat_combos: 'Kampanyalar',
    quick_discount_title: 'İndirim Uygula / Kampanya',
    quick_discount_apply: 'İndirimi Uygula',
    quick_discount_remove: 'İndirimi Kaldır (Eski Fiyata Dön)'
  }
};
const CATEGORY_I18N = {
  'electronics': { ru: 'Электроника', tr: 'Elektronik' },
  'transport': { ru: 'Транспорт', tr: 'Vasıta & Araçlar' },
  'realestate': { ru: 'Недвижимость', tr: 'Emlak' },
  'tools': { ru: 'Инструменты', tr: 'Alet & Edavat' },
  'home': { ru: 'Для дома', tr: 'Ev & Yaşam' },
  'food': { ru: 'Продукты', tr: 'Gıda & Market' },
  'fashion': { ru: 'Одежда и мода', tr: 'Giyim & Moda' },
  'services': { ru: 'Услуги', tr: 'Hizmetler' },
  'kids': { ru: 'Детские товары', tr: 'Anne & Bebek' },
  'other': { ru: 'Прочее', tr: 'Diğer' },
  'Elektronik': { ru: 'Электроника', tr: 'Elektronik' },
  'Vasıta & Araçlar': { ru: 'Транспорт', tr: 'Vasıta & Araçlar' },
  'Emlak': { ru: 'Недвижимость', tr: 'Emlak' },
  'Alet & Edavat': { ru: 'Инструменты', tr: 'Alet & Edavat' },
  'Ev & Yaşam': { ru: 'Для дома', tr: 'Ev & Yaşam' },
  'Gıda & Market': { ru: 'Продукты', tr: 'Gıda & Market' },
  'Giyim & Moda': { ru: 'Одежда и мода', tr: 'Giyim & Moda' },
  'Hizmetler': { ru: 'Услуги', tr: 'Hizmetler' },
  'Anne & Bebek': { ru: 'Детские товары', tr: 'Anne & Bebek' },
  'Diğer': { ru: 'Прочее', tr: 'Diğer' },
  'Электроника': { ru: 'Электроника', tr: 'Elektronik' },
  'Транспорт': { ru: 'Транспорт', tr: 'Vasıta & Araçlar' },
  'Недвижимость': { ru: 'Недвижимость', tr: 'Emlak' },
  'Инструменты': { ru: 'Инструменты', tr: 'Alet & Edavat' },
  'Продукты': { ru: 'Продукты', tr: 'Gıda & Market' },
  'Одежда и мода': { ru: 'Одежда и мода', tr: 'Giyim & Moda' },
  'Услуги': { ru: 'Услуги', tr: 'Hizmetler' },
  'Детские товары': { ru: 'Детские товары', tr: 'Anne & Bebek' },
  'Прочее': { ru: 'Прочее', tr: 'Diğer' }
};

function t(keyOrText) {
  if (!keyOrText) return '';
  const lang = (typeof currentLang !== 'undefined' && currentLang === 'tr') ? 'tr' : 'ru';
  
  if (CATEGORY_I18N[keyOrText]) {
    return CATEGORY_I18N[keyOrText][lang] || CATEGORY_I18N[keyOrText].tr;
  }
  
  if (I18N[lang] && I18N[lang][keyOrText]) {
    return I18N[lang][keyOrText];
  }
  
  if (lang === 'tr' && I18N.ru) {
    for (const [k, ruVal] of Object.entries(I18N.ru)) {
      if (ruVal === keyOrText && I18N.tr[k]) {
        return I18N.tr[k];
      }
    }
  }
  
  if (lang === 'ru' && I18N.tr) {
    for (const [k, trVal] of Object.entries(I18N.tr)) {
      if (trVal === keyOrText && I18N.ru[k]) {
        return I18N.ru[k];
      }
    }
  }
  
  return keyOrText;
}