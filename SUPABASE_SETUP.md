# Supabase account setup

This static app now supports email/password accounts and per-user cloud sync.

Connected project: `berry-todo` (`ccsaagokhakzlhievcwr`, `ap-southeast-1`).

## Finish the Supabase connection

1. Run `supabase/todo_states.sql` in the `berry-todo` project's SQL editor or apply it as a migration.
2. In Authentication > Providers, keep Email enabled. For personal testing, you can turn email confirmation off so registration signs in directly. For production, turn confirmation back on.
3. If email confirmation is enabled, go to Authentication > URL Configuration and set the deployed Site URL, then add every local/deployed redirect URL used by the app. If these URLs are missing, the confirmation email can open a "cannot access" page even though the signup request succeeded.
4. The project's public URL and **Publishable Key** are in `supabase-config.js`. Never place a secret key or `service_role` key in this frontend.
5. For production email delivery, configure custom SMTP under Authentication settings.

After a user verifies their email and signs in, the first login uploads local Todo data if no cloud copy exists. Later logins restore the user's cloud data, and edits sync automatically.

## Phone login later

Supabase supports phone authentication, but it requires enabling Phone Auth and configuring an SMS provider such as Twilio, MessageBird, or Vonage. This introduces SMS charges and requires rate-limit and abuse protection decisions. The recommended first release for this app is email/password; add phone OTP once the account flow is stable.
