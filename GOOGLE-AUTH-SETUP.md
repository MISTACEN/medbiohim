# MEDBIOHIM — Google + Email Auth

The frontend supports two entry methods:
- Email + password through the MEDBIOHIM API/Supabase Auth.
- Google through Supabase Auth OAuth and `/auth/callback`.

## Supabase

Authentication → Providers → Google:
1. Enable Google.
2. Paste the Google OAuth Client ID.
3. Paste the Google OAuth Client Secret.

Authentication → URL Configuration:
- Site URL: `https://medbiohim.vercel.app`
- Redirect URL: `https://medbiohim.vercel.app/auth/callback`
- Local: `http://localhost:3000/auth/callback` when needed.

The Google provider page in Supabase shows the exact Supabase callback URL to register in Google Cloud.

## Google Cloud

Create an OAuth Client ID for a Web application. Add JavaScript origins:
- `https://medbiohim.vercel.app`
- `http://localhost:3000` for local development.

Add the exact callback URL shown by Supabase as an Authorized redirect URI. Then copy Client ID and Client Secret into the Supabase Google provider.

Google users are normal Supabase Auth users. `/auth/me` creates/loads the matching `public.users` profile. Application roles remain in `public.user_roles`; Google login never grants admin automatically.

Never put the Google Client Secret in Vercel, frontend `.env`, GitHub or browser code. It belongs only in the Supabase provider configuration.

## Adding Google as the second sign-in method

`/settings` → «Способы входа» → «Привязать Google». Two project settings are required:

1. Supabase → Authentication → Providers → **Enable manual linking**. Without it the API answers `503 IDENTITY_LINK_DISABLED` («Привязка второго способа входа выключена на сервере»), and Google is never linked.
2. Supabase → Authentication → URL Configuration → Redirect URLs: `https://medbiohim.vercel.app/**`, plus the exact local origin (`http://localhost:3000/**`, `http://localhost:3010/**` — whatever port the dev server uses).

The Worker accepts any `localhost`/`127.0.0.1`/`[::1]` port as a return address for local development; every other host must be listed in `CORS_ORIGINS` or match `APP_ORIGIN`. Unlinking returns the account to a single sign-in method and is refused when it is the last one.

