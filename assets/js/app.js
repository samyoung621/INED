/* 路由與啟動。純 hash 路由，不需要伺服器設定，GitHub Pages 直接可用。 */
(function () {
  const U = window.SBUi, el = U.el;

  const ROUTES = [
    { path: '',         view: 'overview',    nav: 'overview' },
    { path: 'rank',     view: 'leaderboard', nav: 'rank' },
    { path: 'players',  view: 'players',     nav: 'players' },
    { path: 'player',   view: 'player',      nav: 'players', param: 'id' },
    { path: 'games',    view: 'games',       nav: 'games' },
    { path: 'game',     view: 'game',        nav: 'games', param: 'id' },
    { path: 'record',   view: 'record',      nav: 'record' },
    { path: 'settings', view: 'settings',    nav: 'settings' }
  ];

  const NAV = [
    { id: 'overview', label: '總覽', href: '#/' },
    { id: 'rank', label: '排行榜', href: '#/rank' },
    { id: 'players', label: '成績表', href: '#/players' },
    { id: 'games', label: '比賽', href: '#/games' },
    { id: 'record', label: '記錄', href: '#/record' },
    { id: 'settings', label: '設定', href: '#/settings' }
  ];

  let season = null;

  /* ------------------------------------------------------------ 主題 */

  const THEME_KEY = 'sb.theme';
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    document.dispatchEvent(new CustomEvent('sb:themechange'));
  }
  function currentTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
    updateThemeButton();
  }
  function updateThemeButton() {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    const label = { auto: '◐ 自動', light: '☀ 淺色', dark: '☾ 深色' }[currentTheme()];
    btn.textContent = label;
    btn.title = '切換外觀（自動 → 淺色 → 深色）';
  }
  applyTheme(currentTheme());

  /* ------------------------------------------------------- 頁首建構 */

  function buildHeader() {
    const header = document.getElementById('header');
    U.clear(header);
    const cfg = season ? season.cfg : window.SBConfig.load();

    header.appendChild(el('div', { class: 'site-header__bar' }, [
      el('a', { class: 'brand', href: '#/' }, [
        cfg.teamName,
        el('span', { class: 'brand__sub', text: '打擊紀錄 · ' + (cfg.seasonName || '') })
      ]),
      el('div', { class: 'site-header__spacer' }),
      el('button', { class: 'icon-btn', id: 'themeBtn', type: 'button', onclick: cycleTheme }, '外觀'),
      el('button', {
        class: 'icon-btn', type: 'button', title: '重新讀取資料', 'aria-label': '重新讀取資料',
        onclick: () => location.reload()
      }, '↻')
    ]));

    const nav = el('nav', { class: 'nav', id: 'nav', 'aria-label': '主導覽' });
    NAV.forEach(item => nav.appendChild(el('a', { href: item.href, 'data-nav': item.id }, item.label)));
    header.appendChild(nav);
    updateThemeButton();
  }

  /* ------------------------------------------------------------ 路由 */

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = raw.split('?');
    const segs = pathPart.split('/').filter(s => s !== '');
    const route = ROUTES.find(r => r.path === (segs[0] || '')) || ROUTES[0];
    const params = {};
    if (route.param && segs[1] !== undefined) params[route.param] = decodeURIComponent(segs[1]);
    (queryPart || '').split('&').filter(Boolean).forEach(kv => {
      const [k, v] = kv.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { route, params };
  }

  function setActiveNav(navId) {
    document.querySelectorAll('#nav a').forEach(a => {
      a.classList.toggle('is-active', a.dataset.nav === navId);
    });
  }

  function render() {
    if (!season) return;
    const { route, params } = parseHash();
    const main = document.getElementById('view');
    U.clear(main);
    setActiveNav(route.nav);

    if (season.loadError && route.view !== 'settings') {
      main.appendChild(U.banner(el('span', {}, [
        season.loadError + ' ',
        el('a', { href: '#/settings' }, '檢查設定')
      ]), 'error'));
    }
    if (season.warnings.length && (route.view === 'overview' || route.view === 'settings')) {
      main.appendChild(U.banner(el('span', {}, [
        el('strong', { text: '資料有 ' + season.warnings.length + ' 項需要確認：' }),
        ' ' + season.warnings.join('　'),
        ' ',
        el('a', { href: '#/settings' }, '看資料健檢')
      ]), 'error'));
    }

    const fn = window.SBViews[route.view];
    if (!fn) { main.appendChild(U.empty('找不到這個頁面')); return; }
    try {
      main.appendChild(fn(season, params));
    } catch (err) {
      console.error(err);
      main.appendChild(U.banner('這個頁面在繪製時出錯：' + err.message, 'error'));
    }
    document.title = season.cfg.teamName + ' 打擊紀錄';
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------ 啟動 */

  function boot() {
    buildHeader();
    const main = document.getElementById('view');
    main.appendChild(el('div', { class: 'empty', text: '正在載入資料…' }));

    window.SBData.load().then(s => {
      season = s;
      buildHeader();
      render();
    }).catch(err => {
      console.error(err);
      U.clear(main);
      main.appendChild(U.banner(el('span', {}, [
        el('strong', { text: '資料載入失敗：' }), err.message,
        el('br'),
        '若是直接用 file:// 開啟這個檔案，瀏覽器會擋住讀取本機 CSV。請改用本機伺服器（例如在專案目錄執行 ',
        el('code', { text: 'python3 -m http.server 8000' }),
        ' 後開 http://localhost:8000/），或在設定頁改接 Google Sheet。'
      ]), 'error'));
    });

    window.addEventListener('hashchange', render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
