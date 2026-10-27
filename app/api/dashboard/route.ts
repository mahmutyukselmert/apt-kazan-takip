import { and, asc, desc, eq, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { readings, settings, tariffs } from "@/db/schema";

export const runtime = "edge";

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

function isIsoDate(value: unknown, withTime = false) {
  if (typeof value !== "string") return false;
  return withTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
    : /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function ensureDefaults(uid: string) {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .insert(settings)
    .values({ userId: uid, updatedAt: now })
    .onConflictDoNothing();

  const existingTariff = await db
    .select({ id: tariffs.id })
    .from(tariffs)
    .where(eq(tariffs.userId, uid))
    .limit(1);

  if (!existingTariff.length) {
    await db.insert(tariffs).values({
      userId: uid,
      effectiveFrom: "2026-01-01",
      pricePerM3: 14.1,
      label: "Başlangıç taslağı – doğrulayın",
      createdAt: now,
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const uid = userId(request);
    await ensureDefaults(uid);
    const db = getDb();
    const [allReadings, allTariffs, userSettings] = await Promise.all([
      db.select().from(readings).where(eq(readings.userId, uid)).orderBy(asc(readings.readAt)),
      db.select().from(tariffs).where(eq(tariffs.userId, uid)).orderBy(desc(tariffs.effectiveFrom)),
      db.select().from(settings).where(eq(settings.userId, uid)).limit(1),
    ]);

    return NextResponse.json({
      readings: allReadings,
      tariffs: allTariffs,
      settings: userSettings[0],
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

      if (previous[0]?.readAt === body.readAt) {
        throw new Error("Bu tarih ve saatte zaten bir okuma var.");
      }
      if (previous[0] && hrc < previous[0].hrc) {
        throw new Error(`HRC son okumadan (${previous[0].hrc.toFixed(2)}) düşük olamaz.`);
      }

      const activeTariff = await db
        .select()
        .from(tariffs)
        .where(and(eq(tariffs.userId, uid), lte(tariffs.effectiveFrom, body.readAt.slice(0, 10))))
        .orderBy(desc(tariffs.effectiveFrom))
        .limit(1);

      const inserted = await db
        .insert(readings)
        .values({
          userId: uid,
          readAt: body.readAt,
          hrc,
          krd,
          boilerTemp: body.boilerTemp === "" || body.boilerTemp == null ? null : cleanNumber(body.boilerTemp, "Kazan sıcaklığı", 0),
          outsideTemp: body.outsideTemp === "" || body.outsideTemp == null ? null : cleanNumber(body.outsideTemp, "Dış hava"),
          boilerStatus: ["on", "off", "standby"].includes(body.boilerStatus) ? body.boilerStatus : "on",
          unitPrice: activeTariff[0]?.pricePerM3 ?? 0,
          note: String(body.note || "").slice(0, 300),
          createdAt: now,
        })
        .returning();

      return NextResponse.json({ reading: inserted[0] }, { status: 201 });
    }

    if (action === "tariff") {
      if (!isIsoDate(body.effectiveFrom)) throw new Error("Geçerlilik tarihi eksik.");
      const pricePerM3 = cleanNumber(body.pricePerM3, "m³ fiyatı", 0.01);
      await db
        .insert(tariffs)
        .values({
          userId: uid,
          effectiveFrom: body.effectiveFrom,
          pricePerM3,
          label: String(body.label || "").slice(0, 120),
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [tariffs.userId, tariffs.effectiveFrom],
          set: { pricePerM3, label: String(body.label || "").slice(0, 120) },
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
          city: "Ankara",
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

export async function DELETE(request: NextRequest) {
  try {
    const uid = userId(request);
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) throw new Error("Kayıt kimliği geçersiz.");
    await getDb().delete(readings).where(and(eq(readings.userId, uid), eq(readings.id, id)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kayıt silinemedi." },
      { status: 400 },
    );
  }
}
