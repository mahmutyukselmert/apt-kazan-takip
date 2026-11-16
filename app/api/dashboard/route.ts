import { and, asc, desc, eq, gt, isNull, lt, lte, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { boilerSessions, limitVersions, readings, settings, tariffs } from "@/db/schema";

export const runtime = "edge";

const OFFICIAL_TIER_1 = 17.3616228;
const OFFICIAL_TIER_2 = 26.2116228;

function userId(request: NextRequest) {
  return request.headers.get("oai-authenticated-user-id") || "local-demo";
}

function cleanNumber(value: unknown, field: string, min = -Infinity) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${field} geçerli bir sayı olmalı.`);
  }
  return parsed;
}

function optionalNumber(value: unknown, field: string, min = -Infinity) {
  return value === "" || value == null ? null : cleanNumber(value, field, min);
}

function isIsoDate(value: unknown, withTime = false) {
  if (typeof value !== "string") return false;
  return withTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
    : /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function ensureDefaults(uid: string) {
  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(settings).values({ userId: uid, updatedAt: now }).onConflictDoNothing();

  const existingTariff = await db
    .select({ id: tariffs.id })
    .from(tariffs)
    .where(eq(tariffs.userId, uid))
    .limit(1);

  if (!existingTariff.length) {
    await db.insert(tariffs).values({
      userId: uid,
      effectiveFrom: "2026-10-01",
      pricePerM3: OFFICIAL_TIER_1,
      priceTier2: OFFICIAL_TIER_2,
      label: "Başkentgaz Ekim 2026 · KDV dahil",
      createdAt: now,
    });
  }
}

async function tariffFor(uid: string, date: string) {
  return (await getDb()
    .select()
    .from(tariffs)
    .where(and(eq(tariffs.userId, uid), lte(tariffs.effectiveFrom, date.slice(0, 10))))
    .orderBy(desc(tariffs.effectiveFrom))
    .limit(1))[0];
}

export async function GET(request: NextRequest) {
  try {
    const uid = userId(request);
    await ensureDefaults(uid);
    const db = getDb();
    const [allReadings, allTariffs, userSettings, allSessions, allLimitVersions] = await Promise.all([
      db.select().from(readings).where(eq(readings.userId, uid)).orderBy(asc(readings.readAt)),
      db.select().from(tariffs).where(eq(tariffs.userId, uid)).orderBy(desc(tariffs.effectiveFrom)),
      db.select().from(settings).where(eq(settings.userId, uid)).limit(1),
      db.select().from(boilerSessions).where(eq(boilerSessions.userId, uid)).orderBy(desc(boilerSessions.startedAt)),
      db.select().from(limitVersions).where(eq(limitVersions.userId, uid)).orderBy(desc(limitVersions.effectiveFrom), asc(limitVersions.month)),
    ]);

    return NextResponse.json({
      readings: allReadings,
      tariffs: allTariffs,
      settings: userSettings[0],
      sessions: allSessions,
      limitVersions: allLimitVersions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Veriler alınamadı." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = userId(request);
    await ensureDefaults(uid);
    const body = await request.json();
    const action = String(body.action || "reading");
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "start") {
      if (!isIsoDate(body.startedAt, true)) throw new Error("Başlangıç tarihi ve saati eksik.");
      const openSession = await db
        .select({ id: boilerSessions.id })
        .from(boilerSessions)
        .where(and(eq(boilerSessions.userId, uid), isNull(boilerSessions.endedAt)))
        .limit(1);
      if (openSession.length) throw new Error("Kazan zaten çalışıyor.");

      const latest = (await db
        .select()
        .from(readings)
        .where(eq(readings.userId, uid))
        .orderBy(desc(readings.readAt))
        .limit(1))[0];
      if (!latest) throw new Error("Önce bir kez güncel HRC ve KRD başlangıç okuması girin.");
      if (body.startedAt < latest.readAt) throw new Error("Başlangıç saati son sayaç okumasından önce olamaz.");

      const inserted = await db
        .insert(boilerSessions)
        .values({
          userId: uid,
          startedAt: body.startedAt,
          startHrc: latest.hrc,
          startKrd: latest.krd,
          targetTemp: optionalNumber(body.targetTemp, "Kazan sıcaklığı", 0),
          outsideTemp: optionalNumber(body.outsideTemp, "Dış hava"),
          note: String(body.note || "").slice(0, 300),
          createdAt: now,
        })
        .returning();
      return NextResponse.json({ session: inserted[0] }, { status: 201 });
    }

    if (action === "stop") {
      if (!isIsoDate(body.endedAt, true)) throw new Error("Kapanış tarihi ve saati eksik.");
      const session = (await db
        .select()
        .from(boilerSessions)
        .where(and(eq(boilerSessions.userId, uid), isNull(boilerSessions.endedAt)))
        .orderBy(desc(boilerSessions.startedAt))
        .limit(1))[0];
      if (!session) throw new Error("Kapatılacak açık bir kazan çalışması bulunamadı.");
      if (body.endedAt <= session.startedAt) throw new Error("Kapanış saati başlangıçtan sonra olmalı.");

      const hrc = cleanNumber(body.hrc, "HRC", session.startHrc);
      const krd = cleanNumber(body.krd, "KRD", 0);
      const latest = (await db
        .select()
        .from(readings)
        .where(eq(readings.userId, uid))
        .orderBy(desc(readings.readAt))
        .limit(1))[0];
      if (latest && hrc < latest.hrc) throw new Error(`HRC son okumadan (${latest.hrc.toFixed(2)}) düşük olamaz.`);
      if (latest?.readAt === body.endedAt) throw new Error("Bu tarih ve saatte zaten bir okuma var.");

      const activeTariff = await tariffFor(uid, body.endedAt);
      const note = String(body.note || session.note || "Kazan kapatıldı").slice(0, 300);
      const inserted = await db
        .insert(readings)
        .values({
          userId: uid,
          readAt: body.endedAt,
          hrc,
          krd,
          boilerTemp: session.targetTemp,
          outsideTemp: optionalNumber(body.outsideTemp, "Dış hava") ?? session.outsideTemp,
          boilerStatus: "off",
          unitPrice: activeTariff?.pricePerM3 ?? 0,
          unitPriceTier2: activeTariff?.priceTier2 ?? 0,
          note,
          createdAt: now,
        })
        .returning();

      await db
        .update(boilerSessions)
        .set({ endedAt: body.endedAt, endHrc: hrc, endKrd: krd, note })
        .where(and(eq(boilerSessions.userId, uid), eq(boilerSessions.id, session.id)));

      return NextResponse.json({ reading: inserted[0], session: { ...session, endedAt: body.endedAt, endHrc: hrc, endKrd: krd } });
    }

    if (action === "cancelSession") {
      const openSession = (await db
        .select({ id: boilerSessions.id })
        .from(boilerSessions)
        .where(and(eq(boilerSessions.userId, uid), isNull(boilerSessions.endedAt)))
        .limit(1))[0];
      if (!openSession) throw new Error("İptal edilecek açık çalışma bulunamadı.");
      await db.delete(boilerSessions).where(and(eq(boilerSessions.userId, uid), eq(boilerSessions.id, openSession.id)));
      return NextResponse.json({ ok: true });
    }

    if (action === "reading") {
      if (!isIsoDate(body.readAt, true)) throw new Error("Okuma tarihi ve saati eksik.");
      const hrc = cleanNumber(body.hrc, "HRC", 0);
      const krd = cleanNumber(body.krd, "KRD", 0);
      const previous = await db
        .select()
        .from(readings)
        .where(and(eq(readings.userId, uid), lte(readings.readAt, body.readAt)))
        .orderBy(desc(readings.readAt))
        .limit(1);
      const isReference = body.readingType === "reference" || !previous[0];

      if (previous[0]?.readAt === body.readAt) throw new Error("Bu tarih ve saatte zaten bir okuma var.");
      if (!isReference && previous[0] && hrc < previous[0].hrc) {
        throw new Error(`HRC son okumadan (${previous[0].hrc.toFixed(2)}) düşük olamaz.`);
      }

      const activeTariff = await tariffFor(uid, body.readAt);
      const inserted = await db
        .insert(readings)
        .values({
          userId: uid,
          readAt: body.readAt,
          hrc,
          krd,
          boilerTemp: null,
          outsideTemp: null,
          boilerStatus: isReference ? "standby" : "off",
          unitPrice: activeTariff?.pricePerM3 ?? 0,
          unitPriceTier2: activeTariff?.priceTier2 ?? 0,
          note: String(body.note || (isReference ? "Sayaç referans okuması" : "Manuel sayaç okuması")).slice(0, 300),
          createdAt: now,
        })
        .returning();

      return NextResponse.json({ reading: inserted[0] }, { status: 201 });
    }

    if (action === "tariff") {
      if (!isIsoDate(body.effectiveFrom)) throw new Error("Geçerlilik tarihi eksik.");
      const pricePerM3 = cleanNumber(body.pricePerM3, "Kademe-1 fiyatı", 0.01);
      const priceTier2 = cleanNumber(body.priceTier2, "Kademe-2 fiyatı", 0.01);
      await db
        .insert(tariffs)
        .values({
          userId: uid,
          effectiveFrom: body.effectiveFrom,
          pricePerM3,
          priceTier2,
          label: String(body.label || "").slice(0, 120),
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [tariffs.userId, tariffs.effectiveFrom],
          set: { pricePerM3, priceTier2, label: String(body.label || "").slice(0, 120) },
        });
      return NextResponse.json({ ok: true });
    }

    if (action === "limit") {
      if (!isIsoDate(body.effectiveFrom)) throw new Error("Güncellemenin geçerlilik tarihi eksik.");
      const year = Math.round(cleanNumber(body.year, "Limit yılı", 2020));
      const month = Math.round(cleanNumber(body.month, "Limit ayı", 1));
      if (month > 12) throw new Error("Limit ayı 1 ile 12 arasında olmalı.");
      const perHomeLimit = cleanNumber(body.perHomeLimit, "Daire başı limit", 0.01);
      const sourceLabel = String(body.sourceLabel || "Resmî limit güncellemesi").slice(0, 160);
      const sourceUrl = String(body.sourceUrl || "").slice(0, 500);
      const note = String(body.note || "").slice(0, 300);
      await db
        .insert(limitVersions)
        .values({ userId: uid, effectiveFrom: body.effectiveFrom, year, month, perHomeLimit, sourceLabel, sourceUrl, note, createdAt: now })
        .onConflictDoUpdate({
          target: [limitVersions.userId, limitVersions.effectiveFrom, limitVersions.year, limitVersions.month],
          set: { perHomeLimit, sourceLabel, sourceUrl, note },
        });
      return NextResponse.json({ ok: true });
    }

    if (action === "settings") {
      const apartmentCount = Math.round(cleanNumber(body.apartmentCount, "Daire sayısı", 1));
      const krdAlert = cleanNumber(body.krdAlert, "KRD alarmı", 0);
      await db
        .update(settings)
        .set({
          buildingName: String(body.buildingName || "Apartmanımız").slice(0, 80),
          apartmentCount,
          krdAlert,
          city: "Eti Mahallesi, Çankaya / Ankara",
          updatedAt: now,
        })
        .where(eq(settings.userId, uid));
      return NextResponse.json({ ok: true });
    }

    throw new Error("Bilinmeyen işlem.");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "İşlem tamamlanamadı." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const uid = userId(request);
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error("Kayıt kimliği geçersiz.");
    if (!isIsoDate(body.readAt, true)) throw new Error("Okuma tarihi ve saati eksik.");

    const db = getDb();
    const current = await db
      .select()
      .from(readings)
      .where(and(eq(readings.userId, uid), eq(readings.id, id)))
      .limit(1);
    if (!current.length) throw new Error("Düzenlenecek okuma bulunamadı.");

    const linkedSession = (await db
      .select()
      .from(boilerSessions)
      .where(and(eq(boilerSessions.userId, uid), eq(boilerSessions.endedAt, current[0].readAt)))
      .limit(1))[0];
    const dependentSessions = await db
      .select()
      .from(boilerSessions)
      .where(and(
        eq(boilerSessions.userId, uid),
        gt(boilerSessions.startedAt, current[0].readAt),
        eq(boilerSessions.startHrc, current[0].hrc),
        eq(boilerSessions.startKrd, current[0].krd),
      ));

    const hrc = cleanNumber(body.hrc, "HRC", 0);
    const krd = cleanNumber(body.krd, "KRD", 0);
    const sameTime = await db
      .select({ id: readings.id })
      .from(readings)
      .where(and(eq(readings.userId, uid), eq(readings.readAt, body.readAt), ne(readings.id, id)))
      .limit(1);
    if (sameTime.length) throw new Error("Bu tarih ve saatte başka bir okuma var.");

    const [previous, next, activeTariff] = await Promise.all([
      db.select().from(readings)
        .where(and(eq(readings.userId, uid), lt(readings.readAt, body.readAt), ne(readings.id, id)))
        .orderBy(desc(readings.readAt)).limit(1),
      db.select().from(readings)
        .where(and(eq(readings.userId, uid), gt(readings.readAt, body.readAt), ne(readings.id, id)))
        .orderBy(asc(readings.readAt)).limit(1),
      tariffFor(uid, body.readAt),
    ]);

    if (linkedSession && hrc < linkedSession.startHrc) {
      throw new Error(`HRC bu çalışmanın başlangıcından (${linkedSession.startHrc.toFixed(2)}) düşük olamaz.`);
    }
    if (dependentSessions.some((session) => body.readAt >= session.startedAt)) {
      throw new Error("Okuma saati, onu kullanan sonraki kazan çalışmasından önce olmalı.");
    }
    const dependentEnd = dependentSessions.find((session) => session.endHrc != null && hrc > session.endHrc);
    if (dependentEnd?.endHrc != null) {
      throw new Error(`HRC sonraki çalışmanın kapanışından (${dependentEnd.endHrc.toFixed(2)}) yüksek olamaz.`);
    }
    if (current[0].boilerStatus !== "standby" && previous[0] && hrc < previous[0].hrc) {
      throw new Error(`HRC önceki okumadan (${previous[0].hrc.toFixed(2)}) düşük olamaz.`);
    }
    if (next[0] && hrc > next[0].hrc) {
      throw new Error(`HRC sonraki okumadan (${next[0].hrc.toFixed(2)}) yüksek olamaz.`);
    }

    const updated = await db
      .update(readings)
      .set({
        readAt: body.readAt,
        hrc,
        krd,
        boilerTemp: current[0].boilerTemp,
        outsideTemp: current[0].outsideTemp,
        boilerStatus: current[0].boilerStatus,
        unitPrice: activeTariff?.pricePerM3 ?? current[0].unitPrice,
        unitPriceTier2: activeTariff?.priceTier2 ?? current[0].unitPriceTier2,
        note: String(body.note || "").slice(0, 300),
      })
      .where(and(eq(readings.userId, uid), eq(readings.id, id)))
      .returning();

    if (linkedSession) {
      await db
        .update(boilerSessions)
        .set({ endedAt: body.readAt, endHrc: hrc, endKrd: krd, note: String(body.note || linkedSession.note).slice(0, 300) })
        .where(and(eq(boilerSessions.userId, uid), eq(boilerSessions.id, linkedSession.id)));
    }
    if (dependentSessions.length) {
      await db
        .update(boilerSessions)
        .set({ startHrc: hrc, startKrd: krd })
        .where(and(
          eq(boilerSessions.userId, uid),
          gt(boilerSessions.startedAt, current[0].readAt),
          eq(boilerSessions.startHrc, current[0].hrc),
          eq(boilerSessions.startKrd, current[0].krd),
        ));
    }

    return NextResponse.json({ reading: updated[0] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Okuma güncellenemedi." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const uid = userId(request);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) throw new Error("Kayıt kimliği geçersiz.");
    const db = getDb();
    const reading = (await db.select().from(readings).where(and(eq(readings.userId, uid), eq(readings.id, id))).limit(1))[0];
    if (!reading) throw new Error("Silinecek okuma bulunamadı.");
    const openSession = (await db.select().from(boilerSessions)
      .where(and(eq(boilerSessions.userId, uid), isNull(boilerSessions.endedAt))).limit(1))[0];
    const latest = (await db.select().from(readings).where(eq(readings.userId, uid)).orderBy(desc(readings.readAt)).limit(1))[0];
    if (openSession && latest?.id === reading.id) {
      throw new Error("Çalışan kazan bu son okumayı kullanıyor. Önce ‘Yanlış başlatmayı sil’ ile açık çalışmayı kaldırın.");
    }
    const dependentSession = (await db.select({ id: boilerSessions.id }).from(boilerSessions)
      .where(and(
        eq(boilerSessions.userId, uid),
        gt(boilerSessions.startedAt, reading.readAt),
        eq(boilerSessions.startHrc, reading.hrc),
        eq(boilerSessions.startKrd, reading.krd),
      )).limit(1))[0];
    if (dependentSession) {
      throw new Error("Bu okuma sonraki kazan çalışmasının başlangıcıdır. Kayıtları en yeniden eskiye doğru silin.");
    }
    await db.delete(boilerSessions).where(and(eq(boilerSessions.userId, uid), eq(boilerSessions.endedAt, reading.readAt)));
    await db.delete(readings).where(and(eq(readings.userId, uid), eq(readings.id, id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kayıt silinemedi." },
      { status: 400 },
    );
  }
}
