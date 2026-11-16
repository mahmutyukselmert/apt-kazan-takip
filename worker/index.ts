import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const encoder = new TextEncoder();

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameValue(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") || "";
  for (const cookie of cookies.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function loginPage(error = "") {
  const message = error ? `<p class="error">${error}</p>` : "";
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEMA Apartmanı · Güvenli Giriş</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#18313a;background:linear-gradient(145deg,#eef7f3,#f7f4ed);font-family:Inter,system-ui,sans-serif}.card{width:min(420px,100%);padding:34px;border:1px solid #dce8e3;border-radius:22px;background:rgba(255,255,255,.94);box-shadow:0 24px 70px rgba(21,57,50,.12)}.mark{width:50px;height:50px;display:grid;place-items:center;border-radius:15px;color:#fff;background:#16805f;font-size:25px}h1{margin:22px 0 7px;font-size:25px;letter-spacing:-.03em}p{margin:0;color:#65777d;font-size:14px;line-height:1.55}label{display:block;margin:24px 0 8px;font-size:12px;font-weight:750}input{width:100%;height:48px;padding:0 14px;border:1px solid #cfdcd8;border-radius:11px;background:#fff;font:inherit;outline:none}input:focus{border-color:#16805f;box-shadow:0 0 0 3px rgba(22,128,95,.12)}button{width:100%;height:48px;margin-top:12px;border:0;border-radius:11px;color:#fff;background:#16805f;font:inherit;font-weight:750;cursor:pointer}.error{margin-top:14px;padding:10px 12px;border-radius:9px;color:#a23f39;background:#fff0ee;font-size:12px}.foot{margin-top:20px;padding-top:18px;border-top:1px solid #e9efec;font-size:11px}.foot a{display:inline-block;margin-top:7px;color:#16805f;font-weight:750;text-decoration:none}
</style></head><body><main class="card"><div class="mark">♨</div><h1>Kazan takip sistemi</h1><p>SEMA Apartmanı yönetim ekranına erişmek için parolanızı girin.</p>${message}<form method="post" action="/__auth/login"><label for="password">Giriş parolası</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required><button type="submit">Güvenli giriş yap</button></form><p class="foot">Veri girişi, düzenleme ve silme işlemleri parola olmadan yapılamaz.<br><a href="/">← Ortak görünüme dön</a></p></main></body></html>`;
}

async function authorize(request: Request, env: Cloudflare.Env) {
  const required = env.AUTH_REQUIRED === "true" || Boolean(env.APP_PASSWORD);
  if (!required) return null;
  if (!env.APP_PASSWORD) {
    return new Response("Güvenli giriş henüz yapılandırılıyor. Lütfen birkaç dakika sonra tekrar deneyin.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const url = new URL(request.url);
  if (url.pathname === "/__auth/login" && request.method === "POST") {
    const form = await request.formData();
    const submitted = String(form.get("password") || "");
    const [submittedHash, expectedHash] = await Promise.all([digest(submitted), digest(env.APP_PASSWORD)]);
    if (!sameValue(submittedHash, expectedHash)) {
      return new Response(loginPage("Parola hatalı. Lütfen yeniden deneyin."), {
        status: 401,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    const token = await digest(`apartman-kazan:${env.APP_PASSWORD}`);
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/yonetim",
        "Set-Cookie": `apt_session=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (url.pathname === "/__auth/logout") {
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": "apt_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" },
    });
  }

  const publicGet = request.method === "GET" && (
    url.pathname === "/" ||
    url.pathname === "/api/public-dashboard" ||
    url.pathname === "/api/weather" ||
    url.pathname === "/favicon.svg" ||
    url.pathname.startsWith("/_next/")
  );
  if (publicGet) return null;

  const expectedToken = await digest(`apartman-kazan:${env.APP_PASSWORD}`);
  if (sameValue(readCookie(request, "apt_session") || "", expectedToken)) return null;
  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "Oturum açmanız gerekiyor." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(loginPage(), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const authResponse = await authorize(request, env);
    if (authResponse) return authResponse;

    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
