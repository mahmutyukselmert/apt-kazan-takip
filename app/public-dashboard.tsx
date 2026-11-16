"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, Building2, CalendarDays, CircleGauge, CloudRain, CloudSun, Droplets,
  ExternalLink, Flame, Gauge, History, LockKeyhole, RefreshCw, ShieldCheck,
  TrendingUp, WalletCards, Wind,
} from "lucide-react";

type Limit = { year: number; month: number; monthName: string; perHomeLimit: number; buildingLimit: number; dailyBuildingLimit: number; days: number };
type MonthRow = Limit & { monthKey: string; usage: number; perHomeUsage: number; heatingHours: number; avgRate: number | null; tier: 1 | 2; k1Cost: number; k2Cost: number };
type DailyRow = { date: string; consumption: number; hours: number; avgRate: number | null; avgBoilerTemp: number | null; avgOutsideTemp: number | null; tier1Cost: number; tier2Cost: number };
type IntervalRow = { startAt: string; endAt: string; date: string; monthKey: string; consumption: number; hours: number; rate: number | null; boilerTemp: number | null; outsideTemp: number | null; tier1Cost: number; tier2Cost: number };
type LimitUpdate = { id: number; effectiveFrom: string; year: number; month: number; monthName: string; oldPerHomeLimit: number; newPerHomeLimit: number; oldBuildingLimit: number; newBuildingLimit: number; sourceLabel: string; sourceUrl: string; note: string };
type BudgetPlan = Limit & { fullTier1Budget: number; sameVolumeAtTier2: number; tierJumpRisk: number; projectedUsage: number; projectedTier: 1 | 2; projectedCost: number; observedDailyAverage: number };
type PublicData = {
  building: { name: string; city: string; apartmentCount: number };
  tariff: { effectiveFrom: string; tier1Price: number; tier2Price: number; label: string; sourceUrl: string } | null;
  summary: {
    monthKey: string; monthUsage: number; initialUsage: number; perHomeUsage: number; remainingGas: number | null; lastUpdatedAt: string | null;
    heatingHours: number; avgRate: number | null; tier: 1 | 2; tierChangedAt: string | null; quota: number; perHomeLimit: number;
    dailyAllowance: number; allowedToDate: number; paceDifference: number; quotaPercent: number; remainingToTier2: number;
    forecast: number; forecastTier: 1 | 2; k1Cost: number; k2Cost: number; actualCost: number; tierRiskDifference: number; observedDays: number; observedDailyAverage: number;
  };
  limits: Limit[]; limitUpdates: LimitUpdate[]; budgetPlan: BudgetPlan[]; monthlyHistory: MonthRow[]; daily: DailyRow[]; intervals: IntervalRow[];
  pricingExplanation: { vatRate: number; tier1Net: number; tier2Net: number; tier1Gross: number; tier2Gross: number; currentUsage: number; currentCost: number };
  sources: { limits: string; tariff: string; rule: string }; ruleNote: string;
};
type Weather = {
  temperature: number | null; apparent: number | null; humidity: number | null; precipitation: number | null;
  windSpeed: number | null; weatherCode: number | null; observedAt: string | null; location: string; source: string;
  coordinates: { latitude: number; longitude: number };
};

