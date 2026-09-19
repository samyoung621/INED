/*
 * 記錄：現場用手機逐打席輸入。
 *
 * 輸入的內容先存在瀏覽器（localStorage），比賽中途重新整理不會消失；
 * 結束後匯出成 CSV，直接貼回 Google Sheet 的「打席」分頁即可。
 */
window.SBViews = window.SBViews || {};

window.SBViews.record = (function () {
  const PA_KEY = 'sb.pending.pa.v1';
  const GAME_KEY = 'sb.pending.games.v1';
  const PA_COLS = ['場次', '局數', '背號', '棒次', '結果', '打點', '得分', '盜壘', '盜壘失敗', '得點圈', '備註'];
  const GAME_COLS = ['場次', '日期', '對手', '場地', '我方得分', '對方得分', '備註'];

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { return []; }
  }
  function write(key, val) {
    // 無痕視窗、封鎖第三方儲存、容量滿了都會丟例外，不能讓它中斷記錄流程
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn('無法寫入瀏覽器儲存空間', e);
      return false;
    }
  }

  return function (season) {
    const U = window.SBUi, S = window.SBStats, el = U.el;
    const frag = document.createDocumentFragment();

    let pending = read(PA_KEY);
    let newGames = read(GAME_KEY);

    const allGames = season.games.concat(newGames.map(g => ({
      id: g['場次'], date: g['日期'], opponent: g['對手'], venue: g['場地'], note: g['備註'], pendingNew: true
    })));

    const state = {
      gameId: (pending.length && pending[pending.length - 1]['場次']) ||
              (allGames.length ? allGames[allGames.length - 1].id : ''),
      inning: (pending.length && Number(pending[pending.length - 1]['局數'])) || 1,
      playerId: '',
      order: (pending.length && Number(pending[pending.length - 1]['棒次']) + 1) || 1,
      rbi: 0, runs: 0, sb: 0, cs: 0, risp: false, note: ''
    };

    frag.appendChild(el('div', { class: 'page-head' }, [
      el('h1', { text: '記錄打席' }),
      el('p', { text: '選好比賽與打者後點一下打席結果即可送出。資料先存在這台裝置，結束後匯出 CSV 貼回 Google Sheet。' })
    ]));

    const host = el('div');
    frag.appendChild(host);

    /* ------------------------------------------------------- 新增比賽 */

    function newGameCard() {
      const f = { date: new Date().toISOString().slice(0, 10), opponent: '', venue: '', note: '', id: '' };
      const inputs = {};
      const mk = (key, label, type, placeholder) => {
        const input = el('input', {
          type: type || 'text', value: f[key], placeholder: placeholder || '',
          oninput: e => { f[key] = e.target.value; }
        });
        inputs[key] = input;
        return el('label', { class: 'field' }, [el('span', { text: label }), input]);
      };

      const body = el('div', {}, [
        el('div', { class: 'form-grid' }, [
          mk('date', '日期', 'date'),
          mk('opponent', '對手', 'text', '例：紅葉隊'),
          mk('venue', '場地', 'text', '例：青年公園壘球場'),
          mk('note', '賽事', 'text', '例：春季聯賽'),
          mk('id', '場次代號（留空自動產生）', 'text', '例：G10')
        ]),
        el('div', { class: 'controls', style: 'margin:12px 0 0' }, [
          el('button', {
            class: 'btn btn--primary', type: 'button',
            onclick: () => {
              if (!f.opponent.trim()) { alert('請先填對手'); return; }
              const id = f.id.trim() || autoGameId();
              if (allGames.some(g => g.id === id)) { alert('場次代號「' + id + '」已經存在'); return; }
              newGames.push({
                '場次': id, '日期': f.date, '對手': f.opponent.trim(), '場地': f.venue.trim(),
                '我方得分': '', '對方得分': '', '備註': f.note.trim()
              });
              write(GAME_KEY, newGames);
              allGames.push({ id: id, date: f.date, opponent: f.opponent.trim(), venue: f.venue.trim(), note: f.note.trim(), pendingNew: true });
              state.gameId = id; state.inning = 1; state.order = 1;
              render();
            }
          }, '建立比賽'),
          el('span', { class: 'note muted', text: '新比賽也會一起匯出成「比賽」分頁的 CSV' })
        ])
      ]);
      return U.card('新增比賽', null, body);
    }

    function autoGameId() {
      let n = allGames.length + 1;
      let id;
      do { id = 'G' + String(n).padStart(2, '0'); n++; } while (allGames.some(g => g.id === id));
      return id;
    }

    /* --------------------------------------------------------- 輸入區 */

    function inputCard() {
      const roster = season.players.filter(p => p.active);
      const lineup = lineupFor(state.gameId);

      const gameSelect = el('select', {
        'aria-label': '比賽',
        onchange: e => { state.gameId = e.target.value; state.inning = 1; state.order = 1; render(); }
      }, allGames.length
        ? allGames.map(g => el('option', { value: g.id, selected: g.id === state.gameId },
            (g.date || g.id) + ' vs ' + g.opponent + (g.pendingNew ? '（新）' : '')))
        : [el('option', { value: '' }, '尚無比賽，請先新增')]);

      const playerSelect = el('select', {
        'aria-label': '打者',
        onchange: e => {
          state.playerId = e.target.value;
          const seen = lineup.find(x => String(x.id) === String(state.playerId));
          if (seen) state.order = seen.order;
          else if (!hasCycled(state.gameId)) state.order = lineup.length + 1;  // 第一輪：接在名單後面
        }
      }, [el('option', { value: '' }, '選擇打者')].concat(roster.map(p =>
        el('option', { value: p.id, selected: String(p.id) === String(state.playerId) },
          (p.number ? '#' + p.number + ' ' : '') + p.name))));

      const num = (key, label, min) => el('label', { class: 'field' }, [
        el('span', { text: label }),
        el('input', {
          type: 'number', min: min === undefined ? 0 : min, max: 10, step: 1, value: state[key],
          oninput: e => { state[key] = Number(e.target.value) || 0; }
        })
      ]);

      const rispBox = el('input', {
        type: 'checkbox', checked: state.risp,
        onchange: e => { state.risp = e.target.checked; }
      });

      const noteInput = el('input', {
        type: 'text', value: state.note, placeholder: '例：反方向強勁平飛',
        oninput: e => { state.note = e.target.value; }
      });

      // 結果按鈕：依安打 / 上壘 / 出局 / 犧牲分組，現場好按
      const GROUPS = [
        { name: '安打', codes: ['1B', '2B', '3B', 'HR'] },
        { name: '上壘', codes: ['BB', 'IBB', 'HBP', 'E', 'CI'] },
        { name: '出局', codes: ['K', 'GO', 'FO', 'LO', 'FC', 'DP'] },
        { name: '犧牲', codes: ['SF', 'SH'] }
      ];
      const buttons = el('div', {}, GROUPS.map(g => el('div', { style: 'margin-bottom:8px' }, [
        el('div', { class: 'note muted', style: 'margin-bottom:4px', text: g.name }),
        el('div', { class: 'controls', style: 'margin:0;gap:6px' }, g.codes.map(code =>
          el('button', {
            class: 'btn', type: 'button', title: S.OUTCOMES[code].label,
            onclick: () => submit(code)
          }, S.OUTCOMES[code].label)
        ))
      ])));

      const body = el('div', {}, [
        el('div', { class: 'form-grid' }, [
          el('label', { class: 'field' }, [el('span', { text: '比賽' }), gameSelect]),
          el('label', { class: 'field' }, [el('span', { text: '打者' }), playerSelect]),
          el('label', { class: 'field' }, [
            el('span', { text: '局數' }),
            el('input', {
              type: 'number', min: 1, max: 30, step: 1, value: state.inning,
              oninput: e => { state.inning = Number(e.target.value) || 1; }
            })
          ]),
          el('label', { class: 'field' }, [
            el('span', { text: '棒次' }),
            el('input', {
              type: 'number', min: 1, max: 15, step: 1, value: state.order,
              oninput: e => { state.order = Number(e.target.value) || 1; }
            })
          ]),
          num('rbi', '打點'),
          num('runs', '得分'),
          num('sb', '盜壘'),
          num('cs', '盜壘失敗')
        ]),
        el('div', { class: 'controls', style: 'margin:12px 0 4px' }, [
          el('label', { style: 'display:flex;align-items:center;gap:6px;font-size:13px' }, [rispBox, '得點圈有人']),
          el('label', { class: 'field', style: 'flex:1;min-width:180px' }, [el('span', { text: '備註' }), noteInput])
        ]),
        el('div', { style: 'border-top:1px solid var(--grid);margin:12px 0 10px' }),
        buttons
      ]);

      return U.card('輸入打席', state.gameId ? '點結果按鈕即送出' : '請先選擇或新增比賽', body);
    }

    /** 這場已記錄的打序名單（用來自動接下一棒）。 */
    function lineupFor(gameId) {
      const seen = new Map();
      pending.filter(r => r['場次'] === gameId).forEach(r => {
        if (!seen.has(r['背號'])) seen.set(r['背號'], { id: r['背號'], order: Number(r['棒次']) || 0 });
      });
      season.atbats.filter(pa => pa.gameId === gameId).forEach(pa => {
        if (!seen.has(String(pa.playerId))) seen.set(String(pa.playerId), { id: String(pa.playerId), order: pa.order });
      });
      return [...seen.values()].sort((a, b) => a.order - b.order);
    }

    /** 這場是否已經有人打過第二次 —— 代表打序跑完一輪了。 */
    function hasCycled(gameId) {
      const count = new Map();
      const bump = id => count.set(String(id), (count.get(String(id)) || 0) + 1);
      pending.filter(r => r['場次'] === gameId).forEach(r => bump(r['背號']));
      season.atbats.filter(pa => pa.gameId === gameId).forEach(pa => bump(pa.playerId));
      return [...count.values()].some(n => n >= 2);
    }

    function submit(code) {
      if (!state.gameId) { alert('請先選擇比賽'); return; }
      if (!state.playerId) { alert('請先選擇打者'); return; }

      pending.push({
        '場次': state.gameId,
        '局數': state.inning,
        '背號': state.playerId,
        '棒次': state.order,
        '結果': code,
        '打點': state.rbi,
        '得分': state.runs,
        '盜壘': state.sb,
        '盜壘失敗': state.cs,
        '得點圈': state.risp ? 'Y' : '',
        '備註': state.note
      });
      write(PA_KEY, pending);

      // 接下一棒。打序第一輪還沒跑完時不能繞回第一棒，否則棒次會錯，
      // 這時候只把棒次加一並清掉打者，由記錄的人挑下一位。
      const lineup = lineupFor(state.gameId);
      const i = lineup.findIndex(x => String(x.id) === String(state.playerId));
      if (hasCycled(state.gameId) && lineup.length > 1 && i >= 0) {
        const next = lineup[(i + 1) % lineup.length];
        state.playerId = next.id;
        state.order = next.order || state.order + 1;
      } else if (i >= 0 && i < lineup.length - 1) {
        const next = lineup[i + 1];
        state.playerId = next.id;
        state.order = next.order || state.order + 1;
      } else {
        state.playerId = '';
        state.order = state.order + 1;
      }
      state.rbi = 0; state.runs = 0; state.sb = 0; state.cs = 0; state.risp = false; state.note = '';
      render();
    }

    /* ----------------------------------------------- 本場即時統計 */

    function liveCard() {
      const rows = pending.filter(r => r['場次'] === state.gameId);
      const existing = season.atbats.filter(pa => pa.gameId === state.gameId);
      const converted = rows.map(r => ({
        code: S.normalizeOutcome(r['結果']), gameId: r['場次'], playerId: r['背號'],
        rbi: r['打點'], runs: r['得分'], sb: r['盜壘'], cs: r['盜壘失敗'], risp: r['得點圈'] === 'Y'
      }));
      const combined = existing.concat(converted);
      if (!combined.length) return null;

      const t = S.summarize(combined);
      const byPlayer = S.groupBy(combined, pa => pa.playerId);
      const lines = [...byPlayer.values()].map(v => {
        const row = season.rowByPlayer.get(String(v.key));
        return {
          name: row ? row.player.name : String(v.key),
          id: v.key,
          stats: v.stats,
          chips: combined.filter(pa => String(pa.playerId) === String(v.key)).map(pa => pa.code)
        };
      });

      return U.card(
        '本場即時統計',
        rows.length + ' 筆待匯出' + (existing.length ? '（已含 Sheet 上的 ' + existing.length + ' 筆）' : ''),
        el('div', {}, [
          U.tiles([
            { label: '團隊打擊率', value: S.fmtRate3(t.AVG), hero: true, note: t.H + ' 安打 / ' + t.AB + ' 打數' },
            { label: '打席', value: S.fmtInt(t.PA) },
            { label: '打點', value: S.fmtInt(t.RBI) },
            { label: '四壞 / 三振', value: (t.BB + t.IBB) + ' / ' + t.K },
            { label: '長打', value: S.fmtInt(t.XBH), note: '全壘打 ' + t.HR }
          ]),
          U.table({
            sticky: 1,
            columns: [
              { key: 'name', label: '球員', text: true },
              { key: 'AB', label: '打數', value: r => r.stats.AB },
              { key: 'H', label: '安打', value: r => r.stats.H },
              { key: 'RBI', label: '打點', value: r => r.stats.RBI },
              { key: 'AVG', label: '打擊率', value: r => r.stats.AVG, format: 'rate3' },
              { key: 'chips', label: '逐打席', text: true, sortable: false, value: () => '',
                render: r => el('span', { class: 'pa-list' }, r.chips.map(c => U.paChip(c))) }
            ],
            rows: lines,
            sort: { key: 'AB', dir: 'desc' }
          })
        ])
      );
    }

    /* ------------------------------------------------- 待匯出清單 */

    function pendingCard() {
      if (!pending.length) {
        return U.card('待匯出資料', null, U.empty('還沒有輸入任何打席'));
      }
      const rows = pending.map((r, i) => Object.assign({ _i: i }, r));
      const body = el('div', {}, [
        U.table({
          maxHeight: '44vh',
          columns: [
            { key: '場次', label: '場次', text: true },
            { key: '局數', label: '局', value: r => Number(r['局數']) },
            { key: '背號', label: '背號', text: true,
              render: r => {
                const row = season.rowByPlayer.get(String(r['背號']));
                return row ? row.player.name : r['背號'];
              } },
            { key: '棒次', label: '棒次', value: r => Number(r['棒次']) },
            { key: '結果', label: '結果', text: true,
              render: r => U.paChip(S.normalizeOutcome(r['結果'])) },
            { key: '打點', label: '打點', value: r => Number(r['打點']) },
            { key: '得分', label: '得分', value: r => Number(r['得分']) },
            { key: '盜壘', label: '盜壘', value: r => Number(r['盜壘']) },
            { key: '得點圈', label: '得點圈', text: true },
            { key: '備註', label: '備註', text: true, sortable: false },
            { key: '_del', label: '', text: true, sortable: false,
              render: r => el('button', {
                class: 'btn btn--sm', type: 'button', title: '刪除這筆',
                onclick: ev => {
                  ev.stopPropagation();
                  pending.splice(r._i, 1);
                  write(PA_KEY, pending);
                  render();
                }
              }, '刪除') }
          ],
          rows: rows
        }),
        el('div', { class: 'controls', style: 'margin:12px 0 0' }, [
          el('button', {
            class: 'btn', type: 'button',
            onclick: () => {
              if (!pending.length) return;
              pending.pop(); write(PA_KEY, pending); render();
            }
          }, '復原最後一筆'),
          el('button', {
            class: 'btn', type: 'button',
            onclick: () => {
              if (!confirm('確定要清空全部待匯出資料？此動作無法復原。')) return;
              pending = []; newGames = [];
              write(PA_KEY, pending); write(GAME_KEY, newGames);
              render();
            }
          }, '清空全部')
        ])
      ]);
      return U.card('待匯出資料', pending.length + ' 個打席' + (newGames.length ? ' · ' + newGames.length + ' 場新比賽' : ''), body);
    }

    /* ----------------------------------------------------- 匯出區 */

    function exportCard() {
      if (!pending.length && !newGames.length) return null;

      function block(title, cols, rows, filename) {
        if (!rows.length) return null;
        const csv = window.SBCsv.stringify(rows, cols);
        const ta = el('textarea', { rows: Math.min(12, rows.length + 2), readonly: true, spellcheck: 'false' }, csv);
        return el('div', { style: 'margin-bottom:14px' }, [
          el('div', { class: 'note', style: 'margin-bottom:6px' }, [
            el('strong', { text: title }),
            el('span', { class: 'muted', text: '　' + rows.length + ' 列' })
          ]),
          ta,
          el('div', { class: 'controls', style: 'margin:8px 0 0' }, [
            el('button', {
              class: 'btn btn--primary btn--sm', type: 'button',
              onclick: e => {
                ta.select();
                const done = () => { e.target.textContent = '已複製 ✓'; setTimeout(() => { e.target.textContent = '複製'; }, 1600); };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(csv).then(done, () => { document.execCommand('copy'); done(); });
                } else { document.execCommand('copy'); done(); }
              }
            }, '複製'),
            el('button', {
              class: 'btn btn--sm', type: 'button',
              onclick: () => U.download(filename, csv)
            }, '下載 CSV')
          ])
        ]);
      }

      return U.card('匯出並貼回 Google Sheet', '貼上時請對齊到最後一列的下一列，不要連表頭一起貼', el('div', {}, [
        block('打席分頁', PA_COLS, pending, '打席.csv'),
        block('比賽分頁（新增的比賽）', GAME_COLS, newGames, '比賽.csv'),
        el('div', { class: 'note muted' },
          '貼完並確認 Sheet 已更新後，再回來按「清空全部」，避免重複計算。')
      ]));
    }

    /* ------------------------------------------------------- 繪製 */

    function render() {
      U.clear(host);
      if (season.source.mode === 'demo') {
        host.appendChild(U.banner(el('span', {}, [
          '下面的球員名單與比賽是示範用的。記錄功能本身照樣可用，',
          '匯出的 CSV 貼到你自己的 Sheet 就行。'
        ])));
      }
      host.appendChild(inputCard());
      const live = liveCard();
      if (live) host.appendChild(live);
      host.appendChild(pendingCard());
      const ex = exportCard();
      if (ex) host.appendChild(ex);
      host.appendChild(newGameCard());
    }

    render();
    return frag;
  };
})();
