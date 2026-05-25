"use client";

import { useState, useRef } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { computeStatus, ALL_STATUSES } from "@/lib/status";

export interface Expense {
  id: string;
  description: string;
  amount: number;
  amountPaid: number;
  category: string;
  dueDate: string;
  isRecurring: boolean;
  frequency: string;
  status: string | null;
  paymentDate: string | null;
  paymentType: string | null;
  notes: string | null;
  remainingName: string | null;
  remainingType: string | null;
  monthKey: string;
  sortOrder: number;
}

interface ExpenseTableProps {
  expenses: Expense[];
  onUpdate: (id: string, data: Partial<Expense>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  headerColor?: string;
  headerTextColor?: string;
  categoryOptions?: string[];
  onMove?: (id: string, targetSection: string) => Promise<void>;
}

function fmt(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
}
function toInputDate(s: string) {
  return new Date(s).toISOString().split("T")[0];
}
function getRowBg(status: string) {
  switch (status) {
    case "Past Due":
    case "Overdue":        return "#FDF8F8";
    case "Paid":           return "#F8FBF9";
    case "Paid as Agreed": return "#FDFCF7";
    case "Cancelled":      return "#F9F9F9";
    default:               return "#FFFFFF";
  }
}
function getCardBorder(status: string) {
  switch (status) {
    case "Past Due":
    case "Overdue":        return "#D4B5B5";
    case "Paid":           return "#B5D4C0";
    case "Paid as Agreed": return "#D4CDB5";
    default:               return "#E8E3DC";
  }
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ expense, onSave, onClose }: {
  expense: Expense;
  onSave: (id: string, data: Partial<Expense>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    description:  expense.description,
    amount:       String(expense.amount),
    amountPaid:   String(expense.amountPaid),
    category:     expense.category,
    dueDate:      toInputDate(expense.dueDate),
    status:       expense.status ?? "",
    paymentDate:  expense.paymentDate ? toInputDate(expense.paymentDate) : "",
    paymentType:  expense.paymentType ?? "",
    notes:        expense.notes ?? "",
    isRecurring:  expense.isRecurring,
    frequency:    expense.frequency,
  });
  const [saving, setSaving] = useState(false);
  const remaining = Math.max(0, (parseFloat(form.amount) || 0) - (parseFloat(form.amountPaid) || 0));

  async function handleSave() {
    setSaving(true);
    await onSave(expense.id, {
      description: form.description,
      amount:      parseFloat(form.amount) || 0,
      amountPaid:  parseFloat(form.amountPaid) || 0,
      category:    form.category,
      dueDate:     form.dueDate,
      status:      form.status || null,
      paymentDate: form.paymentDate || null,
      paymentType: form.paymentType || null,
      notes:       form.notes || null,
      isRecurring: form.isRecurring,
      frequency:   form.frequency,
    });
    setSaving(false);
    onClose();
  }

