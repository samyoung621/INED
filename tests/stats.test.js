/*
 * 打擊數據引擎測試： node --test tests/
 * 用手算的例子驗證每個率值的定義，避免公式寫錯。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/js/stats.js');

/** 依代碼列表產生打席，pa('1B','K',...) */
function pa(...codes) {
  return codes.map((code, i) => ({ code, gameId: 'G1', order: i + 1, rbi: 0, runs: 0 }));
}
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

test('結果代碼正規化：英文、中文全名、簡稱、別名都認得', () => {
  assert.equal(S.normalizeOutcome('1B'), '1B');
  assert.equal(S.normalizeOutcome('一壘安打'), '1B');
  assert.equal(S.normalizeOutcome('一安'), '1B');
  assert.equal(S.normalizeOutcome('安打'), '1B');
  assert.equal(S.normalizeOutcome('hr'), 'HR');
  assert.equal(S.normalizeOutcome('全壘打'), 'HR');
  assert.equal(S.normalizeOutcome('保送'), 'BB');
  assert.equal(S.normalizeOutcome('SO'), 'K');
  assert.equal(S.normalizeOutcome('  三振 '), 'K');
  assert.equal(S.normalizeOutcome('亂打'), null);
  assert.equal(S.normalizeOutcome(''), null);
  assert.equal(S.normalizeOutcome(undefined), null);
});

test('打數排除四壞、觸身、犧牲打與妨礙打擊', () => {
  const t = S.summarize(pa('1B', 'BB', 'IBB', 'HBP', 'SF', 'SH', 'CI', 'K'));
  assert.equal(t.PA, 8);
  assert.equal(t.AB, 2, '只有 1B 與 K 算打數');
  assert.equal(t.H, 1);
  assert.equal(t.BB, 1);
  assert.equal(t.IBB, 1);
  assert.equal(t.HBP, 1);
  assert.equal(t.SF, 1);
  assert.equal(t.SH, 1);
});

test('失誤上壘算打數但不算安打', () => {
  const t = S.summarize(pa('E', 'E', '1B'));
  assert.equal(t.AB, 3);
  assert.equal(t.H, 1);
  close(t.AVG, 1 / 3, 'AVG');
});

test('壘打數：一安1、二安2、三安3、全打4', () => {
  const t = S.summarize(pa('1B', '2B', '3B', 'HR'));
  assert.equal(t.TB, 1 + 2 + 3 + 4);
  assert.equal(t.H, 4);
  assert.equal(t.XBH, 3, '長打 = 二安+三安+全打');
  close(t.SLG, 10 / 4, 'SLG');
  close(t.AVG, 1, 'AVG');
  close(t.ISO, 10 / 4 - 1, 'ISO');
});

test('上壘率分母含犧牲飛球，不含犧牲打與妨礙打擊', () => {
  // 10 打數 3 安打 / 2 四壞 / 1 觸身 / 1 犧飛 / 1 犧打
  const list = pa('1B', '2B', 'HR', 'K', 'K', 'GO', 'FO', 'LO', 'DP', 'FC',
                  'BB', 'BB', 'HBP', 'SF', 'SH');
  const t = S.summarize(list);
  assert.equal(t.AB, 10);
  assert.equal(t.H, 3);
  assert.equal(t.PA, 15);
  close(t.OBP, (3 + 2 + 1) / (10 + 2 + 1 + 1), 'OBP 分母 = AB+BB+HBP+SF = 14');
  close(t.AVG, 3 / 10, 'AVG');
  close(t.OPS, t.OBP + t.SLG, 'OPS = OBP + SLG');
  assert.equal(t.TOB, 6, '上壘次數 = H+BB+HBP');
});

test('三振率與四壞率的分母是打席', () => {
  const t = S.summarize(pa('K', 'K', 'BB', 'IBB', '1B', 'GO', 'SH', 'SF'));
  assert.equal(t.PA, 8);
  close(t.Kpct, 2 / 8, '三振率');
  close(t.BBpct, 2 / 8, '四壞率含故意四壞');
});

