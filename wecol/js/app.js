// ============================================================
//  Wecol — Coffee Education
// ============================================================

// ── Navbar scroll ──
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', scrollY > 30);
}, { passive: true });

// ── Mobile nav ──
const navBurger = document.getElementById('nav-burger');
const navLinks = document.getElementById('nav-links');
navBurger.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  navBurger.setAttribute('aria-expanded', String(isOpen));
  navBurger.setAttribute('aria-label', isOpen ? 'Tutup menu' : 'Buka menu');
});
document.addEventListener('click', e => {
  if (!navLinks.contains(e.target) && !navBurger.contains(e.target)) {
    navLinks.classList.remove('open');
    navBurger.setAttribute('aria-expanded', 'false');
    navBurger.setAttribute('aria-label', 'Buka menu');
  }
});

// ── Page navigation ──
function showPage(id) {
  const nextPage = document.getElementById('page-' + id);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active', 'page-enter'));
  nextPage?.classList.add('active');
  window.requestAnimationFrame(() => {
    if (!nextPage?.classList.contains('active')) return;
    nextPage.classList.remove('page-enter');
    void nextPage.offsetWidth;
    nextPage.classList.add('page-enter');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const map = { home:'Beranda', jenis:'Jenis Kopi', seduh:'Cara Seduh', biji:'Perjalanan Biji', tips:'Tips & Fakta' };
  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.textContent.trim() === map[id])
  );
  navLinks.classList.remove('open');
  navBurger.setAttribute('aria-expanded', 'false');
  navBurger.setAttribute('aria-label', 'Buka menu');

  // Trigger scroll reveal for new page
  setTimeout(initReveal, 100);
}

// ── Accordion ──
function toggleAcc(id) {
  const card = document.getElementById('acc-' + id);
  const isOpen = card.classList.contains('open');
  document.querySelectorAll('.acc-card').forEach(c => c.classList.remove('open'));
  if (!isOpen) card.classList.add('open');
}

// ── Discovery resep: filter, pencarian, dan favorit ──
const FAVORITES_KEY = 'wecol-favorites';
let activeMethodCategory = 'all';
let methodSearchQuery = '';
let lastFocusedElement = null;
let toastTimer = null;

function readFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeFavorites(favorites) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    showToast('Favorit hanya bisa disimpan di perangkat ini.');
  }
}

function isFavorite(id) {
  return readFavorites().has(id);
}

function setFavoriteButtonState(button, saved) {
  const label = saved ? 'Hapus dari favorit' : 'Simpan ke favorit';
  button.classList.toggle('saved', saved);
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);

  if (button.classList.contains('modal-save')) {
    button.innerHTML = `<i class="${saved ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i><span>${saved ? 'Tersimpan' : 'Simpan resep'}</span>`;
  } else {
    button.innerHTML = `<i class="${saved ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i><span class="sr-only">${label}</span>`;
  }
}

function updateFavoriteUI() {
  const favorites = readFavorites();
  document.querySelectorAll('[data-favorite-id]').forEach(button => {
    setFavoriteButtonState(button, favorites.has(button.dataset.favoriteId));
  });

  const count = document.getElementById('favorite-count');
  if (count) count.textContent = [...favorites].filter(id => METHODS[id]).length;
}

function applyMethodFilters() {
  const cards = [...document.querySelectorAll('.mcard')];
  const query = methodSearchQuery.trim().toLowerCase();
  const favorites = readFavorites();
  let visible = 0;

  cards.forEach(card => {
    const id = card.dataset.methodId;
    const searchableText = card.textContent.toLowerCase();
    const matchesCategory = activeMethodCategory === 'all'
      || (activeMethodCategory === 'favorites' && favorites.has(id))
      || card.dataset.cat === activeMethodCategory;
    const matchesSearch = !query || searchableText.includes(query);
    const show = matchesCategory && matchesSearch;

    card.classList.toggle('hidden', !show);
    card.style.animation = '';
    card.classList.remove('visible');
    if (show) {
      visible += 1;
      void card.offsetHeight;
      card.classList.add('visible');
    }
  });

  const count = document.getElementById('method-count');
  if (count) {
    count.textContent = visible === cards.length && activeMethodCategory === 'all' && !query
      ? `${visible} resep tersedia`
      : `${visible} resep ditemukan`;
  }

  const empty = document.getElementById('method-empty');
  if (empty) empty.hidden = visible !== 0;
  updateFavoriteUI();
}

