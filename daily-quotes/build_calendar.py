#!/usr/bin/env python3
"""Build a 3-year daily quote calendar from the source files in data/.

Each data line is: Origin|Language|Theme|Quote
Lines starting with '#' are comments.

Usage: python3 build_calendar.py [--start 2027-01-01] [--years 3]
"""
import argparse
import csv
import difflib
import json
import random
import re
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "output"
SEED = 2027


def load():
    rows = []
    for path in sorted(DATA.glob("*.txt")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 4 or not all(parts):
                sys.exit(f"Bad line {path.name}:{n}: {line}")
            origin, language, theme, quote = parts
            rows.append({
                "origin": origin,
                "language": language,
                "theme": theme,
                "quote": quote,
                "type": "Original" if origin == "Original" else "Traditional",
                "region": path.stem,
            })
    return rows


def norm(text):
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def check_duplicates(rows):
    seen = {}
    for r in rows:
        key = norm(r["quote"])
        if key in seen:
            sys.exit(f"Exact duplicate: {r['quote']}")
        seen[key] = r
    keys = list(seen)
    near = []
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if difflib.SequenceMatcher(None, a, b).ratio() > 0.8:
                near.append((seen[a]["quote"], seen[b]["quote"]))
    return near


def attribution(r):
    if r["type"] == "Original":
        return "Original - written for this collection"
    if r["language"] == "English":
        return f"Traditional saying, {r['origin']}"
    return f"Traditional saying, {r['origin']} (translated from {r['language']})"


def schedule(trad, orig, total):
    rng = random.Random(SEED)
    # Round-robin across regions so consecutive traditional days come from different places.
    by_region = defaultdict(list)
    for r in trad:
        by_region[r["region"]].append(r)
    for lst in by_region.values():
        rng.shuffle(lst)
    queues = sorted(by_region.values(), key=len, reverse=True)
    trad_order = []
    while any(queues):
        for q in queues:
            if q:
                trad_order.append(q.pop())
    orig = orig[:]
    rng.shuffle(orig)

    # Spread originals evenly through the calendar.
    days = []
    ti = oi = 0
    for d in range(total):
        want_orig = round((d + 1) * len(orig) / total) > oi
        if want_orig and oi < len(orig):
            days.append(orig[oi]); oi += 1
        else:
            days.append(trad_order[ti]); ti += 1

    # Avoid the same theme two days in a row by swapping with a later compatible day.
    for i in range(1, total):
        if days[i]["theme"] != days[i - 1]["theme"]:
            continue
        for j in range(i + 1, total):
            ok_i = days[j]["theme"] != days[i - 1]["theme"] and (i + 1 >= total or days[j]["theme"] != days[i + 1]["theme"])
            ok_j = days[i]["theme"] != days[j - 1]["theme"] and (j + 1 >= total or days[i]["theme"] != days[j + 1]["theme"])
            if days[j]["type"] == days[i]["type"] and ok_i and ok_j:
                days[i], days[j] = days[j], days[i]
                break
    return days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2027-01-01")
    ap.add_argument("--years", type=int, default=3)
    args = ap.parse_args()

    start = date.fromisoformat(args.start)
    end = start.replace(year=start.year + args.years)
    total = (end - start).days

    rows = load()
    near = check_duplicates(rows)
    trad = [r for r in rows if r["type"] == "Traditional"]
    orig = [r for r in rows if r["type"] == "Original"]
    if len(trad) + len(orig) < total:
        sys.exit(f"Need {total} quotes, have {len(trad) + len(orig)}")
    orig = orig[: total - len(trad)]

    days = schedule(trad, orig, total)

    OUT.mkdir(exist_ok=True)
    records = []
    for i, r in enumerate(days):
        d = start + timedelta(days=i)
        records.append({
            "day": i + 1,
            "date": d.isoformat(),
            "weekday": d.strftime("%A"),
            "quote": r["quote"],
            "attribution": attribution(r),
            "origin": r["origin"],
            "original_language": r["language"],
            "type": r["type"],
            "theme": r["theme"],
        })

    with open(OUT / "daily_quotes_3yr.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(records[0]))
        w.writeheader()
        w.writerows(records)
    (OUT / "daily_quotes_3yr.json").write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")

    origins = Counter(r["origin"] for r in trad)
    langs = Counter(r["language"] for r in trad)
    themes = Counter(r["theme"] for r in records)
    adjacent = sum(1 for a, b in zip(records, records[1:]) if a["theme"] == b["theme"])
    print(f"Days: {total} ({start} to {end - timedelta(days=1)})")
    print(f"Traditional: {len(trad)} | Original: {len(orig)}")
    print(f"Origins: {len(origins)} | Languages: {len(langs)} | Themes: {len(themes)}")
    print(f"Back-to-back same theme: {adjacent}")
    print(f"Near-duplicate pairs (>80% similar): {len(near)}")
    for a, b in near:
        print(f"  ~ {a}\n    {b}")


if __name__ == "__main__":
    main()