test('BABIP 排除三振與全壘打，加回犧牲飛球', () => {
  const t = S.summarize(pa('1B', 'HR', 'K', 'GO', 'FO', 'SF'));
  assert.equal(t.AB, 5);
  close(t.BABIP, (2 - 1) / (5 - 1 - 1 + 1), 'BABIP');
});

test('分母為 0 時回傳 null，不是 0 也不是 NaN', () => {
  const walksOnly = S.summarize(pa('BB', 'BB', 'HBP'));
  assert.equal(walksOnly.AB, 0);
  assert.equal(walksOnly.AVG, null, '沒有打數就沒有打擊率');
  assert.equal(walksOnly.SLG, null);
  assert.equal(walksOnly.OPS, null, 'SLG 為 null 時 OPS 也是 null');
  close(walksOnly.OBP, 3 / 3, '全部保送 → 上壘率 1.000');

  const empty = S.summarize([]);
  assert.equal(empty.PA, 0);
  assert.equal(empty.AVG, null);
  assert.equal(empty.OBP, null);
});

test('無法辨識的結果被計入 unknown，不汙染打席數', () => {
  const t = S.summarize([{ code: null, gameId: 'G1' }, { code: '亂碼', gameId: 'G1' }, { code: '1B', gameId: 'G1' }]);
  assert.equal(t.PA, 1);
  assert.equal(t.unknown, 2);
});

test('打點、得分、盜壘直接加總；出賽數由不重複比賽算出', () => {
  const list = [
    { code: '1B', gameId: 'G1', rbi: 2, runs: 1, sb: 1, cs: 0 },
    { code: 'HR', gameId: 'G1', rbi: 3, runs: 1, sb: 0, cs: 1 },
    { code: 'K',  gameId: 'G2', rbi: '', runs: '', sb: '', cs: '' },
    { code: 'GO', gameId: 'G2', rbi: 1, runs: 0 }
  ];
  const t = S.summarize(list);
  assert.equal(t.RBI, 6);
  assert.equal(t.R, 2);
  assert.equal(t.SB, 1);
  assert.equal(t.CS, 1);
  assert.equal(t.games, 2);
  close(t.RBIperG, 3, '每場打點');
});

test('得點圈打擊率只看有標記的打席，且只算打數', () => {
  const list = [
    { code: '1B', gameId: 'G1', risp: true },
    { code: 'K',  gameId: 'G1', risp: true },
    { code: 'BB', gameId: 'G1', risp: true },   // 不算打數
    { code: 'HR', gameId: 'G1', risp: false }   // 非得點圈
  ];
  const t = S.summarize(list);
  assert.equal(t.RISP_AB, 2);
  assert.equal(t.RISP_H, 1);
  close(t.RISP_AVG, 0.5, '得點圈打擊率');
});

test('逐場走勢：單場與累計分開算', () => {
  const list = [
    { code: '1B', gameId: 'G1' }, { code: 'K', gameId: 'G1' },
    { code: 'HR', gameId: 'G2' }, { code: 'HR', gameId: 'G2' },
    { code: 'K', gameId: 'G3' }
  ];
  const rows = S.progression(list, ['G1', 'G2', 'G3', 'G4']);
  assert.equal(rows.length, 3, '沒出賽的 G4 不列入');
  close(rows[0].game.AVG, 0.5, 'G1 單場');
  close(rows[1].game.AVG, 1, 'G2 單場');
  close(rows[1].cumulative.AVG, 3 / 4, 'G2 累計');
  close(rows[2].cumulative.AVG, 3 / 5, 'G3 累計');
});

test('近況只取最後幾場有出賽的比賽', () => {
  const list = [
    { code: 'K', gameId: 'G1' }, { code: 'K', gameId: 'G2' },
    { code: '1B', gameId: 'G4' }, { code: '1B', gameId: 'G5' }
  ];
  const form = S.recentForm(list, ['G1', 'G2', 'G3', 'G4', 'G5'], 2);
  assert.equal(form.games, 2);
  assert.deepEqual(form.gameIds, ['G4', 'G5']);
  close(form.stats.AVG, 1, '近 2 場全安打');
});