function filterMethods(cat, btn) {
  activeMethodCategory = cat;
  document.querySelectorAll('.fchip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyMethodFilters();
}

function clearMethodSearch() {
  const input = document.getElementById('method-search');
  const clear = document.getElementById('clear-method-search');
  methodSearchQuery = '';
  if (input) input.value = '';
  if (clear) clear.hidden = true;
  applyMethodFilters();
}

function resetMethodFilters() {
  activeMethodCategory = 'all';
  document.querySelectorAll('.fchip').forEach(b => b.classList.remove('active'));
  document.querySelector('.fchip')?.classList.add('active');
  clearMethodSearch();
}

function toggleFavorite(id, event) {
  event?.preventDefault();
  event?.stopPropagation();

  const favorites = readFavorites();
  const saved = favorites.has(id);
  if (saved) favorites.delete(id);
  else favorites.add(id);
  writeFavorites(favorites);
  updateFavoriteUI();
  applyMethodFilters();
  showToast(saved ? 'Resep dihapus dari favorit.' : 'Resep disimpan ke favorit.');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function enhanceMethodCards() {
  const motionClasses = ['motion-rise', 'motion-slide', 'motion-pop', 'motion-sway'];
  document.querySelectorAll('.mcard').forEach((card, index) => {
    if (!card.dataset.motion) {
      card.dataset.motion = motionClasses[index % motionClasses.length];
      card.classList.add(card.dataset.motion);
    }
    if (card.dataset.enhanced === 'true') return;

    const match = (card.getAttribute('onclick') || '').match(/openModal\('([^']+)'\)/);
    if (!match) return;

    const id = match[1];
    const name = card.querySelector('h3')?.textContent.trim() || 'resep ini';
    card.dataset.methodId = id;
    card.dataset.enhanced = 'true';
    card.removeAttribute('onclick');
    card.setAttribute('role', 'article');
    card.addEventListener('click', event => {
      if (!event.target.closest('button')) openModal(id);
    });

    const header = card.querySelector('.mcard-header');
    if (header) {
      const favorite = document.createElement('button');
      favorite.type = 'button';
      favorite.className = 'favorite-btn';
      favorite.dataset.favoriteId = id;
      favorite.addEventListener('click', event => toggleFavorite(id, event));
      header.appendChild(favorite);
    }

    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'mcard-cta';
    hint.innerHTML = 'Lihat resep <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    hint.setAttribute('aria-label', `Buka resep ${name}`);
    hint.addEventListener('click', event => {
      event.stopPropagation();
      openModal(id);
    });
    card.appendChild(hint);
  });
}

function initMethodDiscovery() {
  const input = document.getElementById('method-search');
  const clear = document.getElementById('clear-method-search');

  input?.addEventListener('input', event => {
    methodSearchQuery = event.target.value;
    if (clear) clear.hidden = !methodSearchQuery;
    applyMethodFilters();
  });
  clear?.addEventListener('click', clearMethodSearch);
  applyMethodFilters();
}

function recommendMethod(id) {
  showPage('seduh');
  window.setTimeout(() => openModal(id), 260);
}

// ── Method data ──
const METHODS = {
  v60: {
    emoji: '🫗', name: 'V60 Pour Over',
    desc: 'Teknik menuang spiral yang menghasilkan kopi bersih, cerah, dan penuh aroma',
    time: '3–4 menit', temp: '93°C', ratio: '1:15', level: 'Pemula', levelCls: 'beginner',
    alat: ['V60 dripper', 'Filter kertas V60', 'Kettle leher angsa', 'Timbangan digital', 'Server/cangkir'],
    steps: [
      'Panaskan air hingga 93°C. Bilas filter kertas dengan air panas untuk menghilangkan rasa kertas — buang airnya.',
      'Giling kopi dengan ukuran medium, seperti tekstur gula pasir kasar. Timbang 15g untuk 225ml air.',
      'Letakkan V60 di atas cangkir, masukkan filter yang sudah dibilas, tuangkan kopi yang sudah digiling. Ratakan permukaannya.',
      'Mulai timer. Tuang 30g air secara perlahan melingkar dari tengah ke luar untuk proses blooming. Tunggu 30 detik penuh — jangan terburu-buru.',
      'Lanjutkan menuang air secara perlahan dengan gerakan spiral. Tuang sedikit demi sedikit setiap 30 detik hingga total air mencapai 225g.',
      'Seluruh proses selesai dalam 3–4 menit. Angkat V60, aduk server sebentar, dan nikmati kopimu.'
    ],
    tip: '<strong>Tips barista:</strong> Gerakan spiral menuang air dari tengah keluar memastikan semua bubuk kopi terekstraksi merata. Ketinggian menuang sekitar 5–8 cm di atas permukaan kopi untuk aerasi yang optimal.'
  },
  frenchpress: {
    emoji: '🫙', name: 'French Press',
    desc: 'Metode immersion yang mempertahankan minyak alami kopi untuk rasa yang kaya dan bold',
    time: '4 menit', temp: '95°C', ratio: '1:12', level: 'Pemula', levelCls: 'beginner',
    alat: ['French Press', 'Sendok pengaduk kayu/plastik', 'Timer', 'Timbangan (opsional)'],
    steps: [
      'Panaskan air hingga 95°C. Bilas French Press dengan air panas agar suhu tetap stabil saat menyeduh.',
      'Giling kopi kasar — teksturnya seperti butiran garam kasar. Masukkan 30g kopi untuk 360ml air.',
      'Tuang sedikit air panas (sekitar 60ml) untuk blooming, aduk pelan, tunggu 30 detik.',
      'Tuang sisa air perlahan. Letakkan tutup French Press tapi jangan tekan plunger dulu.',
      'Tunggu tepat 3.5 menit. Tekan plunger perlahan dan stabil — jangan terburu-buru atau menekan dengan kasar.',
      'Tuang semua kopi ke cangkir segera setelah plunger ditekan. Jangan biarkan kopi tersisa di French Press karena akan terus terekstraksi dan menjadi pahit.'
    ],
    tip: '<strong>Tips barista:</strong> Rahasia French Press yang enak adalah tidak membiarkan kopi terlalu lama di dalam wadah. Tuang semua ke server atau cangkir segera setelah selesai.'
  },
  espresso: {
    emoji: '⚙️', name: 'Espresso',
    desc: 'Teknik bertekanan tinggi yang menghasilkan shot pekat — fondasi semua minuman coffee bar',
    time: '25–30 detik', temp: '93°C', ratio: '1:2', level: 'Lanjutan', levelCls: 'advanced',
    alat: ['Mesin espresso', 'Grinder burr (wajib, bukan blade)', 'Portafilter', 'Tamper', 'Timbangan espresso'],
    steps: [
      'Nyalakan mesin espresso minimal 15–20 menit sebelum digunakan agar mencapai suhu stabil.',
      'Giling kopi sangat halus — hampir seperti tepung. Ini adalah variabel paling penting dalam espresso.',
      'Timbang 18–20g kopi ke dalam portafilter. Distribusikan merata dengan jari atau distribution tool.',
      'Tamp (tekan) kopi dengan tekanan konsisten sekitar 15–20kg. Permukaan harus rata sempurna dan padat.',
      'Kunci portafilter ke mesin, letakkan cangkir di bawah, mulai ekstraksi.',
      'Ekstraksi ideal berlangsung 25–30 detik dan menghasilkan 36–40ml shot. Warna awal cokelat tua, kemudian berubah keemasan (crema). Jika terlalu cepat = gilingan terlalu kasar. Terlalu lambat = terlalu halus.'
    ],
    tip: '<strong>Tips barista:</strong> Grinder adalah investasi terpenting dalam membuat espresso, bukan mesinnya. Grinder burr berkualitas menghasilkan gilingan konsisten yang jauh lebih berpengaruh terhadap rasa dibanding mesin espresso mahal.'
  },
  aeropress: {
    emoji: '🧪', name: 'AeroPress',
    desc: 'Alat portabel paling fleksibel — bisa menghasilkan kopi ala espresso hingga americano',
    time: '1–2 menit', temp: '85°C', ratio: '1:6', level: 'Menengah', levelCls: 'intermediate',
    alat: ['AeroPress + plunger', 'Filter kertas atau logam', 'Kettle', 'Stirrer', 'Timer'],
    steps: [
      'Letakkan filter di dalam cap, bilas dengan air panas. Panaskan air hingga 85°C — lebih rendah dari metode lain.',
      'Pasang AeroPress di atas cangkir. Masukkan 17g kopi dengan gilingan medium-fine.',
      'Tuang 100ml air dalam waktu 10 detik. Aduk 10 kali dengan stirrer.',
      'Pasang cap yang sudah berfilter. Tunggu hingga total waktu mencapai 1 menit.',
      'Balikkan AeroPress ke atas cangkir (dengan hati-hati) dan tekan plunger perlahan selama 20–30 detik. Berhenti saat terdengar bunyi mendesis.',
      'Hasil adalah kopi concentrate yang kuat. Tambahkan air panas untuk americano, atau nikmati langsung.'
    ],
    tip: '<strong>Tips barista:</strong> Coba metode inverted AeroPress — balik alat saat menyeduh sehingga kopi tidak menetes ke bawah sebelum waktunya. Hasilnya lebih konsisten dan ekstraksi lebih terkontrol.'
  },
  coldbrew: {
    emoji: '🧊', name: 'Cold Brew',
    desc: 'Seduh lambat dengan air dingin untuk kopi yang paling smooth, rendah asam, dan refreshing',
    time: '12–24 jam', temp: 'Air dingin atau suhu ruang', ratio: '1:8', level: 'Pemula', levelCls: 'beginner',
    alat: ['Jar/botol kaca besar (min. 1 liter)', 'Saringan kain atau filter kopi', 'Kulkas', 'Timbangan'],
    steps: [
      'Giling kopi kasar — lebih kasar dari French Press, seperti kerikil halus. Timbang 100g kopi untuk 800ml air dingin.',
      'Masukkan kopi ke dalam jar. Tuangkan air dingin secara perlahan. Aduk sebentar untuk memastikan semua bubuk kopi terbasahi.',
      'Tutup jar dengan rapat. Simpan di kulkas (direkomendasikan) atau di suhu ruang yang sejuk.',
      'Biarkan selama 12–24 jam. Semakin lama semakin pekat. Mulai cek setelah 12 jam.',
      'Saring melalui kain saring atau filter kopi ke wadah bersih. Saring dua kali untuk hasil yang lebih jernih.',
      'Cold brew concentrate siap! Encerkan dengan air dingin, susu, atau oat milk dengan perbandingan 1:1 atau sesuai selera. Tambahkan es batu dan nikmati.'
    ],
    tip: '<strong>Tips barista:</strong> Cold brew yang sudah jadi bisa disimpan di kulkas hingga 2 minggu. Buat dalam jumlah besar sekaligus sebagai stok mingguan — jauh lebih efisien dan ekonomis.'
  },
  tubruk: {
    emoji: '🥄', name: 'Kopi Tubruk',
    desc: 'Cara tradisional Indonesia yang paling autentik, sederhana, dan tidak butuh alat khusus',
    time: '3–5 menit', temp: '93°C', ratio: '1:10', level: 'Pemula', levelCls: 'beginner',
    alat: ['Gelas atau cangkir tahan panas', 'Sendok', 'Sumber air panas', 'Kopi bubuk halus'],
    steps: [
      'Siapkan gelas yang bersih. Masukkan 1–2 sendok teh kopi bubuk halus (sekitar 8–12g). Pilih kopi Robusta atau blend untuk rasa yang paling autentik.',
      'Tambahkan gula sesuai selera — gula pasir putih, gula aren merah, atau palm sugar untuk cita rasa lebih kaya.',
      'Tuangkan air panas (sekitar 93°C) perlahan ke dalam gelas. Jangan menuang langsung ke atas bubuk kopi tapi tuang ke sisi gelas.',
      'Aduk pelan satu atau dua kali untuk meratakan kopi dan gula.',
      'Tunggu 3–5 menit hingga ampas mengendap sempurna ke dasar gelas.',
      'Kopi siap diminum! Minum secara perlahan dari bagian atas. Jangan aduk lagi agar ampas di dasar tidak terangkat ke permukaan.'
    ],
    tip: '<strong>Tips barista:</strong> Rahasia kopi tubruk yang nikmat ada pada kualitas biji dan cara sangrai. Kopi yang baru digiling 1–2 jam sebelumnya menghasilkan aroma yang jauh lebih harum dibanding kopi bubuk kemasan yang sudah lama terbuka.'
  },
  chemex: {
    emoji: '⚗️', name: 'Chemex',
    desc: 'Dripper kaca dengan filter tebal yang menghasilkan kopi sangat jernih, ringan, dan bersih',
    time: '4–5 menit', temp: '94°C', ratio: '1:17', level: 'Menengah', levelCls: 'intermediate',
    alat: ['Chemex', 'Filter kertas Chemex', 'Kettle leher angsa', 'Timbangan digital', 'Timer'],
    steps: [
      'Panaskan air hingga 94°C. Lipat filter Chemex dengan sisi tiga lapis menghadap ke arah spout, lalu bilas dengan air panas. Buang air bilasan.',
      'Giling 30g kopi dengan ukuran medium-coarse, kira-kira seperti garam laut. Masukkan kopi ke filter dan ratakan permukaannya.',
      'Tuang 60g air secara perlahan untuk blooming. Pastikan semua bubuk basah, lalu tunggu 30–45 detik.',
      'Tuang sisa air dengan gerakan spiral dalam beberapa tahap sampai total air mencapai 510g. Jaga permukaan air tetap stabil dan jangan menuang ke dinding filter.',
      'Biarkan air menetes seluruhnya. Waktu seduh ideal sekitar 4–5 menit; terlalu cepat biasanya terasa tipis, terlalu lambat bisa terasa pahit.',
      'Lepaskan filter, lalu putar Chemex perlahan untuk mencampur kopi. Tuang ke cangkir dan nikmati saat hangat.'
    ],
    tip: '<strong>Tips barista:</strong> Filter Chemex jauh lebih tebal daripada filter V60, jadi tuang perlahan dan stabil. Aliran yang terlalu deras dapat membuat dasar filter tersumbat dan waktu seduh menjadi terlalu lama.'
  },
  mokpot: {
    emoji: '🫖', name: 'Moka Pot',
    desc: 'Metode kompor khas Italia yang menghasilkan kopi kuat dan aromatik tanpa mesin espresso',
    time: '5–7 menit', temp: 'Api sedang', ratio: '1:7', level: 'Pemula', levelCls: 'beginner',
    alat: ['Moka Pot', 'Kompor', 'Grinder burr', 'Timbangan', 'Cangkir tahan panas'],
    steps: [
      'Isi ruang bawah dengan air panas sampai tepat di bawah katup pengaman. Jangan menutup atau melewati batas katup.',
      'Giling 20g kopi dengan ukuran medium-fine. Isi basket sampai penuh dan ratakan permukaannya tanpa menekan atau memadatkannya.',
      'Pasang basket dan ruang atas dengan rapat. Gunakan kain atau sarung tangan karena bagian bawah akan panas, lalu letakkan Moka Pot di atas api sedang dengan tutup terbuka.',
      'Tunggu kopi mulai mengalir ke ruang atas. Saat alirannya berubah pucat dan terdengar suara mendesis, segera angkat dari kompor.',
      'Dinginkan dasar Moka Pot sebentar dengan kain basah atau air mengalir agar ekstraksi berhenti. Jangan membongkar alat saat masih bertekanan.',
      'Aduk kopi di ruang atas agar rasanya merata, lalu tuang. Nikmati langsung atau encerkan dengan air panas dan susu.'
    ],
    tip: '<strong>Tips barista:</strong> Jangan pernah men-tamp kopi di Moka Pot. Kopi yang terlalu padat dapat menghambat aliran dan meningkatkan tekanan. Api sedang dan pengangkatan sebelum mendidih membantu mencegah rasa gosong.'
  },
  japaneseicedcoffee: {
    emoji: '🧋', name: 'Japanese Iced Coffee',
    desc: 'Pour over langsung ke es batu untuk kopi yang cerah, wangi, dan segar dalam hitungan menit',
    time: '3–4 menit', temp: '96°C', ratio: '1:13', level: 'Menengah', levelCls: 'intermediate',
    alat: ['V60 atau dripper', 'Filter kertas', 'Kettle leher angsa', 'Timbangan digital', 'Server', 'Es batu 130g'],
    steps: [
      'Siapkan 20g kopi dengan gilingan medium. Masukkan 130g es batu ke dalam server, lalu pasang dripper dan filter yang sudah dibilas.',
      'Panaskan air hingga 96°C. Tuang 40g air ke atas kopi untuk blooming, lalu tunggu 30 detik.',
      'Tuang air panas secara perlahan dalam dua atau tiga tahap sampai total air panas mencapai 130g. Tuang melingkar tanpa menyentuh kertas filter.',
      'Biarkan seluruh air menetes selama kira-kira 3–4 menit. Air panas yang diekstrak langsung bertemu es sehingga aroma dan keasamannya tetap terasa jelas.',
      'Lepaskan dripper. Putar server beberapa kali agar kopi panas dan es tercampur merata serta suhunya turun dengan cepat.',
      'Tuang ke gelas berisi es tambahan bila perlu. Sajikan segera agar karakter kopi tetap segar.'
    ],
    tip: '<strong>Tips barista:</strong> Es dan air panas harus dihitung sebagai total air seduh. Kalau rasanya terlalu encer, kurangi es sedikit; kalau terlalu pekat, tambahkan es atau air setelah seduhan selesai.'
  },
  siphon: {
    emoji: '🔭', name: 'Siphon / Vacuum Pot',
    desc: 'Metode teatrikal dengan dua ruang kaca yang menghasilkan kopi bersih dan kompleks',
    time: '6–8 menit', temp: '92°C', ratio: '1:15', level: 'Lanjutan', levelCls: 'advanced',
    alat: ['Siphon / vacuum pot', 'Filter kain atau kertas', 'Burner', 'Stirrer', 'Timbangan', 'Timer'],
    steps: [
      'Pasang filter di ruang atas dan pastikan rantainya terkunci. Basahi filter jika menggunakan filter kain. Isi ruang bawah dengan 300ml air panas.',
      'Nyalakan burner. Pasang ruang atas secara miring terlebih dahulu, lalu tegakkan saat air mulai naik agar sambungannya rapat.',
      'Saat hampir seluruh air berpindah ke ruang atas, masukkan 20g kopi medium-fine. Aduk perlahan 8–10 kali untuk membasahi semua bubuk.',
      'Pertahankan api kecil dan biarkan kopi terekstraksi sekitar 60–90 detik. Aduk sekali lagi dengan gerakan lembut menjelang akhir waktu seduh.',
      'Matikan burner. Tekanan vakum akan menarik kopi melewati filter ke ruang bawah dalam 1–2 menit. Jangan memaksa atau menggoyangkan kaca.',
      'Lepaskan ruang atas setelah aliran berhenti, lalu aduk kopi di ruang bawah dan sajikan.'
    ],
    tip: '<strong>Tips barista:</strong> Kontrol panas adalah kunci siphon. Api yang terlalu besar membuat ekstraksi kasar dan mempercepat aliran; gunakan api stabil dan jangan meninggalkan burner tanpa pengawasan.'
  },
  vietnamesecoffee: {
    emoji: '🇻🇳', name: 'Vietnamese Drip (Phin)',
    desc: 'Kopi pekat dari filter tetes khas Vietnam yang nikmat bersama susu kental manis dan es',
    time: '5–8 menit', temp: '95°C', ratio: '1:8', level: 'Pemula', levelCls: 'beginner',
    alat: ['Phin Vietnam', 'Gelas', 'Kopi Robusta atau dark roast', 'Sendok', 'Susu kental manis', 'Es batu'],
    steps: [
      'Masukkan 25–30g susu kental manis ke dalam gelas. Siapkan es batu jika ingin membuat versi dingin.',
      'Giling 20g kopi dengan ukuran medium-fine. Masukkan ke dalam phin, ratakan perlahan, lalu pasang saringan tekan tanpa memadatkan kopi terlalu keras.',
      'Tuang 30–40ml air panas untuk blooming. Tunggu 30–45 detik sampai kopi mengembang.',
      'Tuang sisa air panas secara perlahan sampai total sekitar 160ml. Tutup phin dan biarkan menetes selama 5–8 menit.',
      'Aduk kopi yang menetes bersama susu kental manis sampai tercampur rata. Untuk versi panas, sajikan langsung.',
      'Untuk kopi susu es Vietnam, tuang campuran ke gelas berisi es batu dan aduk sebelum diminum.'
    ],
    tip: '<strong>Tips barista:</strong> Aliran ideal phin berlangsung pelan dan stabil. Jika menetes terlalu cepat, gunakan gilingan sedikit lebih halus; jika macet, gunakan gilingan lebih kasar dan jangan menekan saringan terlalu kuat.'
  },
  turkishcoffee: {
    emoji: '🏺', name: 'Turkish Coffee (Cezve)',
    desc: 'Kopi bubuk sangat halus yang dimasak perlahan bersama air di dalam cezve',
    time: '3–4 menit', temp: 'Api kecil', ratio: '1:8', level: 'Menengah', levelCls: 'intermediate',
    alat: ['Cezve / ibrik', 'Grinder dengan setelan sangat halus', 'Sendok kecil', 'Cangkir demitasse', 'Gula atau kapulaga (opsional)'],
    steps: [
      'Giling 7–8g kopi sampai sangat halus, menyerupai tepung. Masukkan ke dalam cezve bersama 60ml air dingin.',
      'Tambahkan gula atau sejumput kapulaga jika suka. Aduk saat masih dingin sampai semua bubuk tidak menggumpal.',
      'Letakkan cezve di atas api kecil. Setelah mulai dipanaskan, jangan mengaduk terlalu sering agar lapisan busa bisa terbentuk.',
      'Saat busa naik dan kopi hampir mendidih, angkat cezve dari api. Jangan biarkan kopi mendidih bergolak karena busanya akan hilang dan rasanya lebih pahit.',
      'Kembalikan ke api selama beberapa detik, lalu angkat lagi. Ulangi sekali bila ingin busa lebih tebal, tanpa membiarkannya mendidih.',
      'Tuang perlahan ke cangkir kecil. Tunggu 1–2 menit agar ampas mengendap sebelum diminum.'
    ],
    tip: '<strong>Tips barista:</strong> Turkish coffee tidak disaring, jadi jangan habiskan tegukan terakhir agar ampas tetap berada di dasar cangkir. Gunakan api kecil supaya busa terbentuk perlahan dan tidak gosong.'
  }
};

// ── Open modal ──
function openModal(id) {
  const m = METHODS[id];
  if (!m) return;
  lastFocusedElement = document.activeElement;
  const saved = isFavorite(id);

  const alatHtml = m.alat.map(a =>
    `<span class="alat-pill"><i class="fa-solid fa-check"></i>${a}</span>`
  ).join('');

  const stepsHtml = m.steps.map((s, i) =>
    `<li class="step" style="animation-delay:${i * .06}s"><p>${s}</p></li>`
  ).join('');

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-top">
      <div class="modal-top-l">
        <h2 id="modal-title">${m.emoji} ${m.name}</h2>
        <p>${m.desc}</p>
        <span class="mlvl ${m.levelCls}" style="margin-top:10px;display:inline-block">${m.level}</span>
      </div>
      <div class="modal-actions">
        <button class="modal-save ${saved ? 'saved' : ''}" data-favorite-id="${id}" type="button" onclick="toggleFavorite('${id}', event)" aria-pressed="${saved}" aria-label="${saved ? 'Hapus dari favorit' : 'Simpan ke favorit'}">
          <i class="${saved ? 'fa-solid' : 'fa-regular'} fa-heart" aria-hidden="true"></i><span>${saved ? 'Tersimpan' : 'Simpan resep'}</span>
        </button>
        <button class="modal-close" type="button" onclick="closeModal()" aria-label="Tutup panduan"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="modal-content">
      <div class="modal-specs">
        <span class="mspec-pill"><i class="fa-solid fa-clock"></i>${m.time}</span>
        <span class="mspec-pill"><i class="fa-solid fa-fire"></i>${m.temp}</span>
        <span class="mspec-pill"><i class="fa-solid fa-scale-balanced"></i>Rasio ${m.ratio}</span>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Alat yang Dibutuhkan</div>
        <div class="alat-wrap">${alatHtml}</div>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Langkah-langkah</div>
        <ol class="steps-list">${stepsHtml}</ol>
      </div>
      <div class="modal-tip">${m.tip}</div>
    </div>
  `;

  const modalBg = document.getElementById('modal-bg');
  modalBg.classList.add('open');
  modalBg.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.querySelector('.modal-close')?.focus();
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-bg')) return;
  const modalBg = document.getElementById('modal-bg');
  modalBg.classList.remove('open');
  modalBg.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
  lastFocusedElement = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

// ── Scroll Reveal ──
let revealObserver = null;

function initReveal() {
  // Timeline items
  document.querySelectorAll('.tl-item').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.08}s`;
  });

  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  }

  const targets = document.querySelectorAll(
    '.tbento, .mcard, .tip-item, .fact-item, .tl-item, .acc-card, .fwheel, .roast-pill'
  );

  targets.forEach(el => {
    if (!el.classList.contains('visible')) revealObserver.observe(el);
  });
}

