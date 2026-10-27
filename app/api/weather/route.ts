import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", "39.9334");
    url.searchParams.set("longitude", "32.8597");
    url.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code");
    url.searchParams.set("timezone", "Europe/Istanbul");

    const response = await fetch(url, { next: { revalidate: 900 } });
    if (!response.ok) throw new Error("Hava servisi yanıt vermedi.");
    const data = await response.json();
    return NextResponse.json({
      temperature: data.current?.temperature_2m ?? null,
      apparent: data.current?.apparent_temperature ?? null,
      weatherCode: data.current?.weather_code ?? null,
      observedAt: data.current?.time ?? null,
      source: "Open-Meteo",
    });
  } catch {
    return NextResponse.json({ error: "Hava verisi alınamadı." }, { status: 503 });
  }
}
