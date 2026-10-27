"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, BarChart3, Building2, CalendarDays, Check, ChevronRight, CircleGauge,
  CloudSun, CreditCard, Droplets, Flame, Gauge, History, LayoutDashboard, Loader2,
  Menu, Pencil, Plus, RefreshCw, SlidersHorizontal, ThermometerSun, Trash2, TrendingDown,
  WalletCards, X,
} from "lucide-react";

type Reading = {
  id: number; readAt: string; hrc: number; krd: number; boilerTemp: number | null;
  outsideTemp: number | null; boilerStatus: "on" | "off" | "standby";
  unitPrice: number; note: string;
};
type Tariff = { id: number; effectiveFrom: string; pricePerM3: number; label: string };
type BuildingSettings = { buildingName: string; apartmentCount: number; krdAlert: number; city: string };
type DashboardData = { readings: Reading[]; tariffs: Tariff[]; settings: BuildingSettings };
type EnrichedReading = Reading & { consumption: number | null; hours: number | null; rate: number | null; cost: number | null; krdDelta: number | null; recharge: number | null };

const MONTHLY_LIMITS = [344.73, 326.8, 302.09, 180.69, 109.01, 46.2, 35.19, 31.03, 40.69, 76.86, 161.63, 284.25];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

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
function recommendation(temp: number | null | undefined) {
  if (temp == null) return { range: "Hava bekleniyor", text: "Öneri için hava verisi gerekli.", tone: "neutral" };
  if (temp > 10) return { range: "40–45°C", text: "Ilık rejim yeterli olabilir.", tone: "mild" };
  if (temp >= 0) return { range: "50–55°C", text: "Standart kış bandı.", tone: "cold" };
  return { range: "60–65°C", text: "Don rejimi; tüketimi yakından izleyin.", tone: "freeze" };
}
function statusLabel(status: Reading["boilerStatus"]) { return status === "on" ? "Yanıyor" : status === "standby" ? "Beklemede" : "Kapalı"; }

