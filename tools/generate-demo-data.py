import random, csv, datetime, os
random.seed(20260919)

OUT = "/home/user/INED/data"
os.makedirs(OUT, exist_ok=True)

players = [
    ("1",  "陳建宏", "投手",   "右", "在隊", 0.70),
    ("3",  "林志偉", "捕手",   "右", "在隊", 0.95),
    ("5",  "王柏翰", "一壘",   "左", "在隊", 1.15),
    ("7",  "張宇軒", "二壘",   "右", "在隊", 1.05),
    ("8",  "李承恩", "三壘",   "右", "在隊", 0.90),
    ("9",  "黃家豪", "游擊",   "右", "在隊", 1.20),
    ("11", "吳明哲", "左外野", "左", "在隊", 0.85),
    ("14", "蔡旻佑", "中外野", "右", "在隊", 1.10),
    ("17", "劉冠廷", "右外野", "右", "在隊", 0.80),
    ("21", "鄭凱文", "游擊",   "右", "在隊", 0.75),
    ("23", "許博鈞", "一壘",   "左", "在隊", 1.00),
    ("28", "謝東霖", "外野",   "右", "在隊", 0.60),
    ("33", "洪子翔", "捕手",   "右", "離隊", 0.65),
]

opponents = ["紅葉隊", "大安獅", "信義虎", "北投鯨", "士林象", "中山鷹", "松山狼", "內湖豹", "文山熊"]
venues = ["青年公園壘球場", "迎風河濱球場", "百齡河濱球場", "玉成公園壘球場"]

# 出局類分佈
OUT_CODES = ["GO", "GO", "GO", "FO", "FO", "LO", "FC", "DP"]

def draw(power):
    """依球員能力抽一個打席結果。"""
    r = random.random() * (0.55 + 0.45 * power)
    if r < 0.020 * power: return "HR"
    if r < 0.035 * power: return "3B"
    if r < 0.105 * power: return "2B"
    if r < 0.300 * power: return "1B"
    if r < 0.345:         return "BB"
    if r < 0.352:         return "IBB"
    if r < 0.375:         return "HBP"
    if r < 0.398:         return "E"
    if r < 0.415:         return "SF"
    if r < 0.430:         return "SH"
    if r < 0.530:         return "K"
    return random.choice(OUT_CODES)

MARGINS = [4, -2, -1, 3, 0, 3, -3, -2, 1]   # 固定的勝負差，讓示範戰績可重現
games, atbats = [], []
d = datetime.date(2026, 3, 14)
roster = [p for p in players if p[4] == "在隊"]

for gi in range(1, 10):
    gid = f"G{gi:02d}"
    opp = opponents[gi - 1]
    venue = random.choice(venues)
    # 這場的出賽名單與打序（偶爾輪休 1-2 人）
    lineup = roster[:]
    random.shuffle(lineup)
    lineup = lineup[: random.choice([9, 10, 10, 11])]
    innings = random.choice([7, 7, 7, 6, 8])
    game_start = len(atbats)
    our, opp_runs = 0, 0
    idx = 0
    for inn in range(1, innings + 1):
        outs = 0
        runners = []           # 壘上跑者：記錄他們的打席在 atbats 的索引
        risp_on = False
        batters_this_inning = 0
        while outs < 3 and batters_this_inning < 9:
            p = lineup[idx % len(lineup)]
            spot = (idx % len(lineup)) + 1
            idx += 1
            batters_this_inning += 1
            code = draw(p[5])
            rbi = runs = sb = cs = 0
            # 得點圈：二、三壘有人。這裡沒記壘包位置，用「壘上兩人以上」近似
            risp = len(runners) >= 2 and code not in ("BB", "IBB", "HBP")
            my_index = len(atbats)          # 這個打席等一下會被 append 的位置

            def score(n):
                """讓最前面的 n 位跑者回本壘，並把得分記在他們自己的打席上。"""
                scored = 0
                for _ in range(min(n, len(runners))):
                    idx = runners.pop(0)
                    atbats[idx]["得分"] = 1
                    scored += 1
                return scored

            if code == "HR":
                rbi = 1 + score(len(runners)); runs = 1
            elif code in ("1B", "2B", "3B", "E", "FC"):
                advance = {"1B": 1, "2B": 2, "3B": 3, "E": 1, "FC": 1}[code]
                scored = score(max(0, advance - 1) if advance < 3 else len(runners))
                rbi = scored if code != "E" else 0
                if code == "FC":
                    outs += 1
                    if runners: runners.pop(0)
                runners.append(my_index)
            elif code in ("BB", "IBB", "HBP"):
                if len(runners) >= 3: score(1)
                runners.append(my_index)
            elif code == "SF":
                outs += 1
                rbi = score(1)
            elif code == "SH":
                outs += 1
                if runners and random.random() < 0.5:
                    runners.append(runners.pop(0))
            elif code == "DP":
                outs += 2
                if runners: runners.pop()
            else:  # K / GO / FO / LO
                outs += 1

            if runners and random.random() < 0.08:
                if random.random() < 0.75: sb = 1
                else: cs = 1; runners.pop()

            our += rbi
            atbats.append({
                "場次": gid, "局數": inn, "背號": p[0], "棒次": spot, "結果": code,
                "打點": rbi, "得分": runs, "盜壘": sb, "盜壘失敗": cs,
                "得點圈": "Y" if risp else "", "備註": ""
            })

    # 我方得分 = 打席紀錄裡真的回本壘的人數，兩邊資料才會對得起來
    our = sum(1 for r in atbats[game_start:] if r["得分"])
    # 勝負差固定，讓示範戰績好看且可重現（正 = 我方贏幾分）
    margin = MARGINS[gi - 1]
    if margin > 0:
        opp_runs = max(0, our - margin)
        if opp_runs >= our:
            opp_runs = max(0, our - 1)
    elif margin < 0:
        opp_runs = our - margin
    else:
        opp_runs = our
    games.append({
        "場次": gid, "日期": d.isoformat(), "對手": opp, "場地": venue,
        "我方得分": our, "對方得分": opp_runs,
        "備註": "友誼賽" if gi % 4 == 0 else "春季聯賽"
    })
    d += datetime.timedelta(days=random.choice([7, 7, 14]))

with open(f"{OUT}/players.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["背號", "姓名", "守備位置", "慣用手", "狀態"])
    for p in players: w.writerow(p[:5])

with open(f"{OUT}/games.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["場次", "日期", "對手", "場地", "我方得分", "對方得分", "備註"])
    w.writeheader(); w.writerows(games)

with open(f"{OUT}/atbats.csv", "w", newline="", encoding="utf-8") as f:
    cols = ["場次", "局數", "背號", "棒次", "結果", "打點", "得分", "盜壘", "盜壘失敗", "得點圈", "備註"]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader(); w.writerows(atbats)

wins = sum(1 for g in games if g["我方得分"] > g["對方得分"])
losses = sum(1 for g in games if g["我方得分"] < g["對方得分"])
ties = len(games) - wins - losses
print(f"{len(games)} 場比賽、{len(atbats)} 個打席、戰績 {wins}勝{losses}敗{ties}和")
