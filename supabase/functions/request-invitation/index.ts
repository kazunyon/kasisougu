import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
function getAdminKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const namedKeys = JSON.parse(secretKeys) as Record<string, string>;
      if (typeof namedKeys.default === "string") return namedKeys.default;
    } catch { /* Use the local/legacy single-key fallback below. */ }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const SUPABASE_ADMIN_KEY = getAdminKey();
const INVITATION_CODE_PEPPER = Deno.env.get("INVITATION_CODE_PEPPER") ?? "";
const INVITATION_RATE_PEPPER = Deno.env.get("INVITATION_RATE_PEPPER") ?? "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://kazunyon.github.io";
const INVITATION_REDIRECT_URL = Deno.env.get("INVITATION_REDIRECT_URL") ??
  "https://kazunyon.github.io/kasisougu/invitation.html";

const GENERIC_MESSAGE = "該当する場合は招待メールが届きます。受信トレイと迷惑メールをご確認ください。届かない場合は運営担当者へご連絡ください。";
const encoder = new TextEncoder();

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin === APP_ORIGIN ? APP_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), {status, headers: corsHeaders(origin)});
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, "0")).join("");
}

function requestIp(request: Request): string {
  // Supabase's Cloudflare edge injects this value. Do not trust caller-controlled
  // forwarding headers as a fallback; that would let a caller rotate fake IPs.
  return request.headers.get("cf-connecting-ip")?.trim() || "";
}

function isDuplicateAccount(error: {code?: string; message?: string}): boolean {
  const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return /email_exists|user_already_exists|already registered|already exists/.test(detail);
}

Deno.serve(async request => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (origin !== APP_ORIGIN) return json(403, {message: "利用できません。"}, origin);
    return new Response(null, {status: 204, headers: corsHeaders(origin)});
  }
  if (request.method !== "POST" || origin !== APP_ORIGIN) {
    return json(403, {message: "利用できません。"}, origin);
  }
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY || INVITATION_CODE_PEPPER.length < 32 || INVITATION_RATE_PEPPER.length < 32) {
    console.error("request-invitation configuration is incomplete");
    return json(503, {message: "申込を受け付けられません。運営担当者へご連絡ください。"}, origin);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4096) return json(413, {message: "入力内容を確認してください。"}, origin);

  let payload: {email?: unknown; code?: unknown};
  try { payload = await request.json(); }
  catch { return json(400, {message: "入力内容を確認してください。"}, origin); }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const code = typeof payload.code === "string" ? payload.code : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return json(400, {message: "メールアドレスと6桁の登録キーを確認してください。"}, origin);
  }

  const ip = requestIp(request);
  if (!ip) {
    console.warn("request-invitation could not determine request IP");
    return json(503, {message: "申込を受け付けられません。時間をおいてお試しください。"}, origin);
  }

  try {
    const [codeHmac, emailDigest, ipDigest] = await Promise.all([
      hmacHex(INVITATION_CODE_PEPPER, code),
      hmacHex(INVITATION_RATE_PEPPER, `email:${email}`),
      hmacHex(INVITATION_RATE_PEPPER, `ip:${ip}`),
    ]);
    const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
      auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
    });
    const {data: attempt, error: rateError} = await admin.rpc("kasi_check_invitation_request", {
      p_code_hmac: codeHmac,
      p_email_digest: emailDigest,
      p_ip_digest: ipDigest,
    });
    if (rateError || !attempt) {
      console.error("request-invitation rate check failed", rateError?.code ?? "unknown");
      return json(503, {message: "申込を受け付けられません。時間をおいてお試しください。"}, origin);
    }
    if (attempt.allowed !== true) {
      return json(429, {message: "申込回数の上限に達しました。時間をおいてお試しください。"}, origin);
    }

    if (attempt.code_valid !== true) {
      await admin.rpc("kasi_finish_invitation_request", {p_attempt_id: attempt.attempt_id, p_outcome: "rejected_key"});
      return json(202, {message: GENERIC_MESSAGE}, origin);
    }

    const {error: inviteError} = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: INVITATION_REDIRECT_URL,
    });
    if (inviteError) {
      const duplicate = isDuplicateAccount(inviteError);
      const outcome = duplicate ? "already_registered" : "auth_rejected";
      await admin.rpc("kasi_finish_invitation_request", {p_attempt_id: attempt.attempt_id, p_outcome: outcome});
      if (!duplicate) {
        console.warn("request-invitation mail delivery failed", inviteError.code ?? inviteError.status ?? "unknown");
      }
      return json(202, {message: GENERIC_MESSAGE}, origin);
    }

    await admin.rpc("kasi_finish_invitation_request", {p_attempt_id: attempt.attempt_id, p_outcome: "invited"});
    return json(202, {message: GENERIC_MESSAGE}, origin);
  } catch (error) {
    console.error("request-invitation failed", error instanceof Error ? error.name : "unknown");
    return json(503, {message: "申込を受け付けられません。時間をおいてお試しください。"}, origin);
  }
});
