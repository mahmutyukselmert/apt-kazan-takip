"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, BarChart3, Building2, CalendarDays, Check, ChevronRight, CircleGauge,
  CloudSun, CreditCard, Droplets, Flame, Gauge, History, LayoutDashboard, Loader2,
  Menu, Pencil, Play, Plus, RefreshCw, SlidersHorizontal, StopCircle,
  Timer, Trash2, WalletCards, X,
} from "lucide-react";

type Reading = {
  id: number; readAt: string; hrc: number; krd: number; boilerTemp: number | null;
  outsideTemp: number | null; boilerStatus: "on" | "off" | "standby";
  unitPrice: number; unitPriceTier2: number; note: string;
};
type Tariff = { id: number; effectiveFrom: string; pricePerM3: number; priceTier2: number; label: string };
type LimitVersion = { id: number; effectiveFrom: string; year: number; month: number; perHomeLimit: number; sourceLabel: string; sourceUrl: string; note: string };
type BoilerSession = {
  id: number; startedAt: string; endedAt: string | null; startHrc: number; startKrd: number;
  endHrc: number | null; endKrd: number | null; targetTemp: number | null;
  outsideTemp: number | null; note: string;
};
type BuildingSettings = { buildingName: string; apartmentCount: number; krdAlert: number; city: string };
type DashboardData = { readings: Reading[]; tariffs: Tariff[]; settings: BuildingSettings; sessions: BoilerSession[]; limitVersions: LimitVersion[] };
type EnrichedReading = Reading & {
  consumption: number | null; hours: number | null; rate: number | null; cost: number | null;
  krdDelta: number | null; recharge: number | null; appliedPrice: number | null; tier: 1 | 2 | null;
};

const MONTHLY_LIMITS = [344.73, 326.8, 302.09, 180.69, 109.01, 46.2, 35.19, 31.03, 40.69, 76.86, 161.63, 284.25];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function limitFor(data: DashboardData, year: number, monthIndex: number) {
  return data.limitVersions
    .filter((version) => version.year === year && version.month === monthIndex + 1)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.perHomeLimit ?? MONTHLY_LIMITS[monthIndex];
}