function MiniStat({ icon, label, value, sub, accent = "green" }: { icon: ReactNode; label: string; value: string; sub: string; accent?: "green" | "amber" | "blue" | "red" }) {
  return <article className="stat-card"><div className={`stat-icon stat-icon-${accent}`}>{icon}</div><div className="min-w-0"><p className="eyebrow">{label}</p><p className="stat-value">{value}</p><p className="stat-sub">{sub}</p></div></article>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [weather, setWeather] = useState<{ temperature: number | null; apparent: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<"dashboard" | "readings" | "settings">("dashboard");
  const [readingOpen, setReadingOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ readAt: localDateTimeValue(), hrc: "", krd: "", boilerTemp: "50", outsideTemp: "", boilerStatus: "on", note: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Veriler alınamadı.");
      setData(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Veriler alınamadı."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/weather").then((response) => response.json()).then((payload) => {
      if (typeof payload.temperature === "number") {
        setWeather(payload); setForm((current) => ({ ...current, outsideTemp: String(payload.temperature) }));
      }
    }).catch(() => undefined);
  }, [load]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(""), 3200); return () => window.clearTimeout(id); }, [toast]);

  const enriched = useMemo<EnrichedReading[]>(() => {
    if (!data) return [];
    return data.readings.map((reading, index) => {
      const previous = data.readings[index - 1];
      if (!previous) return { ...reading, consumption: null, hours: null, rate: null, cost: null, krdDelta: null, recharge: null };
      const consumption = Math.max(0, reading.hrc - previous.hrc);
      const hours = Math.max(0, (new Date(reading.readAt).getTime() - new Date(previous.readAt).getTime()) / 3_600_000);
      const krdDelta = previous.krd - reading.krd;
      return { ...reading, consumption, hours, rate: hours > 0 ? consumption / hours : null, cost: consumption * reading.unitPrice, krdDelta, recharge: krdDelta < 0 ? Math.abs(krdDelta) : null };
    });
  }, [data]);

  const stats = useMemo(() => {
    const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const rows = enriched.filter((row) => new Date(row.readAt).getTime() >= monthStart && row.consumption != null);
    const monthUsage = rows.reduce((sum, row) => sum + (row.consumption || 0), 0);
    const monthCost = rows.reduce((sum, row) => sum + (row.cost || 0), 0);
    const totalHours = rows.reduce((sum, row) => sum + (row.hours || 0), 0);
    const quota = MONTHLY_LIMITS[now.getMonth()] * (data?.settings.apartmentCount || 20);
    const elapsedDay = Math.max(1, now.getDate() - 1 + now.getHours() / 24);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { monthUsage, monthCost, avgRate: totalHours ? monthUsage / totalHours : 0, quota, forecast: (monthUsage / elapsedDay) * days, latest: enriched.at(-1), quotaPct: quota ? (monthUsage / quota) * 100 : 0 };
  }, [data, enriched]);

  const chartData = useMemo(() => enriched.slice(-14).map((row) => ({ label: dateLabel(row.readAt, true), gaz: row.consumption == null ? 0 : Number(row.consumption.toFixed(2)), hava: row.outsideTemp })), [enriched]);
  const currentRecommendation = recommendation(weather?.temperature ?? stats.latest?.outsideTemp);
  const latestKrdLow = !!(data && stats.latest && stats.latest.krd <= data.settings.krdAlert);
  const activeTariff = data?.tariffs[0];

  function openNewReading() {
    setEditingId(null); setError("");
    setForm({ readAt: localDateTimeValue(), hrc: "", krd: "", boilerTemp: form.boilerTemp || "50", outsideTemp: weather?.temperature == null ? "" : String(weather.temperature), boilerStatus: "on", note: "" });
    setReadingOpen(true);
  }
  function editReading(reading: Reading) {
    setEditingId(reading.id); setError("");
    setForm({ readAt: reading.readAt.slice(0, 16), hrc: String(reading.hrc), krd: String(reading.krd), boilerTemp: reading.boilerTemp == null ? "" : String(reading.boilerTemp), outsideTemp: reading.outsideTemp == null ? "" : String(reading.outsideTemp), boilerStatus: reading.boilerStatus, note: reading.note || "" });
    setReadingOpen(true);
  }
  async function submitReading(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/dashboard", { method: editingId == null ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reading", id: editingId, ...form }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Okuma kaydedilemedi.");
      setReadingOpen(false); setEditingId(null); setForm({ readAt: localDateTimeValue(), hrc: "", krd: "", boilerTemp: form.boilerTemp, outsideTemp: weather?.temperature == null ? "" : String(weather.temperature), boilerStatus: form.boilerStatus, note: "" });
      setToast(editingId == null ? "Sayaç okuması kaydedildi." : "Sayaç okuması güncellendi."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Okuma kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function submitTariff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const target = event.currentTarget; const values = new FormData(target); setSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tariff", effectiveFrom: values.get("effectiveFrom"), pricePerM3: values.get("pricePerM3"), label: values.get("label") }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Tarife kaydedilemedi.");
      setToast("Yeni fiyat dönemi eklendi."); target.reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Tarife kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", buildingName: values.get("buildingName"), apartmentCount: values.get("apartmentCount"), krdAlert: values.get("krdAlert") }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Ayarlar kaydedilemedi.");
      setToast("Bina ayarları güncellendi."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Ayarlar kaydedilemedi."); }
    finally { setSaving(false); }
  }
  async function removeReading(id: number) {
    if (!window.confirm("Bu sayaç okuması silinsin mi? Sonraki periyot hesabı yeniden oluşur.")) return;
    const response = await fetch(`/api/dashboard?id=${id}`, { method: "DELETE" });
    if (response.ok) { setToast("Okuma silindi."); await load(); }
  }

  const nav = [
    { id: "dashboard" as const, label: "Genel Bakış", icon: LayoutDashboard },
    { id: "readings" as const, label: "Sayaç Kayıtları", icon: History },
    { id: "settings" as const, label: "Tarife & Ayarlar", icon: SlidersHorizontal },
  ];
  if (loading && !data) return <main className="loading-screen"><div className="brand-mark"><Flame size={23} /></div><Loader2 className="animate-spin" size={24} /><p>Kazan paneli hazırlanıyor…</p></main>;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Flame size={22} /></div><div><strong>Isı Yönetim</strong><span>Kazan & sayaç</span></div><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="Ana menü"><p>YÖNETİM</p>{nav.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => { setActive(item.id); setMenuOpen(false); }}><item.icon size={19} /><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-note"><div className="online-dot" /><div><strong>Buluta bağlı</strong><span>Veriler güvende</span></div></div>
      <div className="sidebar-building"><Building2 size={18} /><div><strong>{data?.settings.buildingName}</strong><span>{data?.settings.apartmentCount} daire · Ankara</span></div></div>
    </aside>
    {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat" />}

    <main className="main-content">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Menüyü aç"><Menu size={22} /></button><div className="mobile-brand"><Flame size={20} /><strong>Isı Yönetim</strong></div><div className="topbar-spacer" /><div className="weather-pill"><CloudSun size={17} /><span>Ankara</span><strong>{weather ? `${number(weather.temperature, 0)}°` : "—"}</strong></div><button className="icon-button" onClick={load} aria-label="Verileri yenile"><RefreshCw size={18} /></button><button className="primary-button top-add" onClick={openNewReading}><Plus size={18} /><span>Yeni okuma</span></button></header>
      <div className="page-wrap">
        <div className="page-heading"><div><p className="breadcrumb">{active === "dashboard" ? "KONTROL MERKEZİ" : active === "readings" ? "KAYIT DEFTERİ" : "YAPILANDIRMA"}</p><h1>{active === "dashboard" ? "Kazan kontrol merkezi" : active === "readings" ? "Sayaç okumaları" : "Tarife ve bina ayarları"}</h1><p>{active === "dashboard" ? "Tüketim, maliyet ve kazan performansı tek ekranda." : active === "readings" ? "HRC ana tüketim kaydıdır; KRD bakiye ve yüklemeyi doğrular." : "Fiyat değişimlerini tarihli kaydedin, geçmiş maliyetleri koruyun."}</p></div><button className="primary-button heading-add" onClick={openNewReading}><Plus size={19} />Yeni okuma</button></div>
        {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => setError("")}><X size={17} /></button></div>}

        {active === "dashboard" && <>
          <section className="stats-grid">
            <MiniStat icon={<Droplets size={20} />} label="Bu ay tüketim" value={`${number(stats.monthUsage)} m³`} sub={`${MONTHS[new Date().getMonth()]} toplamı`} accent="blue" />
            <MiniStat icon={<WalletCards size={20} />} label="Bu ay maliyet" value={money(stats.monthCost)} sub={activeTariff ? `${number(activeTariff.pricePerM3, 2)} TL / m³` : "Tarife girilmedi"} accent="green" />
            <MiniStat icon={<Gauge size={20} />} label="Ortalama hız" value={`${number(stats.avgRate, 2)} m³/sa`} sub="Okumalar arası ortalama" accent="amber" />
            <MiniStat icon={<CreditCard size={20} />} label="Kalan kredi" value={`${number(stats.latest?.krd)} m³`} sub={latestKrdLow ? "Yükleme eşiğinin altında" : `Alarm: ${number(data?.settings.krdAlert)} m³`} accent={latestKrdLow ? "red" : "green"} />
          </section>
          <section className="dashboard-grid">
            <article className="panel chart-panel"><div className="panel-head"><div><p className="eyebrow">TÜKETİM EĞİLİMİ</p><h2>Gaz ve dış hava ilişkisi</h2></div><div className="legend"><span><i className="legend-bar" />Tüketim</span><span><i className="legend-line" />Dış hava</span></div></div>
              {chartData.length > 1 ? <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 4, bottom: 0, left: -18 }}><defs><linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1c9a74" stopOpacity={0.24} /><stop offset="100%" stopColor="#1c9a74" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7e9ec" /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7b8390" }} axisLine={false} tickLine={false} minTickGap={28} /><YAxis yAxisId="gas" tick={{ fontSize: 11, fill: "#7b8390" }} axisLine={false} tickLine={false} /><YAxis yAxisId="temp" orientation="right" tick={{ fontSize: 11, fill: "#7b8390" }} axisLine={false} tickLine={false} unit="°" /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e6e8eb", boxShadow: "0 10px 30px rgba(20,32,45,.1)", fontSize: 12 }} /><Area yAxisId="gas" dataKey="gaz" type="monotone" fill="url(#gasFill)" stroke="none" /><Bar yAxisId="gas" dataKey="gaz" fill="#1c9a74" radius={[5, 5, 1, 1]} maxBarSize={28} /><Line yAxisId="temp" dataKey="hava" type="monotone" stroke="#e29a39" strokeWidth={2.2} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} connectNulls /></ComposedChart></ResponsiveContainer></div>
              : <div className="empty-chart"><BarChart3 size={32} /><strong>İlk okuma yalnızca başlangıç referansıdır</strong><span>Kazan durumu kapalı olsa da olmasa da maliyet için ikinci bir HRC okuması gerekir.</span><button onClick={openNewReading}>Yeni okuma gir <ChevronRight size={16} /></button></div>}
            </article>
            <aside className="right-stack">
              <article className={`panel weather-card weather-${currentRecommendation.tone}`}><div className="weather-top"><span><ThermometerSun size={21} />Kazan önerisi</span><strong>{weather ? `${number(weather.temperature, 0)}°C` : "—"}</strong></div><div className="recommended-range">{currentRecommendation.range}</div><p>{currentRecommendation.text}</p><div className="weather-meta"><span>Hissedilen {weather ? `${number(weather.apparent, 0)}°C` : "—"}</span><span>Open-Meteo · 15 dk</span></div></article>
              <article className="panel quota-card"><div className="panel-head compact"><div><p className="eyebrow">AYLIK PLANLAMA</p><h2>Tüketim kotası</h2></div><CircleGauge size={22} /></div><div className="quota-values"><strong>{number(stats.monthUsage, 0)} m³</strong><span>/ {number(stats.quota, 0)} m³</span></div><div className="progress"><span style={{ width: `${Math.min(100, stats.quotaPct)}%` }} /></div><div className="quota-foot"><span>%{number(stats.quotaPct, 0)} kullanıldı</span><span>Tahmin: {number(stats.forecast, 0)} m³</span></div><p className="legal-note"><AlertTriangle size={14} />Limitler planlama taslağıdır; resmi tarife/fatura limiti olarak kullanmadan önce doğrulayın.</p></article>
            </aside>
          </section>
          <section className="panel recent-panel"><div className="panel-head"><div><p className="eyebrow">SON HAREKETLER</p><h2>Yakın dönem okumaları</h2></div><button className="text-button" onClick={() => setActive("readings")}>Tümünü gör <ChevronRight size={16} /></button></div><ReadingTable rows={enriched.slice(-5).reverse()} onEdit={editReading} onDelete={removeReading} emptyAction={openNewReading} /></section>
        </>}

        {active === "readings" && <section className="panel records-panel"><div className="records-summary"><div><span>Toplam okuma</span><strong>{enriched.length}</strong></div><div><span>Toplam ölçülen</span><strong>{number(enriched.reduce((sum, row) => sum + (row.consumption || 0), 0))} m³</strong></div><div><span>Son HRC</span><strong>{number(stats.latest?.hrc, 2)}</strong></div><div><span>Son KRD</span><strong>{number(stats.latest?.krd, 2)}</strong></div></div><div className="baseline-note"><CircleGauge size={17} /><span><strong>İlk okuma referanstır.</strong> Tüketim ve maliyet ikinci HRC okumasından itibaren hesaplanır; kazan durumundan bağımsızdır.</span></div><ReadingTable rows={[...enriched].reverse()} onEdit={editReading} onDelete={removeReading} emptyAction={openNewReading} expanded /></section>}

        {active === "settings" && data && <div className="settings-grid">
          <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">BİNA PROFİLİ</p><h2>Temel ayarlar</h2></div><Building2 size={22} /></div><form onSubmit={submitSettings} className="form-stack"><Field label="Bina / site adı"><input name="buildingName" defaultValue={data.settings.buildingName} required /></Field><div className="form-grid-two"><Field label="Daire sayısı" hint="Aylık planlama kotası bu sayıyla çarpılır."><input name="apartmentCount" type="number" min="1" defaultValue={data.settings.apartmentCount} required /></Field><Field label="KRD alarm eşiği" hint="Bakiye bu değerin altına indiğinde uyarı gösterilir."><input name="krdAlert" type="number" min="0" step="0.01" defaultValue={data.settings.krdAlert} required /></Field></div><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}Ayarları kaydet</button></form></section>
          <section className="panel settings-card"><div className="panel-head"><div><p className="eyebrow">FİYAT DÖNEMİ</p><h2>Yeni m³ fiyatı ekle</h2></div><CalendarDays size={22} /></div><p className="settings-intro">Fiyat değiştiğinde yeni tarih ekleyin. Eski kayıtların maliyeti değişmez.</p><form onSubmit={submitTariff} className="form-stack"><div className="form-grid-two"><Field label="Geçerlilik tarihi"><input name="effectiveFrom" type="date" required /></Field><Field label="Birim fiyat (TL / m³)"><input name="pricePerM3" inputMode="decimal" type="number" min="0.01" step="0.0001" required /></Field></div><Field label="Açıklama"><input name="label" placeholder="Örn. Kasım 2026 yeni tarife" /></Field><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}Fiyat dönemini ekle</button></form></section>
          <section className="panel tariff-history"><div className="panel-head"><div><p className="eyebrow">GEÇMİŞ</p><h2>Tarife dönemleri</h2></div><WalletCards size={22} /></div><div className="tariff-list">{data.tariffs.map((tariff, index) => <div key={tariff.id} className="tariff-row"><div className="tariff-date"><span>{new Date(`${tariff.effectiveFrom}T00:00`).getDate()}</span><strong>{MONTHS[new Date(`${tariff.effectiveFrom}T00:00`).getMonth()].slice(0, 3).toUpperCase()}</strong></div><div><strong>{number(tariff.pricePerM3, 2)} TL / m³</strong><span>{tariff.label || "Açıklama yok"}</span></div>{index === 0 && <em>AKTİF</em>}</div>)}</div></section>
          <section className="panel method-card"><div className="panel-head"><div><p className="eyebrow">HESAP MANTIĞI</p><h2>Ne giriyoruz, ne hesaplanıyor?</h2></div><CircleGauge size={22} /></div><div className="method-list"><div><span>01</span><p><strong>HRC ana ölçümdür.</strong> Yeni HRC – önceki HRC = gerçek dönem tüketimi.</p></div><div><span>02</span><p><strong>KRD bakiye kontrolüdür.</strong> Artarsa sistem bunu gaz yüklemesi olarak işaretler.</p></div><div><span>03</span><p><strong>Kazan durumu her okumada tutulur.</strong> Ayrı açılış/kapanış zorunlu değildir; değişiklik anında okuma almak analizi güçlendirir.</p></div><div><span>04</span><p><strong>Hava + kazan derecesi karşılaştırılır.</strong> Böylece aynı hava koşulunda hangi ayarın daha ekonomik olduğu görülür.</p></div></div></section>
        </div>}
      </div>
    </main>

    <nav className="mobile-nav" aria-label="Mobil menü">{nav.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><item.icon size={20} /><span>{item.id === "dashboard" ? "Özet" : item.id === "readings" ? "Kayıtlar" : "Ayarlar"}</span></button>)}<button className="mobile-plus" onClick={openNewReading}><Plus size={22} /><span>Okuma</span></button></nav>

    {readingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) { setReadingOpen(false); setEditingId(null); } }}><section className="reading-modal" role="dialog" aria-modal="true" aria-labelledby="reading-title"><div className="modal-handle" /><header className="modal-head"><div><p className="eyebrow">{editingId == null ? "SAHA GİRİŞİ" : "KAYIT DÜZENLEME"}</p><h2 id="reading-title">{editingId == null ? "Yeni sayaç okuması" : "Sayaç okumasını düzenle"}</h2><span>{editingId == null ? "HRC ve KRD’yi cihaz ekranından aynen girin." : "Değişiklikten sonra dönem hesapları otomatik yenilenir."}</span></div><button className="icon-button" onClick={() => { setReadingOpen(false); setEditingId(null); }} aria-label="Kapat"><X size={20} /></button></header><form onSubmit={submitReading} className="reading-form">
      <Field label="Okuma tarihi ve saati"><input type="datetime-local" value={form.readAt} onChange={(event) => setForm({ ...form, readAt: event.target.value })} required /></Field>
      <div className="meter-grid"><Field label="HRC · Harcanan" hint={stats.latest ? `Son: ${number(stats.latest.hrc, 2)} m³` : "İlk okuma başlangıç değeridir."}><div className="unit-input"><input inputMode="decimal" type="number" min="0" step="0.01" value={form.hrc} onChange={(event) => setForm({ ...form, hrc: event.target.value })} placeholder="0,00" required /><span>m³</span></div></Field><Field label="KRD · Kalan kredi" hint={stats.latest ? `Son: ${number(stats.latest.krd, 2)} m³` : "Sayaçtaki kalan bakiye."}><div className="unit-input"><input inputMode="decimal" type="number" min="0" step="0.01" value={form.krd} onChange={(event) => setForm({ ...form, krd: event.target.value })} placeholder="0,00" required /><span>m³</span></div></Field></div>
      <Field label="Kazan durumu"><div className="status-toggle">{[{ id: "on", label: "Yanıyor", icon: Flame }, { id: "standby", label: "Beklemede", icon: CircleGauge }, { id: "off", label: "Kapalı", icon: TrendingDown }].map((option) => <button type="button" key={option.id} className={form.boilerStatus === option.id ? "active" : ""} onClick={() => setForm({ ...form, boilerStatus: option.id })}><option.icon size={17} />{option.label}</button>)}</div></Field>
      <div className="meter-grid"><Field label="Kazan derecesi"><div className="unit-input"><input inputMode="decimal" type="number" min="0" max="100" step="0.5" value={form.boilerTemp} onChange={(event) => setForm({ ...form, boilerTemp: event.target.value })} /><span>°C</span></div></Field><Field label="Dış hava" hint={weather ? "Ankara’dan otomatik alındı." : "Elle girebilirsiniz."}><div className="unit-input"><input inputMode="decimal" type="number" step="0.1" value={form.outsideTemp} onChange={(event) => setForm({ ...form, outsideTemp: event.target.value })} /><span>°C</span></div></Field></div>
      <Field label="Not (isteğe bağlı)"><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Örn. Gece rejimi 45°C’ye alındı" rows={3} /></Field>
      {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setReadingOpen(false); setEditingId(null); }}>Vazgeç</button><button className="primary-button" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}{editingId == null ? "Okumayı kaydet" : "Değişiklikleri kaydet"}</button></div>
    </form></section></div>}
    {toast && <div className="toast"><Check size={18} />{toast}</div>}
  </div>;
}