// Motion system: tiap halaman dan kartu punya karakter transisi yang berbeda.
const style = document.createElement('style');
style.textContent = `
  @keyframes pageHomeEnter {
    from { opacity: 0; transform: translateY(18px) scale(.992); filter: blur(3px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @keyframes pageJenisEnter {
    from { opacity: 0; transform: translateX(-20px); filter: blur(2px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @keyframes pageSeduhEnter {
    from { opacity: 0; transform: translateX(20px); filter: blur(2px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @keyframes pageBijiEnter {
    from { opacity: 0; transform: translateY(24px) scale(.985); filter: blur(2px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @keyframes pageTipsEnter {
    from { opacity: 0; transform: scale(.985) rotate(.25deg); filter: blur(2px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  .page.page-enter { animation: pageHomeEnter .58s cubic-bezier(.22,1,.36,1) both; }
  #page-home.page-enter { animation-name: pageHomeEnter; }
  #page-jenis.page-enter { animation-name: pageJenisEnter; }
  #page-seduh.page-enter { animation-name: pageSeduhEnter; }
  #page-biji.page-enter { animation-name: pageBijiEnter; }
  #page-tips.page-enter { animation-name: pageTipsEnter; }

  @keyframes cardRise {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cardSlide {
    from { opacity: 0; transform: translateX(-22px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes cardPop {
    from { opacity: 0; transform: translateY(10px) scale(.94); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes cardSway {
    from { opacity: 0; transform: translateX(18px) rotate(1deg); }
    to   { opacity: 1; transform: translateX(0) rotate(0); }
  }
  .mcard.motion-rise.visible { animation: cardRise .62s cubic-bezier(.22,1,.36,1) both; }
  .mcard.motion-slide.visible { animation: cardSlide .62s cubic-bezier(.22,1,.36,1) both; }
  .mcard.motion-pop.visible { animation: cardPop .62s cubic-bezier(.22,1,.36,1) both; }
  .mcard.motion-sway.visible { animation: cardSway .62s cubic-bezier(.22,1,.36,1) both; }

  @keyframes contentFloat {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes contentFromLeft {
    from { opacity: 0; transform: translateX(-16px); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes contentFromRight {
    from { opacity: 0; transform: translateX(16px); }
    to   { opacity: 1; transform: none; }
  }
  .tbento.visible { animation: contentFloat .62s cubic-bezier(.22,1,.36,1) both; }
  .tbento:nth-child(even).visible { animation-name: contentFromRight; }
  .tip-item.visible:nth-child(odd), .fact-item.visible:nth-child(odd) { animation: contentFromLeft .52s ease both; }
  .tip-item.visible:nth-child(even), .fact-item.visible:nth-child(even) { animation: contentFromRight .52s ease both; }
  .tl-item.visible { animation: contentFloat .58s cubic-bezier(.22,1,.36,1) both; }
  .roast-pill.visible { animation: cardPop .52s cubic-bezier(.22,1,.36,1) both; }
  .fwheel.visible { animation: cardSway .5s ease both; }

  @keyframes starterChoiceIn {
    from { opacity: 0; transform: translateX(18px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  #page-home.page-enter .starter-choice { animation: starterChoiceIn .55s cubic-bezier(.22,1,.36,1) both; }
  #page-home.page-enter .starter-choice:nth-child(2) { animation-delay: .08s; }
  #page-home.page-enter .starter-choice:nth-child(3) { animation-delay: .16s; }
  #page-home.page-enter .starter-choice:nth-child(4) { animation-delay: .24s; }

  .tbento, .mcard, .tip-item, .fact-item, .fwheel, .roast-pill {
    opacity: 0;
    transform: translateY(16px);
    transition: opacity .5s ease, transform .5s ease, background .3s, box-shadow .3s, border-color .3s;
  }
  .tbento.visible, .mcard.visible, .tip-item.visible,
  .fact-item.visible, .fwheel.visible, .roast-pill.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .tl-item {
    opacity: 0; transform: translateY(16px);
    transition: opacity .5s ease, transform .5s ease;
  }
  .tl-item.visible { opacity: 1; transform: none; }
  /* Stagger delay */
  .tbento:nth-child(1){transition-delay:.05s}
  .tbento:nth-child(2){transition-delay:.12s}
  .tbento:nth-child(3){transition-delay:.19s}
  .tbento:nth-child(4){transition-delay:.26s}
`;
document.head.appendChild(style);

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('page-home')?.classList.add('page-enter');
  enhanceMethodCards();
  initMethodDiscovery();
  initReveal();
  // First accordion open by default
  document.getElementById('acc-arabica')?.classList.add('open');
});
