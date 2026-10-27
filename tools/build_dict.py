"""从 ECDICT（MIT 许可，https://github.com/skywind3000/ECDICT）生成网页版离线小词典。
usage: python3 tools/build_dict.py ecdict.csv web/data/dict.json
输出：{"w": [[word, phonetic, [[pos, meaning], ...]], ...], "f": {inflected: lemma}}
单词按常用程度排序；义项按估计的常用程度排序，第一个是默认义项。
"""
import csv, json, re, sys
csv.field_size_limit(10**8)
src, out = sys.argv[1], sys.argv[2]
LEVELS = {"zk", "gk", "cet4", "cet6"}
# 初学者最常用的义项（WordNet 统计与日常用法不一致的高频词）
PREFER = {"fast": "adj.", "well": "adv.", "open": "v.", "run": "v.", "play": "v.", "sleep": "v.", "study": "v.",
          "cook": "v.", "watch": "v.", "kind": "adj.", "back": "adv.", "right": "adj.", "left": "adj.", "walk": "v.",
          "dance": "v.", "jump": "v.", "smile": "v.", "help": "v.", "work": "v.", "drink": "n.", "love": "v.",
          "hope": "v.", "rain": "n.", "snow": "n.", "clean": "adj.", "dry": "adj.", "close": "v.", "late": "adj.",
          "early": "adj.", "hard": "adj.", "still": "adv.", "just": "adv.", "very": "adv.", "down": "adv.", "up": "adv."}
POS_MAP = {"n": "n.", "v": "v.", "vt": "v.", "vi": "v.", "a": "adj.", "adj": "adj.", "ad": "adv.", "adv": "adv.",
           "prep": "prep.", "conj": "conj.", "pron": "pron.", "int": "int.", "interj": "int.", "num": "num.", "art": "art."}


def clean(text):
    text = re.sub(r"[（(][^）)]*[）)]", "", text)
    parts = [p.strip() for p in re.split(r"[；;,，]", text) if p.strip()]
    return "；".join(parts[:2])[:18]


def pos_weights(r):
    """ECDICT 的 pos 列（如 "v:60/n:40"）；为空时按英文释义中各词性的义项数估计"""
    w = {}
    for x in (r["pos"] or "").split("/"):
        k, _, c = x.partition(":")
        if k and c.isdigit(): w[POS_MAP.get(k, k + ".")] = int(c) * 10
    if not w:
        for l in (r["definition"] or "").split("\\n"):
            m = re.match(r"^([a-z]+)\.", l)
            if m:
                k = POS_MAP.get(m.group(1), m.group(1) + ".")
                w[k] = w.get(k, 0) + 1
    return w


rows = {}
for r in csv.DictReader(open(src, encoding="utf-8")):
    w = r["word"]
    if not re.fullmatch(r"[a-z]{2,20}", w) and w not in ("a", "i"):
        continue
    tags = set((r["tag"] or "").split())
    frq = int(r["frq"] or 0); bnc = int(r["bnc"] or 0)
    if not (tags & LEVELS or r["oxford"] == "1" or 0 < frq <= 12000 or 0 < bnc <= 12000) or not r["translation"]:
        continue
    senses, seen = [], set()
    for l in r["translation"].split("\\n"):
        m = re.match(r"^([a-z]+)\.\s*(.*)$", l)
        if not m: continue
        pos = POS_MAP.get(m.group(1), m.group(1) + ".")
        mean = clean(m.group(2))
        if not mean or pos in seen or re.search(r"[A-Za-z]{3,}", mean): continue
        seen.add(pos); senses.append([pos, mean])
    if not senses:
        l = next((l for l in r["translation"].split("\\n") if l and not l.startswith("[")), "")
        if l and not re.search(r"[A-Za-z]{3,}", clean(l)): senses = [["", clean(l)]]
    if not senses: continue
    wt = pos_weights(r)
    senses.sort(key=lambda s: (s[0] != PREFER.get(w), -wt.get(s[0], 0)))   # 稳定排序：同权重保持原顺序
    ph = (r["phonetic"] or "").strip().replace("'", "ˈ").replace(",", "ˌ").replace(":", "ː").replace("ә", "ə").replace("ɒː", "ɔː")
    rank = min([x for x in (frq, bnc) if x > 0] or [99999])
    rows[w] = [w, f"/{ph}/" if ph else "", senses[:4], rank, r["exchange"] or ""]

forms = {}
for w, row in rows.items():
    for part in row[4].split("/"):
        k, _, v = part.partition(":")
        # 变形本身也是常用词时（如 running），只有原形更常用才还原
        if k in ("p", "d", "i", "3", "s", "r", "t") and re.fullmatch(r"[a-z]+", v) and v != w \
                and (v not in rows or (row[3] < rows[v][3] and rows[v][2][0][0] not in ("n.", "adj."))):
            forms.setdefault(v, w)
words = sorted(rows.values(), key=lambda r: r[3])
json.dump({"w": [r[:3] for r in words], "f": forms}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(words), "words,", len(forms), "forms")
