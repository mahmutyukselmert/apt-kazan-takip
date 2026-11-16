import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { boilerSessions, limitVersions, readings, settings, tariffs } from "@/db/schema";

export const runtime = "edge";

const USER_ID = "local-demo";
const MONTHLY_LIMITS = [344.73, 326.8, 302.09, 180.69, 109.01, 46.2, 35.19, 31.03, 40.69, 76.86, 161.63, 284.25];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const LIMIT_SOURCE = "https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf";
const TARIFF_SOURCE = "https://www.baskentdogalgaz.com.tr/tr/page/Satis-Tarifeleri-ve-Fiyatlari/31";
const RULE_SOURCE = "https://www.baskentdogalgaz.com.tr/tr/page/Kademeli-Dogal-Gaz-Tarifesi-Nedir/250";

function istanbulNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day" | "hour") => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour") };
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export async function GET() {
  try {
    const db = getDb();
    const [allReadings, buildingRows, allTariffs, allSessions, allLimitVersions] = await Promise.all([
      db.select().from(readings).where(eq(readings.userId, USER_ID)).orderBy(asc(readings.readAt)),
      db.select().from(settings).where(eq(settings.userId, USER_ID)).limit(1),
      db.select().from(tariffs).where(eq(tariffs.userId, USER_ID)).orderBy(desc(tariffs.effectiveFrom)),
      db.select().from(boilerSessions).where(eq(boilerSessions.userId, USER_ID)).orderBy(asc(boilerSessions.startedAt)),
      db.select().from(limitVersions).where(eq(limitVersions.userId, USER_ID)).orderBy(asc(limitVersions.effectiveFrom), asc(limitVersions.month)),
    ]);

    const now = istanbulNow();
    const currentMonthKey = `${now.year}-${String(now.month).padStart(2, "0")}`;
    const today = `${currentMonthKey}-${String(now.day).padStart(2, "0")}`;
    const building = buildingRows[0];
    const apartmentCount = building?.apartmentCount || 25;
    const validTariffs = allTariffs.filter((tariff) => tariff.pricePerM3 > 0 && tariff.priceTier2 > 0);
    const activeTariff = validTariffs.find((tariff) => tariff.effectiveFrom <= today) || validTariffs[0];
    const tier1Price = activeTariff?.pricePerM3 || 0;
    const tier2Price = activeTariff?.priceTier2 || 0;
    const sessionByEnd = new Map(allSessions.filter((session) => session.endedAt).map((session) => [session.endedAt, session]));

    const measuredIntervals = allReadings.slice(1).map((reading, offset) => {
      const previous = allReadings[offset];
      const matched = sessionByEnd.get(reading.readAt);
      const startAt = matched?.startedAt || previous.readAt;
      const endAt = matched?.endedAt || reading.readAt;
      const hours = Math.max(0, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000);
      const consumption = reading.boilerStatus === "standby" ? 0 : Math.max(0, reading.hrc - previous.hrc);
      const boilerTemp = matched?.targetTemp ?? previous.boilerTemp ?? reading.boilerTemp;
      const outsideTemp = matched?.outsideTemp ?? reading.outsideTemp ?? previous.outsideTemp;
      return {
        startAt, endAt, date: reading.readAt.slice(0, 10), monthKey: reading.readAt.slice(0, 7),
        consumption: round(consumption), hours: round(hours), rate: hours > 0 ? round(consumption / hours) : null,
        boilerTemp, outsideTemp,
        tier1Cost: round(consumption * (reading.unitPrice || tier1Price)),
        tier2Cost: round(consumption * (reading.unitPriceTier2 || tier2Price)),
      };
    });
    const firstReading = allReadings[0];
    const intervals = firstReading ? [{
      startAt: firstReading.readAt,
      endAt: firstReading.readAt,
      date: firstReading.readAt.slice(0, 10),
      monthKey: firstReading.readAt.slice(0, 7),
      consumption: round(Math.max(0, firstReading.hrc)),
      hours: 0,
      rate: null,
      boilerTemp: null,
      outsideTemp: firstReading.outsideTemp,
      tier1Cost: round(Math.max(0, firstReading.hrc) * (firstReading.unitPrice || tier1Price)),
      tier2Cost: round(Math.max(0, firstReading.hrc) * (firstReading.unitPriceTier2 || tier2Price)),
    }, ...measuredIntervals] : measuredIntervals;

    const dailyMap = new Map<string, { date: string; consumption: number; timedConsumption: number; hours: number; boilerWeighted: number; boilerHours: number; outsideWeighted: number; outsideHours: number; tier1Cost: number; tier2Cost: number }>();
    for (const row of intervals) {
      const activeHours = row.consumption > 0 ? row.hours : 0;
      const daily = dailyMap.get(row.date) || { date: row.date, consumption: 0, timedConsumption: 0, hours: 0, boilerWeighted: 0, boilerHours: 0, outsideWeighted: 0, outsideHours: 0, tier1Cost: 0, tier2Cost: 0 };
      daily.consumption += row.consumption;
      if (activeHours > 0) daily.timedConsumption += row.consumption;
      daily.hours += activeHours;
      daily.tier1Cost += row.tier1Cost;
      daily.tier2Cost += row.tier2Cost;
      if (row.boilerTemp != null && activeHours > 0) { daily.boilerWeighted += row.boilerTemp * activeHours; daily.boilerHours += activeHours; }
      if (row.outsideTemp != null && activeHours > 0) { daily.outsideWeighted += row.outsideTemp * activeHours; daily.outsideHours += activeHours; }
      dailyMap.set(row.date, daily);
    }

    const daily = Array.from(dailyMap.values()).map((row) => ({
      date: row.date, consumption: round(row.consumption), hours: round(row.hours),
      avgRate: row.hours > 0 ? round(row.timedConsumption / row.hours) : null,
      avgBoilerTemp: row.boilerHours > 0 ? round(row.boilerWeighted / row.boilerHours, 1) : null,
      avgOutsideTemp: row.outsideHours > 0 ? round(row.outsideWeighted / row.outsideHours, 1) : null,
      tier1Cost: round(row.tier1Cost), tier2Cost: round(row.tier2Cost),
    }));

    const applicableLimitVersions = allLimitVersions.filter((version) => version.year === now.year && version.effectiveFrom <= today);
    const activeLimitVersions = new Map<number, (typeof applicableLimitVersions)[number]>();
    for (const version of applicableLimitVersions) activeLimitVersions.set(version.month, version);
    const limits = MONTHLY_LIMITS.map((fallbackLimit, index) => {
      const version = activeLimitVersions.get(index + 1);
      const perHomeLimit = version?.perHomeLimit ?? fallbackLimit;
      const days = new Date(Date.UTC(now.year, index + 1, 0)).getUTCDate();
      const buildingLimit = perHomeLimit * apartmentCount;
      return { year: now.year, month: index + 1, monthName: MONTHS[index], perHomeLimit, buildingLimit: round(buildingLimit), dailyBuildingLimit: round(buildingLimit / days), days, effectiveFrom: version?.effectiveFrom ?? null };
    });

    const versionsByMonth = new Map<number, typeof applicableLimitVersions>();
    for (const version of applicableLimitVersions) {
      const rows = versionsByMonth.get(version.month) || [];
      rows.push(version);
      versionsByMonth.set(version.month, rows);
    }
    const limitUpdates = Array.from(versionsByMonth.entries()).flatMap(([month, versions]) => versions.slice(1).map((version, index) => ({
      id: version.id,
      effectiveFrom: version.effectiveFrom,
      year: version.year,
      month,
      monthName: MONTHS[month - 1],
      oldPerHomeLimit: versions[index].perHomeLimit,
      newPerHomeLimit: version.perHomeLimit,
      oldBuildingLimit: round(versions[index].perHomeLimit * apartmentCount),
      newBuildingLimit: round(version.perHomeLimit * apartmentCount),
      sourceLabel: version.sourceLabel,
      sourceUrl: version.sourceUrl,
      note: version.note,
    }))).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || a.month - b.month);

    const monthlyHistory = limits.map((limit) => {
      const key = `${limit.year}-${String(limit.month).padStart(2, "0")}`;
      const rows = intervals.filter((row) => row.monthKey === key);
      const usage = rows.reduce((sum, row) => sum + row.consumption, 0);
      const heatingHours = rows.reduce((sum, row) => sum + (row.consumption > 0 ? row.hours : 0), 0);
      const timedUsage = rows.reduce((sum, row) => sum + (row.hours > 0 ? row.consumption : 0), 0);
      const k1Cost = rows.reduce((sum, row) => sum + row.tier1Cost, 0);
      const k2Cost = rows.reduce((sum, row) => sum + row.tier2Cost, 0);
      return {
        ...limit, monthKey: key, usage: round(usage), perHomeUsage: round(usage / apartmentCount), heatingHours: round(heatingHours),
        avgRate: heatingHours > 0 ? round(timedUsage / heatingHours) : null, tier: usage > limit.buildingLimit ? 2 : 1,
        k1Cost: round(k1Cost || usage * tier1Price), k2Cost: round(k2Cost || usage * tier2Price),
      };
    });

    const currentLimit = limits[now.month - 1];
    const currentRows = intervals.filter((row) => row.monthKey === currentMonthKey);
    const initialUsage = firstReading?.readAt.slice(0, 7) === currentMonthKey ? Math.max(0, firstReading.hrc) : 0;
    const monthUsage = currentRows.reduce((sum, row) => sum + row.consumption, 0);
    const heatingHours = currentRows.reduce((sum, row) => sum + (row.consumption > 0 ? row.hours : 0), 0);
    const timedUsage = currentRows.reduce((sum, row) => sum + (row.hours > 0 ? row.consumption : 0), 0);
    let cumulative = 0;
    let tierChangedAt: string | null = null;
    for (const row of currentRows) { cumulative += row.consumption; if (!tierChangedAt && cumulative > currentLimit.buildingLimit) tierChangedAt = row.endAt; }
    const tier: 1 | 2 = monthUsage > currentLimit.buildingLimit ? 2 : 1;
    const observationStartDay = currentRows.length ? Number(currentRows[0].date.slice(8, 10)) : now.day;
    const observedDays = Math.max(1, now.day - observationStartDay + 1);
    const observedDailyAverage = monthUsage / observedDays;
    const forecast = observedDailyAverage * currentLimit.days;
    const k1Cost = currentRows.reduce((sum, row) => sum + row.tier1Cost, 0) || monthUsage * tier1Price;
    const k2Cost = currentRows.reduce((sum, row) => sum + row.tier2Cost, 0) || monthUsage * tier2Price;
    const latest = allReadings.at(-1);

    const budgetPlan = limits.map((limit) => {
      const projectedUsage = observedDailyAverage * limit.days;
      const projectedTier: 1 | 2 = projectedUsage > limit.buildingLimit ? 2 : 1;
      return {
        ...limit,
        fullTier1Budget: round(limit.buildingLimit * tier1Price),
        sameVolumeAtTier2: round(limit.buildingLimit * tier2Price),
        tierJumpRisk: round(limit.buildingLimit * (tier2Price - tier1Price)),
        projectedUsage: round(projectedUsage),
        projectedTier,
        projectedCost: round(projectedUsage * (projectedTier === 2 ? tier2Price : tier1Price)),
        observedDailyAverage: round(observedDailyAverage),
      };
    });

    return NextResponse.json({
      building: { name: building?.buildingName || "Apartmanımız", city: building?.city || "Eti Mahallesi, Çankaya / Ankara", apartmentCount },
      tariff: activeTariff ? { effectiveFrom: activeTariff.effectiveFrom, tier1Price, tier2Price, label: activeTariff.label, sourceUrl: TARIFF_SOURCE } : null,
      summary: {
        monthKey: currentMonthKey, monthUsage: round(monthUsage), initialUsage: round(initialUsage), perHomeUsage: round(monthUsage / apartmentCount), remainingGas: latest?.krd ?? null,
        lastUpdatedAt: latest?.readAt ?? null, heatingHours: round(heatingHours), avgRate: heatingHours > 0 ? round(timedUsage / heatingHours) : null,
        tier, tierChangedAt, quota: currentLimit.buildingLimit, perHomeLimit: currentLimit.perHomeLimit, dailyAllowance: currentLimit.dailyBuildingLimit,
        allowedToDate: round(currentLimit.dailyBuildingLimit * now.day), paceDifference: round((currentLimit.dailyBuildingLimit * now.day) - monthUsage),
        quotaPercent: currentLimit.buildingLimit ? round((monthUsage / currentLimit.buildingLimit) * 100) : 0,
        remainingToTier2: round(Math.max(0, currentLimit.buildingLimit - monthUsage)), forecast: round(forecast), observedDays, observedDailyAverage: round(observedDailyAverage),
        forecastTier: forecast > currentLimit.buildingLimit ? 2 : 1, k1Cost: round(k1Cost), k2Cost: round(k2Cost),
        actualCost: round(tier === 2 ? k2Cost : k1Cost), tierRiskDifference: round(Math.max(0, k2Cost - k1Cost)),
      },
      limits, limitUpdates, budgetPlan, monthlyHistory, daily: daily.slice(-45), intervals: intervals.filter((row) => row.consumption > 0 && row.hours > 0).slice(-24),
      pricingExplanation: {
        vatRate: 20,
        tier1Net: round(tier1Price / 1.2, 6),
        tier2Net: round(tier2Price / 1.2, 6),
        tier1Gross: round(tier1Price, 6),
        tier2Gross: round(tier2Price, 6),
        currentUsage: round(monthUsage),
        currentCost: round(monthUsage * (tier === 2 ? tier2Price : tier1Price)),
      },
      sources: { limits: limitUpdates[0]?.sourceUrl || LIMIT_SOURCE, tariff: TARIFF_SOURCE, rule: RULE_SOURCE },
      ruleNote: "Ön ödemeli sayaçta satın alınan veya devreden kredi değil, ilgili ayda tüketilen gaz esas alınır. Merkezi sistem toplam limiti hane sayısı ile çarpılır; limit aşılırsa ilgili ay tüketimi Kademe-2 fiyatıyla değerlendirilir.",
    }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ortak görünüm hazırlanamadı." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
