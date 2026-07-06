"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ExpenseTable, type Expense } from "@/components/ExpenseTable";
import {
  effectivePaid,
  effectiveRemaining,
  sectionOf,
  type LedgerSection,
} from "@/lib/finance";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatMonthDisplay(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getPrevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m-2 because months are 0-indexed
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getNextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

const sum = (arr: Expense[], f: (e: Expense) => number) => arr.reduce((s, e) => s + f(e), 0);

// Sections that make up this period's operating obligations (bills).
const BILL_SECTIONS: LedgerSection[] = ["expenses", "business", "marketing", "annual"];
// Discretionary / already-spent cash.
const VARIABLE_SECTIONS: LedgerSection[] = ["groceries", "restaurants", "incidental", "fuel"];

// Ordered obligation tables + their header styling.
const OBLIGATION_TABLES: { key: LedgerSection; label: string; color: string; text?: string }[] = [
  { key: "expenses",  label: "Monthly Expenses",    color: "#111111" },
  { key: "business",  label: "Business Finances",   color: "#C4A882", text: "#111111" },
  { key: "marketing", label: "Marketing",           color: "#8B5E7A" },
  { key: "annual",    label: "Annual Expenses",     color: "#8A8078" },
  { key: "liens",     label: "Liens & Collections", color: "#8B2020" },
];

const VARIABLE_LABELS: Record<string, string> = {
  groceries: "Groceries", restaurants: "Restaurants", incidental: "Incidental", fuel: "Fuel",
};

export default function MonthlyPage() {
  const router = useRouter();
  const params = useParams();
  const monthKey = params.monthKey as string;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    description: "",
    amount: "",
    category: "",
    dueDate: monthKey ? `${monthKey}-01` : "",
    isRecurring: false,
  });
  const [addError, setAddError] = useState<string | null>(null);

  const fetchExpenses = useCallback(async () => {
    if (!monthKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses?monthKey=${monthKey}`);
      const data = await res.json();
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    fetchExpenses();
    setGenerateMsg(null);
  }, [fetchExpenses]);

  async function handleUpdate(id: string, data: Partial<Expense>) {
    await fetch(`/api/expenses/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchExpenses();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    await fetchExpenses();
  }

  async function handleGenerateMonth() {
    const nextMonth = getNextMonthKey(monthKey);
    if (!confirm(`Generate ${formatMonthDisplay(nextMonth)} from recurring expenses?`)) return;

    setGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await fetch("/api/expenses/generate-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMonthKey: nextMonth }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenerateMsg(`✓ ${data.message}`);
        setTimeout(() => router.push(`/monthly/${nextMonth}`), 1000);
      } else {
        setGenerateMsg(`✗ ${data.error}`);
      }
    } catch (err) {
      setGenerateMsg("✗ Network error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addForm.description || !addForm.amount || !addForm.category || !addForm.dueDate) {
      setAddError("All fields are required.");
      return;
    }

    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, amount: parseFloat(addForm.amount), monthKey }),
    });

    if (res.ok) {
      setShowAddForm(false);
      setAddForm({ description: "", amount: "", category: "", dueDate: `${monthKey}-01`, isRecurring: false });
      await fetchExpenses();
    } else {
      const data = await res.json();
      setAddError(data.error || "Failed to add expense.");
    }
  }

  const prevMonth = getPrevMonthKey(monthKey);
  const nextMonth = getNextMonthKey(monthKey);

  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return (
      <div className="text-center py-16 text-red-400">
        Invalid month key. Expected format: YYYY-MM
      </div>
    );
  }

  // ── Group every entry into exactly one ledger section ──────────────────────
  const bySection = (s: LedgerSection) => expenses.filter((e) => sectionOf(e) === s);
  const income = bySection("income");
  const liens = bySection("liens");
  const bills = expenses.filter((e) => BILL_SECTIONS.includes(sectionOf(e)));
  const variable = expenses.filter((e) => VARIABLE_SECTIONS.includes(sectionOf(e)));

  // ── Accountant-style figures (one consistent definition of settled/outstanding) ──
  const incomeExpected = sum(income, (e) => e.amount);
  const incomeReceived = sum(income, effectivePaid);

  const billsDue = sum(bills, (e) => e.amount);
  const billsPaid = sum(bills, effectivePaid);
  const billsRemaining = sum(bills, effectiveRemaining);

  const lienOutstanding = sum(liens, effectiveRemaining);
  const lienPaid = sum(liens, effectivePaid);

  const variableSpent = sum(variable, (e) => e.amount);

  // Net cash: money received, less everything actually paid out this period.
  const netCash = incomeReceived - billsPaid - lienPaid - variableSpent;

  const card = (label: string, value: string, color: string, sub?: string) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/monthly/${prevMonth}`)}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            title={`Go to ${formatMonthDisplay(prevMonth)}`}
          >
            ←
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">{formatMonthDisplay(monthKey)}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Monthly statement · {monthKey}</p>
          </div>
          <button
            onClick={() => router.push(`/monthly/${nextMonth}`)}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            title={`Go to ${formatMonthDisplay(nextMonth)}`}
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors"
          >
            Dashboard
          </button>
          <button
            onClick={handleGenerateMonth}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {generating ? "Generating..." : `Generate ${formatMonthDisplay(nextMonth)}`}
          </button>
        </div>
      </div>

      {generateMsg && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            generateMsg.startsWith("✓")
              ? "bg-green-900/30 text-green-400 border border-green-800"
              : "bg-red-900/30 text-red-400 border border-red-800"
          }`}
        >
          {generateMsg}
        </div>
      )}

      {/* Summary — income kept strictly separate from obligations */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {card("Income Received", formatCurrency(incomeReceived), "#4ade80", `of ${formatCurrency(incomeExpected)} expected`)}
        {card("Bills Paid", formatCurrency(billsPaid), "#4ade80", `of ${formatCurrency(billsDue)} due`)}
        {card("Bills Remaining", formatCurrency(billsRemaining), "#fb923c", "outstanding this period")}
        {card("Net Cash Position", formatCurrency(netCash), netCash >= 0 ? "#4ade80" : "#f87171", "received less paid out")}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {card("Liens Outstanding", formatCurrency(lienOutstanding), "#f87171", `${liens.length} account${liens.length !== 1 ? "s" : ""} (excl. from bills)`)}
        {card("Variable Spending", formatCurrency(variableSpent), "#60a5fa", `${variable.length} entr${variable.length !== 1 ? "ies" : "y"}`)}
        {card("Total Obligations", formatCurrency(billsDue), "#e4e4e7", `${bills.length} bill${bills.length !== 1 ? "s" : ""}`)}
        {card("Entries", String(expenses.length), "#a1a1aa", "all sections")}
      </div>

      {/* Cash reconciliation — how the net position is derived */}
      <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-md">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Cash Reconciliation</p>
        {[
          ["Income received", incomeReceived, "#4ade80"],
          ["Less: bills paid", -billsPaid, "#f87171"],
          ["Less: lien payments", -lienPaid, "#f87171"],
          ["Less: variable spending", -variableSpent, "#f87171"],
        ].map(([label, value]) => (
          <div key={label as string} className="flex items-center justify-between py-1 text-sm">
            <span className="text-zinc-400">{label as string}</span>
            <span className="font-mono tabular-nums" style={{ color: (value as number) < 0 ? "#f87171" : "#4ade80" }}>
              {(value as number) < 0 ? `(${formatCurrency(Math.abs(value as number))})` : formatCurrency(value as number)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-zinc-800 text-sm">
          <span className="text-white font-medium">Net cash position</span>
          <span className="font-mono font-bold tabular-nums" style={{ color: netCash >= 0 ? "#4ade80" : "#f87171" }}>
            {formatCurrency(netCash)}
          </span>
        </div>
      </div>

      {/* Add Expense */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Ledger</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddExpense}
          className="mb-6 bg-zinc-900 border border-zinc-700 rounded-xl p-5 grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs text-zinc-500 mb-1">Description *</label>
            <input
              type="text"
              value={addForm.description}
              onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. Netflix"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={addForm.amount}
              onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Category *</label>
            <input
              type="text"
              value={addForm.category}
              onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. Subscriptions"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Due Date *</label>
            <input
              type="date"
              value={addForm.dueDate}
              onChange={(e) => setAddForm({ ...addForm, dueDate: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={addForm.isRecurring}
                onChange={(e) => setAddForm({ ...addForm, isRecurring: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              Recurring
            </label>
          </div>
          <div className="col-span-2 md:col-span-3">
            {addError && <p className="text-red-400 text-xs mb-2">{addError}</p>}
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add Expense
            </button>
          </div>
        </form>
      )}

      {/* Ledger */}
      {loading ? (
        <div className="text-center py-16 text-zinc-500">Loading expenses...</div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-500 mb-4">No expenses for {formatMonthDisplay(monthKey)}.</p>
          <button
            onClick={handleGenerateMonth}
            disabled={generating}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Generate from Recurring
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Income — inflow, never mixed into obligations */}
          {income.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded" style={{ background: "#4ade80" }} />
                Income
              </h3>
              <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">Source</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-right px-4 py-2 font-medium">Expected</th>
                      <th className="text-right px-4 py-2 font-medium">Received</th>
                      <th className="text-right px-4 py-2 font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {income.map((e) => {
                      const received = effectivePaid(e);
                      const diff = received - e.amount;
                      return (
                        <tr key={e.id} className="border-t border-zinc-800 text-zinc-300">
                          <td className="px-4 py-2.5">{e.description}</td>
                          <td className="px-4 py-2.5 font-mono text-zinc-500">{fmtDate(e.dueDate)}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(e.amount)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-green-400">{formatCurrency(received)}</td>
                          <td className="px-4 py-2.5 text-right font-mono" style={{ color: diff < 0 ? "#f87171" : diff > 0 ? "#4ade80" : "#71717a" }}>
                            {diff !== 0 ? (diff > 0 ? "+" : "") + formatCurrency(diff) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-900 font-semibold text-white">
                      <td className="px-4 py-2.5" colSpan={2}>{income.length} source{income.length !== 1 ? "s" : ""}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(incomeExpected)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-green-400">{formatCurrency(incomeReceived)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(incomeReceived - incomeExpected)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* Obligations — one table per section, each foots to settled/outstanding */}
          {OBLIGATION_TABLES.map(({ key, label, color, text }) => {
            const items = bySection(key);
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded" style={{ background: color }} />
                  {label}
                </h3>
                <ExpenseTable
                  expenses={items}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  headerColor={color}
                  headerTextColor={text}
                />
              </section>
            );
          })}

          {/* Variable spending — already-paid discretionary cash */}
          {variable.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded" style={{ background: "#60a5fa" }} />
                Variable Spending
              </h3>
              <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">Description</th>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-right px-4 py-2 font-medium">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variable.map((e) => (
                      <tr key={e.id} className="border-t border-zinc-800 text-zinc-300">
                        <td className="px-4 py-2.5">{e.description}</td>
                        <td className="px-4 py-2.5 text-zinc-500">{VARIABLE_LABELS[e.frequency] ?? e.frequency}</td>
                        <td className="px-4 py-2.5 font-mono text-zinc-500">{fmtDate(e.dueDate)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-blue-300">{formatCurrency(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-900 font-semibold text-white">
                      <td className="px-4 py-2.5" colSpan={3}>{variable.length} entr{variable.length !== 1 ? "ies" : "y"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-300">{formatCurrency(variableSpent)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
