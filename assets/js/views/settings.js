/* 設定：接上 Google Sheet、球隊名稱、排行門檻。設定存在瀏覽器。 */
window.SBViews = window.SBViews || {};
window.SBViews.settings = function (season) {
  const U = window.SBUi, el = U.el;
  const frag = document.createDocumentFragment();
  const cfg = window.SBConfig.load();

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: '設定' }),
    el('p', { text: '這些設定存在這台裝置的瀏覽器裡。要讓全隊都看到同一份設定，請改 assets/js/config.js 的預設值。' })
  ]));

  frag.appendChild(U.banner(el('span', {}, [
    el('strong', { text: '目前資料來源：' }), season.source.label,
    season.loadError ? el('span', { style: 'color:var(--critical)', text: '　' + season.loadError }) : null
  ]), season.loadError ? 'error' : null));

  const totalsMode = season.granularity === 'totals';
  const form = {};
  function field(key, label, hint, type, value) {
    const input = el('input', { type: type || 'text', value: value === undefined ? (cfg[key] || '') : value });
    form[key] = input;
    return el('label', { class: 'field' }, [
      el('span', { text: label }),
      input,
      hint ? el('span', { class: 'muted', style: 'font-size:11.5px', text: hint }) : null
    ]);
  }

  /* ------------------------------------------------------ 球隊資訊 */

  frag.appendChild(U.card('球隊資訊', null, el('div', { class: 'form-grid' }, [
    field('teamName', '球隊名稱'),
    field('seasonName', '球季名稱', '例：2026 春季'),
    field('qualifyingAB', '規定打數（累計成績模式）', '率值排行的門檻，目前為 ' + (totalsMode ? season.minPA : cfg.qualifyingAB) + ' 打數', 'number'),
    field('qualifyingPAPerGame', '規定打席係數（逐打席模式）', '規定打席 = 場次 × 這個數字', 'number'),
    field('recentGames', '「近況」場數', '球員頁的近況看最後幾場', 'number')
  ])));

  /* ------------------------------------------------- Google Sheet */

  const modeHost = el('div');
  let mode = cfg.mode;
  function renderMode() {
    U.clear(modeHost);
    modeHost.appendChild(U.seg(
      [
        { label: '球季累計成績', value: 'totals' },
        { label: '逐打席（三分頁）', value: 'sheet' },
        { label: '示範資料', value: 'demo' }
      ],
      mode, v => { mode = v; renderMode(); }
    ));
    modeHost.appendChild(el('p', { class: 'note muted', style: 'margin:8px 0 0' }, {
      totals: '每位球員一列的加總成績。上手最快，但沒有逐場走勢、得分、盜壘與逐打席。',
      sheet: '三個分頁（球員／比賽／打席），一列一個打席。所有數據與走勢都算得出來。',
      demo: '用專案內的示範資料，不連任何試算表。'
    }[mode]));
  }
  renderMode();

  frag.appendChild(U.card('資料來源', null, el('div', {}, [
    el('div', { class: 'controls' }, [el('span', { class: 'note', text: '模式' }), modeHost]),
    el('div', { class: 'form-grid' }, [
      field('sheetId', 'Google Sheet ID', '網址 /spreadsheets/d/ 後面那一段'),
      field('tabTotals', '累計成績分頁名稱', '留空代表讀第一個分頁', 'text', cfg.tabs.totals),
      field('tabPlayers', '球員分頁名稱', '逐打席模式用', 'text', cfg.tabs.players),
      field('tabGames', '比賽分頁名稱', '逐打席模式用', 'text', cfg.tabs.games),
      field('tabAtbats', '打席分頁名稱', '逐打席模式用', 'text', cfg.tabs.atbats)
    ]),
    el('p', { class: 'note', style: 'margin:12px 0 6px' }, [
      '用 Sheet ID 的話，該表的共用權限要設成「知道連結的任何人 → 檢視者」。',
      el('br'),
      '若你改用「檔案 → 共用 → 發佈到網路」，把三個分頁各自的 CSV 網址填在下面，會優先使用這些網址。'
    ]),
    el('div', { class: 'form-grid' }, [
      field('urlTotals', '累計成績 CSV 網址', null, 'text', cfg.csvUrls.totals),
      field('urlPlayers', '球員分頁 CSV 網址', null, 'text', cfg.csvUrls.players),
      field('urlGames', '比賽分頁 CSV 網址', null, 'text', cfg.csvUrls.games),
      field('urlAtbats', '打席分頁 CSV 網址', null, 'text', cfg.csvUrls.atbats)
    ]),
    el('div', { class: 'controls', style: 'margin:14px 0 0' }, [
      el('button', {
        class: 'btn btn--primary', type: 'button',
        onclick: () => {
          window.SBConfig.save({
            teamName: form.teamName.value.trim() || window.SBConfig.DEFAULTS.teamName,
            seasonName: form.seasonName.value.trim(),
            qualifyingPAPerGame: Number(form.qualifyingPAPerGame.value) || window.SBConfig.DEFAULTS.qualifyingPAPerGame,
            qualifyingAB: Math.max(1, Number(form.qualifyingAB.value) || window.SBConfig.DEFAULTS.qualifyingAB),
            recentGames: Math.max(1, Number(form.recentGames.value) || window.SBConfig.DEFAULTS.recentGames),
            mode: mode,
            sheetId: form.sheetId.value.trim(),
            tabs: {
              totals: form.tabTotals.value.trim(),
              players: form.tabPlayers.value.trim() || '球員',
              games: form.tabGames.value.trim() || '比賽',
              atbats: form.tabAtbats.value.trim() || '打席'
            },
            csvUrls: {
              totals: form.urlTotals.value.trim(),
              players: form.urlPlayers.value.trim(),
              games: form.urlGames.value.trim(),
              atbats: form.urlAtbats.value.trim()
            }
          });
          location.hash = '#/';
          location.reload();
        }
      }, '儲存並重新載入'),
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          if (!confirm('回復成 config.js 的預設值？（不會刪掉你記錄中的打席）')) return;
          window.SBConfig.reset();
          location.reload();
        }
      }, '回復預設值')
    ])
  ])));

  /* ---------------------------------------------------- 資料健檢 */

  const diag = totalsMode ? [
    ['資料形式', '球季累計成績（每位球員一列）'],
    ['球員名單', season.players.length + ' 人'],
    ['團隊打數 / 安打', season.team.AB + ' / ' + season.team.H],
    ['規定打數', season.minPA + ' 打數'],
    ['算不出來的項目', '打席、得分、盜壘、三振率、四壞率、BABIP、得點圈、逐場走勢']
  ] : [
    ['資料形式', '逐打席紀錄'],
    ['球員名單', season.players.length + ' 人（在隊 ' + season.players.filter(p => p.active).length + ' 人）'],
    ['比賽', season.games.length + ' 場（已記錄比分 ' + season.record.played + ' 場）'],
    ['打席', season.atbats.length + ' 筆'],
    ['無法辨識的打席', season.team.unknown + ' 筆'],
    ['規定打席', season.minPA + ' 打席']
  ];
  frag.appendChild(U.card('資料健檢', null, el('div', {}, [
    el('dl', { class: 'kv' }, diag.reduce((acc, [k, v]) => acc.concat([el('dt', { text: k }), el('dd', { text: v })]), [])),
    season.warnings.length
      ? el('div', { style: 'margin-top:12px' }, season.warnings.map(w => U.banner(w, 'error')))
      : el('p', { class: 'note muted', style: 'margin:12px 0 0', text: '沒有發現對不上的資料。' })
  ])));

  frag.appendChild(U.card('文件', null, el('p', { class: 'note' }, [
    '欄位格式與 Google Sheet 建立步驟寫在 ',
    el('a', { href: 'docs/DATA-FORMAT.md' }, 'docs/DATA-FORMAT.md'),
    '；部署方式見 ',
    el('a', { href: 'docs/SETUP.md' }, 'docs/SETUP.md'),
    '。'
  ])));

  return frag;
};
