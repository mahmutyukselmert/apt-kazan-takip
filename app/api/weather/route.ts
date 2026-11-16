import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    // Eti Mahallesi, Çankaya / Ankara
    url.searchParams.set("latitude", "39.9324");
    url.searchParams.set("longitude", "32.8459");
    url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
    url.searchParams.set("timezone", "Europe/Istanbul");

    const response = await fetch(url, { next: { revalidate: 900 } });
    if (!response.ok) throw new Error("Hava servisi yanıt vermedi.");
    const data = await response.json();
    return NextResponse.json({
      temperature: data.current?.temperature_2m ?? null,
      apparent: data.current?.apparent_temperature ?? null,
      humidity: data.current?.relative_humidity_2m ?? null,
      precipitation: data.current?.precipitation ?? null,
      windSpeed: data.current?.wind_speed_10m ?? null,
      weatherCode: data.current?.weather_code ?? null,
      observedAt: data.current?.time ?? null,
      location: "Eti Mahallesi, Çankaya / Ankara",
      coordinates: { latitude: 39.9324, longitude: 32.8459 },
      source: "Open-Meteo",
    });
  } catch {
    return NextResponse.json({ error: "Hava verisi alınamadı." }, { status: 503 });
  }
}