function number(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}
function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function dateLabel(value: string, compact = false) {
  return new Intl.DateTimeFormat("tr-TR", compact
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(new Date(value));
}
function durationLabel(hours: number) {
  const whole = Math.floor(hours);
  const minutes = Math.max(0, Math.round((hours - whole) * 60));
  return whole ? `${whole} sa ${minutes} dk` : `${minutes} dk`;
}
function statusLabel(status: Reading["boilerStatus"]) {
  return status === "on" ? "Çalışma sırasında" : status === "standby" ? "Sayaç referansı" : "Kapanış okuması";
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function MiniStat({ icon, label, value, sub, accent = "green" }: { icon: ReactNode; label: string; value: string; sub: string; accent?: "green" | "amber" | "blue" | "red" }) {
  return <article className="stat-card"><div className={`stat-icon stat-icon-${accent}`}>{icon}</div><div className="min-w-0"><p className="eyebrow">{label}</p><p className="stat-value">{value}</p><p className="stat-sub">{sub}</p></div></article>;
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [weather, setWeather] = useState<{ temperature: number | null; apparent: number | null; humidity: number | null; windSpeed: number | null; precipitation: number | null; weatherCode: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [active, setActive] = useState<"dashboard" | "readings" | "settings">("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sessionModal, setSessionModal] = useState<"start" | "stop" | null>(null);
  const [clock, setClock] = useState(0);
  const [form, setForm] = useState({ readAt: localDateTimeValue(), hrc: "", krd: "", readingType: "reference", note: "" });
  const [startForm, setStartForm] = useState({ startedAt: localDateTimeValue(), targetTemp: "30", outsideTemp: "", note: "" });
  const [stopForm, setStopForm] = useState({ endedAt: localDateTimeValue(), hrc: "", krd: "", outsideTemp: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Veriler alınamadı.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Veriler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    fetch("/api/weather").then((response) => response.json()).then((payload) => {
      if (typeof payload.temperature === "number") {
        setWeather(payload);
        setStartForm((current) => ({ ...current, outsideTemp: String(payload.temperature) }));
        setStopForm((current) => ({ ...current, outsideTemp: String(payload.temperature) }));
      }
    }).catch(() => undefined);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openSession = data?.sessions.find((session) => !session.endedAt) || null;
  useEffect(() => {
    if (!openSession) return;
    const first = window.setTimeout(() => setClock(Date.now()), 0);
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, [openSession]);

  const enriched = useMemo<EnrichedReading[]>(() => {
    if (!data) return [];
    const sessionByEnd = new Map(data.sessions.filter((session) => session.endedAt).map((session) => [session.endedAt, session]));
    const base = data.readings.map((reading, index) => {
      const previous = data.readings[index - 1];
      if (!previous) return { ...reading, consumption: Math.max(0, reading.hrc), hours: null, rate: null, cost: null, krdDelta: null, recharge: null, appliedPrice: null, tier: null };
      if (reading.boilerStatus === "standby") return { ...reading, consumption: null, hours: null, rate: null, cost: null, krdDelta: previous.krd - reading.krd, recharge: null, appliedPrice: null, tier: null };
      const consumption = Math.max(0, reading.hrc - previous.hrc);
      const matched = sessionByEnd.get(reading.readAt);
      const hours = matched?.endedAt
        ? Math.max(0, (new Date(matched.endedAt).getTime() - new Date(matched.startedAt).getTime()) / 3_600_000)
        : Math.max(0, (new Date(reading.readAt).getTime() - new Date(previous.readAt).getTime()) / 3_600_000);
      const krdDelta = previous.krd - reading.krd;
      return { ...reading, consumption, hours, rate: hours > 0 ? consumption / hours : null, cost: null, krdDelta, recharge: krdDelta < 0 ? Math.abs(krdDelta) : null, appliedPrice: null, tier: null };
    });
    const monthlyUsage = new Map<string, number>();
    for (const row of base) {
      if (row.consumption == null) continue;
      const key = row.readAt.slice(0, 7);
      monthlyUsage.set(key, (monthlyUsage.get(key) || 0) + row.consumption);
    }
    return base.map((row) => {
      if (row.consumption == null) return row;
      const month = Number(row.readAt.slice(5, 7)) - 1;
      const quota = limitFor(data, Number(row.readAt.slice(0, 4)), month) * data.settings.apartmentCount;
      const tier: 1 | 2 = (monthlyUsage.get(row.readAt.slice(0, 7)) || 0) > quota ? 2 : 1;
      const appliedPrice = tier === 2 && row.unitPriceTier2 > 0 ? row.unitPriceTier2 : row.unitPrice;
      return { ...row, tier, appliedPrice, cost: row.consumption * appliedPrice };
    });
  }, [data]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rows = enriched.filter((row) => row.readAt.slice(0, 7) === monthKey && row.consumption != null);
    const monthUsage = rows.reduce((sum, row) => sum + (row.consumption || 0), 0);
    const monthCost = rows.reduce((sum, row) => sum + (row.cost || 0), 0);
    const totalHours = rows.reduce((sum, row) => sum + (row.hours || 0), 0);
    const timedUsage = rows.reduce((sum, row) => sum + (row.hours && row.hours > 0 ? (row.consumption || 0) : 0), 0);
    const apartmentCount = data?.settings.apartmentCount || 20;
    const perHomeLimit = data ? limitFor(data, now.getFullYear(), now.getMonth()) : MONTHLY_LIMITS[now.getMonth()];
    const initialUsage = data?.readings[0]?.readAt.slice(0, 7) === monthKey ? Math.max(0, data.readings[0].hrc) : 0;
    const quota = perHomeLimit * apartmentCount;
    const elapsedDay = Math.max(1, now.getDate() - 1 + now.getHours() / 24);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const forecast = (monthUsage / elapsedDay) * days;
    return {
      monthUsage, initialUsage, monthCost, avgRate: totalHours ? timedUsage / totalHours : 0,
      quota, perHomeLimit, perHomeUsage: monthUsage / apartmentCount, forecast,
      latest: enriched.at(-1), quotaPct: quota ? (monthUsage / quota) * 100 : 0,
      tier: monthUsage > quota ? 2 : 1,
    };
  }, [data, enriched]);

  const chartData = useMemo(() => enriched.slice(-14).map((row) => ({
    label: dateLabel(row.readAt, true),
    gaz: row.consumption == null ? 0 : Number(row.consumption.toFixed(2)),
    hava: row.outsideTemp,
  })), [enriched]);
  const activeTariff = data?.tariffs[0];
  const latestKrdLow = !!(data && stats.latest && stats.latest.krd <= data.settings.krdAlert);
  const runningHours = openSession ? Math.max(0, (clock - new Date(openSession.startedAt).getTime()) / 3_600_000) : 0;

  function showError(err: unknown, fallback: string) {
    setError(err instanceof Error ? err.message : fallback);
  }
  function openNewReading() {
    setEditingId(null); setError("");
    setForm({
      readAt: localDateTimeValue(), hrc: stats.latest ? String(stats.latest.hrc) : "",
      krd: stats.latest ? String(stats.latest.krd) : "", readingType: "reference",
      note: stats.latest ? "Sayaç referansı / düzeltme" : "Sayaç değişimi · ilk referans",
    });
    setReadingOpen(true);
  }
  function editReading(reading: Reading) {
    setEditingId(reading.id); setError("");
    setForm({
      readAt: reading.readAt.slice(0, 16), hrc: String(reading.hrc), krd: String(reading.krd),
      readingType: reading.boilerStatus === "standby" ? "reference" : "session_end", note: reading.note || "",
    });
    setReadingOpen(true);
  }
  function openStart() {
    if (!stats.latest) { openNewReading(); setToast("Önce ilk sayaç değerini kaydedin."); return; }
    setError("");
    setStartForm({ startedAt: localDateTimeValue(), targetTemp: "30", outsideTemp: weather?.temperature == null ? "" : String(weather.temperature), note: "" });
    setSessionModal("start");
  }
  function openStop() {
    setError("");
    setStopForm({
      endedAt: localDateTimeValue(), hrc: "", krd: "",
      outsideTemp: weather?.temperature == null ? "" : String(weather.temperature), note: "",
    });
    setSessionModal("stop");
  }
  async function submitReading(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/dashboard", {
        method: editingId == null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reading", id: editingId, ...form }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Okuma kaydedilemedi.");
      setReadingOpen(false); setEditingId(null);
      setToast(editingId == null ? "Sayaç okuması kaydedildi." : "Sayaç okuması güncellendi.");
      await load();
    } catch (err) { showError(err, "Okuma kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function submitSession(event: FormEvent) {
    event.preventDefault(); if (!sessionModal) return;
    setSaving(true); setError("");
    try {
      const action = sessionModal;
      const body = action === "start"
        ? { action, ...startForm }
        : { action, ...stopForm };
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kazan işlemi tamamlanamadı.");
      setSessionModal(null);
      setToast(action === "start" ? "Kazan çalışması başlatıldı." : "Kazan kapatıldı; tüketim hesaplandı.");
      await load();
    } catch (err) { showError(err, "Kazan işlemi tamamlanamadı."); }
    finally { setSaving(false); }
  }
  async function cancelSession() {
    if (!window.confirm("Açık kazan çalışması iptal edilsin mi? Sayaç verileri silinmez.")) return;
    setSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancelSession" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Çalışma iptal edilemedi.");
      setToast("Açık çalışma iptal edildi."); await load();
    } catch (err) { showError(err, "Çalışma iptal edilemedi."); }
    finally { setSaving(false); }
  }
  async function submitTariff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target); setSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tariff", effectiveFrom: values.get("effectiveFrom"), pricePerM3: values.get("pricePerM3"), priceTier2: values.get("priceTier2"), label: values.get("label") }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Tarife kaydedilemedi.");
      setToast("İki kademeli tarife kaydedildi."); target.reset(); await load();
    } catch (err) { showError(err, "Tarife kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function submitLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target); setSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "limit", effectiveFrom: values.get("effectiveFrom"), year: values.get("year"), month: values.get("month"), perHomeLimit: values.get("perHomeLimit"), sourceLabel: values.get("sourceLabel"), sourceUrl: values.get("sourceUrl"), note: values.get("note") }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Kademe limiti kaydedilemedi.");
      setToast("Yeni kademe limiti tarihçeye eklendi; eski değer korundu."); target.reset(); await load();
    } catch (err) { showError(err, "Kademe limiti kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", buildingName: values.get("buildingName"), apartmentCount: values.get("apartmentCount"), krdAlert: values.get("krdAlert") }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Ayarlar kaydedilemedi.");
      setToast("Bina ayarları güncellendi."); await load();
    } catch (err) { showError(err, "Ayarlar kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function removeReading(id: number) {
    if (!window.confirm("Bu sayaç okuması silinsin mi? Sonraki dönem hesabı yeniden oluşur.")) return;
    const response = await fetch(`/api/dashboard?id=${id}`, { method: "DELETE" });
    if (response.ok) { setToast("Okuma silindi."); await load(); }
  }

  const nav = [
    { id: "dashboard" as const, label: "Genel Bakış", icon: LayoutDashboard },
    { id: "readings" as const, label: "Kayıtlar", icon: History },
    { id: "settings" as const, label: "Tarife & Ayarlar", icon: SlidersHorizontal },
  ];
  if (loading && !data) return <main className="loading-screen"><div className="brand-mark"><Flame size={23} /></div><Loader2 className="animate-spin" size={24} /><p>Kazan paneli hazırlanıyor…</p></main>;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Flame size={22} /></div><div><strong>Isı Yönetim</strong><span>Kazan & sayaç</span></div><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="Ana menü"><p>YÖNETİM</p>{nav.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => { setActive(item.id); setMenuOpen(false); }}><item.icon size={19} /><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-note"><div className="online-dot" /><div><strong>Cloudflare’a bağlı</strong><span>D1 veritabanı aktif</span></div></div>
      <div className="sidebar-building"><Building2 size={18} /><div><strong>{data?.settings.buildingName}</strong><span>{data?.settings.apartmentCount} daire · Eti Mh.</span></div></div>
    </aside>
    {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat" />}

    <main className="main-content">
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Menüyü aç"><Menu size={22} /></button>
        <div className="mobile-brand"><Flame size={20} /><strong>Isı Yönetim</strong></div><div className="topbar-spacer" />
        <div className="weather-pill"><CloudSun size={17} /><span>Eti Mh.</span><strong>{weather ? `${number(weather.temperature, 0)}°` : "—"}</strong></div>
        <button className="icon-button" onClick={load} aria-label="Verileri yenile"><RefreshCw size={18} /></button>
        <button className={openSession ? "stop-button top-add" : "primary-button top-add"} onClick={openSession ? openStop : openStart}>{openSession ? <StopCircle size={18} /> : <Play size={18} />}<span>{openSession ? "Kazanı kapat" : "Kazanı aç"}</span></button>
      </header>

      <div className="page-wrap">
        <div className="page-heading"><div><p className="breadcrumb">{active === "dashboard" ? "KONTROL MERKEZİ" : active === "readings" ? "KAYIT DEFTERİ" : "YAPILANDIRMA"}</p><h1>{active === "dashboard" ? "Kazan kontrol merkezi" : active === "readings" ? "Çalışmalar ve sayaç okumaları" : "Tarife ve bina ayarları"}</h1><p>{active === "dashboard" ? "1) Başlatın. 2) Kapatırken HRC ve KRD’yi girin. Hepsi bu." : active === "readings" ? "Sayaç referansı ile kazan çalışması birbirinden ayrı tutulur." : "Resmî Ankara limitleri ve iki kademeli fiyat hesabı."}</p></div>{active === "readings" && <button className="secondary-button" onClick={openNewReading}><Plus size={18} />Sayaç referansı ekle</button>}</div>
        {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => setError("")}><X size={17} /></button></div>}

        {active === "dashboard" && <>
          <BoilerControl session={openSession} latest={stats.latest} runningHours={runningHours} onStart={openStart} onStop={openStop} onCancel={cancelSession} />
          <section className="stats-grid">
            <MiniStat icon={<Droplets size={20} />} label="Bu ay tüketim" value={`${number(stats.monthUsage)} m³`} sub={`${MONTHS[new Date().getMonth()]} · ilk referans ${number(stats.initialUsage)} m³ dâhil`} accent="blue" />
            <MiniStat icon={<WalletCards size={20} />} label="Tahmini maliyet" value={money(stats.monthCost)} sub={`${stats.tier}. kademe · ${number(stats.tier === 2 ? activeTariff?.priceTier2 : activeTariff?.pricePerM3, 2)} TL/m³`} accent={stats.tier === 2 ? "red" : "green"} />
            <MiniStat icon={<Gauge size={20} />} label="Ortalama hız" value={`${number(stats.avgRate, 2)} m³/sa`} sub="Kazan çalışma sürelerine göre" accent="amber" />
            <MiniStat icon={<CreditCard size={20} />} label="Kalan kredi" value={`${number(stats.latest?.krd)} m³`} sub={latestKrdLow ? "Yükleme eşiğinin altında" : `Alarm: ${number(data?.settings.krdAlert)} m³`} accent={latestKrdLow ? "red" : "green"} />
          </section>
          <section className="dashboard-grid">
            <article className="panel chart-panel"><div className="panel-head"><div><p className="eyebrow">TÜKETİM EĞİLİMİ</p><h2>Gaz ve dış hava ilişkisi</h2></div><div className="legend"><span><i className="legend-bar" />Tüketim</span><span><i className="legend-line" />Dış hava</span></div></div>
              {chartData.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 4, bottom: 0, left: -18 }}><defs><linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c9a74" stopOpacity={0.24} /><stop offset="100%" stopColor="#1c9a74" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7e9ec" /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7b8390" }} axisLine={false} tickLine={false} minTickGap={28} /><YAxis yAxisId="gas" tick={{ fontSize: 11, fill: "#7b8390" }} axisLine={false} tickLine={false} /><YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 11, fill: "#7b8390" }} axisLine={false} tickLine={false} unit="°" /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e6e8eb", boxShadow: "0 10px 30px rgba(20,32,45,.1)", fontSize: 12 }} /><Area yAxisId="gas" dataKey="gaz" type="monotone" fill="url(#gasFill)" stroke="none" /><Bar yAxisId="gas" dataKey="gaz" fill="#1c9a74" radius={[5, 5, 1, 1]} maxBarSize={28} /><Line yAxisId="temp" dataKey="hava" type="monotone" stroke="#e29a39" strokeWidth={2.2} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} connectNulls /></ComposedChart></ResponsiveContainer></div>
              : <div className="empty-chart"><BarChart3 size={32} /><strong>Başlangıç okuması hazır</strong><span>“Kazanı aç” dediğinizde son HRC/KRD otomatik başlangıç olur; tekrar yazılmaz.</span><button onClick={openSession ? openStop : openStart}>{openSession ? "Kazanı kapat" : "Kazanı aç"} <ChevronRight size={16} /></button></div>}
            </article>
            <aside className="right-stack">
              <article className="panel current-weather"><div className="weather-title"><div><CloudSun size={26} /><span><strong>Eti Mahallesi hava durumu</strong><small>Çankaya / Ankara</small></span></div><b>{weather ? `${number(weather.temperature, 0)}°C` : "—"}</b></div><div className="weather-metrics"><span>Hissedilen<strong>{weather ? `${number(weather.apparent, 0)}°` : "—"}</strong></span><span>Nem<strong>{weather ? `%${number(weather.humidity, 0)}` : "—"}</strong></span><span>Rüzgâr<strong>{weather ? `${number(weather.windSpeed, 0)} km/sa` : "—"}</strong></span><span>Yağış<strong>{weather ? `${number(weather.precipitation, 1)} mm` : "—"}</strong></span></div><p>39.9324, 32.8459 · Open-Meteo · 15 dakikada güncellenir</p></article>
              <article className={`panel quota-card ${stats.tier === 2 ? "quota-danger" : ""}`}><div className="panel-head compact"><div><p className="eyebrow">ANKARA KADEME TAKİBİ</p><h2>{stats.tier === 2 ? "Kademe-2 limiti aşıldı" : "Kademe-1 sınırı içinde"}</h2></div><CircleGauge size={22} /></div><div className="quota-values"><strong>{number(stats.monthUsage, 0)} m³</strong><span>/ {number(stats.quota, 0)} m³</span></div><div className="progress"><span style={{ width: `${Math.min(100, stats.quotaPct)}%` }} /></div><div className="quota-foot"><span>Daire başı %{number(stats.quotaPct, 0)}</span><span>Tahmin: {number(stats.forecast, 0)} m³</span></div><p className="legal-note"><AlertTriangle size={14} />{MONTHS[new Date().getMonth()]} sınırı daire başı {number(stats.perHomeLimit, 2)} Sm³; merkezi sistem toplam sınırı {number(stats.quota, 2)} Sm³. Aşılırsa ayın tamamı Kademe-2 olur.</p></article>
            </aside>
          </section>
          <section className="panel recent-panel"><div className="panel-head"><div><p className="eyebrow">SON HAREKETLER</p><h2>Yakın dönem sayaç okumaları</h2></div><button className="text-button" onClick={() => setActive("readings")}>Tümünü gör <ChevronRight size={16} /></button></div><ReadingTable rows={enriched.slice(-5).reverse()} onEdit={editReading} onDelete={removeReading} emptyAction={openNewReading} /></section>
        </>}

        {active === "readings" && <>
          <section className="panel sessions-panel"><div className="panel-head"><div><p className="eyebrow">KAZAN ÇALIŞMALARI</p><h2>Açılış ve kapanış geçmişi</h2></div><Timer size={22} /></div><SessionList sessions={data?.sessions || []} /></section>
          <section className="panel records-panel"><div className="records-summary"><div><span>Gerçek okuma</span><strong>{enriched.length}</strong></div><div><span>Toplam ölçülen</span><strong>{number(enriched.reduce((sum, row) => sum + (row.consumption || 0), 0))} m³</strong></div><div><span>Son HRC</span><strong>{number(stats.latest?.hrc, 2)}</strong></div><div><span>Son KRD</span><strong>{number(stats.latest?.krd, 2)}</strong></div></div><div className="baseline-note"><CircleGauge size={17} /><span><strong>Basit akış:</strong> Sayaç değişiminde bir kez referans ekleyin. Kazanı başlatırken yalnız saat ve dereceyi, kapatırken yalnız HRC ve KRD’yi girin.</span></div><ReadingTable rows={[...enriched].reverse()} onEdit={editReading} onDelete={removeReading} emptyAction={openNewReading} expanded /></section>
        </>}

        {active === "settings" && data && <div className="settings-grid">
          <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">BİNA PROFİLİ</p><h2>Temel ayarlar</h2></div><Building2 size={22} /></div><form onSubmit={submitSettings} className="form-stack"><Field label="Bina / site adı"><input name="buildingName" defaultValue={data.settings.buildingName} required /></Field><div className="form-grid-two"><Field label="Daire sayısı" hint="Merkezi sistem kademe sınırı bu sayıyla çarpılır."><input name="apartmentCount" type="number" min="1" defaultValue={data.settings.apartmentCount} required /></Field><Field label="KRD alarm eşiği"><input name="krdAlert" type="number" min="0" step="0.01" defaultValue={data.settings.krdAlert} required /></Field></div><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}Ayarları kaydet</button></form></section>
          <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">İKİ KADEMELİ TARİFE</p><h2>Yeni fiyat dönemi</h2></div><CalendarDays size={22} /></div><p className="settings-intro">Başkentgaz fiyatı değiştiğinde iki kademeyi aynı tarihle kaydedin. Sistem ay limitine göre doğru fiyatı seçer.</p><form onSubmit={submitTariff} className="form-stack"><Field label="Geçerlilik tarihi"><input name="effectiveFrom" type="date" required /></Field><div className="form-grid-two"><Field label="Kademe-1 (TL / Sm³)"><input name="pricePerM3" inputMode="decimal" type="number" min="0.01" step="0.000001" required /></Field><Field label="Kademe-2 (TL / Sm³)"><input name="priceTier2" inputMode="decimal" type="number" min="0.01" step="0.000001" required /></Field></div><Field label="Açıklama"><input name="label" placeholder="Örn. Kasım 2026 Başkentgaz · KDV dahil" /></Field><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}Tarifeyi kaydet</button></form><a className="source-link" href="https://www.baskentdogalgaz.com.tr/tr/page/Satis-Tarifeleri-ve-Fiyatlari/31" target="_blank" rel="noreferrer">Başkentgaz resmî satış tarifeleri <ChevronRight size={15} /></a></section>
          <section className="panel settings-card limit-settings-card"><div className="panel-head"><div><p className="eyebrow">KADEME LİMİTİ SÜRÜMLERİ</p><h2>Yeni aylık limit ekle</h2></div><History size={22} /></div><p className="settings-intro">Eski değeri değiştirmez. Seçilen ay için tarihli yeni bir sürüm oluşturur ve değişiklik ortak ekranda yayımlanır.</p><form onSubmit={submitLimit} className="form-stack"><div className="form-grid-two"><Field label="Duyuru / geçerlilik tarihi"><input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field><Field label="Limit yılı"><input name="year" type="number" min="2020" max="2100" defaultValue={new Date().getFullYear()} required /></Field></div><div className="form-grid-two"><Field label="Limit ayı"><select name="month" defaultValue="11" required>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></Field><Field label="Daire başı limit (Sm³)"><input name="perHomeLimit" type="number" min="0.01" step="0.01" required /></Field></div><Field label="Kaynak başlığı"><input name="sourceLabel" placeholder="Örn. BOTAŞ Kasım-Aralık 2026 güncellemesi" required /></Field><Field label="Resmî kaynak bağlantısı"><input name="sourceUrl" type="url" placeholder="https://..." /></Field><Field label="Değişiklik notu"><textarea name="note" rows={2} placeholder="Neden değiştiği veya duyuru açıklaması" /></Field><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}Yeni sürümü ekle</button></form></section>
          <section className="panel tariff-history limit-history"><div className="panel-head"><div><p className="eyebrow">LİMİT GEÇMİŞİ</p><h2>Eski ve güncel değerler</h2></div><History size={22} /></div><div className="limit-version-list">{data.limitVersions.map((version, index, rows) => { const newer = rows.find((candidate) => candidate.year === version.year && candidate.month === version.month && candidate.effectiveFrom > version.effectiveFrom); return <div key={version.id} className="limit-version-row"><div><strong>{MONTHS[version.month - 1]} {version.year} · {number(version.perHomeLimit, 2)} Sm³/daire</strong><span>{version.effectiveFrom} · {version.sourceLabel || "Kaynak belirtilmedi"}</span>{version.note && <small>{version.note}</small>}</div>{!newer && <em>GÜNCEL</em>}</div>; })}</div></section>
          <section className="panel tariff-history"><div className="panel-head"><div><p className="eyebrow">GEÇMİŞ</p><h2>Tarife dönemleri</h2></div><WalletCards size={22} /></div><div className="tariff-list">{data.tariffs.map((tariff, index) => <div key={tariff.id} className="tariff-row"><div className="tariff-date"><span>{new Date(`${tariff.effectiveFrom}T00:00`).getDate()}</span><strong>{MONTHS[new Date(`${tariff.effectiveFrom}T00:00`).getMonth()].slice(0, 3).toUpperCase()}</strong></div><div><strong>K1 {number(tariff.pricePerM3, 2)} · K2 {number(tariff.priceTier2, 2)} TL</strong><span>{tariff.label || "Açıklama yok"}</span></div>{index === 0 && <em>AKTİF</em>}</div>)}</div></section>
          <section className="panel method-card"><div className="panel-head"><div><p className="eyebrow">HESAP MANTIĞI</p><h2>Yeni sade akış</h2></div><CircleGauge size={22} /></div><div className="method-list"><div><span>01</span><p><strong>İlk HRC/KRD bir kez girilir.</strong> Bu değer başlangıç referansıdır.</p></div><div><span>02</span><p><strong>Kazanı açarken sayaç yazılmaz.</strong> Son gerçek okuma otomatik başlangıç olur.</p></div><div><span>03</span><p><strong>Kapatırken yeni HRC/KRD girilir.</strong> Süre ve tüketim çalışma kaydıyla eşleştirilir.</p></div><div><span>04</span><p><strong>Kademe hane başı hesaplanır.</strong> 25 daireli merkezi sistemde aylık Ankara limiti 25 ile çarpılır; aşımda ayın tamamı Kademe-2 olur.</p></div></div></section>
        </div>}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="Mobil menü">{nav.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><item.icon size={20} /><span>{item.id === "dashboard" ? "Özet" : item.id === "readings" ? "Kayıtlar" : "Ayarlar"}</span></button>)}<button className={openSession ? "mobile-stop" : "mobile-plus"} onClick={openSession ? openStop : openStart}>{openSession ? <StopCircle size={22} /> : <Play size={22} />}<span>{openSession ? "Kapat" : "Başlat"}</span></button></nav>

    {readingOpen && <div className="modal-backdrop" role="presentation"><section className="reading-modal" role="dialog" aria-modal="true"><div className="modal-handle" /><header className="modal-head"><div><p className="eyebrow">{editingId == null ? "SAYAÇ REFERANSI" : "KAYIT DÜZENLEME"}</p><h2>{editingId == null ? "Başlangıç değerini kaydet" : "Sayaç değerini düzelt"}</h2><span>Sayaç değişimi veya düzeltme içindir; kazanı çalışıyor olarak işaretlemez.</span></div><button className="icon-button" onClick={() => setReadingOpen(false)}><X size={20} /></button></header><form onSubmit={submitReading} className="reading-form">
      <Field label="Okuma tarihi ve saati"><input type="datetime-local" value={form.readAt} onChange={(event) => setForm({ ...form, readAt: event.target.value })} required /></Field>
      <div className="meter-grid"><Field label="HRC · Harcanan" hint={stats.latest ? `Son: ${number(stats.latest.hrc, 2)} m³` : "İlk okuma başlangıç değeridir."}><div className="unit-input"><input type="number" min="0" step="0.01" value={form.hrc} onChange={(event) => setForm({ ...form, hrc: event.target.value })} required /><span>m³</span></div></Field><Field label="KRD · Kalan kredi" hint={stats.latest ? `Son: ${number(stats.latest.krd, 2)} m³` : "Sayaçtaki bakiye."}><div className="unit-input"><input type="number" min="0" step="0.01" value={form.krd} onChange={(event) => setForm({ ...form, krd: event.target.value })} required /><span>m³</span></div></Field></div>
      <Field label="Not"><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} /></Field>
      {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setReadingOpen(false)}>Vazgeç</button><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}{editingId == null ? "Okumayı kaydet" : "Değişiklikleri kaydet"}</button></div>
    </form></section></div>}

    {sessionModal && <div className="modal-backdrop" role="presentation"><section className="reading-modal session-modal" role="dialog" aria-modal="true"><div className="modal-handle" /><header className="modal-head"><div><p className="eyebrow">{sessionModal === "start" ? "YENİ ÇALIŞMA" : "ÇALIŞMAYI TAMAMLA"}</p><h2>{sessionModal === "start" ? "Kazanı aç" : "Kazanı kapat"}</h2><span>{sessionModal === "start" ? "Son sayaç değerleri otomatik başlangıç alınır; tekrar yazmanız gerekmez." : "Yalnızca cihazdaki güncel HRC ve KRD değerlerini girin."}</span></div><button className="icon-button" onClick={() => setSessionModal(null)}><X size={20} /></button></header><form onSubmit={submitSession} className="reading-form">
      {sessionModal === "start" ? <>
        <div className="auto-baseline"><div><span>Başlangıç HRC</span><strong>{number(stats.latest?.hrc, 2)} m³</strong></div><div><span>Başlangıç KRD</span><strong>{number(stats.latest?.krd, 2)} m³</strong></div><Check size={21} /></div>
        <Field label="Açılış tarihi ve saati"><input type="datetime-local" value={startForm.startedAt} onChange={(event) => setStartForm({ ...startForm, startedAt: event.target.value })} required /></Field>
        <Field label="Kazan derecesi" hint="Bilmiyorsanız boş bırakabilirsiniz. Dış hava Eti Mahallesi için otomatik kaydedilir."><div className="unit-input"><input type="number" min="0" max="100" step="0.5" value={startForm.targetTemp} onChange={(event) => setStartForm({ ...startForm, targetTemp: event.target.value })} /><span>°C</span></div></Field>
      </> : <>
        <div className="session-summary"><span><Timer size={17} />{openSession ? durationLabel(runningHours) : "—"}</span><span>Başlangıç HRC <strong>{number(openSession?.startHrc, 2)}</strong></span></div>
        <Field label="Kapanış tarihi ve saati"><input type="datetime-local" value={stopForm.endedAt} onChange={(event) => setStopForm({ ...stopForm, endedAt: event.target.value })} required /></Field>
        <div className="meter-grid"><Field label="Güncel HRC · Harcanan" hint={`Başlangıç: ${number(openSession?.startHrc, 2)} m³`}><div className="unit-input"><input type="number" min={openSession?.startHrc || 0} step="0.01" value={stopForm.hrc} onChange={(event) => setStopForm({ ...stopForm, hrc: event.target.value })} required /><span>m³</span></div></Field><Field label="Güncel KRD · Kalan" hint={`Başlangıç: ${number(openSession?.startKrd, 2)} m³`}><div className="unit-input"><input type="number" min="0" step="0.01" value={stopForm.krd} onChange={(event) => setStopForm({ ...stopForm, krd: event.target.value })} required /><span>m³</span></div></Field></div>
        <div className="consumption-preview"><span>Bu çalışmanın tüketimi</span><strong>{stopForm.hrc && openSession ? number(Math.max(0, Number(stopForm.hrc) - openSession.startHrc), 2) : "—"} m³</strong></div>
      </>}
      {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSessionModal(null)}>Vazgeç</button><button className={sessionModal === "stop" ? "stop-button" : "primary-button"} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : sessionModal === "start" ? <Play size={18} /> : <StopCircle size={18} />}{sessionModal === "start" ? "Çalışmayı başlat" : "Kapat ve hesapla"}</button></div>
    </form></section></div>}
    {toast && <div className="toast"><Check size={18} />{toast}</div>}
  </div>;
}

