"""Prepare an HMAC digest and local secret file for invite-only registration."""
import getpass
import hashlib
import hmac
import os
import re
import secrets
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SECRET_FILE = ROOT / 'supabase' / '.invitation-secrets.env'
APP_ORIGIN = 'https://kazunyon.github.io'
INVITATION_REDIRECT_URL = 'https://kazunyon.github.io/kasisougu/invitation.html'


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        name, value = line.split('=', 1)
        values[name.strip()] = value.strip()
    return values


def main() -> None:
    values = read_env(SECRET_FILE)
    code_pepper = values.get('INVITATION_CODE_PEPPER')
    rate_pepper = values.get('INVITATION_RATE_PEPPER')
    if not code_pepper or not rate_pepper:
        code_pepper = secrets.token_hex(32)
        rate_pepper = secrets.token_hex(32)
        SECRET_FILE.write_text(
            '\n'.join([
                f'INVITATION_CODE_PEPPER={code_pepper}',
                f'INVITATION_RATE_PEPPER={rate_pepper}',
                f'APP_ORIGIN={APP_ORIGIN}',
                f'INVITATION_REDIRECT_URL={INVITATION_REDIRECT_URL}',
                '',
            ]),
            encoding='utf-8',
        )
        try:
            os.chmod(SECRET_FILE, 0o600)
        except OSError:
            pass
        print(f'Created ignored local secret file: {SECRET_FILE}')
        print('Keep this file private. Deploy it with the Supabase CLI, then retain it in an approved secret store for future key rotations.')
    else:
        print('Using the existing peppers. Keep them unchanged when rotating only the six-digit key.')

    code = getpass.getpass('Enter the new six-digit invitation key (input hidden): ')
    confirmation = getpass.getpass('Enter it again (input hidden): ')
    if not re.fullmatch(r'[0-9]{6}', code) or not hmac.compare_digest(code, confirmation):
        raise SystemExit('The key must contain exactly six matching ASCII digits.')

    digest = hmac.new(code_pepper.encode('utf-8'), code.encode('ascii'), hashlib.sha256).hexdigest()
    print('\nHMAC digest (not the invitation key):')
    print(digest)
    print('\nAfter applying the migration, run this SQL in the Supabase SQL Editor to replace the active key:')
    print("UPDATE private.kasi_invitation_codes SET status = 'revoked', revoked_at = now() WHERE status = 'active';")
    print("INSERT INTO private.kasi_invitation_codes (code_hmac, expires_at) VALUES ('" + digest + "', now() + interval '90 days');")
    if SECRET_FILE.exists():
        print('\nDeploy/update Edge Function secrets with:')
        print('npx supabase secrets set --env-file supabase/.invitation-secrets.env')


if __name__ == '__main__':
    main()
