# One-time Administrator bootstrap

Administrator provisioning and legacy-email migration are explicit operator
commands. They are never run by `server.js` or a frontend/mobile client.

## Server-only configuration

Configure these values in the backend secret store or local `backend/.env`:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=<controlled-real-inbox>
BOOTSTRAP_ADMIN_NAME=<administrator-name>
BOOTSTRAP_ADMIN_INITIAL_PASSWORD=<strong-initial-password>
BOOTSTRAP_ADMIN_MIGRATE_FROM_EMAIL=<current-bootstrap-email>
BOOTSTRAP_CONFIRMATION_SECRET=<server-only-random-secret>
```

Never use `VITE_`, `NEXT_PUBLIC_`, or `EXPO_PUBLIC_` prefixes. The initial
password is only needed for a brand-new database and should be removed from the
environment after successful provisioning.

## Inspect before applying

```sh
npm run bootstrap:administrator -- inspect
```

Inspection is read-only. For a new provision it validates the configured name
and password before producing a confirmation. The confirmation binds the
normalized name and a keyed, non-reversible password digest; the raw password
is never printed or stored in the operation record. For every operation it is
also bound to the current database ID, status/version, source/target emails,
operation lease/phase, and verification-token/cooldown state.

## Existing Administrator email migration

After reviewing the inspection output:

```sh
npm run bootstrap:administrator -- migrate --confirm=<inspection-token>
```

The migration updates the same MongoDB user record, preserves its password,
role, profile/data relationships, login-attempt count, and lock expiry, then
marks the account pending/unverified and sends a Resend verification link to
the new registered address. A delivery failure rolls the email and verification
state back while preserving a still-valid source verification link. The
migration uses an inspected status/version compare-and-set, so a concurrent
suspension is never overwritten. The persistent leased, phased operation record
supports safe reconciliation and prevents the migration from being applied
twice.

Changing the registered Administrator identity atomically increments
`authVersion`, revoking every previously issued session. That increment is not
rolled back if email delivery fails and the visible email/status fields are
restored; a fresh password plus login-OTP flow is required before a new session
can be issued.

## Brand-new database only

If no Administrator exists, inspection proposes a one-time provision command:

```sh
npm run bootstrap:administrator -- provision --confirm=<inspection-token>
```

Provisioning creates one pending, unverified canonical `administrator`; it does
not create a Firebase staff identity and never marks the account verified. If
any Administrator already exists, provisioning exits without changing it.

## Resend an expired bootstrap verification link

For the sole pending Administrator, inspect the explicit resend first:

```sh
npm run bootstrap:administrator -- resend
npm run bootstrap:administrator -- resend --confirm=<inspection-token>
```

The existing verification-link cooldown and replacement-token invalidation are
enforced and reported by inspection. A resend confirmation is bound to the
current active token and cooldown state, so it cannot be replayed after a send.
Concurrent account-bound issuance is serialized across workers. Resend never
changes role, password, active state, lock state, or verification state.

If a process exits mid-operation, wait for the displayed lease expiry, rerun
inspection, review the recorded phase, and confirm the proposed reconcile
action. Reconciliation reuses an already-delivered valid link instead of
sending a duplicate.

After email verification, normal sign-in remains mandatory:

1. Registered email and password.
2. Fresh 6-digit login OTP delivered by Resend.
3. Final JWT only after the OTP is verified.
