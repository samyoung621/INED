/* 總覽：球隊戰績、團隊打擊成績、各項排行前段、打席結果分佈。 */
window.SBViews = window.SBViews || {};
window.SBViews.overview = function (season) {
  const U = window.SBUi, C = window.SBCharts, S = window.SBStats, el = U.el;
  const frag = document.createDocumentFragment();
  const t = season.team;
  const rec = season.record;

  frag.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: season.cfg.teamName + '　' + season.cfg.seasonName + '打擊成績' }),
    el('p', { text: rec.played + ' 場出賽 · ' + t.PA + ' 個打席 · 規定打席 ' + season.minPA + ' 以上列入率值排名' })
  ]));

  /* ----------------------------------------------------- 戰績與團隊成績 */

  frag.appendChild(U.tiles([
    { label: '戰績（勝-敗-和）', value: rec.W + '-' + rec.L + '-' + rec.T, hero: true,
      note: rec.winPct === null ? '尚無勝負' : '勝率 ' + S.fmtRate3(rec.winPct) },
    { label: '得分 / 失分', value: rec.runsFor + ' / ' + rec.runsAgainst,
      note: (rec.runsFor - rec.runsAgainst >= 0 ? '+' : '') + (rec.runsFor - rec.runsAgainst) + ' 分差' },
    { label: '團隊打擊率', value: S.fmtRate3(t.AVG), note: t.H + ' 安打 / ' + t.AB + ' 打數' },
    { label: '團隊上壘率', value: S.fmtRate3(t.OBP), note: t.BB + t.IBB + ' 四壞 · ' + t.HBP + ' 觸身' },
    { label: '團隊長打率', value: S.fmtRate3(t.SLG), note: t.TB + ' 壘打數' },
    { label: '團隊 OPS', value: S.fmtRate3(t.OPS), note: '純長打率 ' + S.fmtRate3(t.ISO) },
    { label: '全壘打', value: S.fmtInt(t.HR), note: '長打 ' + t.XBH + ' 支' },
    { label: '打點 / 得分', value: t.RBI + ' / ' + t.R, note: '盜壘 ' + t.SB + ' 次' },
    { label: '三振率 / 四壞率', value: S.fmtPct1(t.Kpct) + ' / ' + S.fmtPct1(t.BBpct), note: t.K + ' 三振 · ' + (t.BB + t.IBB) + ' 四壞' }
  ]));

  /* ----------------------------------------------------------- 排行前段 */

  const minPA = season.minPA;
  const leaderCards = [
    { key: 'AVG', label: '打擊率', format: S.fmtRate3, qualified: true },
    { key: 'OPS', label: 'OPS', format: S.fmtRate3, qualified: true },
    { key: 'H', label: '安打', format: S.fmtInt, qualified: false },
    { key: 'RBI', label: '打點', format: S.fmtInt, qualified: false }
  ].map(cat => {
    const top = S.rank(season.rows, cat.key, { minPA: minPA, limit: 5 });
    const body = top.length
      ? C.leaderBars(top.map(r => ({
          rank: r.rank, value: r.stats[cat.key], link: U.playerLink(r.player)
        })), cat.format)
      : U.empty('尚無符合條件的球員');
    return U.card(cat.label + '　前 5 名', cat.qualified ? '規定打席 ' + minPA + ' 以上' : '全隊', body);
  });
  frag.appendChild(el('div', { class: 'grid grid--3' }, leaderCards));

  /* -------------------------------------------------- 團隊打擊率走勢 */

  const progPoints = season.byGame
    .filter(e => e.stats.AB > 0)
    .map(e => ({
      label: e.game.date ? e.game.date.slice(5) : 'G' + e.game.seq,
      value: e.cumulative.AVG,
      sub: 'vs ' + e.game.opponent + '　單場 ' + S.fmtRate3(e.stats.AVG) + '（' + e.stats.H + '/' + e.stats.AB + '）'
    }));

  const trendCard = U.card(
    '團隊累計打擊率走勢',
    '逐場累計，滑過看單場成績',
    C.lineChart({
      points: progPoints,
      format: S.fmtRate3,
      valueLabel: '累計打擊率',
      label: '團隊累計打擊率逐場走勢',
      height: 230
    })
  );

  /* ------------------------------------------------------ 打席結果分佈 */

  const GROUPS = ['安打', '上壘', '出局・犧牲'];
  const groupOf = code => {
    const g = S.OUTCOMES[code].group;
    return g === 'safe' ? '安打' : g === 'on' ? '上壘' : '出局・犧牲';
  };
  const distItems = Object.keys(S.OUTCOMES)
    .filter(code => season.distribution[code] > 0)
    .map(code => ({
      label: S.OUTCOMES[code].label,
      value: season.distribution[code],
      group: groupOf(code),
      sub: S.fmtPct1(season.distribution[code] / t.PA) + ' 的打席'
    }))
    .sort((a, b) => b.value - a.value);

  const distCard = U.card(
    '打席結果分佈',
    t.PA + ' 個打席',
    C.barChart({
      items: distItems,
      groups: GROUPS,
      format: S.fmtInt,
      valueLabel: '次數',
      label: '各種打席結果出現次數'
    })
  );

  frag.appendChild(el('div', { class: 'grid grid--2' }, [trendCard, distCard]));

  /* -------------------------------------------------------- 最近比賽 */

  const recent = season.byGame.slice(-5).reverse();
  if (recent.length) {
    frag.appendChild(U.card('最近比賽', null, U.table({
      sticky: 1,
      columns: [
        { key: 'date', label: '日期', text: true, value: r => r.game.date,
          render: r => el('a', { href: '#/game/' + encodeURIComponent(r.game.id) }, r.game.date || r.game.id) },
        { key: 'opponent', label: '對手', text: true, value: r => r.game.opponent },
        { key: 'score', label: '比分', value: r => r.game.runsFor,
          render: r => r.game.result ? (r.game.runsFor + ' : ' + r.game.runsAgainst) : '-' },
        { key: 'result', label: '結果', value: r => r.game.result, render: r => U.resultBadge(r.game.result) },
        { key: 'avg', label: '打擊率', value: r => r.stats.AVG, format: 'rate3' },
        { key: 'h', label: '安打', value: r => r.stats.H },
        { key: 'ab', label: '打數', value: r => r.stats.AB },
        { key: 'rbi', label: '打點', value: r => r.stats.RBI },
        { key: 'hr', label: '全壘打', value: r => r.stats.HR }
      ],
      rows: recent,
      onRowClick: r => { location.hash = '#/game/' + encodeURIComponent(r.game.id); }
    })));
  }

  return frag;
};