function number(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}
function dateLabel(value: string | null, compact = false) {
  if (!value) return "Henüz okuma yok";
  return new Intl.DateTimeFormat("tr-TR", compact
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(new Date(value));
}
function dateOnlyLabel(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}
function weatherText(code: number | null | undefined) {
  if (code == null) return "Hava verisi bekleniyor";
  if (code === 0) return "Açık";
  if (code <= 3) return "Parçalı bulutlu";
  if (code <= 48) return "Sisli";
  if (code <= 67) return "Yağışlı";
  if (code <= 77) return "Karlı";
  if (code <= 82) return "Sağanak";
  return "Fırtınalı";
}

export default function PublicDashboard() {
  const [data, setData] = useState<PublicData | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [planMonth, setPlanMonth] = useState(0);
  const [planTemp, setPlanTemp] = useState("45");
  const [hoursPerDay, setHoursPerDay] = useState("4");
  const [planDays, setPlanDays] = useState("30");
  const [manualRate, setManualRate] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const key = Date.now();
      const [dashboardResponse, weatherResponse] = await Promise.all([
        fetch(`/api/public-dashboard?refresh=${key}`, { cache: "no-store" }),
        fetch(`/api/weather?refresh=${key}`, { cache: "no-store" }),
      ]);
      const payload = await dashboardResponse.json() as PublicData & { error?: string };
      if (!dashboardResponse.ok) throw new Error(payload.error || "Ortak görünüm alınamadı.");
      setData(payload);
      const currentMonth = Number(payload.summary.monthKey.slice(5, 7));
      setPlanMonth((value) => value || Math.min(12, currentMonth + 1));
      if (weatherResponse.ok) setWeather(await weatherResponse.json() as Weather);
      setRefreshedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Veriler yüklenemedi.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const id = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(id); }, [load]);

  const currentDaily = useMemo(() => data?.daily.filter((row) => row.date.slice(0, 7) === data.summary.monthKey).map((row) => ({
    ...row, label: new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(`${row.date}T12:00:00`)), dailyLimit: data.summary.dailyAllowance,
  })) || [], [data]);

  const scenario = useMemo(() => {
    if (!data || !planMonth) return null;
    const limit = data.limits.find((item) => item.month === planMonth) || data.limits[0];
    const month = data.monthlyHistory.find((item) => item.month === planMonth);
    const target = Number(planTemp) || 45;
    const usableSamples = data.intervals.filter((item) => item.rate != null && item.rate > 0);
    const similar = usableSamples.filter((item) => item.boilerTemp != null && Math.abs(item.boilerTemp - target) <= 5);
    const sourceSamples = similar.length ? similar : usableSamples;
    const measuredRate = sourceSamples.length
      ? sourceSamples.reduce((sum, item) => sum + (item.rate || 0) * item.hours, 0) / sourceSamples.reduce((sum, item) => sum + item.hours, 0)
      : 0;
    const chosenRate = Number(manualRate) > 0 ? Number(manualRate) : measuredRate;
    const days = Math.max(1, Math.min(limit.days, Number(planDays) || limit.days));
    const hours = Math.max(0, Number(hoursPerDay) || 0);
    const plannedUsage = chosenRate * hours * days;
    const existingUsage = month?.usage || 0;
    const totalUsage = existingUsage + plannedUsage;
    const tier = totalUsage > limit.buildingLimit ? 2 : 1;
    const k1Cost = totalUsage * (data.tariff?.tier1Price || 0);
    const k2Cost = totalUsage * (data.tariff?.tier2Price || 0);
    const maxHoursPerDay = chosenRate > 0 ? Math.max(0, (limit.buildingLimit - existingUsage) / chosenRate / days) : 0;
    return { limit, sampleCount: sourceSamples.length, similar: similar.length > 0, chosenRate, days, hours, plannedUsage, existingUsage, totalUsage, tier, k1Cost, k2Cost, maxHoursPerDay };
  }, [data, planMonth, planTemp, hoursPerDay, planDays, manualRate]);

  if (loading && !data) return <div className="public-loading"><Flame size={28} /><span>Ortak enerji görünümü hazırlanıyor…</span></div>;
  if (!data) return <div className="public-loading"><AlertTriangle size={28} /><strong>Veriler gösterilemedi</strong><span>{error}</span><button onClick={() => void load()}>Yeniden dene</button></div>;

  const { summary, building, tariff } = data;
  const monthName = data.limits.find((item) => item.month === Number(summary.monthKey.slice(5, 7)))?.monthName || "Bu ay";
  const currentMonthNumber = Number(summary.monthKey.slice(5, 7));
  const futureBudgetPlans = data.budgetPlan.filter((item) => item.month > currentMonthNumber).slice(0, 2);
  const tierMessage = summary.tier === 2 ? `Kademe-2’ye ${dateLabel(summary.tierChangedAt)} itibarıyla geçildi.` : `Kademe-2 sınırına ${number(summary.remainingToTier2, 0)} m³ kaldı.`;

  return <div className="public-shell">
    <header className="public-header">
      <Link className="public-brand" href="/"><span><Flame size={21} /></span><div><strong>{building.name}</strong><small>Ortak enerji ve bütçe görünümü</small></div></Link>
      <div className="public-header-actions">
        <button className="public-refresh" onClick={() => void load()} disabled={loading} aria-label="Verileri yenile" title={refreshedAt ? `Son yenileme ${refreshedAt.toLocaleTimeString("tr-TR")}` : "Verileri yenile"}><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
        <form action="/yonetim" method="get"><button className="public-login" type="submit"><LockKeyhole size={16} /> Yönetici girişi</button></form>
      </div>
    </header>

    <main className="public-main public-main-wide">
      <section className={`public-hero ${summary.tier === 2 ? "tier-two" : ""}`}>
        <div><p className="public-kicker"><span /> CANLI ORTAK TÜKETİM BİLGİSİ</p><h1>Isınma, kademe ve bütçe aynı tabloda.</h1><p>{building.apartmentCount} bağımsız bölüm için HRC tüketimi esas alınır. Devreden KRD gaz stokudur; kademe limitini değiştirmez.</p></div>
        <div className="public-tier-hero"><span>ŞU ANKİ TARİFE</span><strong>Kademe-{summary.tier}</strong><small>{tierMessage}</small></div>
      </section>
      {error && <div className="error-banner"><AlertTriangle size={17} />{error}</div>}

      {data.limitUpdates.length > 0 && <section className="panel limit-update-card"><div className="limit-update-head"><span><History size={24} /></span><div><p className="eyebrow">RESMÎ LİMİT GÜNCELLEMESİ</p><h2>{dateOnlyLabel(data.limitUpdates[0].effectiveFrom)} itibarıyla yeni kademe sınırları</h2><p>Önceki değerler silinmedi; tarihçede korunuyor. Hesaplamalar aşağıdaki güncel değerlerle yapılıyor.</p></div></div><div className="limit-update-grid">{data.limitUpdates.map((update) => <article key={update.id}><div><strong>{update.monthName} {update.year}</strong><small>Daire başı aylık limit</small></div><p><del>{number(update.oldPerHomeLimit, 2)}</del><span>→</span><b>{number(update.newPerHomeLimit, 2)} Sm³</b></p><small>{building.apartmentCount} hane toplamı: <del>{number(update.oldBuildingLimit, 2)}</del> → <strong>{number(update.newBuildingLimit, 2)} m³</strong></small>{update.sourceUrl && <a href={update.sourceUrl} target="_blank" rel="noreferrer">{update.sourceLabel || "Resmî kaynağı aç"} <ExternalLink size={14} /></a>}</article>)}</div></section>}

      <section className="panel price-proof-card"><div><p className="eyebrow">KDV DÂHİL FİYAT SAĞLAMASI</p><h2>Gösterilen maliyet doğru tarife ile hesaplanıyor</h2><p>Vergisiz satış fiyatına %{data.pricingExplanation.vatRate} KDV eklenir. Sayaç ve çalışma geçmişi değiştirilmeden, her kayıt kendi tarihindeki fiyatla korunur.</p></div><div className="price-proof-grid"><article><span>Kademe-1</span><strong>{number(data.pricingExplanation.tier1Net, 6)} × 1,20</strong><b>{number(data.pricingExplanation.tier1Gross, 2)} TL/m³</b></article><article><span>Kademe-2</span><strong>{number(data.pricingExplanation.tier2Net, 6)} × 1,20</strong><b>{number(data.pricingExplanation.tier2Gross, 2)} TL/m³</b></article><article className="price-proof-result"><span>Bu ayın sağlaması</span><strong>{number(data.pricingExplanation.currentUsage, 1)} m³ × {number(summary.tier === 2 ? data.pricingExplanation.tier2Gross : data.pricingExplanation.tier1Gross, 6)} TL</strong><b>{money(data.pricingExplanation.currentCost)}</b></article></div></section>

      <section className="public-stats public-stats-five">
        <PublicStat icon={<Droplets size={21} />} label={`${monthName} tüketimi`} value={`${number(summary.monthUsage)} m³`} detail={`Daire başı ${number(summary.perHomeUsage)} m³ · İlk referans ${number(summary.initialUsage)} m³ dâhil`} tone="blue" />
        <PublicStat icon={<Flame size={21} />} label="Kalan gaz stoku (KRD)" value={`${number(summary.remainingGas)} m³`} detail="Kademe hesabına girmez" tone="green" />
        <PublicStat icon={<WalletCards size={21} />} label="Şu anki tahmini maliyet" value={money(summary.actualCost)} detail={`Kademe-${summary.tier} · KDV dâhil`} tone={summary.tier === 2 ? "red" : "amber"} />
        <PublicStat icon={<Gauge size={21} />} label="Günlük ortalama sınır" value={`${number(summary.dailyAllowance)} m³`} detail={`${building.apartmentCount} hane toplamı`} tone="violet" />
        <PublicStat icon={<TrendingUp size={21} />} label="Ay sonu tahmini" value={`${number(summary.forecast, 0)} m³`} detail={`Tahmini Kademe-${summary.forecastTier}`} tone={summary.forecastTier === 2 ? "red" : "green"} />
      </section>

      <section className="budget-strip">
        <div><span>K1’de mevcut tüketimin maliyeti</span><strong>{money(summary.k1Cost)}</strong><small>{number(tariff?.tier1Price, 2)} TL/m³</small></div>
        <div><span>Aynı tüketim K2 olursa</span><strong>{money(summary.k2Cost)}</strong><small>{number(tariff?.tier2Price, 2)} TL/m³</small></div>
        <div className="risk"><span>Kademe risk farkı</span><strong>+{money(summary.tierRiskDifference)}</strong><small>Limit aşılırsa ayın tamamı</small></div>
        <div><span>Bugüne kadar güvenli tempo</span><strong>{number(summary.allowedToDate, 0)} m³</strong><small>Gerçek: {number(summary.monthUsage, 0)} m³</small></div>
      </section>

      {futureBudgetPlans.length > 0 && <section className="panel future-budget-card"><div className="future-budget-head"><div><p className="eyebrow">YÖNETİM İÇİN GELECEK BÜTÇESİ</p><h2>Kademe-1 hakkını tam kullanırsak ne kadar para gerekir?</h2><p>“Tam K1 bütçesi”, güncel apartman limitinin tamamının K1 fiyatıyla kullanılmasıdır. Ölçülen tempo tahmini ise yalnızca elimizdeki {summary.observedDays} günlük veriye dayanır ve yeni kayıtlarla kendiliğinden güncellenir.</p></div><div><span>Ölçülen günlük tempo</span><strong>{number(summary.observedDailyAverage, 2)} m³/gün</strong></div></div><div className="future-budget-grid">{futureBudgetPlans.map((plan) => <article key={plan.month}><header><div><span>{plan.monthName} {plan.year}</span><strong>{number(plan.buildingLimit, 2)} m³</strong></div><em>{plan.days} gün</em></header><dl><div><dt>Tam K1 hakkı için bütçe</dt><dd>{money(plan.fullTier1Budget)}</dd></div><div><dt>Aynı miktar K2 fiyatına çıkarsa</dt><dd>{money(plan.sameVolumeAtTier2)}</dd></div><div className="risk"><dt>Kademe fiyat farkı riski</dt><dd>+{money(plan.tierJumpRisk)}</dd></div><div><dt>Bizim ölçülen tempoya göre</dt><dd>{number(plan.projectedUsage, 0)} m³ · {money(plan.projectedCost)}</dd></div></dl><p className={plan.projectedTier === 2 ? "danger" : "safe"}>Tempo tahmini: Kademe-{plan.projectedTier}</p></article>)}</div><small className="budget-caveat">Bu bir yönetim tahminidir; hava sıcaklığı, kazan derecesi ve günlük çalışma süresi değiştikçe gerçekleşen tüketim farklılaşır.</small></section>}

      <section className="public-content-grid public-content-grid-wide">
        <article className="panel public-chart-card">
          <PanelHead eyebrow="GÜNLÜK BÜTÇE TAKİBİ" title="Günlük tüketim ve güvenli tempo" />
          {currentDaily.length ? <div className="public-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={currentDaily} margin={{ top: 10, right: 4, bottom: 0, left: -8 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7e9ec" /><XAxis dataKey="label" tick={{ fontSize: 14, fill: "#596975", fontWeight: 600 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 14, fill: "#596975", fontWeight: 600 }} axisLine={false} tickLine={false} unit=" m³" width={64} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e6e8eb", fontSize: 14 }} /><Bar dataKey="consumption" name="Tüketim" fill="#168b68" radius={[5,5,1,1]} maxBarSize={38} /><Line dataKey="dailyLimit" name="Günlük ortalama sınır" type="monotone" stroke="#d97725" strokeWidth={2.2} dot={false} /></ComposedChart></ResponsiveContainer></div> : <EmptyChart />}
        </article>
        <div className="public-side-stack">
          <article className={`panel public-quota-card ${summary.tier === 2 ? "danger" : ""}`}><PanelHead eyebrow="ANKARA KADEME TAKİBİ" title={summary.tier === 2 ? "Kademe-2 limiti aşıldı" : "Kademe-1 sınırı içinde"} icon={<CircleGauge size={23} />} /><div className="public-quota-values"><strong>{number(summary.monthUsage, 0)} m³</strong><span>/ {number(summary.quota, 0)} m³</span></div><div className="public-progress"><span style={{ width: `${Math.min(100, summary.quotaPercent)}%` }} /></div><div className="public-quota-foot"><span>Limitin %{number(summary.quotaPercent, 0)}’i</span><span>Kalan {number(summary.remainingToTier2, 0)} m³</span></div><p className="public-tier-note"><AlertTriangle size={15} />{tierMessage}</p></article>
          <article className="panel current-weather"><div className="weather-title"><div><CloudSun size={26} /><span><strong>{weatherText(weather?.weatherCode)}</strong><small>{weather?.location || building.city}</small></span></div><b>{number(weather?.temperature, 0)}°C</b></div><div className="weather-metrics"><span>Hissedilen<strong>{number(weather?.apparent, 0)}°</strong></span><span>Nem<strong>%{number(weather?.humidity, 0)}</strong></span><span><Wind size={14} /> Rüzgâr<strong>{number(weather?.windSpeed, 0)} km/sa</strong></span><span><CloudRain size={14} /> Yağış<strong>{number(weather?.precipitation, 1)} mm</strong></span></div><p>Eti Mahallesi yaklaşık konumu: 39.9324, 32.8459 · Open-Meteo</p></article>
        </div>
      </section>

      <section className="planning-grid">
        <article className="panel annual-plan-card"><PanelHead eyebrow={`${building.apartmentCount} HANE İÇİN RESMÎ PLAN`} title="Aylık limit ve günlük tüketim bütçesi" /><div className="annual-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.monthlyHistory} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7e9ec" /><XAxis dataKey="monthName" tick={{ fontSize: 14, fill: "#596975", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={58} /><YAxis tick={{ fontSize: 14, fill: "#596975", fontWeight: 600 }} axisLine={false} tickLine={false} width={62} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e6e8eb", fontSize: 14 }} /><Bar dataKey="buildingLimit" name="Apartman limiti" fill="#cfe6df" radius={[4,4,0,0]} /><Bar dataKey="usage" name="Gerçek tüketim" fill="#168b68" radius={[4,4,0,0]} /></ComposedChart></ResponsiveContainer></div><div className="limit-table-wrap"><table className="limit-table"><thead><tr><th>Ay</th><th>Daire başı</th><th>{building.apartmentCount} hane limiti</th><th>Günlük ort.</th><th>Gerçek</th></tr></thead><tbody>{data.monthlyHistory.map((row) => <tr key={row.month}><td>{row.monthName}</td><td>{number(row.perHomeLimit, 2)}</td><td><strong>{number(row.buildingLimit, 2)} m³</strong></td><td>{number(row.dailyBuildingLimit, 2)} m³</td><td>{row.usage ? `${number(row.usage, 1)} m³` : "—"}</td></tr>)}</tbody></table></div></article>

        <article className="panel calculator-card"><PanelHead eyebrow="ISINMA SENARYOSU" title="Kaç saat yakarsak ne olur?" /><p className="calculator-intro">Tahmin, gerçek ölçümlerdeki m³/saat hızını seçtiğiniz kazan sıcaklığına yakın kayıtlarla eşleştirir. Veri azsa genel ortalamayı kullanır.</p><div className="calculator-fields"><label>Planlanan ay<select value={planMonth} onChange={(event) => { const month = Number(event.target.value); setPlanMonth(month); const limit = data.limits.find((item) => item.month === month); if (limit) setPlanDays(String(limit.days)); }}>{data.limits.map((item) => <option key={item.month} value={item.month}>{item.monthName}</option>)}</select></label><label>Kazan sıcaklığı<input type="number" min="20" max="90" value={planTemp} onChange={(event) => setPlanTemp(event.target.value)} /><span>°C</span></label><label>Günde çalışma<input type="number" min="0" max="24" step="0.5" value={hoursPerDay} onChange={(event) => setHoursPerDay(event.target.value)} /><span>saat</span></label><label>Kaç gün<input type="number" min="1" max={scenario?.limit.days || 31} value={planDays} onChange={(event) => setPlanDays(event.target.value)} /><span>gün</span></label><label className="full">m³/saat varsayımı <small>(boşsa ölçülen ortalama)</small><input type="number" min="0" step="0.01" placeholder={scenario ? number(scenario.chosenRate, 2) : ""} value={manualRate} onChange={(event) => setManualRate(event.target.value)} /><span>m³/sa</span></label></div>{scenario && <div className="scenario-results"><div><span>Kullanılan hız</span><strong>{number(scenario.chosenRate, 2)} m³/sa</strong><small>{manualRate ? "Kullanıcı varsayımı" : `${scenario.sampleCount} ölçüm · ${scenario.similar ? "yakın sıcaklık" : "genel ortalama"}`}</small></div><div><span>Plan tüketimi</span><strong>{number(scenario.plannedUsage, 0)} m³</strong><small>{scenario.hours} sa/gün × {scenario.days} gün</small></div><div><span>Ay toplamı</span><strong>{number(scenario.totalUsage, 0)} m³</strong><small>Limit {number(scenario.limit.buildingLimit, 0)} m³</small></div><div className={scenario.tier === 2 ? "danger" : "safe"}><span>Senaryo sonucu</span><strong>Kademe-{scenario.tier}</strong><small>{scenario.tier === 2 ? `K2 maliyeti ${money(scenario.k2Cost)}` : `K1 maliyeti ${money(scenario.k1Cost)}`}</small></div><div className="wide"><span>Limiti aşmamak için bu hızla azami çalışma</span><strong>{number(scenario.maxHoursPerDay, 1)} saat/gün</strong><small>Kazan sıcaklığı tek başına tüketimi belirlemez; bina ısı kaybı ve dış hava da etkilidir.</small></div></div>}</article>
      </section>

      <section className="panel interval-card"><PanelHead eyebrow="GERÇEK YAKIM ÖLÇÜMLERİ" title="Saat, derece ve tüketim karşılaştırması" /><div className="limit-table-wrap"><table className="limit-table interval-table"><thead><tr><th>Tarih</th><th>Süre</th><th>Kazan</th><th>Dış hava</th><th>Harcanan</th><th>Hız</th><th>K1 maliyeti</th><th>K2 maliyeti</th></tr></thead><tbody>{data.intervals.slice().reverse().map((row) => <tr key={`${row.startAt}-${row.endAt}`}><td>{dateLabel(row.endAt, true)}</td><td>{number(row.hours, 1)} sa</td><td>{number(row.boilerTemp, 0)}°C</td><td>{number(row.outsideTemp, 0)}°C</td><td><strong>{number(row.consumption, 2)} m³</strong></td><td>{number(row.rate, 2)} m³/sa</td><td>{money(row.tier1Cost)}</td><td>{money(row.tier2Cost)}</td></tr>)}</tbody></table></div></section>

      <section className="public-disclosure public-rule"><ShieldCheck size={24} /><div><strong>Hesap kuralı</strong><p>{data.ruleNote}</p><div className="source-links"><a href={data.sources.limits} target="_blank" rel="noreferrer">BOTAŞ limitleri <ExternalLink size={12} /></a><a href={data.sources.rule} target="_blank" rel="noreferrer">Başkentgaz kuralı <ExternalLink size={12} /></a><a href={data.sources.tariff} target="_blank" rel="noreferrer">Başkentgaz tarifeleri <ExternalLink size={12} /></a></div></div><Building2 size={34} /></section>
    </main>
  </div>;
}

function PublicStat({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <article className="public-stat"><span className={`public-stat-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}
function PanelHead({ eyebrow, title, icon }: { eyebrow: string; title: string; icon?: React.ReactNode }) {
  return <div className="public-panel-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{icon}</div>;
}
function EmptyChart() {
  return <div className="public-empty-chart"><CalendarDays size={26} /><strong>Günlük veri birikiyor</strong><span>Yeni okumalar geldikçe tüketim ve günlük bütçe karşılaştırması oluşacak.</span></div>;
}
