import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
function adminKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch { /* legacy key below */ }
  return Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const key = adminKey();
const origin = Deno.env.get("APP_ORIGIN") ?? "https://kazunyon.github.io";
const bootstrapToken = Deno.env.get("ADMIN_BOOTSTRAP_TOKEN") ?? "";
const codePepper = Deno.env.get("INVITATION_CODE_PEPPER") ?? "";
const redirectUrl = Deno.env.get("INVITATION_REDIRECT_URL") ?? "";
const encoder = new TextEncoder();
const admin = createClient(url, key, {auth: {autoRefreshToken: false, persistSession: false}});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function headers(requestOrigin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": requestOrigin === origin ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin",
  };
}
function reply(requestOrigin: string | null, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {status, headers: headers(requestOrigin)});
}
function fail(message = "処理できませんでした。時間をおいて再度お試しください。"): never { throw new Error(message); }
function secureEqual(a: string, b: string): boolean {
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
async function digest(value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(codePepper), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function rpc(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const {data, error} = await admin.rpc(name, args);
  if (error) { console.error("admin-management RPC failed", name, error.code); fail(); }
  return data;
}
async function audit(actor: string, action: string, targetId: string | null = null, targetEmail: string | null = null): Promise<void> {
  await rpc("kasi_admin_write_audit", {p_actor_id:actor, p_action:action, p_target_user_id:targetId, p_target_email:targetEmail});
}
function has(roles: string[], ...allowed: string[]): boolean { return roles.some(role => allowed.includes(role)); }
function parsePage(raw: unknown): number { return Number.isInteger(raw) && Number(raw) >= 1 && Number(raw) <= 10000 ? Number(raw) : 1; }
function sixDigits(): string {
  // Reject the short tail so every one of the million values is equally likely.
  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;
  let value: number;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= ceiling);
  return String(value % 1000000).padStart(6, "0");
}

Deno.serve(async request => {
  const requestOrigin = request.headers.get("origin");
  if (request.method === "OPTIONS") return requestOrigin === origin
    ? new Response(null, {status:204, headers:headers(requestOrigin)})
    : reply(requestOrigin, 403, {message:"利用できません。"});
  if (request.method !== "POST" || requestOrigin !== origin) return reply(requestOrigin, 403, {message:"利用できません。"});
  if (!url || !key || codePepper.length < 32 || !redirectUrl.startsWith(origin + "/"))
    return reply(requestOrigin, 503, {message:"管理機能の設定が完了していません。"});
  if (Number(request.headers.get("content-length") ?? "0") > 4096) return reply(requestOrigin, 413, {message:"入力内容を確認してください。"});
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return reply(requestOrigin, 401, {message:"ログインしてください。"});
  const {data: authData, error: authError} = await admin.auth.getUser(token);
  if (authError || !authData.user?.id) return reply(requestOrigin, 401, {message:"ログインし直してください。"});
  if (authData.user.banned_until && new Date(authData.user.banned_until) > new Date())
    return reply(requestOrigin, 403, {message:"このアカウントは利用停止中です。"});
  const actor = authData.user.id;
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
  } catch { return reply(requestOrigin, 400, {message:"入力内容を確認してください。"}); }
  const action = payload.action;
  try {
    if (action === "bootstrap") {
      if (bootstrapToken.length < 32 || typeof payload.token !== "string" || !secureEqual(payload.token, bootstrapToken))
        return reply(requestOrigin, 403, {message:"初回設定の確認コードが違います。"});
      const done = await rpc("kasi_admin_bootstrap", {p_user_id:actor});
      return reply(requestOrigin, done ? 200 : 409, {message:done ? "管理者の登録が完了しました。" : "初回管理者は登録済みです。"});
    }
    const roles: string[] = await rpc("kasi_admin_roles", {p_user_id:actor});
    if (!Array.isArray(roles) || !has(roles, "system_operator", "invitation_operator", "audit_reader"))
      return reply(requestOrigin, 403, {message:"管理機能を利用する権限がありません。"});
    if (action === "context") return reply(requestOrigin, 200, {roles, email:authData.user.email});
    if (action === "key_status" && has(roles, "system_operator", "invitation_operator"))
      return reply(requestOrigin, 200, {key:await rpc("kasi_admin_key_status")});
    if (action === "key_rotate" && has(roles, "system_operator")) {
      const memo = typeof payload.memo === "string" ? payload.memo.trim() : "";
      if (!memo || memo.length > 100) return reply(requestOrigin, 400, {message:"発行先のメモを1〜100文字で入力してください。"});
      const code = sixDigits();
      const result = await rpc("kasi_admin_rotate_key", {p_actor_id:actor, p_code_hmac:await digest(code), p_memo:memo});
      return reply(requestOrigin, 200, {key:result, code});
    }
    if (action === "key_update" && has(roles, "system_operator")) {
      const keyId = typeof payload.key_id === "string" ? payload.key_id : "";
      const memo = typeof payload.memo === "string" ? payload.memo.trim() : "";
      if (!uuid.test(keyId) || !memo || memo.length > 100)
        return reply(requestOrigin, 400, {message:"発行先のメモを1〜100文字で入力してください。"});
      const changed = await rpc("kasi_admin_update_key", {p_actor_id:actor, p_key_id:keyId, p_memo:memo});
      return changed ? reply(requestOrigin, 200, {key:await rpc("kasi_admin_key_status")})
        : reply(requestOrigin, 404, {message:"有効な登録キーが見つかりません。"});
    }
    if (action === "key_delete" && has(roles, "system_operator")) {
      const keyId = typeof payload.key_id === "string" ? payload.key_id : "";
      if (!uuid.test(keyId)) return reply(requestOrigin, 400, {message:"対象の登録キーを確認してください。"});
      const deleted = await rpc("kasi_admin_delete_key", {p_actor_id:actor, p_key_id:keyId});
      return deleted ? reply(requestOrigin, 200, {key:await rpc("kasi_admin_key_status")})
        : reply(requestOrigin, 404, {message:"有効な登録キーが見つかりません。"});
    }
    if (action === "key_stop" && has(roles, "system_operator"))
      return reply(requestOrigin, 200, {key:await rpc("kasi_admin_stop_key", {p_actor_id:actor})});
    if (action === "invite" && has(roles, "system_operator", "invitation_operator")) {
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (email.length > 254 || !emailPattern.test(email)) return reply(requestOrigin, 400, {message:"メールアドレスを確認してください。"});
      const {error} = await admin.auth.admin.inviteUserByEmail(email, {redirectTo:redirectUrl});
      await audit(actor, error ? "invite_failed" : "invite", null, email);
      if (error) return reply(requestOrigin, 409, {message:"招待できませんでした。登録済みか、送信設定を確認してください。"});
      return reply(requestOrigin, 200, {message:"招待メールを送信しました。"});
    }
    if (action === "resend_invite" && has(roles, "system_operator", "invitation_operator")) {
      const target = typeof payload.user_id === "string" ? payload.user_id : "";
      if (!uuid.test(target)) return reply(requestOrigin, 400, {message:"対象の利用者を確認してください。"});
      const {data: targetData, error: targetError} = await admin.auth.admin.getUserById(target);
      if (targetError || !targetData.user?.email) return reply(requestOrigin, 404, {message:"利用者が見つかりません。"});
      if (targetData.user.email_confirmed_at) return reply(requestOrigin, 409, {message:"登録済みです。パスワード再設定をご案内ください。"});
      const {error} = await admin.auth.admin.inviteUserByEmail(targetData.user.email, {redirectTo:redirectUrl});
      await audit(actor, error ? "invite_resend_failed" : "invite_resend", target, targetData.user.email);
      if (error) return reply(requestOrigin, 409, {message:"再送できませんでした。時間をおいて確認してください。"});
      return reply(requestOrigin, 200, {message:"招待メールを再送しました。"});
    }
    if (action === "users" && has(roles, "system_operator", "invitation_operator")) {
      const page = parsePage(payload.page);
      const {data, error} = await admin.auth.admin.listUsers({page, perPage:50});
      if (error) fail();
      const users = data.users.map(user => ({
        id:user.id, email:user.email, created_at:user.created_at,
        last_sign_in_at:user.last_sign_in_at, invited_at:user.invited_at,
        email_confirmed_at:user.email_confirmed_at, banned_until:user.banned_until,
      }));
      return reply(requestOrigin, 200, {users, page, next:users.length === 50});
    }
    if (action === "user_roles" && has(roles, "system_operator")) {
      const target = typeof payload.user_id === "string" ? payload.user_id : "";
      if (!uuid.test(target)) return reply(requestOrigin, 400, {message:"対象の利用者を確認してください。"});
      return reply(requestOrigin, 200, {roles:await rpc("kasi_admin_roles", {p_user_id:target})});
    }
    if ((action === "suspend" || action === "resume") && has(roles, "system_operator")) {
      const target = typeof payload.user_id === "string" ? payload.user_id : "";
      if (!uuid.test(target) || target === actor) return reply(requestOrigin, 400, {message:"対象の利用者を確認してください。"});
      const {data: targetData, error: targetError} = await admin.auth.admin.getUserById(target);
      if (targetError || !targetData.user) return reply(requestOrigin, 404, {message:"利用者が見つかりません。"});
      const targetRoles: string[] = await rpc("kasi_admin_roles", {p_user_id:target});
      if (has(targetRoles, "system_operator")) return reply(requestOrigin, 403, {message:"管理責任者の利用を停止できません。"});
      const {error} = await admin.auth.admin.updateUserById(target, {ban_duration:action === "suspend" ? "876000h" : "none"});
      if (error) fail();
      await audit(actor, action === "suspend" ? "user_suspend" : "user_resume", target, targetData.user.email ?? null);
      return reply(requestOrigin, 200, {message:action === "suspend" ? "利用を停止しました。" : "利用を再開しました。"});
    }
    if (action === "delete_user" && has(roles, "system_operator")) {
      const target = typeof payload.user_id === "string" ? payload.user_id : "";
      if (!uuid.test(target) || target === actor) return reply(requestOrigin, 400, {message:"対象の利用者を確認してください。"});
      const {data: targetData, error: targetError} = await admin.auth.admin.getUserById(target);
      if (targetError || !targetData.user) return reply(requestOrigin, 404, {message:"利用者が見つかりません。"});
      if (!targetData.user.banned_until || new Date(targetData.user.banned_until) <= new Date())
        return reply(requestOrigin, 409, {message:"停止中の利用者だけ削除できます。先に利用を停止してください。"});
      const targetRoles: string[] = await rpc("kasi_admin_roles", {p_user_id:target});
      if (has(targetRoles, "system_operator")) return reply(requestOrigin, 403, {message:"管理責任者は削除できません。"});

      // Supabase Auth prevents deleting users who own Storage objects. Remove their
      // private media through the Storage API before deleting the account.
      const paths: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const {data, error} = await admin.from("kasi_user_media").select("storage_path")
          .eq("owner_id", target).order("storage_path", {ascending:true}).range(offset, offset + 999);
        if (error) fail();
        paths.push(...(data ?? []).map(row => row.storage_path).filter((path): path is string => typeof path === "string"));
        if (!data || data.length < 1000) break;
      }
      for (let offset = 0; offset < paths.length; offset += 1000) {
        const {error} = await admin.storage.from("kasi_user-media").remove(paths.slice(offset, offset + 1000));
        if (error) fail();
      }
      const {error: deleteError} = await admin.auth.admin.deleteUser(target);
      if (deleteError) return reply(requestOrigin, 409, {message:"写真は削除されましたが、利用者の削除に失敗しました。もう一度削除を実行してください。"});
      try { await audit(actor, "user_delete", target); }
      catch { console.error("admin-management audit failed", "user_delete"); }
      return reply(requestOrigin, 200, {message:"利用者と関連データを削除しました。"});
    }
    if (action === "audit" && has(roles, "system_operator", "audit_reader")) {
      const page = parsePage(payload.page);
      const rows = await rpc("kasi_admin_audit_page", {p_offset:(page-1)*50, p_limit:50});
      return reply(requestOrigin, 200, {rows, page, next:rows.length === 50});
    }
    if (action === "role_change" && has(roles, "system_operator")) {
      const target = typeof payload.user_id === "string" ? payload.user_id : "";
      const role = payload.role;
      if (!uuid.test(target) || target === actor || !["invitation_operator", "audit_reader"].includes(String(role)) || typeof payload.grant !== "boolean")
        return reply(requestOrigin, 400, {message:"権限の変更内容を確認してください。"});
      const {error} = await admin.auth.admin.getUserById(target);
      if (error) return reply(requestOrigin, 404, {message:"利用者が見つかりません。"});
      await rpc("kasi_admin_change_role", {p_actor_id:actor, p_target_id:target, p_role:role, p_grant:payload.grant});
      return reply(requestOrigin, 200, {message:"権限を変更しました。"});
    }
    return reply(requestOrigin, 403, {message:"この操作を行う権限がありません。"});
  } catch (error) {
    console.error("admin-management action failed", String(action), error instanceof Error ? error.name : "unknown");
    return reply(requestOrigin, 503, {message:"処理できませんでした。時間をおいて再度お試しください。"});
  }
});
