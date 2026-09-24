"""Interactive local setup for the administrator support tool.

Run from the repository root with Python 3.12 and Node/npm installed. This
script never stores a Supabase access token or service key in the repository.
"""
import argparse
import os
import re
import secrets
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
REF = re.compile(r"^[a-z0-9]{20}$")


def run(*args: str) -> None:
    command = list(args)
    if command[0] == "npx":
        command[0] = shutil.which("npx") or "npx"
    print("実行:", " ".join(args), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def read_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                name, value = line.split("=", 1)
                result[name.strip()] = value.strip()
    return result


def validate(project_ref: str, app_origin: str, redirect_url: str) -> None:
    if not REF.fullmatch(project_ref):
        raise ValueError("project-ref は Supabase の20文字の英小文字・数字で指定してください。")
    parsed = urlparse(app_origin)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        raise ValueError("app-origin はパスを含まない https オリジンで指定してください。")
    if not redirect_url.startswith(app_origin + "/"):
        raise ValueError("redirect-url は app-origin の配下にしてください。")


def prepare_secrets(project_ref: str, app_origin: str, redirect_url: str) -> tuple[Path, dict[str, str]]:
    validate(project_ref, app_origin, redirect_url)
    path = ROOT / "supabase" / f".admin-secrets-{project_ref}.env"
    values = read_env(path)
    old = read_env(ROOT / "supabase" / ".invitation-secrets.env")
    for name in ("INVITATION_CODE_PEPPER", "INVITATION_RATE_PEPPER"):
        if not values.get(name):
            values[name] = old.get(name) or secrets.token_hex(32)
    if not values.get("ADMIN_BOOTSTRAP_TOKEN"):
        values["ADMIN_BOOTSTRAP_TOKEN"] = secrets.token_urlsafe(48)
    values["APP_ORIGIN"] = app_origin
    values["INVITATION_REDIRECT_URL"] = redirect_url
    path.write_text("\n".join(f"{name}={value}" for name, value in values.items()) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return path, values


def main() -> None:
    parser = argparse.ArgumentParser(description="装具びより 管理者支援ツールの初回設定")
    parser.add_argument("--project-ref", required=True, help="Supabase Dashboard に表示される project ref")
    parser.add_argument("--app-origin", default="https://kazunyon.github.io", help="アプリの https オリジン")
    parser.add_argument("--redirect-url", default="https://kazunyon.github.io/kasisougu/invitation.html")
    args = parser.parse_args()
    try:
        path, values = prepare_secrets(args.project_ref, args.app_origin, args.redirect_url)
    except ValueError as error:
        parser.error(str(error))
    print(f"秘密値を Git 管理外の {path} に準備しました。安全な保管先にも保存してください。")
    print("招待メールの送信元・SMTP、通常登録の停止、Auth Redirect URL は Dashboard で設定してください。")
    print(f"接続先 project-ref: {args.project_ref}")
    if input("接続先を確認しましたか。project-ref を再入力してください: ").strip() != args.project_ref:
        raise SystemExit("接続先の確認が一致しないため中止しました。")

    run("npx", "supabase", "link", "--project-ref", args.project_ref)
    print("未適用の migration を確認します。管理機能以外の変更も表示される場合があります。")
    run("npx", "supabase", "db", "push", "--dry-run")
    if input("表示された変更をこのプロジェクトへ反映しますか。「反映」と入力: ").strip() != "反映":
        raise SystemExit("データベース反映の前に中止しました。")
    run("npx", "supabase", "db", "push")
    run("npx", "supabase", "secrets", "set", "--env-file", str(path))
    run("npx", "supabase", "functions", "deploy", "request-invitation")
    run("npx", "supabase", "functions", "deploy", "admin-management")
    print("\nSupabase 側の配置が完了しました。管理画面を公開後、既存の確認済みアカウントでログインしてください。")
    print("初回管理者確認コード（登録後は使えません）:")
    print(values["ADMIN_BOOTSTRAP_TOKEN"])
    print("確認コードはこのファイルと安全な保管先以外へ転記しないでください。")


if __name__ == "__main__":
    main()
