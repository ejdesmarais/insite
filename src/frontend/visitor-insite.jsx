import React, { useState, useEffect, useRef } from "react";
import {
  Search, Sparkles, TrendingUp, TrendingDown, Building2, Users, Repeat, Flame,
  ChevronDown, ChevronRight, Globe, MapPin, Clock, FileText, Mail, RefreshCw,
  ArrowUpRight, Eye, Download, Target, CheckCircle2,
  LayoutDashboard, BarChart3, UserCircle2, Filter, ExternalLink,
  PlayCircle, Calculator, BookOpen, FileBarChart2, MousePointerClick, Copy, Menu, X
} from "lucide-react";
import egainLogo from "./assets/egain-logo-purple.webp";

/* ------------------------------- Helpers --------------------------------- */

// Format a UTC timestamp as a date in the browser's local timezone.
// Uses the session's raw `ts` field so dates reflect where the visitor was,
// not the UTC date (which would read as "next day" for US west-coast sessions).
function fmtLocalDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreTone(n) {
  if (n >= 80) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (n >= 60) return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-slate-100 text-slate-600 ring-slate-500/20";
}

function ScoreBadge({ value }) {
  return (
    <span className={`vi-mono inline-flex items-center justify-center min-w-[2.6rem] px-2 py-0.5 rounded-md text-xs font-semibold ring-1 ring-inset ${scoreTone(value)}`}>
      {value}
    </span>
  );
}

function StagePill({ stage }) {
  const tones = {
    Awareness: "bg-slate-100 text-slate-600",
    Research:  "bg-fuchsia-50 text-fuchsia-800",
    Evaluation:"bg-fuchsia-50 text-fuchsia-600",
    Purchase:  "bg-emerald-50 text-emerald-700",
  };
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${tones[stage] || tones.Awareness}`}>{stage}</span>;
}

function TrendCell({ value }) {
  const up = value >= 0;
  return (
    <span className={`vi-mono inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {up ? "+" : ""}{value}%
    </span>
  );
}