function BoilerControl({ session, latest, runningHours, onStart, onStop, onCancel }: { session: BoilerSession | null; latest?: EnrichedReading; runningHours: number; onStart: () => void; onStop: () => void; onCancel: () => void }) {
  const detail = session
    ? `${dateLabel(session.startedAt, true)} · ${number(session.targetTemp, 0)}°C hedef · Başlangıç HRC ${number(session.startHrc, 2)}`
    : latest
      ? `Son sayaç: HRC ${number(latest.hrc, 2)} · KRD ${number(latest.krd, 2)}`
      : "Önce ilk sayaç okumasını girin.";
  return <section className={`boiler-control ${session ? "boiler-running" : "boiler-idle"}`}><div className="boiler-state-icon">{session ? <Flame size={26} /> : <CircleGauge size={25} />}</div><div className="boiler-state-main"><p className="eyebrow">{session ? "KAZAN ÇALIŞIYOR" : "KAZAN KAPALI"}</p><strong>{session ? `${durationLabel(runningHours)} çalıştı` : "Yeni çalışmaya hazır"}</strong><span>{detail}</span></div>{session && <button className="text-button control-cancel" onClick={onCancel}>Yanlış başlatmayı sil</button>}<button className={session ? "stop-button" : "primary-button"} onClick={session ? onStop : onStart}>{session ? <StopCircle size={19} /> : <Play size={19} />}{session ? "Kazanı kapat" : "Kazanı aç"}</button></section>;
}

