# Daily Quotes: 3-Year Calendar (Phase 1)

1,096 daily quotes, one per day, from **Jan 1, 2027 to Dec 31, 2029** (includes leap day 2028).

| | Count |
|---|---|
| Traditional sayings, author unknown | 727 |
| Original quotes written for this collection | 369 |
| Cultures / origins | 89 |
| Source languages (all translated to English) | 89 |
| Themes | 32 |

## Files

- `output/daily_quotes_3yr.csv`: the calendar. Opens in Excel or Google Sheets (UTF-8).
- `output/daily_quotes_3yr.json`: the same data for apps, automations, and Phase 2.
- `data/*.txt`: the source library, grouped by region. One quote per line: `Origin|Language|Theme|Quote`.
- `build_calendar.py`: rebuilds the calendar from the source files.

### Columns
`day, date, weekday, quote, attribution, origin, original_language, type, theme`

## How the calendar is arranged
- Each day's traditional saying comes from a different region than the day before, so the calendar moves around the world.
- Originals are spread evenly, about one every three days.
- The same theme never lands on two days in a row.
- The order is fixed by a seed, so every rebuild gives the same calendar.

## Selection standards
- **Unknown authors only.** Sayings tied to a named author were left out, even when they are often called "proverbs". That rules out Confucius, Laozi, Rumi, Saadi, Kabir, Thiruvalluvar, Franklin, and others. Anonymous classical sources were kept, such as the Old Norse *Hávamál*, Sumerian proverb tablets, the Upanishads, and Zen anthologies.
- **Misattributions removed.** Popular internet quotes with made-up origins were left out, for example many "Native American" and "Chinese" proverbs found online.
- **Translations** give the meaning in natural English. Where a literal version would be unclear, a short explanation is part of the line (for example, the Thai "hot water" proverb).
- **Originals** were checked against well-known quotes. Any that were too close to a famous line (David Campbell, Brené Brown, James Clear, Dave Ramsey) were rewritten.
- **Note on attribution:** folk sayings travel. A proverb listed under one culture often appears in others too. The origin given is where the saying is well documented, not a claim that it started only there.

## Rebuild or change the start date
```bash
python3 build_calendar.py                      # default: starts 2027-01-01, 3 years
python3 build_calendar.py --start 2027-03-01   # any start date
```
To add, remove, or edit a quote, change the line in `data/` and rebuild. The script rejects badly formatted lines and exact duplicates, and it flags near-duplicates.