function daysSince(ts) {
  if (!ts) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function getSellerCue(account) {
  const idleDays = daysSince(account.lastActivity);
  const lateStage = account.stage === 'Evaluation' || account.stage === 'Purchase';

  if (account.intent >= 75 && lateStage && account.trend >= 20) {
    return {
      label: "Follow up",
      reason: "High intent rising",
      icon: Flame,
      level: "urgent",
      badge: "bg-rose-50 text-rose-700 ring-rose-600/20",
      row: "bg-rose-50/35 hover:bg-rose-50/70"
    };
  }

  if (idleDays !== null && idleDays >= 5 && account.intent >= 65 && account.icp >= 65) {
    return {
      label: "Re-engage",
      reason: `${idleDays} days idle`,
      icon: Clock,
      level: "attention",
      badge: "bg-amber-50 text-amber-700 ring-amber-600/20",
      row: "bg-amber-50/30 hover:bg-amber-50/65"
    };
  }

  if (account.trend >= 50 && account.intent >= 55) {
    return {
      label: "Watch",
      reason: "Intent rising",
      icon: TrendingUp,
      level: "watch",
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
      row: "hover:bg-fuchsia-50/40"
    };
  }

  return null;
}

function SellerCueBadge({ account, compact = false }) {
  const cue = getSellerCue(account);
  if (!cue) return <span className="text-xs text-slate-300">—</span>;
  const Icon = cue.icon;
  return (
    <span title={cue.reason} className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${cue.badge}`}>
      <Icon size={12} />
      {cue.label}
      {!compact && <span className="font-medium opacity-75">· {cue.reason}</span>}
    </span>
  );
}

function AITag({ children = "AI" }) {
  return (
    <span className="vi-brand-bg inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white">
      <Sparkles size={11} />
      {children}
    </span>
  );
}

function SignalTag({ children = "Signal" }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
      <BarChart3 size={11} />
      {children}
    </span>
  );
}

function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          value ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
        }`}>
        {value || label}
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[150px] py-1">
          {value && (
            <button onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100 mb-1">
              Clear
            </button>
          )}
          {options.map(opt => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-800 ${value === opt ? 'bg-fuchsia-50 text-fuchsia-800 font-medium' : 'text-slate-700'}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInput({ value, onChange }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search companies, domains…"
        className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100 transition" />
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">{children}</div>;
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse bg-slate-100 rounded ${className}`} />;
}

function formatRetryTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/* ------------------------------- Top Nav --------------------------------- */

function TopNav({ active, onNav, searchQuery, onSearch, aiMode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [
    { id: "dashboard", label: "Dashboard" },
  ];
  const go = (id) => { setMenuOpen(false); onNav(id); };
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-14 flex items-center gap-4 lg:gap-8">
        <button onClick={() => go("dashboard")} className="flex items-center gap-2.5 shrink-0">
          <img src={egainLogo} alt="eGain" className="h-7 w-auto shrink-0" />
          <div className="leading-none text-left">
            <div className="text-[10px] font-medium text-slate-400 tracking-wide">VISITOR IN<span className="vi-brand-text">SITE</span></div>
          </div>
        </button>

        <nav className="hidden lg:flex items-center gap-1">
          {items.map((it) => (
            <button key={it.id} onClick={() => go(it.id)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                active === it.id ? "bg-fuchsia-50 text-fuchsia-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              }`}>
              {it.label}
            </button>
          ))}
        </nav>

        {active === "dashboard" && (
          <div className="hidden md:block flex-1 max-w-md ml-auto">
            <SearchInput value={searchQuery} onChange={onSearch} />
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto md:ml-0">
          {aiMode === 'live' && (
            <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-fuchsia-50 text-fuchsia-600 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
              AI engine live
            </span>
          )}
          {aiMode === 'simulated' && (
            <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Demo AI seeded
            </span>
          )}
          <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu"
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-50">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-slate-100 bg-white px-4 sm:px-8 py-3 space-y-2 vi-fade-in">
          {active === "dashboard" && (
            <div className="md:hidden">
              <SearchInput value={searchQuery} onChange={onSearch} />
            </div>
          )}
          <nav className="grid gap-1">
            {items.map((it) => (
              <button key={it.id} onClick={() => go(it.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  active === it.id ? "bg-fuchsia-50 text-fuchsia-800" : "text-slate-600 hover:bg-slate-50"
                }`}>
                {it.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

/* --------------------------- Dashboard ----------------------------------- */

const KPI_ICONS = [Building2, Flame, Repeat, TrendingUp];
const KPI_SUBS  = ['identified this period', 'intent score ≥ 75', '2+ sessions this period', 'week-over-week activity'];
const KPI_KEYS  = ['companiesIdentified', 'highIntentAccounts', 'repeatVisitors', 'trendingUp'];
const KPI_LABELS = ['Companies Identified', 'High Intent Accounts', 'Repeat Visitors', 'Accounts Trending Up'];

function Dashboard({ accounts, kpis, insights, onOpenAccount, searchQuery }) {
  const [filterIndustry, setFilterIndustry] = useState(null);
  const [filterStage,    setFilterStage]    = useState(null);
  const [filterIcp,      setFilterIcp]      = useState(null);

  const industries = [...new Set(accounts.map(a => a.industry).filter(Boolean))].sort();
  const stages     = ['Awareness', 'Research', 'Evaluation', 'Purchase'];
  const icpBands   = ['High (75+)', 'Medium (50–74)', 'Low (<50)'];

  const filtered = accounts.filter(a => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (q) {
      const haystack = `${a.name} ${a.site || ''} ${a.industry || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filterIndustry && a.industry !== filterIndustry) return false;
    if (filterStage    && a.stage    !== filterStage)    return false;
    if (filterIcp) {
      if (filterIcp === 'High (75+)'     && a.icp < 75)                    return false;
      if (filterIcp === 'Medium (50–74)' && (a.icp < 50 || a.icp >= 75))  return false;
      if (filterIcp === 'Low (<50)'      && a.icp >= 50)                   return false;
    }
    return true;
  });

  const loading = !accounts.length;

  return (
    <div className="vi-fade-in max-w-[1440px] mx-auto px-4 sm:px-8 py-5 sm:py-7">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="vi-display text-2xl font-bold tracking-tight text-slate-900">Visitor In<span className="vi-brand-text">Site</span></h1>
          <p className="text-sm text-slate-500 mt-1">Turn website behavior into sales-ready signals.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-500">
            <Clock size={12} className="text-slate-400" /> Last 14 days
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {KPI_KEYS.map((key, i) => {
          const Icon = KPI_ICONS[i];
          return (
            <div key={key} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-500">{KPI_LABELS[i]}</span>
                <span className="w-8 h-8 rounded-lg bg-fuchsia-50 grid place-items-center text-fuchsia-700"><Icon size={15} /></span>
              </div>
              {loading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="vi-mono text-[26px] font-semibold leading-none text-slate-900">{kpis[key]}</span>
                </div>
              )}
              <div className="text-[11px] text-slate-400 mt-1.5">{KPI_SUBS[i]}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        {/* Hot accounts table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-500" />
              <h2 className="text-[15px] font-semibold text-slate-900">Identified Accounts</h2>
              <span className="text-xs text-slate-400">{kpis?.highIntentAccounts ?? '—'} accounts above intent threshold</span>
            </div>
          </div>

          <div className="px-4 sm:px-5 py-3 flex items-center flex-wrap gap-2 border-b border-slate-100 bg-slate-50/60">
            <Filter size={13} className="text-slate-400 mr-1" />
            <FilterDropdown label="Industry"     options={industries} value={filterIndustry} onChange={setFilterIndustry} />
            <FilterDropdown label="Buying Stage" options={stages}     value={filterStage}    onChange={setFilterStage}    />
            <FilterDropdown label="ICP Fit"      options={icpBands}   value={filterIcp}      onChange={setFilterIcp}      />
            {(filterIndustry || filterStage || filterIcp) && (
              <button onClick={() => { setFilterIndustry(null); setFilterStage(null); setFilterIcp(null); }}
                className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 ml-1">
                Clear all
              </button>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              [1,2,3].map(i => <div key={i} className="px-4 py-3.5"><Skeleton className="h-12" /></div>)
            ) : filtered.map((a) => {
              const cue = getSellerCue(a);
              return (
                <button key={a.id} onClick={() => onOpenAccount(a.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${cue?.row || 'hover:bg-fuchsia-50/40'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`w-8 h-8 rounded-md ${a.color} grid place-items-center text-white text-[10px] font-bold shrink-0`}>{a.initials}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 text-[13px] truncate">{a.name}</div>
                      <div className="text-[11px] text-slate-400">{a.industry} · {a.revenue}</div>
                    </div>
                    <TrendCell value={a.trend} />
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pl-[42px] text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">ICP <ScoreBadge value={a.icp} /></span>
                    <span className="inline-flex items-center gap-1">Intent <ScoreBadge value={a.intent} /></span>
                    <StagePill stage={a.stage} />
                    <span className="vi-mono">{a.visitors} visitors</span>
                    {cue && <SellerCueBadge account={a} compact />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="font-semibold px-5 py-2.5">Company</th>
                  <th className="font-semibold px-3 py-2.5">Industry</th>
                  <th className="font-semibold px-3 py-2.5 text-right">Employees</th>
                  <th className="font-semibold px-3 py-2.5 text-right">Revenue</th>
                  <th className="font-semibold px-3 py-2.5 text-center">ICP</th>
                  <th className="font-semibold px-3 py-2.5 text-center">Intent</th>
                  <th className="font-semibold px-3 py-2.5">Stage</th>
                  <th className="font-semibold px-3 py-2.5 text-center">Visitors</th>
                  <th className="font-semibold px-3 py-2.5">Action</th>
                  <th className="font-semibold px-5 py-2.5 text-right">Trend</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="px-5 py-3"><Skeleton className="h-9 w-48" /></td>
                      {[1,2,3,4,5,6,7,8,9].map(j => <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-16" /></td>)}
                    </tr>
                  ))
                ) : filtered.map((a) => {
                  const cue = getSellerCue(a);
                  return (
                    <tr key={a.id} onClick={() => onOpenAccount(a.id)}
                      className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${cue?.row || 'hover:bg-fuchsia-50/40'}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-md ${a.color} grid place-items-center text-white text-[10px] font-bold shrink-0`}>{a.initials}</span>
                          <div>
                            <div className="font-semibold text-slate-900">{a.name}</div>
                            <div className="text-[11px] text-slate-400">{a.site}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{a.industry}</td>
                      <td className="px-3 py-3 text-right vi-mono text-slate-600">{a.employees}</td>
                      <td className="px-3 py-3 text-right vi-mono text-slate-600">{a.revenue}</td>
                      <td className="px-3 py-3 text-center"><ScoreBadge value={a.icp} /></td>
                      <td className="px-3 py-3 text-center"><ScoreBadge value={a.intent} /></td>
                      <td className="px-3 py-3"><StagePill stage={a.stage} /></td>
                      <td className="px-3 py-3 text-center vi-mono text-slate-600">{a.visitors}</td>
                      <td className="px-3 py-3"><SellerCueBadge account={a} /></td>
                      <td className="px-5 py-3 text-right"><TrendCell value={a.trend} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>Showing {filtered.length}{filtered.length !== accounts.length ? ` of ${accounts.length}` : ''} identified accounts</span>
            <span className="inline-flex items-center gap-1"><Clock size={12} /> Derived from web log data</span>
          </div>
        </div>

        {/* Signals rail */}
        <aside className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <SignalTag>Signals</SignalTag>
          </div>
          <div className="space-y-3">
            {(!insights || !insights.length) ? (
              [1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)
            ) : insights.map((ins, i) => (
              <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{ins.tag}</div>
                <p className="text-[12.5px] leading-relaxed text-slate-700">{ins.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------- Account shell (tabs) ------------------------------- */

function AccountHeader({ account, tab, setTab, onBackToAccounts }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "journey",  label: "Journey Timeline" },
    { id: "intent",   label: "Intent Analysis" },
    { id: "actions",  label: "Recommended Actions" },
  ];
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-5">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
          <button onClick={onBackToAccounts} className="hover:text-slate-600 cursor-pointer">
            Accounts
          </button>
          <ChevronRight size={12} />
          <span className="text-slate-600 font-medium">{account.name}</span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 lg:gap-6 pb-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${account.color} grid place-items-center text-white text-lg font-bold shadow-sm`}>{account.initials}</div>
            <div>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                <h1 className="vi-display text-lg sm:text-xl font-bold tracking-tight text-slate-900">{account.name}</h1>
                <StagePill stage={account.stage} />
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-[13px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Building2 size={13} className="text-slate-400" />{account.industry}</span>
                <span className="inline-flex items-center gap-1.5"><BarChart3 size={13} className="text-slate-400" />{account.revenue} revenue</span>
                <span className="inline-flex items-center gap-1.5"><Users size={13} className="text-slate-400" />{account.employees} employees</span>
                <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-slate-400" />{account.hq}</span>
                <span className="inline-flex items-center gap-1.5 text-fuchsia-700"><Globe size={13} />{account.site}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-3 shrink-0">
            <div className="text-center px-5 py-2.5 rounded-xl bg-fuchsia-50 ring-1 ring-inset ring-fuchsia-600/15">
              <div className="vi-mono text-2xl font-semibold text-fuchsia-800 leading-none">{account.icp}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700/80 mt-1">ICP Score</div>
            </div>
            <div className="text-center px-5 py-2.5 rounded-xl bg-fuchsia-50 ring-1 ring-inset ring-fuchsia-600/15">
              <div className="vi-mono text-2xl font-semibold text-fuchsia-700 leading-none">{account.intent}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-600/80 mt-1">Intent Score</div>
            </div>
          </div>
        </div>

        <nav className="flex gap-5 -mb-px overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`pb-2.5 text-[13px] font-medium border-b-2 transition-colors shrink-0 ${
                tab === t.id ? "border-fuchsia-700 text-fuchsia-800" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* -------------------- Account Overview ----------------------------------- */

function AccountOverview({ account, detail, aiContent, aiLoading, onRegenerate, regenInfo, aiMode }) {
  const sessions = detail?.sessions ?? [];
  const totalSessions = detail?.totalSessions ?? account.totalSessions;

  return (
    <div className="vi-fade-in max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
      {/* AI Executive Summary */}
      <div className="vi-ai-card-tint rounded-xl p-4 sm:p-6 shadow-sm mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
          <div className="flex items-center flex-wrap gap-2.5">
            <AITag>AI Executive Summary</AITag>
            <span className="text-[11px] text-slate-400">
              Generated from {totalSessions} sessions
            </span>
            {aiContent?.generatedAt && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                <Clock size={12} /> {new Date(aiContent.generatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={onRegenerate}
              disabled={aiLoading || !!regenInfo?.retryAfter}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <RefreshCw size={13} className={aiLoading ? "animate-spin" : ""} />
              {aiLoading ? "Generating…" : "Regenerate"}
            </button>
            {regenInfo?.retryAfter && (
              <span className="text-[11px] text-slate-400">Available at {formatRetryTime(regenInfo.retryAfter)}</span>
            )}
            {aiMode === 'simulated' && !regenInfo?.retryAfter && (
              <span className="text-[11px] text-slate-400">Using seeded demo content</span>
            )}
          </div>
        </div>

        {aiLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : aiContent?.summary ? (
          <p className="text-[15px] leading-[1.7] text-slate-700 max-w-4xl">{aiContent.summary}</p>
        ) : (
          <p className="text-[15px] leading-[1.7] text-slate-500 italic">AI summary will appear here once generated.</p>
        )}

        {aiContent?.recommendations?.[0] && (
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg bg-fuchsia-50/70 border border-fuchsia-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Target size={15} className="text-fuchsia-700 shrink-0" />
              <div className="text-[13px]">
                <span className="font-semibold text-fuchsia-900">Recommended action: </span>
                <span className="text-fuchsia-900">{aiContent.recommendations[0].body}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Unique visitors", value: detail?.visitors ?? account.visitors, sub: `${account.visitors} IP${account.visitors !== 1 ? 's' : ''} identified`, icon: Users },
          { label: "Total sessions", value: totalSessions, sub: detail ? `Avg. duration ${Math.floor((detail.avgDurationS||0)/60)}m ${(detail.avgDurationS||0)%60}s` : '—', icon: MousePointerClick },
          { label: "Pages per session", value: detail?.pagesPerSession ?? '—', sub: "avg across all sessions", icon: Eye },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{s.label}</span>
              <s.icon size={15} className="text-slate-300" />
            </div>
            <div className="vi-mono text-2xl font-semibold text-slate-900">{s.value}</div>
            <div className="text-[11px] text-slate-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Top pages */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <SectionLabel>Top content consumed</SectionLabel>
          <div className="space-y-2.5">
            {(detail?.topPages ?? []).slice(0, 5).map((p) => (
              <div key={p.path} className="flex items-center justify-between text-[13px]">
                <span className="text-slate-700">{p.label}</span>
                <span className="vi-mono text-xs text-slate-400">{p.views} views</span>
              </div>
            ))}
            {!detail && [1,2,3,4].map(i => <Skeleton key={i} className="h-4" />)}
          </div>
        </div>

        {/* Visitor signals */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <SectionLabel>Identified visitor signals</SectionLabel>
          <div className="space-y-2.5 text-[13px]">
            {(detail?.visitorSummary ?? []).map((v) => (
              <div key={v.visitorId} className="flex gap-2.5">
                <UserCircle2 size={16} className="text-slate-300 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-800">Visitor {v.visitorId}</span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {v.sessionCount} session{v.sessionCount !== 1 ? 's' : ''} · {v.uniquePages} unique pages
                  </div>
                </div>
              </div>
            ))}
            {!detail && [1,2,3].map(i => <Skeleton key={i} className="h-10" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Journey Timeline ----------------------------------- */

function groupIntoMoments(sessions) {
  if (!sessions.length) return [];
  const sorted = [...sessions].sort((a, b) => a.ts - b.ts);

  // Group into 3-day calendar windows anchored to the earliest session.
  // This creates 4-6 natural moments for a 2-week account without relying on
  // a gap threshold that would collapse evenly-spaced daily visits into one blob.
  const WINDOW_MS = 3 * 24 * 3600 * 1000;
  const epoch = sorted[0].ts;
  const byWindow = {};
  for (const s of sorted) {
    const windowIdx = Math.floor((s.ts - epoch) / WINDOW_MS);
    (byWindow[windowIdx] || (byWindow[windowIdx] = [])).push(s);
  }
  const clusters = Object.values(byWindow);

  return clusters.reverse().map(cs => {
    const types    = cs.map(s => s.type);
    const visitors = [...new Set(cs.map(s => s.visitorId))];
    const convCount = types.filter(t => t === 'conversion').length;
    const highCount = types.filter(t => t === 'high').length;

    const bofuCount = convCount + highCount;
    let label, sublabel, badge;
    if (convCount >= 2) {
      label    = 'Demo / Trial Evaluation';
      sublabel = `${convCount} demo or free-trial request${convCount > 1 ? 's' : ''}`;
      badge    = 'conversion';
    } else if (bofuCount >= 2 && visitors.length >= 2) {
      label    = 'Multi-visitor Pricing Evaluation';
      sublabel = `${visitors.length} visitors explored pricing or demo`;
      badge    = 'spike';
    } else if (bofuCount >= 2) {
      label    = 'Pricing Spike';
      sublabel = `${bofuCount} pricing or demo visits in this window`;
      badge    = 'spike';
    } else if (bofuCount === 1 && visitors.length > 1) {
      label    = 'Multi-visitor Interest';
      sublabel = `${visitors.length} distinct visitors, including pricing or demo activity`;
      badge    = 'multi';
    } else if (convCount === 1) {
      label    = 'Demo / Trial Request';
      sublabel = 'Demo request or free trial sign-up';
      badge    = 'conversion';
    } else if (highCount === 1) {
      label    = 'High-intent Visit';
      sublabel = 'Pricing or demo page activity';
      badge    = 'high';
    } else if (cs.length >= 3) {
      label    = 'Research Phase';
      sublabel = `${cs.length} sessions exploring solutions & content`;
      badge    = 'content';
    } else {
      label    = 'Exploratory Visit';
      sublabel = 'Top-of-funnel awareness activity';
      badge    = 'entry';
    }

    const dateFirst = fmtLocalDate(cs[0].ts);
    const dateLast  = fmtLocalDate(cs[cs.length - 1].ts);
    return {
      key:          `${cs[0].ts}-${cs[cs.length - 1].ts}`,
      sessions:     [...cs].reverse(),
      label, sublabel, badge,
      visitors,
      sessionCount: cs.length,
      dateRange:    dateFirst === dateLast ? dateFirst : `${dateFirst} – ${dateLast}`,
      firstTs:      cs[0].ts,
      lastTs:       cs[cs.length - 1].ts,
    };
  });
}

const MOMENT_STYLE = {
  conversion: { dot: 'bg-emerald-500 ring-emerald-100', badge: 'bg-emerald-50 text-emerald-700',   border: 'border-emerald-200 bg-emerald-50/30'  },
  spike:      { dot: 'bg-fuchsia-700 ring-fuchsia-100', badge: 'bg-fuchsia-50 text-fuchsia-800',   border: 'border-fuchsia-200 bg-fuchsia-50/30'  },
  multi:      { dot: 'bg-blue-400 ring-blue-100',        badge: 'bg-blue-50 text-blue-700',         border: 'border-blue-200 bg-blue-50/20'         },
  high:       { dot: 'bg-fuchsia-500 ring-fuchsia-100', badge: 'bg-fuchsia-50 text-fuchsia-700',   border: 'border-fuchsia-100 bg-fuchsia-50/20'  },
  content:    { dot: 'bg-slate-400 ring-slate-100',      badge: 'bg-slate-100 text-slate-600',      border: 'border-slate-200'                       },
  entry:      { dot: 'bg-slate-300 ring-slate-100',      badge: 'bg-slate-100 text-slate-500',      border: 'border-slate-200'                       },
};

const SESSION_CHIP = {
  conversion: 'bg-emerald-50 text-emerald-700',
  high:       'bg-fuchsia-50 text-fuchsia-800',
  content:    'bg-fuchsia-50 text-fuchsia-600',
  entry:      'bg-slate-100 text-slate-600',
};

function JourneyTimeline({ detail }) {
  const [openMoments,  setOpenMoments]  = useState({});
  const [openSessions, setOpenSessions] = useState({});
  const sessions = detail?.sessions ?? [];
  const moments  = groupIntoMoments(sessions);

  return (
    <div className="vi-fade-in max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
      <div className="mb-5">
        <h2 className="vi-display text-lg font-bold tracking-tight text-slate-900">Account Journey</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">Sessions grouped into key moments — click to expand individual visits.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 sm:p-6">
        {!detail ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : moments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No sessions recorded for this account.</p>
        ) : (
          <div className="relative pl-5 sm:pl-6">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
            <div className="space-y-2">
              {moments.map((moment, mIdx) => {
                const ms     = MOMENT_STYLE[moment.badge] ?? MOMENT_STYLE.entry;
                const isOpen = !!openMoments[moment.key];
                // Gap indicator between moments
                const prev      = moments[mIdx + 1];
                const gapDays   = prev ? Math.round((moment.firstTs - prev.lastTs) / 86400000) : 0;

                return (
                  <React.Fragment key={moment.key}>
                    {gapDays >= 5 && (
                      <div className="pl-1 py-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span>{gapDays}-day gap</span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>
                    )}
                    <div className="relative">
                      <span className={`absolute -left-6 top-[18px] w-[15px] h-[15px] rounded-full ring-4 ${ms.dot}`} />
                      <div className={`rounded-xl border transition-all ${isOpen ? `${ms.border} shadow-sm` : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <button
                          onClick={() => setOpenMoments(p => ({ ...p, [moment.key]: !p[moment.key] }))}
                          className="w-full text-left px-4 py-3">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <div className="sm:w-32 shrink-0 text-[12px] text-slate-500">{moment.dateRange}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[14px] font-semibold text-slate-900">{moment.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ms.badge}`}>
                                  {moment.badge === 'conversion' ? 'Conversion' : moment.badge === 'spike' ? 'Spike' : moment.badge === 'multi' ? 'Multi-visitor' : moment.badge === 'high' ? 'High-intent' : moment.badge === 'content' ? 'Research' : 'Activity'}
                                </span>
                              </div>
                              <div className="text-[12px] text-slate-500 mt-0.5">{moment.sublabel}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1"><Users size={12} />{moment.visitors.length} visitor{moment.visitors.length !== 1 ? 's' : ''}</span>
                              <span className="inline-flex items-center gap-1"><MousePointerClick size={12} />{moment.sessionCount} session{moment.sessionCount !== 1 ? 's' : ''}</span>
                              <ChevronDown size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-slate-100/70">
                            <div className="space-y-1.5 mt-3">
                              {moment.sessions.map(e => {
                                const chip    = SESSION_CHIP[e.type] ?? SESSION_CHIP.entry;
                                const isSOpen = !!openSessions[e.id];
                                return (
                                  <button key={e.id}
                                    onClick={() => setOpenSessions(p => ({ ...p, [e.id]: !p[e.id] }))}
                                    className={`w-full text-left rounded-lg border transition-all ${isSOpen ? 'border-fuchsia-200 bg-fuchsia-50/30' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5">
                                      <div className="sm:w-24 shrink-0">
                                        <div className="text-[12px] font-medium text-slate-700">{fmtLocalDate(e.ts)}</div>
                                        <div className="text-[11px] text-slate-400">{new Date(e.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[13px] font-medium text-slate-800 truncate">{e.title}</span>
                                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${chip}`}>
                                            {e.type === 'conversion' ? 'Conversion' : e.type === 'high' ? 'High-intent' : e.type === 'content' ? 'Content' : 'Entry'}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-400">Visitor {e.visitorId}</div>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                                        <span className="inline-flex items-center gap-1"><Clock size={12} />{e.formattedDuration}</span>
                                        <span className="inline-flex items-center gap-1"><Eye size={12} />{e.pageCount}p</span>
                                        <ChevronDown size={13} className={`text-slate-400 transition-transform ${isSOpen ? 'rotate-180' : ''}`} />
                                      </div>
                                    </div>
                                    {isSOpen && (
                                      <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                                        <ul className="mt-2 space-y-1">
                                          {e.detail.map((d, i) => (
                                            <li key={i} className="flex gap-2 text-[12px] text-slate-600">
                                              <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />{d}
                                            </li>
                                          ))}
                                        </ul>
                                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                                          <span>{e.referrer}</span><span>·</span><span>{e.device}</span>
                                        </div>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Intent Analysis ------------------------------------ */

function IntentAnalysis({ account, detail, aiContent, aiLoading }) {
  const stages = ["Awareness", "Research", "Evaluation", "Purchase"];
  const current = account.stage;
  const interestScores = detail?.interestScores ?? {};
  const sortedInterests = Object.entries(interestScores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="vi-fade-in max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Interest categories */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[15px] font-semibold text-slate-900">Interest Categories</h2>
            <SignalTag>Rule-based</SignalTag>
          </div>
          <p className="text-xs text-slate-400 mb-5">Weighted by page depth and repeat visits.</p>
          {!detail ? (
            <div className="space-y-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-6" />)}</div>
          ) : (
            <div className="space-y-4">
              {sortedInterests.map(([label, score]) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-medium text-slate-700">{label}</span>
                    <span className="vi-mono text-xs font-semibold text-slate-500">{score}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${score >= 80 ? "vi-brand-bg" : score >= 60 ? "bg-fuchsia-600" : "bg-fuchsia-300"}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buying stage */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Buying Stage</h2>
          <p className="text-xs text-slate-400 mb-5">Inferred from behavioral patterns across all identified visitors.</p>

          <div className="flex items-center gap-1.5 sm:gap-2 mb-6">
            {stages.map((s, i) => {
              const reached  = stages.indexOf(current) >= i;
              const isCurrent = s === current;
              return (
                <React.Fragment key={s}>
                  {i > 0 && <div className={`flex-1 h-0.5 ${reached ? "bg-fuchsia-500" : "bg-slate-200"}`} />}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`grid place-items-center rounded-full ${
                      isCurrent ? "w-10 h-10 vi-brand-bg text-white shadow-md shadow-fuchsia-200"
                        : reached ? "w-8 h-8 bg-fuchsia-100 text-fuchsia-700"
                        : "w-8 h-8 bg-slate-100 text-slate-400"
                    }`}>
                      {isCurrent ? <Target size={16} /> : <CheckCircle2 size={14} className={reached ? "" : "opacity-40"} />}
                    </div>
                    <span className={`text-[11px] font-semibold ${isCurrent ? "text-fuchsia-800" : reached ? "text-slate-600" : "text-slate-400"}`}>{s}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="vi-ai-card rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AITag>Stage rationale</AITag>
            </div>
            {aiLoading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
            ) : aiContent?.stage_rationale ? (
              <p className="text-[13px] leading-relaxed text-slate-700">{aiContent.stage_rationale}</p>
            ) : (
              <p className="text-[13px] text-slate-400 italic">Rationale will appear once AI content is generated.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Pricing/demo sessions", value: detail?.pricingVisits   ?? '—' },
              { label: "Product page sessions", value: detail?.productVisits   ?? '—' },
              { label: "Case studies read",     value: detail?.caseStudyViews  ?? '—' },
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                <div className="vi-mono text-lg font-semibold text-slate-900">{m.value}</div>
                <div className="text-[10px] font-medium text-slate-400 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Recommended Actions -------------------------------- */

const STATIC_ASSETS = [
  {
    icon: FileText,
    type: "Customer Stories",
    title: "Real AI-driven CX wins",
    meta: "eGain customer examples",
    href: "https://www.egain.com/customers/",
  },
  {
    icon: BookOpen,
    type: "eBook",
    title: "Knowledge Management for Dummies",
    meta: "eGain 3rd Special Edition",
    href: "https://www.egain.com/knowledge-management-for-dummies/",
  },
  {
    icon: FileBarChart2,
    type: "Product Sheet",
    title: null,
    meta: "eGain industry solution",
    href: null,
  },
  {
    icon: Calculator,
    type: "ROI Calculator",
    title: "eGain AI ROI Calculator",
    meta: "Interactive model",
    href: "https://www.egain.com/roi-calculator/",
  },
];

function industryAssetUrl(industry = "") {
  const value = industry.toLowerCase();
  if (value.includes("bank")) return "https://www.egain.com/products/retail-banking-suite/";
  if (value.includes("financial")) return "https://www.egain.com/what-is-knowledge-management-in-financial-services/";
  if (value.includes("health insurance")) return "https://www.egain.com/what-is-knowledge-management-in-health-insurance/";
  if (value.includes("health")) return "https://www.egain.com/what-is-knowledge-management-in-healthcare-providers/";
  if (value.includes("insurance")) return "https://www.egain.com/what-is-knowledge-management-in-insurance/";
  if (value.includes("telecommunication")) return "https://www.egain.com/what-is-knowledge-management-in-telco/";
  if (value.includes("retail")) return "https://www.egain.com/what-is-knowledge-management-in-retail/";
  if (value.includes("travel") || value.includes("aviation")) return "https://www.egain.com/what-is-knowledge-management-in-travel-hospitality-airlines/";
  return "https://www.egain.com/ai-knowledge-hub/";
}

function RecommendedActions({ account, aiContent, aiLoading, onRegenerate, regenInfo, aiMode }) {
  const [copied, setCopied] = useState(false);
  const recommendations = aiContent?.recommendations ?? [];
  const email = aiContent?.email;

  const handleCopy = () => {
    if (!email) return;
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const suggestedAssets = STATIC_ASSETS.map(a =>
    a.title === null
      ? { ...a, title: `${account.industry} Solutions Overview`, href: industryAssetUrl(account.industry) }
      : a
  );

  return (
    <div className="vi-fade-in max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="vi-display text-lg font-bold tracking-tight text-slate-900">Recommended Next Steps</h2>
          <p className="text-[13px] text-slate-500 mt-0.5">Prioritized by the AI engine from this account's intent signals.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onRegenerate}
            disabled={aiLoading || !!regenInfo?.retryAfter}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <RefreshCw size={14} className={aiLoading ? "animate-spin" : ""} />
            {aiLoading ? "Generating…" : "Regenerate plan"}
          </button>
          {regenInfo?.retryAfter && (
            <span className="text-[11px] text-slate-400">Available at {formatRetryTime(regenInfo.retryAfter)}</span>
          )}
          {aiMode === 'simulated' && !regenInfo?.retryAfter && (
            <span className="text-[11px] text-slate-400">Using seeded demo content</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
        <div className="space-y-5">
          {/* Recommendations */}
          <div className="vi-ai-card rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center flex-wrap gap-2 border-b border-slate-100">
              <AITag>AI Recommendations</AITag>
              {aiContent?.generatedAt && (
                <span className="text-[11px] text-slate-400">Generated {new Date(aiContent.generatedAt).toLocaleDateString()}</span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {aiLoading ? (
                [1,2,3].map(i => <div key={i} className="px-5 py-4"><Skeleton className="h-16" /></div>)
              ) : recommendations.length > 0 ? recommendations.map((r, i) => (
                <div key={r.title} className="px-4 sm:px-5 py-4 flex gap-3 sm:gap-4">
                  <span className="vi-mono w-7 h-7 rounded-lg bg-fuchsia-50 text-fuchsia-800 text-[13px] font-semibold grid place-items-center shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-[14px] font-semibold text-slate-900">{r.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.priority === "high" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                        {r.priority === "high" ? "High priority" : "Medium priority"}
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-600 leading-relaxed mt-1">{r.body}</p>
                  </div>
                </div>
              )) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  {aiContent ? "No recommendations available." : "Open this tab to generate AI recommendations."}
                </div>
              )}
            </div>
          </div>

          {/* Outreach email */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100">
              <div className="flex items-center flex-wrap gap-2">
                <Mail size={15} className="text-slate-400" />
                <h3 className="text-[15px] font-semibold text-slate-900">Suggested Outreach Message</h3>
                <AITag>AI drafted</AITag>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors">
                  <Copy size={13} /> {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="px-4 sm:px-5 py-4">
              {aiLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
              ) : email ? (
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-[13px] leading-relaxed text-slate-700">
                  <div className="text-xs text-slate-400 mb-3">
                    <span className="font-semibold text-slate-500">Subject:</span> {email.subject}
                  </div>
                  <div className="whitespace-pre-wrap">{email.body}</div>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">Generate AI content to see a drafted outreach email.</p>
              )}
            </div>
          </div>
        </div>

        {/* Suggested assets */}
        <aside className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <SectionLabel>Suggested assets to share</SectionLabel>
          <div className="space-y-3">
            {suggestedAssets.map((a) => (
              <a
                key={a.title}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-lg border border-slate-100 hover:border-fuchsia-200 hover:bg-fuchsia-50/30 p-3 transition-colors"
              >
                <div className="flex gap-3">
                  <span className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-fuchsia-100 grid place-items-center text-slate-500 group-hover:text-fuchsia-700 shrink-0 transition-colors">
                    <a.icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700">{a.type}</div>
                    <div className="text-[13px] font-medium text-slate-800 leading-snug mt-0.5">{a.title}</div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">{a.meta} <ExternalLink size={10} /></div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------- Placeholder ---------------------------------------- */

function ComingSoon({ label }) {
  return (
    <div className="vi-fade-in max-w-[1440px] mx-auto px-4 sm:px-8 py-24 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 grid place-items-center text-slate-400 mb-4">
        <LayoutDashboard size={20} />
      </div>
      <h2 className="text-lg font-semibold text-slate-800">{label}</h2>
      <p className="text-sm text-slate-500 mt-1">This section isn't part of the current prototype.</p>
    </div>
  );
}

/* -------------------- App root ------------------------------------------- */

export default function VisitorIntelligence() {
  const [nav, setNav]           = useState("dashboard");
  const [tab, setTab]           = useState("overview");
  const [accounts, setAccounts] = useState([]);
  const [kpis, setKpis]         = useState(null);
  const [insights, setInsights] = useState([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedId, setSelectedId]       = useState(null);
  const [accountDetail, setAccountDetail] = useState(null);
  const [aiContent, setAiContent]         = useState(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [regenInfo, setRegenInfo]         = useState(null);
  const [aiMode, setAiMode]               = useState(null); // 'live' | 'simulated' | null

  // Fetch AI mode from backend status
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(({ hasOpenAI }) => setAiMode(hasOpenAI ? 'live' : 'simulated'))
      .catch(() => {});
  }, []);

  // Dashboard data
  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(({ accounts: accs, kpis: k, insights: ins }) => {
        setAccounts(accs);
        setKpis(k);
        setInsights(ins);
      })
      .catch(err => console.error('Failed to load accounts:', err));
  }, []);

  // Account detail when selected
  useEffect(() => {
    if (!selectedId) return;
    setAccountDetail(null);
    setAiContent(null);
    setRegenInfo(null);
    fetch(`/api/accounts/${selectedId}`)
      .then(r => r.json())
      .then(setAccountDetail)
      .catch(err => console.error('Failed to load account detail:', err));
  }, [selectedId]);

  // AI content — load on first visit to any AI-consuming tab
  useEffect(() => {
    if (!selectedId) return;
    if (!['overview', 'intent', 'actions'].includes(tab)) return;
    if (aiContent || aiLoading) return;
    setAiLoading(true);
    fetch(`/api/accounts/${selectedId}/ai`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setAiContent(data); setAiLoading(false); })
      .catch(err => { console.error('Failed to load AI content:', err); setAiLoading(false); });
  }, [selectedId, tab]);

  const handleOpenAccount = (id) => {
    setSelectedId(id);
    setNav("accounts");
    setTab("overview");
  };

  const handleNav = (id) => {
    if (id !== "accounts") setSelectedId(null);
    setNav(id);
  };

  const handleRegenerate = async () => {
    if (!selectedId || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch(`/api/accounts/${selectedId}/ai/regenerate`, { method: 'POST' });
      const data = await res.json();
      if (res.status === 429) {
        setRegenInfo({ retryAfter: data.retry_after });
      } else {
        setAiContent(data);
        setRegenInfo(null);
      }
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const selectedAccount = accounts.find(a => a.id === selectedId);

  return (
    <div className="vi-root min-h-screen bg-slate-50 text-slate-900">
      <TopNav active={nav} onNav={handleNav} searchQuery={searchQuery} onSearch={setSearchQuery} aiMode={aiMode} />

      {nav === "dashboard" && (
        <Dashboard
          accounts={accounts}
          kpis={kpis}
          insights={insights}
          onOpenAccount={handleOpenAccount}
          searchQuery={searchQuery}
        />
      )}

      {nav === "accounts" && selectedAccount && (
        <>
          <AccountHeader account={selectedAccount} tab={tab} setTab={setTab} onBackToAccounts={() => handleNav("dashboard")} />
          {tab === "overview" && (
            <AccountOverview
              account={selectedAccount}
              detail={accountDetail}
              aiContent={aiContent}
              aiLoading={aiLoading}
              onRegenerate={handleRegenerate}
              regenInfo={regenInfo}
              aiMode={aiMode}
            />
          )}
          {tab === "journey" && <JourneyTimeline detail={accountDetail} />}
          {tab === "intent"  && (
            <IntentAnalysis
              account={selectedAccount}
              detail={accountDetail}
              aiContent={aiContent}
              aiLoading={aiLoading}
            />
          )}
          {tab === "actions" && (
            <RecommendedActions
              account={selectedAccount}
              aiContent={aiContent}
              aiLoading={aiLoading}
              onRegenerate={handleRegenerate}
              regenInfo={regenInfo}
              aiMode={aiMode}
            />
          )}
        </>
      )}

      {nav === "accounts" && !selectedAccount && (
        <ComingSoon label="Select an account from the dashboard" />
      )}
    </div>
  );
}