function SessionList({ sessions }: { sessions: BoilerSession[] }) {
  if (!sessions.length) return <div className="empty-sessions">Henüz kazan çalışma kaydı yok.</div>;
  return <div className="session-list">{sessions.slice(0, 20).map((session) => {
    const hours = session.endedAt ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 3_600_000 : null;
    const usage = session.endHrc == null ? null : Math.max(0, session.endHrc - session.startHrc);
    const period = session.endedAt
      ? `${dateLabel(session.startedAt, true)} → ${dateLabel(session.endedAt, true)}`
      : `${dateLabel(session.startedAt, true)} · devam ediyor`;
    const detail = session.note || `${number(session.targetTemp, 0)}°C hedef · ${number(session.outsideTemp, 0)}° dış hava`;
    return <div className="session-row" key={session.id}><span className={session.endedAt ? "session-dot done" : "session-dot live"} /><div><strong>{period}</strong><span>{detail}</span></div><div className="session-metrics"><strong>{usage == null ? "Açık" : `${number(usage, 2)} m³`}</strong><span>{hours == null ? "Devam ediyor" : durationLabel(hours)}</span></div></div>;
  })}</div>;
}

function ReadingTable({ rows, onEdit, onDelete, emptyAction, expanded = false }: { rows: EnrichedReading[]; onEdit: (reading: Reading) => void; onDelete: (id: number) => void; emptyAction: () => void; expanded?: boolean }) {
  if (!rows.length) return <div className="empty-records"><div><Gauge size={30} /></div><h3>Henüz sayaç okuması yok</h3><p>İlk kayıt başlangıç değeriniz olur. Sonraki çalışmalarda bu değeri yeniden yazmanız gerekmez.</p><button className="primary-button" onClick={emptyAction}><Plus size={18} />İlk okumayı ekle</button></div>;
  return <div className="table-scroll"><table className="readings-table"><thead><tr><th>Tarih / saat</th><th>Tür</th><th>HRC</th><th>KRD</th><th>Tüketim</th>{expanded && <th>Süre</th>}<th>Hız</th><th>Koşullar</th><th>Kademe / maliyet</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{dateLabel(row.readAt, true)}</strong>{row.note && <span title={row.note}>{row.note}</span>}</td><td><em className={`status status-${row.boilerStatus}`}><i />{statusLabel(row.boilerStatus)}</em></td><td>{number(row.hrc, 2)}</td><td><strong>{number(row.krd, 2)}</strong>{row.recharge != null && <span className="recharge">+{number(row.recharge)} yükleme</span>}</td><td><strong>{row.consumption == null ? "Başlangıç" : `${number(row.consumption, 2)} m³`}</strong></td>{expanded && <td>{row.hours == null ? "—" : durationLabel(row.hours)}</td>}<td>{row.rate == null ? "—" : `${number(row.rate, 2)} m³/sa`}</td><td><span className="conditions"><Flame size={14} />{row.boilerTemp == null ? "—" : `${number(row.boilerTemp, 0)}°`}<i /><CloudSun size={14} />{row.outsideTemp == null ? "—" : `${number(row.outsideTemp, 0)}°`}</span></td><td>{row.cost == null ? <><strong>Hesaplanmaz</strong><span>İlk okuma = referans</span></> : <><strong>{money(row.cost)}</strong><span className={row.tier === 2 ? "tier-badge tier-2" : "tier-badge"}>Kademe-{row.tier} · {number(row.appliedPrice, 2)} TL</span></>}</td><td><div className="row-actions"><button className="row-action edit" onClick={() => onEdit(row)}><Pencil size={15} /></button><button className="row-action delete" onClick={() => onDelete(row.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>;
}
