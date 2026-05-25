"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExpenseTable, type Expense } from "@/components/ExpenseTable";
import { computeStatus } from "@/lib/status";

// ── Design tokens ──────────────────────────────────────────────────────────────
const OBSIDIAN   = "#111111";
const GOLD       = "#B8976A";
const IVORY      = "#FAF9F6";
const SURFACE    = "#FFFFFF";
const BORDER     = "#E8E3DC";
const WARM_GRAY  = "#6B6460";
const MUTED_GRN  = "#2A6B4A";
const MUTED_RED  = "#8B2020";
const GR_BEIGE   = "#C4A882";

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function fmtEasternTime(d: Date) {
  const weekday = d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
  const date    = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });
  const time    = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: true });
  return { weekday, date, time };
}

function getCurrentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function getNextMonthKey(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonth(mk: string) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [monthKey] = useState(getCurrentMonthKey);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg]     = useState<string | null>(null);
  const [showAdd, setShowAdd]             = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [addForm, setAddForm] = useState({
    description: "", amount: "", category: "",
    dueDate: `${getCurrentMonthKey()}-01`, isRecurring: false, frequency: "monthly",
  });
  const [addIncomeForm, setAddIncomeForm] = useState({
    description: "", amount: "", amountPaid: "", category: "Income",
    dueDate: `${getCurrentMonthKey()}-01`,
  });
  const [addError, setAddError]           = useState<string | null>(null);
  const [addIncomeError, setAddIncomeError] = useState<string | null>(null);
  const [activeTab, setActiveTab]         = useState<"overview" | "income" | "paid">("overview");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const [openInsights, setOpenInsights] = useState(true);
  const [openMonthly, setOpenMonthly] = useState(false);
  const [incomeInlineId,    setIncomeInlineId]    = useState<string | null>(null);
  const [incomeInlineField, setIncomeInlineField] = useState<string | null>(null);
  const [incomeInlineValue, setIncomeInlineValue] = useState("");
  const [openAnnual,  setOpenAnnual]  = useState(false);
  const [openLiens,   setOpenLiens]   = useState(false);
  const [openGR,      setOpenGR]      = useState(false);
  const [showAddGR,     setShowAddGR]     = useState(false);
  const [showAddAnnual, setShowAddAnnual] = useState(false);
  const [showAddLien,   setShowAddLien]   = useState(false);
  const [addGRForm,     setAddGRForm]     = useState({ description: "", amount: "", category: "GR Business", dueDate: `${getCurrentMonthKey()}-01`, isRecurring: false, frequency: "monthly" });
  const [addAnnualForm, setAddAnnualForm] = useState({ description: "", amount: "", category: "", dueDate: `${getCurrentMonthKey()}-01`, isRecurring: false, frequency: "annual" });
  const [addLienForm,   setAddLienForm]   = useState({ description: "", amount: "", category: "", dueDate: `${getCurrentMonthKey()}-01`, isRecurring: false, frequency: "lien" });
  const [addGRError,     setAddGRError]     = useState<string | null>(null);
  const [addAnnualError, setAddAnnualError] = useState<string | null>(null);
  const [addLienError,   setAddLienError]   = useState<string | null>(null);
  const [openGroceries,    setOpenGroceries]    = useState(false);
  const [openRestaurants,  setOpenRestaurants]  = useState(false);
  const [openIncidental,   setOpenIncidental]   = useState(false);
  const [openFuel,         setOpenFuel]         = useState(false);
  const [spendInlineId,    setSpendInlineId]    = useState<string | null>(null);
  const [spendInlineField, setSpendInlineField] = useState<string | null>(null);
  const [spendInlineValue, setSpendInlineValue] = useState("");
  const [searchMonthly,     setSearchMonthly]     = useState("");
  const [searchGR,          setSearchGR]          = useState("");
  const [searchAnnual,      setSearchAnnual]       = useState("");
  const [searchLiens,       setSearchLiens]        = useState("");
  const [searchGroceries,   setSearchGroceries]    = useState("");
  const [searchRestaurants, setSearchRestaurants]  = useState("");
  const [searchIncidental,  setSearchIncidental]   = useState("");
  const [searchFuel,        setSearchFuel]         = useState("");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/expenses?monthKey=${monthKey}`);
      const data = await res.json();
      setExpenses(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, [monthKey]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  async function handleUpdate(id: string, data: Partial<Expense>) {
    await fetch(`/api/expenses/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    await fetchExpenses();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    await fetchExpenses();
  }

  async function handleGenerate() {
    const next = getNextMonthKey(monthKey);
    if (!confirm(`Generate ${fmtMonth(next)} from recurring expenses?`)) return;
    setGenerating(true); setGenMsg(null);
    try {
      const res  = await fetch("/api/expenses/generate-month", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMonthKey: next }),
      });
      const data = await res.json();
      if (res.ok) { setGenMsg(`${data.message}`); router.push(`/monthly/${next}`); }
      else setGenMsg(`${data.error}`);
    } catch { setGenMsg("Network error"); }
    finally { setGenerating(false); }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault(); setAddError(null);
    if (!addForm.description || !addForm.amount || !addForm.category || !addForm.dueDate) {
      setAddError("All fields required."); return;
    }
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, amount: parseFloat(addForm.amount), monthKey }),
    });
    if (res.ok) {
      setShowAdd(false);
      setAddForm({ description: "", amount: "", category: "", dueDate: `${monthKey}-01`, isRecurring: false, frequency: "monthly" });
      fetchExpenses();
    } else {
      const d = await res.json(); setAddError(d.error || "Failed.");
    }
  }

  async function handleAddGR(e: React.FormEvent) {
    e.preventDefault(); setAddGRError(null);
    if (!addGRForm.description || !addGRForm.amount || !addGRForm.dueDate) {
      setAddGRError("All fields required."); return;
    }
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addGRForm, amount: parseFloat(addGRForm.amount), monthKey }),
    });
    if (res.ok) {
      setShowAddGR(false);
      setAddGRForm({ description: "", amount: "", category: "GR Business", dueDate: `${monthKey}-01`, isRecurring: false, frequency: "monthly" });
      fetchExpenses();
    } else { const d = await res.json(); setAddGRError(d.error || "Failed."); }
  }

  async function handleAddAnnual(e: React.FormEvent) {
    e.preventDefault(); setAddAnnualError(null);
    if (!addAnnualForm.description || !addAnnualForm.amount || !addAnnualForm.category || !addAnnualForm.dueDate) {
      setAddAnnualError("All fields required."); return;
    }
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addAnnualForm, amount: parseFloat(addAnnualForm.amount), monthKey }),
    });
    if (res.ok) {
      setShowAddAnnual(false);
      setAddAnnualForm({ description: "", amount: "", category: "", dueDate: `${monthKey}-01`, isRecurring: false, frequency: "annual" });
      fetchExpenses();
    } else { const d = await res.json(); setAddAnnualError(d.error || "Failed."); }
  }

  async function handleAddLien(e: React.FormEvent) {
    e.preventDefault(); setAddLienError(null);
    if (!addLienForm.description || !addLienForm.amount || !addLienForm.category || !addLienForm.dueDate) {
      setAddLienError("All fields required."); return;
    }
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addLienForm, amount: parseFloat(addLienForm.amount), monthKey }),
    });
    if (res.ok) {
      setShowAddLien(false);
      setAddLienForm({ description: "", amount: "", category: "", dueDate: `${monthKey}-01`, isRecurring: false, frequency: "lien" });
      fetchExpenses();
    } else { const d = await res.json(); setAddLienError(d.error || "Failed."); }
  }

  async function commitSpendInline(expense: Expense) {
    if (!spendInlineId || !spendInlineField) return;
    let update: Partial<Expense> = {};
    if (spendInlineField === "description" && spendInlineValue.trim()) update = { description: spendInlineValue.trim() };
    else if (spendInlineField === "category" && spendInlineValue.trim()) update = { category: spendInlineValue.trim() };
    else if (spendInlineField === "dueDate" && spendInlineValue) update = { dueDate: spendInlineValue };
    else if (spendInlineField === "amount") { const v = parseFloat(spendInlineValue); if (!isNaN(v)) update = { amount: v, amountPaid: v }; }
    else if (spendInlineField === "notes") update = { notes: spendInlineValue };
    if (Object.keys(update).length) await handleUpdate(expense.id, update);
    setSpendInlineId(null); setSpendInlineField(null);
  }

  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault(); setAddIncomeError(null);
    if (!addIncomeForm.description || !addIncomeForm.amount || !addIncomeForm.dueDate) {
      setAddIncomeError("All fields required."); return;
    }
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...addIncomeForm,
        amount:      parseFloat(addIncomeForm.amount) || 0,
        amountPaid:  parseFloat(addIncomeForm.amountPaid) || 0,
        frequency:   "income",
        monthKey,
      }),
    });
    if (res.ok) {
      setShowAddIncome(false);
      setAddIncomeForm({ description: "", amount: "", amountPaid: "", category: "Income", dueDate: `${monthKey}-01` });
      await fetchExpenses();
    } else {
      const d = await res.json(); setAddIncomeError(d.error || "Failed.");
    }
  }

  // ── Split expenses ─────────────────────────────────────────────────────────
  const sortAlpha   = (arr: Expense[]) => [...arr].sort((a, b) => a.description.localeCompare(b.description));
  const applySearch = (arr: Expense[], q: string) =>
    q.trim() ? arr.filter(e => e.description.toLowerCase().includes(q.toLowerCase())) : arr;
  const isApple = (e: Expense) => e.description.toLowerCase().includes("apple");

  const monthly    = sortAlpha(expenses.filter(e => e.frequency === "monthly" && e.category !== "GR Business" && !isApple(e)));
  const annual     = sortAlpha(expenses.filter(e => e.frequency === "annual"  && e.category !== "GR Business" && !isApple(e)));
  const liens      = sortAlpha(expenses.filter(e => e.frequency === "lien"    && !isApple(e)));
  const income     = expenses.filter(e => e.frequency === "income");
  const grBusiness = sortAlpha(expenses.filter(e => e.category === "GR Business" || e.category === "Kove Ai-Business" || isApple(e)));
  const groceries   = sortAlpha(expenses.filter(e => e.frequency === "groceries"));
  const restaurants = sortAlpha(expenses.filter(e => e.frequency === "restaurants"));
  const incidental  = sortAlpha(expenses.filter(e => e.frequency === "incidental"));
  const fuel        = sortAlpha(expenses.filter(e => e.frequency === "fuel"));

  // ── Stats ──────────────────────────────────────────────────────────────────
  function effectivePaid(e: Expense) {
    if (e.amountPaid > 0) return e.amountPaid;
    const st = computeStatus({ status: e.status, paymentDate: e.paymentDate, dueDate: e.dueDate, amountPaid: e.amountPaid, amount: e.amount });
    return st === "Paid" ? e.amount : 0;
  }
  function effectiveRemaining(e: Expense) {
    return Math.max(0, e.amount - effectivePaid(e));
  }

  const mDue  = monthly.reduce((s, e) => s + e.amount, 0);
  const mPaid = monthly.reduce((s, e) => s + effectivePaid(e), 0);
  const mRem  = monthly.reduce((s, e) => s + effectiveRemaining(e), 0);
  const aDue  = annual.reduce((s, e) => s + e.amount, 0);
  const aPaid = annual.reduce((s, e) => s + effectivePaid(e), 0);
  const aRem  = annual.reduce((s, e) => s + effectiveRemaining(e), 0);
  const lDue  = liens.reduce((s, e) => s + e.amount, 0);
  const lPaid = liens.reduce((s, e) => s + effectivePaid(e), 0);
  const lRem  = liens.reduce((s, e) => s + effectiveRemaining(e), 0);
  const grDue  = grBusiness.reduce((s, e) => s + e.amount, 0);
  const grPaid = grBusiness.reduce((s, e) => s + effectivePaid(e), 0);
  const grRem  = grBusiness.reduce((s, e) => s + effectiveRemaining(e), 0);
  const iExp  = income.reduce((s, e) => s + e.amount, 0);
  const iRec  = income.reduce((s, e) => s + effectivePaid(e), 0);

  const grSpent   = groceries.reduce((s, e) => s + e.amount, 0);
  const resSpent  = restaurants.reduce((s, e) => s + e.amount, 0);
  const incSpent  = incidental.reduce((s, e) => s + e.amount, 0);
  const fuelSpent = fuel.reduce((s, e) => s + e.amount, 0);
  const varSpent  = grSpent + resSpent + incSpent + fuelSpent;

  const totalRem    = mRem + aRem + lRem + grRem;
  const totalDue    = mDue + aDue + lDue + grDue;
  const totalPaidAll = mPaid + aPaid + lPaid + grPaid;
  const netBalance  = iRec - totalPaidAll - varSpent;

  // Only bill-type entries have meaningful statuses
  const billExpenses = expenses.filter(e => ["monthly", "annual", "lien"].includes(e.frequency) || e.category === "GR Business");
  const pastDueCount = billExpenses.filter(e => {
    const s = computeStatus({ status: e.status, paymentDate: e.paymentDate, dueDate: e.dueDate, amountPaid: e.amountPaid, amount: e.amount });
    return s === "Past Due" || s === "Overdue";
  }).length;
  const paidCount = billExpenses.filter(e => {
    const s = computeStatus({ status: e.status, paymentDate: e.paymentDate, dueDate: e.dueDate, amountPaid: e.amountPaid, amount: e.amount });
    return s === "Paid";
  }).length;

  const progressPct = (mDue + grDue) > 0 ? ((mPaid + grPaid) / (mDue + grDue)) * 100 : 0;

  // ── AI Insights ────────────────────────────────────────────────────────────
  const insights: { text: string; tone: "warning" | "positive" | "neutral" }[] = [];
  const budgetPct   = totalDue > 0 ? Math.round((totalPaidAll / totalDue) * 100) : 0;
  const coveragePct = totalRem > 0 ? Math.round((iRec / totalRem) * 100) : 100;
  const grPortfolioPct = totalDue > 0 ? Math.round((grDue / totalDue) * 100) : 0;

  if (pastDueCount > 0)
    insights.push({ text: `${pastDueCount} obligation${pastDueCount > 1 ? "s" : ""} past due — immediate attention advised.`, tone: "warning" });
  insights.push({ text: `${budgetPct}% of total obligations fulfilled this period — ${fmt(totalDue - totalPaidAll)} outstanding across all categories.`, tone: budgetPct >= 75 ? "positive" : "neutral" });
  if (iRec > 0)
    insights.push({ text: `Received income covers ${Math.min(coveragePct, 999)}% of current outstanding obligations.`, tone: coveragePct >= 100 ? "positive" : "neutral" });
  if (grPortfolioPct > 0)
    insights.push({ text: `Business Finances comprises ${grPortfolioPct}% of total portfolio obligations — ${fmt(grRem)} remaining.`, tone: "neutral" });
  if (varSpent > 0)
    insights.push({ text: `Variable spending: ${fmt(grSpent)} groceries · ${fmt(resSpent)} dining · ${fmt(incSpent)} incidental · ${fmt(fuelSpent)} fuel = ${fmt(varSpent)} total deducted from income.`, tone: varSpent > iRec * 0.3 ? "warning" : "neutral" });
  if (netBalance >= 0)
    insights.push({ text: `Net financial position: ${fmt(netBalance)} remaining of income received after bills paid and food spending.`, tone: "positive" });
  else
    insights.push({ text: `Net financial position: ${fmt(Math.abs(netBalance))} overspent relative to income received.`, tone: "warning" });

  // ── Section header helper ─────────────────────────────────────────────────
  function jumpToSection(sectionId: string, openFn: () => void) {
    setActiveTab("overview");
    openFn();
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  const chevron = (open: boolean) => (
    <span style={{ color: GOLD, fontSize: 10, marginLeft: 6 }}>{open ? "▾" : "▸"}</span>
  );

  const inpStyle = { background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN };
  const inp = "w-full px-3 py-2.5 text-sm rounded-sm focus:outline-none";

  return (
    <div style={{ background: IVORY, minHeight: "100vh", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div style={{ background: OBSIDIAN, borderBottom: `1px solid ${GOLD}` }}>
        <div className="max-w-screen-2xl mx-auto px-8 py-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs tracking-widest mb-1" style={{ color: GOLD, letterSpacing: "0.2em" }}>ESTATE MANAGEMENT</p>
              <h1 className="text-lg font-light text-white tracking-wide">{fmtMonth(monthKey)}</h1>
            </div>
            <div className="flex flex-col items-end gap-4">
              {now && (
                <div className="text-right">
                  <p className="text-xs tracking-widest" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em" }}>
                    {fmtEasternTime(now).weekday.toUpperCase()}, {fmtEasternTime(now).date.toUpperCase()}
                  </p>
                  <p className="text-sm font-light tabular-nums mt-0.5" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {fmtEasternTime(now).time} <span className="text-xs" style={{ color: GOLD }}>ET</span>
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={() => router.push(`/monthly/${monthKey}`)}
                  className="px-5 py-2 text-xs tracking-widest transition-all"
                  style={{ background: "transparent", color: "rgba(255,255,255,0.7)", border: `1px solid rgba(255,255,255,0.2)`, letterSpacing: "0.12em" }}>
                  MONTHLY VIEW
                </button>
                <button onClick={handleGenerate} disabled={generating}
                  className="px-5 py-2 text-xs tracking-widest transition-all disabled:opacity-50"
                  style={{ background: GOLD, color: OBSIDIAN, border: `1px solid ${GOLD}`, letterSpacing: "0.12em", fontWeight: 600 }}>
                  {generating ? "GENERATING…" : `+ ${fmtMonth(getNextMonthKey(monthKey)).toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-px w-full" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-px transition-all duration-700" style={{ width: `${progressPct}%`, background: GOLD }} />
            </div>
            <div className="flex justify-between mt-2">
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                {fmt(mPaid + grPaid)} PAID OF {fmt(mDue + grDue)} MONTHLY
              </p>
              <p className="text-xs" style={{ color: GOLD, letterSpacing: "0.08em" }}>{Math.round(progressPct)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky summary bar ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20" style={{ background: "#1C1C1C", borderBottom: `1px solid #2A2A2A` }}>
        <div className="max-w-screen-2xl mx-auto px-8 py-2.5 flex items-center gap-8">
          <span style={{ color: GOLD, letterSpacing: "0.18em", fontSize: 10 }}>MONTHLY</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
            Due <strong style={{ color: "#fff", fontWeight: 400 }}>{fmt(mDue + grDue)}</strong>
          </span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
            Paid <strong style={{ color: GOLD, fontWeight: 500 }}>{fmt(mPaid + grPaid)}</strong>
          </span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
            Remaining <strong style={{ color: "rgba(255,255,255,0.75)", fontWeight: 400 }}>{fmt(mRem + grRem)}</strong>
          </span>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
        <div className="max-w-screen-2xl mx-auto px-8 flex gap-0 pt-0">
          {(["overview", "income", "paid"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-6 py-3.5 text-xs transition-all"
              style={activeTab === tab
                ? { color: OBSIDIAN, borderBottom: `2px solid ${GOLD}`, background: "transparent", letterSpacing: "0.16em", fontWeight: 600 }
                : { color: "#9E9E9E", borderBottom: "2px solid transparent", background: "transparent", letterSpacing: "0.16em" }}>
              {tab === "overview" ? "OVERVIEW" : tab === "income" ? "INCOME" : "PAID"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-8 py-8">

        {genMsg && (
          <div className="mb-8 px-5 py-3 text-xs tracking-wide" style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: WARM_GRAY, letterSpacing: "0.06em" }}>
            {genMsg}
          </div>
        )}

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <>
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: "Monthly Due",  value: fmt(mDue),           sub: `${monthly.length} items`,  accent: OBSIDIAN },
                { label: "Total Paid",   value: fmt(mPaid + grPaid + aPaid), sub: `${paidCount} fulfilled`,   accent: MUTED_GRN },
                { label: "Remaining",    value: fmt(mRem),           sub: `of ${fmt(mDue)}`,          accent: WARM_GRAY },
                { label: "Past Due",     value: String(pastDueCount),sub: "require attention",        accent: pastDueCount > 0 ? MUTED_RED : WARM_GRAY },
              ].map(c => (
                <div key={c.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${c.accent}` }} className="p-5">
                  <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>{c.label.toUpperCase()}</p>
                  <p className="text-2xl font-light tabular-nums" style={{ color: c.accent }}>{c.value}</p>
                  {c.sub && <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Income summary cards */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: "Income Expected", value: fmt(iExp), sub: `${income.length} sources`,  accent: OBSIDIAN },
                { label: "Income Received", value: fmt(iRec), sub: `of ${fmt(iExp)} expected`,  accent: MUTED_GRN },
              ].map(c => (
                <div key={c.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${c.accent}` }} className="p-5">
                  <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>{c.label.toUpperCase()}</p>
                  <p className="text-2xl font-light tabular-nums" style={{ color: c.accent }}>{c.value}</p>
                  {c.sub && <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{c.sub}</p>}
                </div>
              ))}
            </div>

            {/* Variable spending + Net Balance cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              {[
                { label: "Groceries Spent",   value: fmt(grSpent),   sub: `${groceries.length} entries`,   accent: "#4A7C59" },
                { label: "Restaurants Spent", value: fmt(resSpent),  sub: `${restaurants.length} entries`,  accent: "#7C4A4A" },
                { label: "Incidental Spent",  value: fmt(incSpent),  sub: `${incidental.length} entries`,   accent: "#4A6B7C" },
                { label: "Fuel Spent",        value: fmt(fuelSpent), sub: `${fuel.length} entries`,         accent: "#8B6320" },
              ].map(c => (
                <div key={c.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${c.accent}` }} className="p-5">
                  <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>{c.label.toUpperCase()}</p>
                  <p className="text-2xl font-light tabular-nums" style={{ color: c.accent }}>{c.value}</p>
                  <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>{c.sub}</p>
                </div>
              ))}
              <div style={{ background: netBalance >= 0 ? SURFACE : "#FDF8F8", border: `1px solid ${BORDER}`, borderTop: `2px solid ${netBalance >= 0 ? MUTED_GRN : MUTED_RED}` }} className="p-5">
                <p className="text-xs mb-3" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>INCOME BALANCE</p>
                <p className="text-2xl font-light tabular-nums" style={{ color: netBalance >= 0 ? MUTED_GRN : MUTED_RED }}>{fmt(netBalance)}</p>
                <p className="text-xs mt-2" style={{ color: "#BDBAB6", letterSpacing: "0.06em" }}>remaining balance</p>
              </div>
            </div>

            {/* ── AI Insights + Gauge ──────────────────────────────────────── */}
            <div className="mb-10" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
              <button
                onClick={() => setOpenInsights(!openInsights)}
                className="w-full px-6 py-4 flex items-center gap-3 hover:opacity-70 transition-opacity"
                style={{ borderBottom: openInsights ? `1px solid ${BORDER}` : "none", background: IVORY }}>
                <div className="w-px h-4" style={{ background: GOLD }} />
                <p className="text-xs font-semibold tracking-widest" style={{ color: OBSIDIAN, letterSpacing: "0.2em" }}>AI FINANCIAL INSIGHTS</p>
                <span style={{ color: GOLD, fontSize: 10, marginLeft: "auto" }}>{openInsights ? "▾" : "▸"}</span>
              </button>
              {openInsights && (
                <div className="flex flex-col md:flex-row">
                  {/* Insights list */}
                  <div className="flex-1 divide-y" style={{ borderColor: BORDER }}>
                    {insights.map((ins, i) => (
                      <div key={i} className="px-6 py-4 flex items-start gap-4">
                        <span style={{ color: ins.tone === "warning" ? MUTED_RED : ins.tone === "positive" ? MUTED_GRN : GOLD, fontSize: 16, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>◆</span>
                        <p className="text-sm leading-relaxed" style={{ color: WARM_GRAY }}>{ins.text}</p>
                      </div>
                    ))}
                  </div>
                  {/* Chart */}
                  <div className="px-6 py-6 shrink-0 border-t md:border-t-0 md:border-l" style={{ borderColor: BORDER, width: 380 }}>
                    <p className="text-xs mb-4 tracking-widest" style={{ color: WARM_GRAY, letterSpacing: "0.2em" }}>INCOME UTILIZATION</p>
                    <FinancialGauge
                      pct={iRec > 0 ? (totalPaidAll + varSpent) / iRec * 100 : 0}
                      iRec={iRec}
                      data={[
                        { label: "BILLS",       amount: totalPaidAll },
                        { label: "GROCERIES",   amount: grSpent      },
                        { label: "DINING",      amount: resSpent     },
                        { label: "INCIDENTAL",  amount: incSpent     },
                        { label: "FUEL",        amount: fuelSpent    },
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Section: Expenses ─────────────────────────────────────── */}
            <SectionBlock
              id="section-expenses"
              label="EXPENSES"
              accent={OBSIDIAN}
              open={openMonthly}
              onToggle={() => setOpenMonthly(!openMonthly)}
              chevron={chevron}
              action={openMonthly ? (
                <button onClick={() => setShowAdd(!showAdd)}
                  className="text-xs tracking-widest px-4 py-2 transition-all"
                  style={{ background: showAdd ? IVORY : OBSIDIAN, color: showAdd ? MUTED_RED : "#fff", border: `1px solid ${showAdd ? BORDER : OBSIDIAN}`, letterSpacing: "0.12em" }}>
                  {showAdd ? "CANCEL" : "+ ADD"}
                </button>
              ) : null}>
              {showAdd && (
                <form onSubmit={handleAddExpense}
                  className="mb-6 p-6 grid grid-cols-2 md:grid-cols-3 gap-4"
                  style={{ background: IVORY, border: `1px solid ${BORDER}` }}>
                  {[
                    { label: "Description", key: "description", type: "text",   placeholder: "e.g. Netflix" },
                    { label: "Amount",       key: "amount",      type: "number", placeholder: "0.00" },
                    { label: "Category",     key: "category",    type: "text",   placeholder: "e.g. GR Business" },
                    { label: "Due Date",     key: "dueDate",     type: "date",   placeholder: "" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type} value={(addForm as any)[f.key]} placeholder={f.placeholder}
                        onChange={e => setAddForm({ ...addForm, [f.key]: e.target.value })}
                        className={inp} style={inpStyle} />
                    </div>
                  ))}
                  <div className="flex items-end gap-6">
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: WARM_GRAY, letterSpacing: "0.08em" }}>
                      <input type="checkbox" checked={addForm.isRecurring}
                        onChange={e => setAddForm({ ...addForm, isRecurring: e.target.checked })} className="w-3.5 h-3.5" /> RECURRING
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: WARM_GRAY, letterSpacing: "0.08em" }}>
                      <input type="checkbox" checked={addForm.frequency === "annual"}
                        onChange={e => setAddForm({ ...addForm, frequency: e.target.checked ? "annual" : "monthly" })} className="w-3.5 h-3.5" /> ANNUAL
                    </label>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-4">
                    {addError && <p className="text-xs" style={{ color: MUTED_RED }}>{addError}</p>}
                    <button type="submit" className="px-6 py-2.5 text-xs tracking-widest"
                      style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.14em" }}>ADD EXPENSE</button>
                  </div>
                </form>
              )}
              <MiniStats items={[
                { label: "DUE", value: fmt(mDue) },
                { label: "PAID", value: fmt(mPaid), positive: true },
                { label: "REMAINING", value: fmt(mRem), negative: mRem > 0 },
              ]} />
              {openMonthly && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search expenses…" value={searchMonthly}
                    onChange={e => setSearchMonthly(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchMonthly && <button onClick={() => setSearchMonthly("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {loading
                ? <Loader />
                : <ExpenseTable expenses={applySearch(monthly, searchMonthly)} onUpdate={handleUpdate} onDelete={handleDelete}
                    headerColor={OBSIDIAN} />}
            </SectionBlock>

            {/* ── Section: Business Finances ────────────────────────────── */}
            <SectionBlock
              id="section-gr"
              label="BUSINESS FINANCES"
              accent={GR_BEIGE}
              open={openGR}
              onToggle={() => setOpenGR(!openGR)}
              chevron={chevron}
              action={openGR ? (
                <button onClick={() => setShowAddGR(!showAddGR)}
                  className="text-xs tracking-widest px-4 py-2 transition-all"
                  style={{ background: showAddGR ? IVORY : OBSIDIAN, color: showAddGR ? MUTED_RED : "#fff", border: `1px solid ${showAddGR ? BORDER : OBSIDIAN}`, letterSpacing: "0.12em" }}>
                  {showAddGR ? "CANCEL" : "+ ADD"}
                </button>
              ) : null}>
              {showAddGR && (
                <form onSubmit={handleAddGR}
                  className="mb-6 p-6 grid grid-cols-2 md:grid-cols-3 gap-4"
                  style={{ background: IVORY, border: `1px solid ${BORDER}` }}>
                  {[
                    { label: "Description", key: "description", type: "text",   placeholder: "e.g. Marketing" },
                    { label: "Amount",       key: "amount",      type: "number", placeholder: "0.00" },
                    { label: "Due Date",     key: "dueDate",     type: "date",   placeholder: "" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type} value={(addGRForm as any)[f.key]} placeholder={f.placeholder}
                        onChange={e => setAddGRForm({ ...addGRForm, [f.key]: e.target.value })}
                        className={inp} style={inpStyle} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>CATEGORY</label>
                    <select value={addGRForm.category}
                      onChange={e => setAddGRForm({ ...addGRForm, category: e.target.value })}
                      className={inp} style={inpStyle}>
                      <option value="GR Business">GR Business</option>
                      <option value="Kove Ai-Business">Kove Ai-Business</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: WARM_GRAY, letterSpacing: "0.08em" }}>
                      <input type="checkbox" checked={addGRForm.isRecurring}
                        onChange={e => setAddGRForm({ ...addGRForm, isRecurring: e.target.checked })} className="w-3.5 h-3.5" /> RECURRING
                    </label>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-4">
                    {addGRError && <p className="text-xs" style={{ color: MUTED_RED }}>{addGRError}</p>}
                    <button type="submit" className="px-6 py-2.5 text-xs tracking-widest"
                      style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.14em" }}>ADD ENTRY</button>
                  </div>
                </form>
              )}
              <MiniStats items={[
                { label: "DUE", value: fmt(grDue) },
                { label: "PAID", value: fmt(grPaid), positive: true },
                { label: "REMAINING", value: fmt(grRem), negative: grRem > 0 },
              ]} />
              {openGR && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search business finances…" value={searchGR}
                    onChange={e => setSearchGR(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchGR && <button onClick={() => setSearchGR("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && (
                <ExpenseTable expenses={applySearch(grBusiness, searchGR)} onUpdate={handleUpdate} onDelete={handleDelete}
                  headerColor={GR_BEIGE} headerTextColor={OBSIDIAN} />
              )}
            </SectionBlock>

            {/* ── Section: Annual ───────────────────────────────────────── */}
            <SectionBlock
              id="section-annual"
              label="ANNUAL EXPENSES"
              accent="#8A8078"
              open={openAnnual}
              onToggle={() => setOpenAnnual(!openAnnual)}
              chevron={chevron}
              action={openAnnual ? (
                <button onClick={() => setShowAddAnnual(!showAddAnnual)}
                  className="text-xs tracking-widest px-4 py-2 transition-all"
                  style={{ background: showAddAnnual ? IVORY : OBSIDIAN, color: showAddAnnual ? MUTED_RED : "#fff", border: `1px solid ${showAddAnnual ? BORDER : OBSIDIAN}`, letterSpacing: "0.12em" }}>
                  {showAddAnnual ? "CANCEL" : "+ ADD"}
                </button>
              ) : null}>
              {showAddAnnual && (
                <form onSubmit={handleAddAnnual}
                  className="mb-6 p-6 grid grid-cols-2 md:grid-cols-3 gap-4"
                  style={{ background: IVORY, border: `1px solid ${BORDER}` }}>
                  {[
                    { label: "Description", key: "description", type: "text",   placeholder: "e.g. Insurance" },
                    { label: "Amount",       key: "amount",      type: "number", placeholder: "0.00" },
                    { label: "Category",     key: "category",    type: "text",   placeholder: "e.g. Insurance" },
                    { label: "Due Date",     key: "dueDate",     type: "date",   placeholder: "" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type} value={(addAnnualForm as any)[f.key]} placeholder={f.placeholder}
                        onChange={e => setAddAnnualForm({ ...addAnnualForm, [f.key]: e.target.value })}
                        className={inp} style={inpStyle} />
                    </div>
                  ))}
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: WARM_GRAY, letterSpacing: "0.08em" }}>
                      <input type="checkbox" checked={addAnnualForm.isRecurring}
                        onChange={e => setAddAnnualForm({ ...addAnnualForm, isRecurring: e.target.checked })} className="w-3.5 h-3.5" /> RECURRING
                    </label>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-4">
                    {addAnnualError && <p className="text-xs" style={{ color: MUTED_RED }}>{addAnnualError}</p>}
                    <button type="submit" className="px-6 py-2.5 text-xs tracking-widest"
                      style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.14em" }}>ADD ENTRY</button>
                  </div>
                </form>
              )}
              <MiniStats items={[
                { label: "DUE", value: fmt(aDue) },
                { label: "PAID", value: fmt(aPaid), positive: true },
                { label: "REMAINING", value: fmt(aRem), negative: aRem > 0 },
              ]} />
              {openAnnual && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search annual expenses…" value={searchAnnual}
                    onChange={e => setSearchAnnual(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchAnnual && <button onClick={() => setSearchAnnual("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && (
                <ExpenseTable expenses={applySearch(annual, searchAnnual)} onUpdate={handleUpdate} onDelete={handleDelete}
                  headerColor={OBSIDIAN} />
              )}
            </SectionBlock>

            {/* ── Section: Outstanding Obligations ─────────────────────── */}
            <SectionBlock
              id="section-liens"
              label="OUTSTANDING OBLIGATIONS"
              accent={MUTED_RED}
              open={openLiens}
              onToggle={() => setOpenLiens(!openLiens)}
              chevron={chevron}
              action={openLiens ? (
                <button onClick={() => setShowAddLien(!showAddLien)}
                  className="text-xs tracking-widest px-4 py-2 transition-all"
                  style={{ background: showAddLien ? IVORY : OBSIDIAN, color: showAddLien ? MUTED_RED : "#fff", border: `1px solid ${showAddLien ? BORDER : OBSIDIAN}`, letterSpacing: "0.12em" }}>
                  {showAddLien ? "CANCEL" : "+ ADD"}
                </button>
              ) : null}>
              {showAddLien && (
                <form onSubmit={handleAddLien}
                  className="mb-6 p-6 grid grid-cols-2 md:grid-cols-3 gap-4"
                  style={{ background: IVORY, border: `1px solid ${BORDER}` }}>
                  {[
                    { label: "Description", key: "description", type: "text",   placeholder: "e.g. Legal Obligation" },
                    { label: "Amount",       key: "amount",      type: "number", placeholder: "0.00" },
                    { label: "Category",     key: "category",    type: "text",   placeholder: "e.g. Lien" },
                    { label: "Due Date",     key: "dueDate",     type: "date",   placeholder: "" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type} value={(addLienForm as any)[f.key]} placeholder={f.placeholder}
                        onChange={e => setAddLienForm({ ...addLienForm, [f.key]: e.target.value })}
                        className={inp} style={inpStyle} />
                    </div>
                  ))}
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: WARM_GRAY, letterSpacing: "0.08em" }}>
                      <input type="checkbox" checked={addLienForm.isRecurring}
                        onChange={e => setAddLienForm({ ...addLienForm, isRecurring: e.target.checked })} className="w-3.5 h-3.5" /> RECURRING
                    </label>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-4">
                    {addLienError && <p className="text-xs" style={{ color: MUTED_RED }}>{addLienError}</p>}
                    <button type="submit" className="px-6 py-2.5 text-xs tracking-widest"
                      style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.14em" }}>ADD ENTRY</button>
                  </div>
                </form>
              )}
              <MiniStats items={[
                { label: "TOTAL", value: fmt(lDue) },
                { label: "PAID", value: fmt(lPaid), positive: true },
                { label: "REMAINING", value: fmt(lRem), negative: lRem > 0 },
              ]} />
              {openLiens && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search obligations…" value={searchLiens}
                    onChange={e => setSearchLiens(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchLiens && <button onClick={() => setSearchLiens("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && (
                <ExpenseTable expenses={applySearch(liens, searchLiens)} onUpdate={handleUpdate} onDelete={handleDelete}
                  headerColor={OBSIDIAN} />
              )}
            </SectionBlock>

            {/* ── Section: Groceries ───────────────────────────────────── */}
            <SectionBlock
              id="section-groceries"
              label="GROCERIES"
              accent="#4A7C59"
              open={openGroceries}
              onToggle={() => setOpenGroceries(!openGroceries)}
              chevron={chevron}>
              {openGroceries && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search groceries…" value={searchGroceries}
                    onChange={e => setSearchGroceries(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchGroceries && <button onClick={() => setSearchGroceries("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && <SpendingTable entries={applySearch(groceries, searchGroceries)} accent="#4A7C59" descriptionLabel="Store"
                monthKey={monthKey} frequency="groceries"
                onUpdate={handleUpdate} onDelete={handleDelete} onRefresh={fetchExpenses}
                inlineId={spendInlineId} inlineField={spendInlineField} inlineValue={spendInlineValue}
                setInlineId={setSpendInlineId} setInlineField={setSpendInlineField} setInlineValue={setSpendInlineValue}
                commitInline={commitSpendInline} />}
            </SectionBlock>

            {/* ── Section: Restaurants ─────────────────────────────────── */}
            <SectionBlock
              id="section-restaurants"
              label="RESTAURANTS"
              accent="#7C4A4A"
              open={openRestaurants}
              onToggle={() => setOpenRestaurants(!openRestaurants)}
              chevron={chevron}>
              {openRestaurants && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search restaurants…" value={searchRestaurants}
                    onChange={e => setSearchRestaurants(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchRestaurants && <button onClick={() => setSearchRestaurants("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && <SpendingTable entries={applySearch(restaurants, searchRestaurants)} accent="#7C4A4A" descriptionLabel="Restaurant"
                monthKey={monthKey} frequency="restaurants"
                onUpdate={handleUpdate} onDelete={handleDelete} onRefresh={fetchExpenses}
                inlineId={spendInlineId} inlineField={spendInlineField} inlineValue={spendInlineValue}
                setInlineId={setSpendInlineId} setInlineField={setSpendInlineField} setInlineValue={setSpendInlineValue}
                commitInline={commitSpendInline} />}
            </SectionBlock>

            {/* ── Section: Incidental ──────────────────────────────────── */}
            <SectionBlock
              id="section-incidental"
              label="INCIDENTAL"
              accent="#4A6B7C"
              open={openIncidental}
              onToggle={() => setOpenIncidental(!openIncidental)}
              chevron={chevron}>
              {openIncidental && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search incidental…" value={searchIncidental}
                    onChange={e => setSearchIncidental(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchIncidental && <button onClick={() => setSearchIncidental("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && <SpendingTable entries={applySearch(incidental, searchIncidental)} accent="#4A6B7C" descriptionLabel="Description"
                monthKey={monthKey} frequency="incidental"
                onUpdate={handleUpdate} onDelete={handleDelete} onRefresh={fetchExpenses}
                inlineId={spendInlineId} inlineField={spendInlineField} inlineValue={spendInlineValue}
                setInlineId={setSpendInlineId} setInlineField={setSpendInlineField} setInlineValue={setSpendInlineValue}
                commitInline={commitSpendInline} />}
            </SectionBlock>

            {/* ── Section: Fuel ────────────────────────────────────────── */}
            <SectionBlock
              id="section-fuel"
              label="FUEL"
              accent="#8B6320"
              open={openFuel}
              onToggle={() => setOpenFuel(!openFuel)}
              chevron={chevron}>
              {openFuel && (
                <div className="mb-3 flex items-center gap-2">
                  <input type="text" placeholder="Search fuel…" value={searchFuel}
                    onChange={e => setSearchFuel(e.target.value)}
                    className="px-3 py-2 text-xs focus:outline-none"
                    style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, width: 280, letterSpacing: "0.04em" }} />
                  {searchFuel && <button onClick={() => setSearchFuel("")} style={{ color: WARM_GRAY, fontSize: 11 }}>✕</button>}
                </div>
              )}
              {!loading && <SpendingTable entries={applySearch(fuel, searchFuel)} accent="#8B6320" descriptionLabel="Description"
                monthKey={monthKey} frequency="fuel"
                onUpdate={handleUpdate} onDelete={handleDelete} onRefresh={fetchExpenses}
                inlineId={spendInlineId} inlineField={spendInlineField} inlineValue={spendInlineValue}
                setInlineId={setSpendInlineId} setInlineField={setSpendInlineField} setInlineValue={setSpendInlineValue}
                commitInline={commitSpendInline} />}
            </SectionBlock>
          </>
        )}

        {/* ── INCOME TAB ────────────────────────────────────────────────── */}
        {activeTab === "income" && (
          <div className="py-2">
            {/* Summary strip */}
            <div className="flex gap-0 mb-8" style={{ border: `1px solid ${BORDER}` }}>
              {[
                { label: "SOURCES",   value: String(income.length) },
                { label: "EXPECTED",  value: fmt(iExp) },
                { label: "RECEIVED",  value: fmt(iRec) },
                { label: "VARIANCE",  value: fmt(iRec - iExp), neg: iRec < iExp },
              ].map((s, i, arr) => (
                <div key={s.label} className="flex-1 px-6 py-4" style={{ borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <p className="text-xs mb-1" style={{ color: WARM_GRAY, letterSpacing: "0.16em" }}>{s.label}</p>
                  <p className="text-lg font-light tabular-nums" style={{ color: s.neg ? MUTED_RED : OBSIDIAN }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Income entries */}
            <div style={{ border: `1px solid ${BORDER}` }}>
              {/* Header */}
              <div className="grid px-6 py-2" style={{ gridTemplateColumns: "1fr 140px 120px 120px 110px 80px 60px", background: OBSIDIAN, borderBottom: `1px solid ${BORDER}` }}>
                {["SOURCE", "CATEGORY", "DATE", "EXPECTED", "RECEIVED", "DIFF", ""].map((h, i) => (
                  <p key={i} className="text-xs" style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.14em", textAlign: i >= 3 && i <= 5 ? "right" : "left" }}>{h}</p>
                ))}
              </div>
              {loading && <p className="px-6 py-8 text-xs text-center" style={{ color: "#C8C4BF", letterSpacing: "0.2em" }}>LOADING…</p>}
              {!loading && income.length === 0 && (
                <p className="px-6 py-8 text-xs text-center" style={{ color: "#C8C4BF", letterSpacing: "0.2em" }}>NO INCOME RECORDED</p>
              )}
              {!loading && income.map((e, i) => {
                const diff = e.amountPaid - e.amount;
                const isRow = incomeInlineId === e.id;
                function startEdit(field: string, val: string) { setIncomeInlineId(e.id); setIncomeInlineField(field); setIncomeInlineValue(val); }
                async function commitEdit() {
                  if (!incomeInlineId || !incomeInlineField) return;
                  let update: Partial<Expense> = {};
                  if (incomeInlineField === "description" && incomeInlineValue.trim()) update = { description: incomeInlineValue.trim() };
                  else if (incomeInlineField === "category" && incomeInlineValue.trim()) update = { category: incomeInlineValue.trim() };
                  else if (incomeInlineField === "dueDate" && incomeInlineValue) update = { dueDate: incomeInlineValue };
                  else if (incomeInlineField === "amount") { const v = parseFloat(incomeInlineValue); if (!isNaN(v)) update = { amount: v }; }
                  else if (incomeInlineField === "amountPaid") { const v = parseFloat(incomeInlineValue); if (!isNaN(v)) update = { amountPaid: v }; }
                  if (Object.keys(update).length) await handleUpdate(e.id, update);
                  setIncomeInlineId(null); setIncomeInlineField(null);
                }
                function cancelEdit() { setIncomeInlineId(null); setIncomeInlineField(null); }
                const cellBase = "px-6 py-3.5 flex items-center cursor-pointer hover:opacity-70";
                const inpCls = "w-full text-xs focus:outline-none bg-transparent border-b";
                const inpSt = { borderColor: GOLD, color: OBSIDIAN };
                return (
                  <div key={e.id} className="grid items-center" style={{ gridTemplateColumns: "1fr 140px 120px 120px 110px 80px 60px", borderBottom: i < income.length - 1 ? `1px solid ${BORDER}` : "none", background: i % 2 === 0 ? SURFACE : IVORY }}>

                    {/* Source */}
                    <div className={cellBase} style={{ borderRight: `1px solid ${BORDER}` }} onClick={() => !isRow && startEdit("description", e.description)}>
                      {isRow && incomeInlineField === "description"
                        ? <input autoFocus className={inpCls} style={inpSt} value={incomeInlineValue}
                            onChange={ev => setIncomeInlineValue(ev.target.value)}
                            onBlur={commitEdit} onKeyDown={ev => { if (ev.key === "Enter") commitEdit(); if (ev.key === "Escape") cancelEdit(); }} />
                        : <span className="text-xs font-light" style={{ color: OBSIDIAN }}>{e.description}</span>}
                    </div>

                    {/* Category */}
                    <div className={cellBase} style={{ borderRight: `1px solid ${BORDER}` }} onClick={() => !isRow && startEdit("category", e.category)}>
                      {isRow && incomeInlineField === "category"
                        ? <input autoFocus className={inpCls} style={inpSt} value={incomeInlineValue}
                            onChange={ev => setIncomeInlineValue(ev.target.value)}
                            onBlur={commitEdit} onKeyDown={ev => { if (ev.key === "Enter") commitEdit(); if (ev.key === "Escape") cancelEdit(); }} />
                        : <span className="text-xs" style={{ color: WARM_GRAY }}>{e.category}</span>}
                    </div>

                    {/* Date */}
                    <div className={cellBase} style={{ borderRight: `1px solid ${BORDER}` }} onClick={() => !isRow && startEdit("dueDate", new Date(e.dueDate).toISOString().split("T")[0])}>
                      {isRow && incomeInlineField === "dueDate"
                        ? <input autoFocus type="date" className={inpCls} style={inpSt} value={incomeInlineValue}
                            onChange={ev => setIncomeInlineValue(ev.target.value)}
                            onBlur={commitEdit} onKeyDown={ev => { if (ev.key === "Enter") commitEdit(); if (ev.key === "Escape") cancelEdit(); }} />
                        : <span className="text-xs font-mono" style={{ color: WARM_GRAY }}>{new Date(e.dueDate).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" })}</span>}
                    </div>

                    {/* Expected */}
                    <div className={`${cellBase} justify-end`} style={{ borderRight: `1px solid ${BORDER}` }} onClick={() => !isRow && startEdit("amount", String(e.amount))}>
                      {isRow && incomeInlineField === "amount"
                        ? <input autoFocus type="number" step="0.01" className={`${inpCls} text-right`} style={inpSt} value={incomeInlineValue}
                            onChange={ev => setIncomeInlineValue(ev.target.value)}
                            onBlur={commitEdit} onKeyDown={ev => { if (ev.key === "Enter") commitEdit(); if (ev.key === "Escape") cancelEdit(); }} />
                        : <span className="text-xs font-mono" style={{ color: WARM_GRAY }}>{fmt(e.amount)}</span>}
                    </div>

                    {/* Received */}
                    <div className={`${cellBase} justify-end`} style={{ borderRight: `1px solid ${BORDER}` }} onClick={() => !isRow && startEdit("amountPaid", String(e.amountPaid))}>
                      {isRow && incomeInlineField === "amountPaid"
                        ? <input autoFocus type="number" step="0.01" className={`${inpCls} text-right`} style={inpSt} value={incomeInlineValue}
                            onChange={ev => setIncomeInlineValue(ev.target.value)}
                            onBlur={commitEdit} onKeyDown={ev => { if (ev.key === "Enter") commitEdit(); if (ev.key === "Escape") cancelEdit(); }} />
                        : <span className="text-xs font-mono" style={{ color: e.amountPaid > 0 ? MUTED_GRN : "#C8C4BF" }}>{fmt(e.amountPaid)}</span>}
                    </div>

                    {/* Diff — read only */}
                    <div className="px-6 py-3.5 flex items-center justify-end" style={{ borderRight: `1px solid ${BORDER}` }}>
                      <span className="text-xs font-mono" style={{ color: diff > 0 ? MUTED_GRN : diff < 0 ? MUTED_RED : "#C8C4BF" }}>
                        {diff !== 0 ? (diff > 0 ? "+" : "") + fmt(diff) : "—"}
                      </span>
                    </div>

                    {/* Delete */}
                    <div className="px-3 py-3.5 flex items-center justify-center">
                      <button onClick={() => handleDelete(e.id)} className="text-xs" style={{ color: MUTED_RED, letterSpacing: "0.06em" }}>Del</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add income form */}
            <div className="mt-6">
              <button onClick={() => setShowAddIncome(!showAddIncome)}
                className="text-xs tracking-widest px-5 py-2.5"
                style={{ background: showAddIncome ? IVORY : OBSIDIAN, color: showAddIncome ? MUTED_RED : "#fff", border: `1px solid ${showAddIncome ? BORDER : OBSIDIAN}`, letterSpacing: "0.14em" }}>
                {showAddIncome ? "CANCEL" : "+ ADD INCOME SOURCE"}
              </button>
              {showAddIncome && (
                <form onSubmit={handleAddIncome}
                  className="mt-4 p-6 grid grid-cols-2 md:grid-cols-5 gap-4"
                  style={{ background: IVORY, border: `1px solid ${BORDER}` }}>
                  {[
                    { label: "Source",          key: "description", type: "text",   placeholder: "e.g. Paycheck" },
                    { label: "Expected Amount", key: "amount",      type: "number", placeholder: "0.00" },
                    { label: "Amount Received", key: "amountPaid",  type: "number", placeholder: "0.00" },
                    { label: "Category",        key: "category",    type: "text",   placeholder: "Income" },
                    { label: "Date",            key: "dueDate",     type: "date",   placeholder: "" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.12em" }}>{f.label.toUpperCase()}</label>
                      <input type={f.type} value={(addIncomeForm as any)[f.key]} placeholder={f.placeholder}
                        onChange={e => setAddIncomeForm({ ...addIncomeForm, [f.key]: e.target.value })}
                        className={inp} style={inpStyle} />
                    </div>
                  ))}
                  <div className="col-span-2 md:col-span-5 flex items-center gap-4">
                    {addIncomeError && <p className="text-xs" style={{ color: MUTED_RED }}>{addIncomeError}</p>}
                    <button type="submit" className="px-6 py-2.5 text-xs tracking-widest"
                      style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.14em" }}>ADD</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ── PAID TAB ──────────────────────────────────────────────────── */}
        {activeTab === "paid" && (
          <div className="py-2">
            <div className="mb-8">
              <p className="text-xs mb-6" style={{ color: WARM_GRAY, letterSpacing: "0.2em" }}>PAYMENTS FULFILLED — {fmtMonth(monthKey).toUpperCase()}</p>
              <div style={{ border: `1px solid ${BORDER}` }}>
                {[
                  { label: "Expenses",               paid: mPaid,   due: mDue,   accent: OBSIDIAN,  sectionId: "section-expenses",    openFn: () => setOpenMonthly(true) },
                  { label: "Business Finances",       paid: grPaid,  due: grDue,  accent: GR_BEIGE,  sectionId: "section-gr",          openFn: () => setOpenGR(true) },
                  { label: "Annual Expenses",        paid: aPaid,   due: aDue,   accent: WARM_GRAY, sectionId: "section-annual",      openFn: () => setOpenAnnual(true) },
                  { label: "Outstanding Obligations",paid: lPaid,   due: lDue,   accent: MUTED_RED, sectionId: "section-liens",       openFn: () => setOpenLiens(true) },
                  { label: "Groceries",              paid: grSpent,   due: grSpent,   accent: "#4A7C59", sectionId: "section-groceries",   openFn: () => setOpenGroceries(true) },
                  { label: "Restaurants",            paid: resSpent,  due: resSpent,  accent: "#7C4A4A", sectionId: "section-restaurants", openFn: () => setOpenRestaurants(true) },
                  { label: "Incidental",             paid: incSpent,  due: incSpent,  accent: "#4A6B7C", sectionId: "section-incidental",  openFn: () => setOpenIncidental(true) },
                  { label: "Fuel",                   paid: fuelSpent, due: fuelSpent, accent: "#8B6320", sectionId: "section-fuel",        openFn: () => setOpenFuel(true) },
                ].map((row, i, arr) => {
                  const pct = row.due > 0 ? (row.paid / row.due) * 100 : 0;
                  return (
                    <div key={row.label} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                      <div className="px-6 py-5 flex items-center justify-between gap-6">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div className="w-0.5 h-4 shrink-0" style={{ background: row.accent }} />
                          <button
                            onClick={() => jumpToSection(row.sectionId, row.openFn)}
                            className="text-xs hover:opacity-60 transition-opacity text-left"
                            style={{ color: OBSIDIAN, letterSpacing: "0.14em", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: row.accent }}>
                            {row.label.toUpperCase()}
                          </button>
                        </div>
                        <div className="flex-1 mx-6">
                          <div className="h-px w-full" style={{ background: BORDER }}>
                            <div className="h-px transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: row.accent }} />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-3 shrink-0">
                          <span className="text-base font-light tabular-nums" style={{ color: row.accent }}>{fmt(row.paid)}</span>
                          <span className="text-xs" style={{ color: "#C8C4BF" }}>of {fmt(row.due)}</span>
                          <span className="text-xs tabular-nums w-10 text-right" style={{ color: pct >= 100 ? MUTED_GRN : WARM_GRAY }}>{Math.round(pct)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 px-6 py-4 flex items-center justify-between" style={{ background: OBSIDIAN }}>
                <span className="text-xs tracking-widest" style={{ color: GOLD, letterSpacing: "0.2em" }}>TOTAL PAID</span>
                <span className="text-xl font-light tabular-nums" style={{ color: "#fff" }}>{fmt(mPaid + grPaid + aPaid + lPaid + varSpent)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SpendingTable({ entries, accent, descriptionLabel = "Description", monthKey, frequency, onUpdate, onDelete, onRefresh, inlineId, inlineField, inlineValue, setInlineId, setInlineField, setInlineValue, commitInline }: {
  entries: import("@/components/ExpenseTable").Expense[];
  accent: string;
  descriptionLabel?: string;
  monthKey: string;
  frequency: "groceries" | "restaurants" | "incidental" | "fuel";
  onUpdate: (id: string, data: Partial<import("@/components/ExpenseTable").Expense>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  inlineId: string | null; inlineField: string | null; inlineValue: string;
  setInlineId: (v: string | null) => void; setInlineField: (v: string | null) => void; setInlineValue: (v: string) => void;
  commitInline: (e: import("@/components/ExpenseTable").Expense) => Promise<void>;
}) {
  const OBSIDIAN = "#111111", BORDER = "#E8E3DC", WARM_GRAY = "#6B6460", IVORY = "#FAF9F6", MUTED_RED = "#8B2020";
  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });

  const [addDesc,  setAddDesc]  = useState("");
  const [addDate,  setAddDate]  = useState(`${monthKey}-01`);
  const [addAmt,   setAddAmt]   = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [adding,   setAdding]   = useState(false);
  const [addErr,   setAddErr]   = useState<string | null>(null);

  async function handleAdd(ev: React.FormEvent) {
    ev.preventDefault();
    setAddErr(null);
    if (!addDesc.trim() || !addAmt || !addDate) { setAddErr("Store/restaurant, date and amount are required."); return; }
    const amt = parseFloat(addAmt);
    if (isNaN(amt) || amt <= 0) { setAddErr("Enter a valid amount."); return; }
    setAdding(true);
    const res = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: addDesc.trim(), amount: amt, amountPaid: amt, category: frequency === "groceries" ? "Groceries" : frequency === "restaurants" ? "Dining" : frequency === "fuel" ? "Fuel" : "Incidental", dueDate: addDate, notes: addNotes || null, frequency, monthKey }),
    });
    setAdding(false);
    if (res.ok) { setAddDesc(""); setAddAmt(""); setAddNotes(""); await onRefresh(); }
    else { const d = await res.json(); setAddErr(d.error || "Failed to add."); }
  }

  function startEdit(id: string, field: string, val: string) { setInlineId(id); setInlineField(field); setInlineValue(val); }
  function cancelEdit() { setInlineId(null); setInlineField(null); }

  const inpBase = { background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN, outline: "none", fontSize: 12, padding: "4px 8px", width: "100%" };
  const inpEdit = { fontSize: 12, color: OBSIDIAN, background: "transparent", borderBottom: `1px solid ${accent}`, outline: "none", width: "100%" };

  return (
    <div style={{ border: `1px solid ${BORDER}` }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: OBSIDIAN }}>
              {[descriptionLabel, "Date", "Amount Spent", "Notes", ""].map((h, i) => (
                <th key={i} className="px-3 py-3"
                  style={{ color: "rgba(255,255,255,0.6)", borderRight: "1px solid rgba(255,255,255,0.06)", textAlign: i === 2 ? "right" : "left", fontSize: 9, letterSpacing: "0.16em", fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Always-visible add row */}
            <tr style={{ background: "#F5F3F0", borderBottom: `1px solid ${BORDER}` }}>
              <td className="px-3 py-2" style={{ borderRight: `1px solid ${BORDER}` }}>
                <input type="text" placeholder={descriptionLabel} value={addDesc} onChange={e => setAddDesc(e.target.value)}
                  style={inpBase} />
              </td>
              <td className="px-3 py-2" style={{ borderRight: `1px solid ${BORDER}` }}>
                <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                  style={inpBase} />
              </td>
              <td className="px-3 py-2" style={{ borderRight: `1px solid ${BORDER}` }}>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={addAmt} onChange={e => setAddAmt(e.target.value)}
                  style={{ ...inpBase, textAlign: "right" }} />
              </td>
              <td className="px-3 py-2" style={{ borderRight: `1px solid ${BORDER}` }}>
                <input type="text" placeholder="Notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)}
                  style={inpBase} />
              </td>
              <td className="px-3 py-2 text-center">
                <button onClick={handleAdd} disabled={adding}
                  className="text-xs px-3 py-1 disabled:opacity-50"
                  style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.08em" }}>
                  {adding ? "…" : "ADD"}
                </button>
              </td>
            </tr>
            {addErr && (
              <tr><td colSpan={5} className="px-3 py-1 text-xs" style={{ color: MUTED_RED, background: "#FDF8F8" }}>{addErr}</td></tr>
            )}
            {/* Existing entries */}
            {entries.map((e, i) => {
              const isInline = inlineId === e.id;
              const rowBg = i % 2 === 0 ? "#FFFFFF" : IVORY;
              return (
                <tr key={e.id} style={{ background: rowBg, borderBottom: `1px solid ${BORDER}` }}>
                  <td className="px-3 py-2.5 max-w-[220px] cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                    onClick={() => !isInline && startEdit(e.id, "description", e.description)}>
                    {isInline && inlineField === "description"
                      ? <input autoFocus type="text" value={inlineValue} style={inpEdit}
                          onChange={ev => setInlineValue(ev.target.value)}
                          onBlur={() => commitInline(e)} onKeyDown={ev => { if (ev.key === "Enter") commitInline(e); if (ev.key === "Escape") cancelEdit(); }} />
                      : <span className="truncate text-xs" style={{ color: OBSIDIAN }}>{e.description}</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                    onClick={() => !isInline && startEdit(e.id, "dueDate", new Date(e.dueDate).toISOString().split("T")[0])}>
                    {isInline && inlineField === "dueDate"
                      ? <input autoFocus type="date" value={inlineValue} style={{ ...inpEdit, width: 130 }}
                          onChange={ev => setInlineValue(ev.target.value)}
                          onBlur={() => commitInline(e)} onKeyDown={ev => { if (ev.key === "Enter") commitInline(e); if (ev.key === "Escape") cancelEdit(); }} />
                      : <span className="font-mono text-xs" style={{ color: WARM_GRAY }}>{fmtDate(e.dueDate)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                    onClick={() => !isInline && startEdit(e.id, "amount", String(e.amount))}>
                    {isInline && inlineField === "amount"
                      ? <input autoFocus type="number" step="0.01" value={inlineValue} style={{ ...inpEdit, textAlign: "right" }}
                          onChange={ev => setInlineValue(ev.target.value)}
                          onBlur={() => commitInline(e)} onKeyDown={ev => { if (ev.key === "Enter") commitInline(e); if (ev.key === "Escape") cancelEdit(); }} />
                      : <span className="font-mono text-xs font-semibold" style={{ color: accent }}>{fmt(e.amount)}</span>}
                  </td>
                  <td className="px-3 py-2.5 cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                    onClick={() => !isInline && startEdit(e.id, "notes", e.notes ?? "")}>
                    {isInline && inlineField === "notes"
                      ? <input autoFocus type="text" value={inlineValue} style={inpEdit}
                          onChange={ev => setInlineValue(ev.target.value)}
                          onBlur={() => commitInline(e)} onKeyDown={ev => { if (ev.key === "Enter") commitInline(e); if (ev.key === "Escape") cancelEdit(); }} />
                      : <span className="text-xs" style={{ color: "#BDBAB6" }}>{e.notes || "—"}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => onDelete(e.id)} className="text-xs" style={{ color: MUTED_RED }}>Del</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile add form */}
      <div className="md:hidden px-4 py-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${BORDER}`, background: "#F5F3F0" }}>
        <input type="text" placeholder={descriptionLabel} value={addDesc} onChange={e => setAddDesc(e.target.value)}
          className="w-full px-3 py-2 text-sm" style={inpBase} />
        <div className="flex gap-2">
          <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
            className="flex-1 px-3 py-2 text-sm" style={inpBase} />
          <input type="number" step="0.01" min="0" placeholder="0.00" value={addAmt} onChange={e => setAddAmt(e.target.value)}
            className="w-28 px-3 py-2 text-sm" style={inpBase} />
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)}
            className="flex-1 px-3 py-2 text-sm" style={inpBase} />
          <button onClick={handleAdd} disabled={adding} className="px-4 py-2 text-xs disabled:opacity-50"
            style={{ background: OBSIDIAN, color: "#fff" }}>{adding ? "…" : "ADD"}</button>
        </div>
        {addErr && <p className="text-xs" style={{ color: MUTED_RED }}>{addErr}</p>}
        {/* Mobile entries */}
        {entries.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light truncate" style={{ color: OBSIDIAN }}>{e.description}</p>
              <p className="text-xs mt-0.5" style={{ color: WARM_GRAY }}>{fmtDate(e.dueDate)}</p>
              {e.notes && <p className="text-xs" style={{ color: "#BDBAB6" }}>{e.notes}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono text-sm font-semibold" style={{ color: accent }}>{fmt(e.amount)}</span>
              <button onClick={() => onDelete(e.id)} className="text-xs" style={{ color: MUTED_RED }}>Del</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinancialGauge({ pct, iRec, data }: {
  pct: number;
  iRec: number;
  data: { label: string; amount: number }[];
}) {
  const display = Math.round(pct);
  const status      = pct < 60 ? "BALANCED" : pct < 80 ? "ELEVATED" : pct < 100 ? "CRITICAL" : "OVERDRAWN";
  const statusColor = pct < 60 ? "#2A6B4A"  : pct < 80 ? "#B8976A"  : "#8B2020";
  const CHART_H = 200;
  const safe = iRec > 0 ? iRec : 1;

  function barColor(amount: number) {
    const p = (amount / safe) * 100;
    if (p < 20) return "#2A6B4A";
    if (p < 35) return "#B8976A";
    return "#8B2020";
  }

  function fmtShort(v: number) {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${Math.round(v)}`;
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div className="flex items-baseline justify-between mb-5">
        <span style={{ fontSize: 28, fontWeight: 300, color: statusColor, lineHeight: 1 }}>{display}%</span>
        <span style={{ fontSize: 8, letterSpacing: "0.2em", color: statusColor }}>{status}</span>
      </div>

      {/* Column chart */}
      <div className="relative w-full" style={{ height: CHART_H }}>
        {/* Threshold lines */}
        {[{ pct: 80, color: "#8B2020", label: "80%" }, { pct: 60, color: "#B8976A", label: "60%" }].map(t => (
          <div key={t.pct} className="absolute left-0 right-0 flex items-center"
            style={{ bottom: `${t.pct}%`, zIndex: 1 }}>
            <div className="flex-1" style={{ borderTop: `1px dashed ${t.color}`, opacity: 0.45 }} />
            <span style={{ fontSize: 6, color: t.color, letterSpacing: "0.08em", paddingLeft: 4, opacity: 0.7 }}>{t.label}</span>
          </div>
        ))}

        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-1.5">
          {data.map((d, i) => {
            const hPct = Math.min((d.amount / safe) * 100, 100);
            const color = barColor(d.amount);
            return (
              <div key={i} className="relative flex-1 h-full flex flex-col justify-end">
                {d.amount > 0 && (
                  <span className="absolute w-full text-center"
                    style={{ bottom: `${hPct}%`, marginBottom: 3, fontSize: 7, color, letterSpacing: "0.04em" }}>
                    {fmtShort(d.amount)}
                  </span>
                )}
                <div className="w-full transition-all duration-700"
                  style={{ height: `${hPct}%`, background: color, minHeight: d.amount > 0 ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center"
            style={{ fontSize: 6, color: WARM_GRAY, letterSpacing: "0.08em" }}>
            {d.label}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-4">
        {[["#2A6B4A", "Balanced"], ["#B8976A", "Elevated"], ["#8B2020", "Critical"]].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1">
            <div style={{ width: 8, height: 8, background: c, flexShrink: 0 }} />
            <span style={{ fontSize: 7, color: WARM_GRAY, letterSpacing: "0.1em" }}>{l.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionBlock({ label, accent, open, onToggle, chevron, children, action, sub, id }: {
  label: string; accent: string; open: boolean; onToggle: () => void;
  chevron: (o: boolean) => React.ReactNode; children?: React.ReactNode;
  action?: React.ReactNode; sub?: string; id?: string;
}) {
  return (
    <div id={id} className="mb-8">
      <div className="flex items-center justify-between py-3 mb-4" style={{ borderBottom: `1px solid #E8E3DC` }}>
        <button onClick={onToggle} className="flex items-center gap-3 hover:opacity-70 transition-opacity text-left">
          <div className="w-0.5 h-4" style={{ background: accent }} />
          <div>
            <span className="text-xs font-semibold" style={{ color: "#111111", letterSpacing: "0.18em" }}>{label}</span>
            {sub && <p className="text-xs mt-0.5" style={{ color: "#9E9E9E", letterSpacing: "0.04em" }}>{sub}</p>}
          </div>
          {chevron(open)}
        </button>
        {action}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function MiniStats({ items }: { items: { label: string; value: string; positive?: boolean; negative?: boolean }[] }) {
  const OBSIDIAN = "#111111", MUTED_GRN = "#2A6B4A", MUTED_RED = "#8B2020", BORDER = "#E8E3DC", WARM_GRAY = "#6B6460";
  return (
    <div className="flex gap-0 mb-4" style={{ border: `1px solid ${BORDER}` }}>
      {items.map((s, i) => (
        <div key={s.label} className="flex-1 px-5 py-3" style={{ borderRight: i < items.length - 1 ? `1px solid ${BORDER}` : "none" }}>
          <p className="text-xs mb-1" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>{s.label}</p>
          <p className="text-base font-light tabular-nums" style={{ color: s.positive ? MUTED_GRN : s.negative ? MUTED_RED : OBSIDIAN }}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function Loader() {
  return <div className="py-16 text-center text-xs tracking-widest" style={{ color: "#BDBAB6", letterSpacing: "0.2em" }}>LOADING…</div>;
}
