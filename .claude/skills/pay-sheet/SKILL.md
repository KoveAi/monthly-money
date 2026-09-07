---
name: pay-sheet
description: Produce the printable one-page Stone Brook pay-window sheet — the bills still owed in a 5th–20th or 20th–5th window, with amounts, status and space to mark payments, as HTML and PDF. Use when asked for a bill sheet, a pay window, a printout of what is due, or a PDF of bills to pay.
---

# Pay-window sheet

One page listing every bill still owed in a pay window, ordered by due date, with a
tick box and a ruled note column. Written to be printed and worked in pen.

## Run it

```bash
node scripts/pay-window-sheet.mjs                 # the window containing today
node scripts/pay-window-sheet.mjs --window a      # 5th – 20th
node scripts/pay-window-sheet.mjs --window b      # 20th – 4th of next month
node scripts/pay-window-sheet.mjs --month 2026-10 # a month other than this one
node scripts/pay-window-sheet.mjs --today 2026-09-06   # pretend it is another day
node scripts/pay-window-sheet.mjs --html-only     # skip the PDF
node scripts/pay-window-sheet.mjs --out "C:/some/folder"
```

Writes `Stone-Brook-<window>.html` and `.pdf` to Downloads and prints a summary.
It needs `npm install` to have been run once; the PDF step uses Chrome or Edge if
either is installed, and says so plainly if neither is.

## After running

Report the summary it prints — bills, total owed, and the four urgency buckets —
and give the PDF path. Offer to publish the HTML as an artifact if the user wants a
link rather than a file: the script leaves an artifact-ready fragment (no document
wrapper) at the `artifact` path it prints, which the Artifact tool takes directly.

## What it counts, and why

- **Amounts are what is LEFT OVER** — this month's charge plus anything carried in,
  less what has been paid. Not the charge. A bill half paid shows the half still owed.
- **Bills only.** Income gets its own section. Groceries, restaurants, incidental and
  fuel are excluded — they are spending, not bills falling due.
- **Obligations (liens) are excluded.** A five-figure lien is a balance carried until
  it clears, not a payment due in a fortnight; including one buried every real bill
  under it.
- **Paused lines are excluded** and count nothing, as everywhere else in the app.
- **Anything still unpaid from earlier in the month is included**, even though its
  date sits before the window opened, because it still needs money.
- **Status is decided on calendar dates** — Overdue, Due Today, Upcoming (three
  days), Scheduled. Note this deliberately differs from `computeStatus` in
  `lib/status.ts`, which compares a UTC due date against local time and so labels
  tomorrow's bills "Due Today" anywhere west of UTC. Harmless on a dashboard,
  wrong on a sheet about when to pay.

The script compiles `lib/finance.ts` and imports it rather than reimplementing
`effectiveRemaining`, `sectionOf` and `isPaused`. If those rules change, the sheet
follows automatically — a sheet that disagreed with the dashboard would be worse
than no sheet.

## If it does not fit on one page

That is the design target, and the script says how many pages it produced. Window B
spans a month end and carries more bills, so two pages there is normal rather than a
fault. To force one page, tighten `tbody td` padding and `font-size` in the template
inside the script, or drop the category column.
