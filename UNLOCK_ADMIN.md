# Administrator account recovery

The former browser-console unlock examples and fixed demo Administrator email
have been removed. Administrator identity and credentials are server-managed
configuration and must not be published in client-facing documentation.

## Current setup

Use the registered email configured as `BOOTSTRAP_ADMIN_EMAIL` and follow the
[one-time Administrator bootstrap guide](backend/BOOTSTRAP_ADMINISTRATOR.md).
That workflow provisions or migrates the account as pending, sends a secure
verification link to the registered inbox, and retains login OTP enforcement.

## Locked account

Do not paste an Administrator identifier into a browser-console unlock request.
Use an authenticated, audited recovery path or a reviewed server-side
maintenance operation for the configured account. Initial passwords and other
credentials belong only in the backend secret store, never in this file.
