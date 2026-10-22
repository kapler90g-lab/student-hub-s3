# Student Hub — Telegram Mini App

A full-stack class learning hub for Telegram: priority announcements, subject categories, searchable study materials, private file storage, representative-only publishing, deadlines, and optional group notifications.

This is a deployable application codebase, not a static mock-up. It still requires your own Telegram bot, Supabase project, representative Telegram IDs, and HTTPS hosting before it can work for your class.

## What is included

- Mobile-first Telegram Mini App UI that follows Telegram's theme.
- Server-side validation of Telegram Mini App `initData` on every API request.
- Representative permissions enforced on the server.
- Optional class-member allowlist.
- Announcements with urgent/important/normal priority, pinning, deadlines and expiry.
- Subject creation and filtering.
- File uploads and private storage with short-lived signed download links.
- Search by title, description, subject and file type.
- Optional messages to a Telegram group when content is published.
- Delete controls for representatives.
- SQL schema and setup script for the bot menu button.

## Requirements

- Node.js 20 or later
- A Telegram account and bot created with `@BotFather`
- A Supabase project
- A public HTTPS deployment URL for Telegram Mini Apps

## 1. Create the Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the bot token. Treat it like a password.
4. Keep the token private; do not paste it into `public/` files or commit it to Git.

## 2. Create the database and private file bucket

1. Create a project at [Supabase](https://supabase.com/).
2. Open the project's **SQL Editor**.
3. Paste and run all of `schema.sql`.
4. In **Project Settings → API**, copy the Project URL and `service_role` key.
5. Keep the `service_role` key private. It belongs only in the server environment, never in browser JavaScript.

The SQL creates `subjects`, `announcements`, `resources`, enables RLS, and creates a private `student-files` bucket with a 25 MB limit.

## 3. Configure environment variables

In this folder, copy `.env.example` to `.env`.

Linux/macOS:
```bash
cp .env.example .env
```

Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

Fill these values:
- `BOT_TOKEN`: from BotFather
- `SUPABASE_URL`: your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key (server only)
- `APP_URL`: public HTTPS app URL after deployment
- `REP_TELEGRAM_IDS`: numeric Telegram user ID(s) allowed to publish
- `ALLOWED_TELEGRAM_IDS`: optional comma-separated IDs allowed to read the hub. If empty, any Telegram user who can open the bot can read. Representatives are always allowed.
- `TELEGRAM_GROUP_CHAT_ID`: optional group chat ID for notifications

### How do I find a Telegram numeric user ID?

Use a reputable Telegram ID bot or your own bot's server-side logging while testing. Verify the ID carefully before putting it in `REP_TELEGRAM_IDS`. Do not use a username as an ID. Telegram numeric IDs are not the same as `@usernames`.

## 4. Add initial subjects

After running `schema.sql`, run these SQL statements in Supabase SQL Editor (change the list to fit your class):

```sql
insert into public.subjects (name, emoji, sort_order) values
('Biology', '🧬', 1),
('Chemistry', '🧪', 2),
('Physics', '⚡', 3),
('Mathematics', '➗', 4),
('Computer Science', '💻', 5)
on conflict (name) do nothing;
```

## 5. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to see that the server responds, but Telegram sign-in will only work when launched in Telegram with valid signed `initData`. For a real test, deploy it to an HTTPS host, configure the bot's Mini App URL, then open it in Telegram.

Check health at `https://YOUR-APP-URL/api/health`.

## 6. Deploy the server

Deploy this Node.js project to a host that supports Node 20+ and environment variables. Examples include Render, Railway, Fly.io, or a VPS. Choose a host you are comfortable managing and check its current pricing and deployment instructions.

Set the environment variables in the host's dashboard. Do not upload `.env` to a public repository. The app serves the frontend from `public/` and the API from the same server, so one HTTPS origin is simplest.

After deployment:
1. Set `APP_URL` to the exact public HTTPS URL.
2. Redeploy/restart after changing environment variables.
3. Check `/api/health`.

## 7. Connect Telegram to the hosted app

Option A — use the included script:
```bash
npm run set-menu-button
```
It calls Telegram's `setChatMenuButton` API to configure the bot's menu button to open `APP_URL`.

Option B — use BotFather:
1. Open `@BotFather`.
2. Send `/mybots`, choose your bot.
3. Open **Bot Settings → Menu Button** (wording may vary).
4. Set the Mini App URL to your exact HTTPS `APP_URL`.

You can also configure the Main Mini App in BotFather if you want a prominent app-launch button on the bot profile.

## 8. Optional group notifications

1. Add the bot to your student group.
2. Ensure group privacy/permissions and group settings allow it to send messages.
3. Set `TELEGRAM_GROUP_CHAT_ID` to the numeric ID of that group.
4. Restart/redeploy the server.

New announcements and study materials will trigger a group message. The app remains the organized source of truth; the notification message is only a summary. Never add a bot to a group without the group's permission.

## 9. Permissions and security notes

- Telegram's `initData` is checked on the server with the bot token and rejected if older than 24 hours.
- `initDataUnsafe` is not used for authentication.
- The Supabase service-role key is used only on the server.
- The file bucket is private; download links expire after 10 minutes.
- Only Telegram IDs in `REP_TELEGRAM_IDS` can publish, edit subjects, or delete content.
- If `ALLOWED_TELEGRAM_IDS` is configured, only listed students and representatives can read.
- Only common study file formats are accepted; maximum upload size is configurable up to 25 MB.
- This app does not independently prove that a file's academic information is correct. Representatives should verify dates, course, semester and source before marking information urgent.
- For a real class deployment, keep a backup plan and ensure at least two trusted representatives can administer the content.
- Consider a short retention policy for old notices and avoid uploading student records, private grades, or sensitive personal information.

## Troubleshooting

**“Open this app from Telegram to sign in”**
- Open the Mini App from the bot's menu button, not directly in a regular browser.
- Confirm the bot token is correct and the app URL is set.

**“Only an authorized class representative…”**
- Add the user's numeric Telegram ID to `REP_TELEGRAM_IDS`, restart the server, and reopen the Mini App.
- Do not put a username or display name in this setting.

**Database error or empty subject list**
- Confirm `schema.sql` was run in the correct Supabase project.
- Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct.

**File upload fails**
- Check the `student-files` bucket exists and is private.
- Check file format and size.
- Check server logs for Supabase storage errors.

**Group notification does not arrive**
- Verify the bot is in the group and can send messages.
- Verify `TELEGRAM_GROUP_CHAT_ID`.
- The app still publishes to the database even if a notification fails.

## Production checklist

Before inviting the whole class:
- [ ] Replace all example environment values.
- [ ] Add the correct representative IDs.
- [ ] Decide whether to use `ALLOWED_TELEGRAM_IDS`.
- [ ] Verify HTTPS is active.
- [ ] Test with a representative account and a regular student account.
- [ ] Test uploads, downloads, deleting posts, and group notifications.
- [ ] Back up the database and agree who maintains the hub.