test('排行榜：率值項目套用規定打席門檻', () => {
  const rows = [
    { player: { name: '甲' }, stats: S.summarize(pa('1B')) },                       // 1.000 但只有 1 打席
    { player: { name: '乙' }, stats: S.summarize(pa('1B', '1B', 'K', 'K', 'GO')) }, // .400 / 5 打席
    { player: { name: '丙' }, stats: S.summarize(pa('1B', 'K', 'K', 'K', 'GO')) }   // .200 / 5 打席
  ];
  const top = S.rank(rows, 'AVG', { minPA: 5 });
  assert.deepEqual(top.map(r => r.player.name), ['乙', '丙'], '打席不足的甲被排除');
  assert.equal(top[0].rank, 1);

  const all = S.rank(rows, 'AVG', { minPA: 0 });
  assert.equal(all.length, 3);
  assert.equal(all[0].player.name, '甲');
});

test('排行榜：累計項目不設門檻，但 0 不占榜位', () => {
  const rows = [
    { player: { name: '甲' }, stats: S.summarize(pa('HR')) },
    { player: { name: '乙' }, stats: S.summarize(pa('K', 'K')) }
  ];
  const top = S.rank(rows, 'HR', { minPA: 99 });
  assert.equal(top.length, 1, '門檻不套用在全壘打；0 支的乙不上榜');
  assert.equal(top[0].player.name, '甲');
});

test('排行榜：三振率越低越好', () => {
  const rows = [
    { player: { name: '甲' }, stats: S.summarize(pa('K', 'K', '1B', '1B')) },
    { player: { name: '乙' }, stats: S.summarize(pa('K', '1B', '1B', '1B')) }
  ];
  const top = S.rank(rows, 'Kpct', { minPA: 1 });
  assert.equal(top[0].player.name, '乙', '三振率低的排前面');
});

test('排行榜：同值並列同名次', () => {
  const mk = n => ({ player: { name: n }, stats: S.summarize(pa('1B', 'K')) });
  const top = S.rank([mk('甲'), mk('乙'), mk('丙')], 'AVG', { minPA: 1 });
  assert.deepEqual(top.map(r => r.rank), [1, 1, 1]);
});

test('規定打席 = 場次 × 每場係數，向上取整', () => {
  assert.equal(S.qualifyingPA(10), 20);
  assert.equal(S.qualifyingPA(7, 2.5), 18);
  assert.equal(S.qualifyingPA(0), 1, '至少 1');
});

test('率值以棒球寫法呈現，缺值顯示 "-"', () => {
  assert.equal(S.fmtRate3(0.3333), '.333');
  assert.equal(S.fmtRate3(1), '1.000');
  assert.equal(S.fmtRate3(1.256), '1.256');
  assert.equal(S.fmtRate3(0), '.000');
  assert.equal(S.fmtRate3(null), '-');
  assert.equal(S.fmtPct1(0.1234), '12.3%');
  assert.equal(S.fmtInt(null), '-');
  assert.equal(S.format(0.5, 'rate3'), '.500');
});

test('分組：依球員各自算成績', () => {
  const list = [
    { code: '1B', gameId: 'G1', playerId: '7' },
    { code: 'K',  gameId: 'G1', playerId: '7' },
    { code: 'HR', gameId: 'G1', playerId: '9' }
  ];
  const g = S.groupBy(list, p => p.playerId);
  assert.equal(g.size, 2);
  close(g.get('7').stats.AVG, 0.5, '7 號');
  close(g.get('9').stats.SLG, 4, '9 號');
});

/* ---------------------------------------------------------------- *
 * 球季累計成績（只有加總數字、沒有逐打席紀錄的來源）
 * ---------------------------------------------------------------- */