  const OBSIDIAN = "#111111", GOLD = "#B8976A", IVORY = "#FAF9F6", BORDER = "#E8E3DC", WARM_GRAY = "#6B6460";
  const MUTED_GRN = "#2A6B4A", MUTED_RED = "#8B2020";
  const inp = "w-full px-3 py-2.5 text-sm focus:outline-none";
  const inpStyle = { background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full sm:max-w-2xl overflow-hidden shadow-2xl"
        style={{ background: "#fff", border: `1px solid ${BORDER}`, maxHeight: "95vh" }}>

        <div className="px-6 py-5 flex items-start justify-between" style={{ background: OBSIDIAN, borderBottom: `1px solid ${GOLD}` }}>
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs mb-1" style={{ color: GOLD, letterSpacing: "0.2em" }}>EDITING</p>
            <h3 className="text-base font-light text-white tracking-wide">{expense.description}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-xs"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}>✕</button>
        </div>

        <div className="px-6 py-6 grid grid-cols-2 gap-4 overflow-y-auto" style={{ maxHeight: "62vh", background: "#fff" }}>
          <div className="col-span-2">
            <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>DESCRIPTION</label>
            <input type="text" value={form.description} className={inp} style={inpStyle}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          {[
            { label: "Amount Due",    key: "amount",      type: "number" },
            { label: "Amount Paid",   key: "amountPaid",  type: "number" },
            { label: "Category",      key: "category",    type: "text"   },
            { label: "Due Date",      key: "dueDate",     type: "date"   },
            { label: "Payment Date",  key: "paymentDate", type: "date"   },
            { label: "Payment Type",  key: "paymentType", type: "text", placeholder: "Card, ACH, Check…" },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>{f.label.toUpperCase()}</label>
              <input type={f.type} step={f.type === "number" ? "0.01" : undefined} min={f.type === "number" ? "0" : undefined}
                value={(form as any)[f.key]} placeholder={(f as any).placeholder ?? ""}
                className={inp} style={inpStyle}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}

          <div>
            <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>STATUS</label>
            <select value={form.status} className={inp} style={inpStyle}
              onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="">Auto (computed)</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-xs mb-1.5" style={{ color: WARM_GRAY, letterSpacing: "0.14em" }}>NOTES</label>
            <textarea rows={2} value={form.notes} className={`${inp} resize-none`} style={inpStyle}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="col-span-2 flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: WARM_GRAY, letterSpacing: "0.1em" }}>
              <input type="checkbox" checked={form.isRecurring} className="w-3.5 h-3.5"
                onChange={e => setForm({ ...form, isRecurring: e.target.checked })} />
              RECURRING MONTHLY
            </label>
            <div className="flex items-center gap-2 text-xs" style={{ color: WARM_GRAY }}>
              <span style={{ letterSpacing: "0.1em" }}>SECTION</span>
              <select value={form.frequency} className="text-xs px-2 py-1.5 focus:outline-none"
                style={{ background: IVORY, border: `1px solid ${BORDER}`, color: OBSIDIAN }}
                onChange={e => setForm({ ...form, frequency: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="lien">Outstanding Obligations</option>
                <option value="income">Income</option>
                <option value="groceries">Groceries</option>
                <option value="restaurants">Restaurants</option>
                <option value="incidental">Incidental</option>
                <option value="fuel">Fuel</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${BORDER}`, background: IVORY }}>
          <div className="text-xs" style={{ color: WARM_GRAY, letterSpacing: "0.1em" }}>
            REMAINING <span className="font-semibold ml-2" style={{ color: remaining > 0 ? MUTED_RED : MUTED_GRN }}>{fmt(remaining)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs tracking-widest"
              style={{ background: "#fff", color: WARM_GRAY, border: `1px solid ${BORDER}`, letterSpacing: "0.1em" }}>CANCEL</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-xs tracking-widest disabled:opacity-50"
              style={{ background: OBSIDIAN, color: "#fff", letterSpacing: "0.1em" }}>
              {saving ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Card ──────────────────────────────────────────────────────────────
function MobileCard({ expense, onEdit, onDelete, onUpdate }: {
  expense: Expense;
  onEdit: () => void;
  onDelete?: () => void;
  onUpdate: (id: string, data: Partial<Expense>) => Promise<void>;
}) {
  const status    = computeStatus({ status: expense.status, paymentDate: expense.paymentDate, dueDate: expense.dueDate, amountPaid: expense.amountPaid, amount: expense.amount });
  const remaining = Math.max(0, expense.amount - expense.amountPaid);
  const [editPaid, setEditPaid] = useState(false);
  const [paidVal, setPaidVal]   = useState(String(expense.amountPaid));
  const [saving, setSaving]     = useState(false);

  async function savePaid() {
    setSaving(true);
    const v = parseFloat(paidVal.replace(/[^0-9.]/g, ""));
    if (!isNaN(v)) await onUpdate(expense.id, { amountPaid: v });
    setSaving(false);
    setEditPaid(false);
  }

  return (
    <div className="rounded-xl overflow-hidden shadow-sm mb-3"
      style={{ border: `1px solid ${getCardBorder(status)}`, background: "#fff" }}>
      {/* Card header */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #f1f5f9" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 leading-snug text-sm">{expense.description}</p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(expense.dueDate)}</p>
          </div>
          <StatusBadge expense={{ status: expense.status, paymentDate: expense.paymentDate, dueDate: expense.dueDate, amountPaid: expense.amountPaid, amount: expense.amount }} />
        </div>
        <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full"
          style={{ background: "#e8f0fe", color: "#1e40af", border: "1px solid #bfdbfe" }}>
          {expense.category}
        </span>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
        <div className="px-2 py-3">
          <p className="text-xs text-slate-400 mb-0.5">Due</p>
          <p className="text-sm font-mono font-semibold text-slate-700">{fmt(expense.amount)}</p>
        </div>
        <div className="px-2 py-3 cursor-pointer" onClick={() => { setEditPaid(true); setPaidVal(String(expense.amountPaid)); }}>
          <p className="text-xs text-slate-400 mb-0.5">Paid <span className="text-blue-400">✎</span></p>
          {editPaid ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <input type="number" step="0.01" min="0" value={paidVal} autoFocus
                onChange={e => setPaidVal(e.target.value)}
                onBlur={savePaid}
                onKeyDown={e => { if (e.key === "Enter") savePaid(); if (e.key === "Escape") setEditPaid(false); }}
                className="w-20 px-1.5 py-0.5 text-sm font-mono text-center rounded focus:outline-none"
                style={{ border: "2px solid #2563eb" }} />
            </div>
          ) : (
            <p className="text-sm font-mono font-semibold" style={{ color: expense.amountPaid > 0 ? "#16a34a" : "#94a3b8" }}>
              {saving ? "…" : fmt(expense.amountPaid)}
            </p>
          )}
        </div>
        <div className="px-2 py-3">
          <p className="text-xs text-slate-400 mb-0.5">Remaining</p>
          <p className="text-sm font-mono font-semibold" style={{ color: remaining === 0 ? "#cbd5e1" : remaining > 500 ? "#dc2626" : "#475569" }}>
            {fmt(remaining)}
          </p>
        </div>
      </div>

      {/* Notes + actions */}
      {(expense.notes || onDelete) && (
        <div className="px-4 py-2.5 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
          <p className="text-xs text-slate-400 truncate flex-1">{expense.notes || ""}</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={onEdit}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg"
              style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>Edit</button>
            {onDelete && (
              <button onClick={onDelete}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg"
                style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>Del</button>
            )}
          </div>
        </div>
      )}
      {!expense.notes && !onDelete && (
        <div className="px-4 py-2 flex justify-end" style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
          <button onClick={onEdit}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg"
            style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>Edit</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Table ───────────────────────────────────────────────────────────────
export function ExpenseTable({ expenses, onUpdate, onDelete, headerColor = "#0d2b4e", headerTextColor, categoryOptions, onMove }: ExpenseTableProps) {
  const [editingRow, setEditingRow]     = useState<Expense | null>(null);
  const [inlineId, setInlineId]         = useState<string | null>(null);
  const [inlineField, setInlineField]   = useState<string | null>(null);
  const [inlineValue, setInlineValue]   = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [saving, setSaving]             = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getStatus = (e: Expense) =>
    computeStatus({ status: e.status, paymentDate: e.paymentDate, dueDate: e.dueDate, amountPaid: e.amountPaid, amount: e.amount });

  const filtered = filterStatus === "All" ? expenses : expenses.filter(e => getStatus(e) === filterStatus);

  const totalAmount    = filtered.reduce((s, e) => s + e.amount, 0);
  const totalPaid      = filtered.reduce((s, e) => s + e.amountPaid, 0);
  const totalRemaining = filtered.reduce((s, e) => s + Math.max(0, e.amount - e.amountPaid), 0);

  const statusCounts: Record<string, number> = { All: expenses.length };
  expenses.forEach(e => { const s = getStatus(e); statusCounts[s] = (statusCounts[s] ?? 0) + 1; });
  const filterOptions = ["All", ...ALL_STATUSES.filter(s => (statusCounts[s] ?? 0) > 0)];

  function startInline(id: string, field: string, value: string) {
    setInlineId(id); setInlineField(field); setInlineValue(value);
    setTimeout(() => inputRef.current?.select(), 50);
  }
  async function commitInline(expense: Expense) {
    if (!inlineId || !inlineField) return;
    setSaving(inlineId);
    let update: Partial<Expense> = {};
    if (inlineField === "amountPaid") {
      const v = parseFloat(inlineValue.replace(/[^0-9.]/g, ""));
      if (!isNaN(v)) update = { amountPaid: v };
    } else if (inlineField === "amount") {
      const v = parseFloat(inlineValue.replace(/[^0-9.]/g, ""));
      if (!isNaN(v)) update = { amount: v };
    } else if (inlineField === "description") {
      if (inlineValue.trim()) update = { description: inlineValue.trim() };
    } else if (inlineField === "category") {
      if (inlineValue.trim()) update = { category: inlineValue.trim() };
    } else if (inlineField === "dueDate") {
      if (inlineValue) update = { dueDate: inlineValue };
    } else if (inlineField === "status") {
      update = { status: inlineValue || null };
    } else if (inlineField === "notes") {
      update = { notes: inlineValue };
    }
    await onUpdate(expense.id, update);
    setInlineId(null); setInlineField(null); setSaving(null);
  }
  const cancelInline = () => { setInlineId(null); setInlineField(null); };
  const COL = { borderRight: "1px solid #e2e8f0" };

  return (
    <>
      {editingRow && <EditModal expense={editingRow} onSave={onUpdate} onClose={() => setEditingRow(null)} />}

      <div>
        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {filterOptions.map(s => {
            const active = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className="px-3 py-1 text-xs transition-all"
                style={active
                  ? { background: headerColor, color: headerTextColor ?? "#fff", border: `1px solid ${headerColor}`, letterSpacing: "0.1em" }
                  : { background: "#fff", color: "#9E9E9E", border: "1px solid #E8E3DC", letterSpacing: "0.1em" }}>
                {s} <span className="ml-1 opacity-40">{statusCounts[s] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {/* ── MOBILE: Card view (hidden on md+) ── */}
        <div className="md:hidden space-y-0">
          {filtered.length === 0 && (
            <p className="text-center py-10 text-xs tracking-widest" style={{ color: "#BDBAB6", letterSpacing: "0.2em" }}>NO ENTRIES</p>
          )}
          {filtered.map(expense => (
            <MobileCard key={expense.id} expense={expense}
              onEdit={() => setEditingRow(expense)}
              onDelete={onDelete ? () => onDelete(expense.id) : undefined}
              onUpdate={onUpdate} />
          ))}
          {filtered.length > 0 && (
            <div className="p-4 mt-2" style={{ background: headerColor }}>
              <div className="grid grid-cols-3 text-center" style={{ color: headerTextColor ?? "#fff" }}>
                <div><p className="text-xs opacity-60 mb-0.5" style={{ letterSpacing: "0.1em" }}>DUE</p><p className="font-mono text-sm">{fmt(totalAmount)}</p></div>
                <div><p className="text-xs opacity-60 mb-0.5" style={{ letterSpacing: "0.1em" }}>PAID</p><p className="font-mono text-sm">{fmt(totalPaid)}</p></div>
                <div><p className="text-xs opacity-60 mb-0.5" style={{ letterSpacing: "0.1em" }}>REMAINING</p><p className="font-mono text-sm">{fmt(totalRemaining)}</p></div>
              </div>
            </div>
          )}
        </div>

        {/* ── DESKTOP: Table view (hidden on mobile) ── */}
        <div className="hidden md:block overflow-x-auto" style={{ border: "1px solid #E8E3DC" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: headerColor }}>
                {["Expense", "Category", "Due Date", "Amount Due", "Amount Paid", "Remaining", "Status", "Notes", ""].map((h, i) => (
                  <th key={i} className="px-3 py-3"
                    style={{ color: headerTextColor ?? "rgba(255,255,255,0.6)", borderRight: "1px solid rgba(255,255,255,0.06)", textAlign: i >= 3 && i <= 5 ? "right" : "left", fontSize: 9, letterSpacing: "0.16em", fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs tracking-widest" style={{ color: "#BDBAB6", background: "#FAF9F6", letterSpacing: "0.2em" }}>NO ENTRIES</td></tr>
              )}
              {filtered.map((expense) => {
                const status    = getStatus(expense);
                const remaining = Math.max(0, expense.amount - expense.amountPaid);
                const isInline  = inlineId === expense.id;
                const OBSIDIAN = "#111111", GOLD = "#B8976A", BORDER = "#E8E3DC", WARM_GRAY = "#6B6460";
                const MUTED_GRN = "#2A6B4A", MUTED_RED = "#8B2020", IVORY = "#FAF9F6";
                return (
                  <tr key={expense.id} style={{ background: getRowBg(status), borderBottom: `1px solid ${BORDER}`, transition: "background 0.1s" }}>

                    {/* Description */}
                    <td className="px-3 py-2.5 max-w-[220px] cursor-pointer group" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "description", expense.description)}>
                      {isInline && inlineField === "description" ? (
                        <input ref={inputRef} type="text" value={inlineValue} autoFocus
                          onChange={e => setInlineValue(e.target.value)}
                          onBlur={() => commitInline(expense)}
                          onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                          className="w-full" style={{ fontSize: 12, color: OBSIDIAN }} />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {expense.isRecurring && <span style={{ color: GOLD, fontSize: 10 }}>⟳</span>}
                          <span className="truncate text-xs" style={{ color: OBSIDIAN }}>
                            {saving === expense.id && inlineField === "description" ? "…" : expense.description}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-3 py-2.5 whitespace-nowrap cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "category", expense.category)}>
                      {isInline && inlineField === "category" ? (
                        categoryOptions ? (
                          <select value={inlineValue} autoFocus
                            onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => commitInline(expense)}
                            onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                            style={{ fontSize: 11, border: `1px solid ${GOLD}`, background: "#fff", color: OBSIDIAN, padding: "2px 4px" }}>
                            {categoryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input ref={inputRef} type="text" value={inlineValue} autoFocus
                            onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => commitInline(expense)}
                            onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                            className="w-28" style={{ fontSize: 11 }} />
                        )
                      ) : (
                        <span className="text-xs px-2 py-0.5" style={{ background: IVORY, color: WARM_GRAY, border: `1px solid ${BORDER}`, letterSpacing: "0.06em" }}>
                          {saving === expense.id && inlineField === "category" ? "…" : expense.category}
                        </span>
                      )}
                    </td>

                    {/* Due Date */}
                    <td className="px-3 py-2.5 whitespace-nowrap cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "dueDate", toInputDate(expense.dueDate))}>
                      {isInline && inlineField === "dueDate" ? (
                        <input ref={inputRef} type="date" value={inlineValue} autoFocus
                          onChange={e => setInlineValue(e.target.value)}
                          onBlur={() => commitInline(expense)}
                          onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                          style={{ fontSize: 11, width: 130 }} />
                      ) : (
                        <span className="font-mono" style={{ fontSize: 11, color: WARM_GRAY }}>
                          {saving === expense.id && inlineField === "dueDate" ? "…" : fmtDate(expense.dueDate)}
                        </span>
                      )}
                    </td>

                    {/* Amount Due */}
                    <td className="px-3 py-2.5 text-right cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "amount", String(expense.amount))}>
                      {isInline && inlineField === "amount" ? (
                        <input ref={inputRef} type="number" step="0.01" min="0" value={inlineValue} autoFocus
                          onChange={e => setInlineValue(e.target.value)}
                          onBlur={() => commitInline(expense)}
                          onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                          className="text-right" style={{ width: 90, fontSize: 12 }} />
                      ) : (
                        <span className="font-mono text-xs" style={{ color: OBSIDIAN }}>
                          {saving === expense.id && inlineField === "amount" ? "…" : fmt(expense.amount)}
                        </span>
                      )}
                    </td>

                    {/* Amount Paid */}
                    <td className="px-3 py-2.5 text-right cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "amountPaid", String(expense.amountPaid))}>
                      {isInline && inlineField === "amountPaid" ? (
                        <input ref={inputRef} type="number" step="0.01" min="0" value={inlineValue} autoFocus
                          onChange={e => setInlineValue(e.target.value)}
                          onBlur={() => commitInline(expense)}
                          onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                          className="w-24 px-2 py-0.5 text-right font-mono text-xs focus:outline-none"
                          style={{ border: `1px solid ${GOLD}`, background: "#fff", color: OBSIDIAN }} />
                      ) : (
                        <span className="font-mono text-xs" style={{ color: expense.amountPaid > 0 ? MUTED_GRN : "#C8C4BF" }}>
                          {saving === expense.id && inlineField === "amountPaid" ? "…" : fmt(expense.amountPaid)}
                        </span>
                      )}
                    </td>

                    {/* Remaining */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ borderRight: `1px solid ${BORDER}`, color: remaining === 0 ? "#C8C4BF" : remaining > 500 ? MUTED_RED : OBSIDIAN }}>
                      {fmt(remaining)}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 whitespace-nowrap cursor-pointer" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "status", expense.status ?? "")}>
                      {isInline && inlineField === "status" ? (
                        <select value={inlineValue} autoFocus
                          onChange={e => setInlineValue(e.target.value)}
                          onBlur={() => commitInline(expense)}
                          onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                          className="px-2 py-0.5 text-xs focus:outline-none"
                          style={{ border: `1px solid ${GOLD}`, background: "#fff", color: OBSIDIAN }}>
                          <option value="">Auto</option>
                          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <StatusBadge expense={{ status: expense.status, paymentDate: expense.paymentDate, dueDate: expense.dueDate, amountPaid: expense.amountPaid, amount: expense.amount }} />
                      )}
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2.5 text-xs cursor-pointer max-w-[180px]" style={{ borderRight: `1px solid ${BORDER}` }}
                      onClick={() => !isInline && startInline(expense.id, "notes", expense.notes ?? "")}>
                      {isInline && inlineField === "notes" ? (
                        <input ref={inputRef} type="text" value={inlineValue} autoFocus
                          onChange={e => setInlineValue(e.target.value)}
                          onBlur={() => commitInline(expense)}
                          onKeyDown={e => { if (e.key === "Enter") commitInline(expense); if (e.key === "Escape") cancelInline(); }}
                          className="w-full px-1 py-0.5 text-xs focus:outline-none"
                          style={{ border: `1px solid ${GOLD}`, background: "#fff", color: OBSIDIAN }} />
                      ) : (
                        <span className="truncate block" style={{ color: expense.notes ? WARM_GRAY : "#D4D0CB" }}>
                          {expense.notes || "—"}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {onMove && (
                          <select value="" onChange={e => { const v = e.target.value; if (v) onMove(expense.id, v); }}
                            style={{ fontSize: 10, color: WARM_GRAY, border: `1px solid ${BORDER}`, background: IVORY, padding: "2px 3px", letterSpacing: "0.04em" }}>
                            <option value="">Move…</option>
                            <option value="expenses">Expenses</option>
                            <option value="business">Business Finances</option>
                            <option value="annual">Annual Expenses</option>
                            <option value="liens">Outstanding Obligations</option>
                            <option value="groceries">Groceries</option>
                            <option value="restaurants">Restaurants</option>
                            <option value="incidental">Incidental</option>
                            <option value="fuel">Fuel</option>
                            <option value="income">Income</option>
                          </select>
                        )}
                        <button onClick={() => setEditingRow(expense)}
                          className="px-2 py-0.5 text-xs tracking-wide"
                          style={{ color: OBSIDIAN, border: `1px solid ${BORDER}`, letterSpacing: "0.08em" }}>Edit</button>
                        {onDelete && (
                          <button onClick={() => onDelete(expense.id)}
                            className="px-2 py-0.5 text-xs tracking-wide"
                            style={{ color: MUTED_RED, border: `1px solid #D4B5B5`, letterSpacing: "0.08em" }}>Del</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: headerColor, borderTop: `1px solid rgba(255,255,255,0.1)` }}>
                  <td className="px-4 py-3 text-xs uppercase tracking-widest" colSpan={3}
                    style={{ color: headerTextColor ?? "rgba(255,255,255,0.5)", borderRight: "1px solid rgba(255,255,255,0.07)", letterSpacing: "0.16em" }}>
                    {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: headerTextColor ?? "#ffffff", borderRight: "1px solid rgba(255,255,255,0.08)" }}>{fmt(totalAmount)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: headerTextColor ? "#15803d" : "#86efac", borderRight: "1px solid rgba(255,255,255,0.08)" }}>{fmt(totalPaid)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: headerTextColor ?? "#ffffff", borderRight: "1px solid rgba(255,255,255,0.08)" }}>{fmt(totalRemaining)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}