function ReadingTable({ rows, onEdit, onDelete, emptyAction, expanded = false }: { rows: EnrichedReading[]; onEdit: (reading: Reading) => void; onDelete: (id: number) => void; emptyAction: () => void; expanded?: boolean }) {
  if (!rows.length) return <div className="empty-records"><div><Gauge size={30} /></div><h3>Henüz sayaç okuması yok</h3><p>İlk kayıt başlangıç değeriniz olur. İkinci okumada tüketim ve maliyet otomatik hesaplanır.</p><button className="primary-button" onClick={emptyAction}><Plus size={18} />İlk okumayı ekle</button></div>;
  return <div className="table-scroll"><table className="readings-table"><thead><tr><th>Tarih / saat</th><th>Durum</th><th>HRC</th><th>KRD</th><th>Tüketim</th>{expanded && <th>Süre</th>}<th>Hız</th><th>Koşullar</th><th>Maliyet</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{dateLabel(row.readAt, true)}</strong>{row.note && <span title={row.note}>{row.note}</span>}</td><td><em className={`status status-${row.boilerStatus}`}><i />{statusLabel(row.boilerStatus)}</em></td><td>{number(row.hrc, 2)}</td><td><strong>{number(row.krd, 2)}</strong>{row.recharge != null && <span className="recharge">+{number(row.recharge)} yükleme</span>}</td><td><strong>{row.consumption == null ? "Başlangıç" : `${number(row.consumption, 2)} m³`}</strong></td>{expanded && <td>{row.hours == null ? "—" : `${number(row.hours, 1)} sa`}</td>}<td>{row.rate == null ? "—" : `${number(row.rate, 2)} m³/sa`}</td><td><span className="conditions"><Flame size={14} />{row.boilerTemp == null ? "—" : `${number(row.boilerTemp, 0)}°`}<i /><CloudSun size={14} />{row.outsideTemp == null ? "—" : `${number(row.outsideTemp, 0)}°`}</span></td><td>{row.cost == null ? <><strong>Hesaplanmaz</strong><span>İlk okuma = referans</span></> : <><strong>{money(row.cost)}</strong><span>{row.unitPrice ? `${number(row.unitPrice, 2)} TL/m³` : "Fiyat yok"}</span></>}</td><td><div className="row-actions"><button className="row-action edit" onClick={() => onEdit(row)} aria-label="Kaydı düzenle"><Pencil size={15} /></button><button className="row-action delete" onClick={() => onDelete(row.id)} aria-label="Kaydı sil"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>;
}
