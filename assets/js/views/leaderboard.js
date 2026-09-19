/* 排行榜：選一個項目，看長條圖與完整名次表。 */
window.SBViews = window.SBViews || {};
window.SBViews.leaderboard = function (season, params) {
  const U = window.SBUi, C = window.SBCharts, S = window.SBStats, el = U.el;
  const frag = document.createDocumentFragment();

  const state = {
    key: (params && params.cat) || 'AVG',
    qualifiedOnly: !(params && params.all === '1')
  };
  if (!S.CATEGORIES.some(c => c.key === state.key)) state.key = 'AVG';

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: '排行榜' }),
    el('p', { text: '率值類項目預設只列入規定打席（' + season.minPA + ' 打席）以上的球員；累計類項目全隊都排。' })
  ]));

  const controls = el('div', { class: 'controls' });
  const select = el('select', {
    'aria-label': '排行項目',
    onchange: e => { state.key = e.target.value; render(); }
  }, S.CATEGORIES.map(c => el('option', { value: c.key, selected: c.key === state.key }, c.label)));
  controls.appendChild(el('label', { for: 'cat' }, '項目'));
  controls.appendChild(select);
  const toggleHost = el('span');
  controls.appendChild(toggleHost);
  frag.appendChild(controls);

  const host = el('div');
  frag.appendChild(host);

  function render() {
    const cat = S.CATEGORIES.find(c => c.key === state.key);
    const fmt = v => S.format(v, cat.format);
    const minPA = cat.qualified && state.qualifiedOnly ? season.minPA : 0;
    const ranked = S.rank(season.rows, cat.key, { minPA: minPA });

    U.clear(toggleHost);
    if (cat.qualified) {
      toggleHost.appendChild(U.seg(
        [{ label: '符合規定打席', value: true }, { label: '全部球員', value: false }],
        state.qualifiedOnly,
        v => { state.qualifiedOnly = v; render(); }
      ));
    } else {
      toggleHost.appendChild(el('span', { class: 'note muted', text: '累計類項目不設打席門檻' }));
    }

    U.clear(host);
    if (!ranked.length) {
      host.appendChild(U.card(cat.label, null, U.empty('沒有符合條件的球員')));
      return;
    }

    // 前 15 名長條圖（單一量測 → 單色；每根都有直接標籤）
    host.appendChild(U.card(
      cat.label + '　前 ' + Math.min(15, ranked.length) + ' 名',
      cat.dir === 'asc' ? '數值越低越好' : null,
      C.barChart({
        items: ranked.slice(0, 15).map(r => ({
          label: r.player.name,
          value: r.stats[cat.key],
          sub: '第 ' + r.rank + ' 名 · ' + r.stats.PA + ' 打席'
        })),
        format: fmt,
        valueLabel: cat.label,
        label: cat.label + '排行長條圖'
      })
    ));

    // 完整名次表（同時也是圖表的表格檢視）
    host.appendChild(U.card('完整名次', ranked.length + ' 人上榜', U.table({
      sticky: 2,
      sort: null,
      columns: [
        { key: 'rank', label: '#', value: r => r.rank, sortable: false,
          render: r => el('span', { class: 'rank-cell' + (r.rank <= 3 ? ' rank-cell--top' : ''), text: r.rank }) },
        { key: 'name', label: '球員', text: true, value: r => r.player.name, render: r => U.playerLink(r.player) },
        // 選中的項目放在最前面；下面的固定欄位若重複會被濾掉
        { key: 'value', label: cat.label, value: r => r.stats[cat.key], format: cat.format },
        { key: 'PA', label: '打席', value: r => r.stats.PA },
        { key: 'AB', label: '打數', value: r => r.stats.AB },
        { key: 'H', label: '安打', value: r => r.stats.H },
        { key: 'HR', label: '全壘打', value: r => r.stats.HR },
        { key: 'RBI', label: '打點', value: r => r.stats.RBI },
        { key: 'AVG', label: '打擊率', value: r => r.stats.AVG, format: 'rate3' },
        { key: 'OPS', label: 'OPS', value: r => r.stats.OPS, format: 'rate3' },
        { key: 'games', label: '出賽', value: r => r.stats.games }
      ].filter(c => c.key !== cat.key),
      rows: ranked,
      onRowClick: r => { location.hash = '#/player/' + encodeURIComponent(r.player.id); }
    })));

    // 其他項目的前三名，方便一眼掃過
    const quick = S.CATEGORIES.filter(c => c.key !== cat.key).map(c => {
      const top = S.rank(season.rows, c.key, { minPA: c.qualified ? season.minPA : 0, limit: 3 });
      if (!top.length) return null;
      return el('div', {}, [
        el('div', { class: 'card__title', style: 'margin-bottom:6px', text: c.label }),
        C.leaderBars(top.map(r => ({ rank: r.rank, value: r.stats[c.key], link: U.playerLink(r.player) })),
          v => S.format(v, c.format))
      ]);
    }).filter(Boolean);
    host.appendChild(U.card('其他項目前三名', null, el('div', { class: 'grid grid--3' }, quick)));
  }

  render();
  return frag;
};
