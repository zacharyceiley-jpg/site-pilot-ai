# Site Pilot

Standalone Site Pilot website using the existing Secret Unblocked Deluxe Supabase project.

## Current foundation

- Existing Deluxe email/password accounts can sign in through the shared Supabase Auth project.
- No separate Site Pilot account database is created.
- Guest chats are limited server-side to 80 messages per UTC day per network IP.
- Guest IP addresses are HMAC-hashed before storage; raw IP addresses are not stored in the quota table.
- The privileged Supabase service-role key and OpenRouter key stay inside Supabase Edge Function secrets.
- Chat requests use the separate `site-pilot-chat` Edge Function. The existing Deluxe `site-pilot-ai` function is left unchanged.
- Browser text-to-speech can be enabled in Settings.

## Supabase

The frontend uses the public legacy anon key for Supabase Auth and Edge Function invocation. This key is designed for browser use and is protected by Supabase Auth/RLS. Never put a service-role key or OpenRouter key in this repository.

The backend endpoint is:

`https://hhszfqpojhmwbmuhdmis.supabase.co/functions/v1/site-pilot-chat`

The Edge Function expects the existing `OPENROUTER_API_KEY` secret and the standard Supabase Edge Function environment variables.

## Run locally

Because this uses JavaScript modules, serve the folder from a local web server rather than opening `index.html` directly. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Important

The 80-message guest allowance is shared by people using the same public IP address (for example, some school or household networks). It resets at 00:00 UTC. Signed-in Deluxe accounts are not subject to this guest allowance.
