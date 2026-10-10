# Private household access

This app is one private household ledger. Everyone given the household access
code can read and edit the entire ledger. It is not a multi-customer service.
No bank connection or money-transfer integration is included.

## Activate access

1. Use Node.js 24.x. Run `npm ci` locally.
2. In your own private terminal, run `npm run auth:setup`.
3. Save the generated household access code in a password manager. It contains
   192 bits of randomness; do not replace it with a human-chosen password.
4. Open the existing Vercel project, Settings, Environment Variables. Add the
   three generated variables to **Production** (and to Preview only if needed).
   Mark the session secret as sensitive. Never use `NEXT_PUBLIC_` names.
5. Keep the existing `DATABASE_URL`. Redeploy the security commit. No database
   migration, reset, or seed is needed.
6. Open `/login`, enter the saved access code, and confirm your ledger loads.
7. In a private/incognito browser with no session, confirm `/dashboard` redirects
   to `/login` and `/api/expenses` returns 401. Without valid configuration it
   returns 503. Both outcomes must return no financial records.

The configured origin is exactly `https://monthly-money-psi.vercel.app`, without
a trailing slash. For local development use `http://localhost:3000`. Give a
preview deployment its own exact HTTPS origin. There is no wildcard origin trust.

Access fails closed if configuration is missing or malformed. Production cookies
are encrypted and authenticated by iron-session, Secure, HttpOnly, SameSite=Strict,
and host-only. Sessions expire after eight hours. Every expense handler checks
the session itself, and writes also check Origin and Fetch Metadata. Middleware
and protected layouts add checks, but are not the sole authorization boundary.
API responses are private and not cached. Budget browser storage is cleared at
sign-out; use a trusted device because local browser storage is not encrypted.

Sign-out clears this browser's cookie. It does not revoke copies of a previously
stolen cookie. Rotate the access-code hash and/or session secret and redeploy to
invalidate all sessions. The login's burst limit is per server instance, not a
distributed limit; generated credential entropy is the guessing defense. Add
Vercel Firewall rate limiting for `/api/auth/login` for additional abuse control.

## Contain the earlier exposure

- In GitHub, Settings, General, Danger Zone, Change repository visibility, choose
  **Private**. Review collaborators and access permissions.
- The earlier public commits contain household financial data. The current seed
  is disabled and contains no financial records. Making the repo private or
  deleting the current seed cannot retract earlier downloads, forks, or copies.
  Decide separately whether to rewrite history after making the repo private;
  that operation affects all clones and needs coordination.
- Review access logs available in Vercel. A successful anonymous read proves
  exposure, not that another person accessed it.
- Check older Vercel deployment URLs too. New code does not secure old immutable
  deployments. Apply deployment protection or remove exposed older deployments
  after the replacement deployment is verified. Keep database backups private.

## Future bank integration

Before connecting a real account, use a reviewed read-only integration, separate
bank tokens from ledger data, encrypt tokens server-side, validate webhooks, add
disconnect/revocation, and test with sandbox accounts first. A login gate alone
does not establish that a future bank integration is safe.

## Checks

`npm test` runs authentication, input-validation, direct API authorization, and
cross-origin rejection checks using a stub database. `npm run typecheck` checks
types. `npm run build` verifies the production app; `npm run test:http` tests that
built server with an unreachable dummy database, never your production database.
Do not run mutation tests
against the production ledger.

Production dependencies have been checked with `npm audit --omit=dev`. The
Tailwind 3 build-tool dependency tree still has upstream development-dependency
advisories. A Tailwind 4 migration needs separate styling verification; no claim
is made that the full development dependency audit is clean.