test('累計成績：壘打數與長打由一二三壘安打重算', () => {
  const t = S.deriveFromTotals({ AB: 83, H: 37, '1B': 30, '2B': 5, '3B': 1, HR: 1, BB: 3, K: 2, RBI: 21, OBP: 0.465 });
  assert.equal(t.AB, 83);
  assert.equal(t.H, 37);
  assert.equal(t.TB, 30 + 10 + 3 + 4, '壘打數 = 30+2×5+3×1+4×1');
  assert.equal(t.XBH, 7);
  close(t.AVG, 37 / 83, '打擊率由安打與打數重算');
  close(t.SLG, 47 / 83, '長打率由壘打數重算');
});

test('累計成績：上壘率沿用表上的值，因為缺觸身與犧飛無法重算', () => {
  const t = S.deriveFromTotals({ AB: 83, H: 37, '1B': 30, '2B': 5, '3B': 1, HR: 1, BB: 3, OBP: 0.465 });
  close(t.OBP, 0.465, '直接採用');
  close(t.OPS, 0.465 + 47 / 83, 'OPS = 表上的上壘率 + 重算的長打率');
  assert.equal(t.HBP, null, '觸身球不在這種表裡');
  assert.equal(t.SF, null);
});

test('累計成績：沒有的項目是 null 而不是 0', () => {
  const t = S.deriveFromTotals({ AB: 30, H: 10, '1B': 10, '2B': 0, '3B': 0, HR: 0, BB: 2, K: 5, RBI: 4, OBP: 0.4 });
  ['PA', 'R', 'SB', 'CS', 'HBP', 'SF', 'SH', 'games', 'Kpct', 'BBpct', 'BABIP', 'RISP_AVG', 'TOB'].forEach(k => {
    assert.equal(t[k], null, k + ' 應為 null');
  });
  assert.equal(t.K, 5, '三振有資料就是數字');
  assert.equal(t.BB, 2);
});

test('累計成績：缺安打數欄位時由一二三壘安打推回去', () => {
  const t = S.deriveFromTotals({ AB: 20, '1B': 4, '2B': 2, '3B': 1, HR: 1 });
  assert.equal(t.H, 8);
});

test('累計成績合計：率值重算，不是各人平均', () => {
  const a = S.deriveFromTotals({ AB: 10, H: 5, '1B': 5, '2B': 0, '3B': 0, HR: 0, BB: 1, K: 1, RBI: 2, OBP: 0.5 });
  const b = S.deriveFromTotals({ AB: 90, H: 18, '1B': 18, '2B': 0, '3B': 0, HR: 0, BB: 9, K: 9, RBI: 3, OBP: 0.3 });
  const t = S.sumTotals([a, b]);
  assert.equal(t.AB, 100);
  assert.equal(t.H, 23);
  close(t.AVG, 23 / 100, '合計打擊率 = 總安打/總打數，不是 (.500+.200)/2');
  assert.equal(t.BB, 10);
  assert.equal(t.RBI, 5);
  assert.equal(t.OBP, null, '各人的上壘率加不回團隊上壘率，只能留白');
  assert.equal(t.OPS, null);
});

test('排行榜門檻欄位可改成打數', () => {
  const mk = (name, ab, h) => ({
    player: { name: name },
    stats: S.deriveFromTotals({ AB: ab, H: h, '1B': h, '2B': 0, '3B': 0, HR: 0, OBP: 0.4 })
  });
  const rows = [mk('少打數高打率', 5, 4), mk('甲', 50, 20), mk('乙', 40, 12)];
  const top = S.rank(rows, 'AVG', { minPA: 20, qualifyKey: 'AB' });
  assert.deepEqual(top.map(r => r.player.name), ['甲', '乙'], '打數不足的被排除');

  // 用預設的 PA 當門檻會把所有人濾掉，因為這種資料沒有打席
  const byPA = S.rank(rows, 'AVG', { minPA: 20 });
  assert.equal(byPA.length, 0, 'PA 是 null，門檻一律不通過');
});

test('需要逐打席資料的排行項目有標記', () => {
  const needs = S.CATEGORIES.filter(c => c.needsAtbats).map(c => c.key);
  assert.deepEqual(needs.sort(), ['BBpct', 'Kpct', 'RISP_AVG', 'R', 'SB'].sort());
});
