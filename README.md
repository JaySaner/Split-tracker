# SplitSmart — starter

The starter app for the **deepEntra Academy · Build & Ship It** course. It includes a
responsive expense overview with quick entry, search, and a running spend summary. Over the
course you'll give it an **AI brain** (Hour 3) and a **real database with logins** (Hour 5),
then ship it to your own domain (Hours 7–8).

This is the **"My Group"** app you see on the course slide — the basic version you deploy in
Hour 2, before you add the magic.

<p align="center"><b>SplitSmart · My Group</b><br/>🍽️ Dinner — paid by Aisha — ₹1,800<br/>🚕 Cab — paid by Raj — ₹400<br/><b>Total ₹2,200</b></p>

---

## Hour 2 — get it on your laptop & ship it

### 1. Fork this repo
Click **Fork** (top-right) → you get your own copy under your GitHub account.

### 2. Clone your fork and open it
Ask your AI assistant: *"Clone my fork and open it in VS Code."* Or, in a terminal:

```bash
git clone https://github.com/<your-username>/splitsmart-starter.git
cd splitsmart-starter
```

### 3. Install the app's parts
```bash
npm install
```

### 4. Run it
```bash
npm run dev
```
Open **http://localhost:3000** — SplitSmart is alive on your laptop. 🎉

### 5. Make one tiny change
Ask your AI: *"Change the title to 'Raj's SplitSmart' and keep the button deepEntra blue."*
Save → the browser updates instantly. Then snapshot it:

```bash
git add -A
git commit -m "My first change"
git push
```

### 6. Put it on the internet — Vercel 🚀

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/maheshbaxi/splitsmart-starter)

- Import your fork into **[Vercel](https://vercel.com/new)** (it finds your GitHub repo).
- Click **Deploy** → ~1 minute → you get a live `…vercel.app` link. Open it on your phone and
  text it to a friend.
- From now on, **every `git push` redeploys your live site automatically.**

> 🔒 **Keep your API keys private** — never paste them into a screenshot, a commit, or a shared
> doc. Secrets go in Vercel's **Environment Variables** (and in `.env.local` locally, which is
> git-ignored). See `.env.example`.

---

## What's inside

| | |
| --- | --- |
| **Framework** | [Next.js](https://nextjs.org) (App Router) + React |
| **The app** | `app/page.js` — SplitSmart overview and expense entry |
| **Styles** | `app/globals.css` — responsive dashboard and form styles |
| **Data** | Supabase for signed-in users; browser `localStorage` in local-preview mode |

## Scripts
```bash
npm run dev     # local dev → http://localhost:3000
npm run build   # production build
npm run start   # run the production build
```

## Connect Supabase

1. In Supabase, open **SQL Editor** and run `supabase/schema.sql`.
2. Run `supabase/schema_hour6.sql` after it to create groups, membership, private group policies, the creator-membership trigger, and the secure `create_group(group_name)`, `join_group(code)`, and `get_group_members(group_id)` functions. It also adds account-linked payers and equal per-member expense shares. Re-running this migration replaces old-format invite codes with six-digit codes and backfills shares for existing group expenses. Join attempts are limited to five incorrect codes per account every 15 minutes; share invite codes only with intended members.
3. Copy `.env.example` to `.env.local` and enter the project URL and publishable/anon key from **Project Settings → API**.
4. In Supabase **Authentication → Sign In / Providers → Email**, turn off **Confirm email** if you want new accounts to sign in immediately without a verification email. This reduces signup email delivery and avoids verification-email rate limits; Supabase password recovery emails can still be rate-limited.
5. Restart `npm run dev`, create an account, then sign in with the same email and password. If you previously created an unverified account, try signing in after disabling confirmation; if it cannot sign in, wait for the rate limit to reset or remove that unverified user from Supabase **Authentication → Users** before signing up again.
6. In **Authentication → URL Configuration**, allow `http://localhost:3000` and your deployed app URL for password recovery redirects.
7. In Vercel, add both Supabase URL and publishable/anon key under **Project Settings → Environment Variables** for the Production environment, then redeploy. The standard names are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the app also accepts `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Production builds without both values show a setup screen instead of exposing the local demo workspace.

The app reads, adds, and removes expenses scoped to the selected Supabase group. Signed-in
users can see group member names and emails, create groups, switch between their groups,
share an invitation code, and join a group by code. New group expenses are split evenly
among members who had joined when the expense was added; each expense shows its share
breakdown and each member’s totals. Group selection is remembered per signed-in account in that browser. With no
Supabase URL/key configured during local development, it remains in local-preview mode.
RLS remains the security boundary: the UI’s group filter is not used as an authorization check.
Sign-in uses email and password rather than magic-link sign-in. If **Confirm email** is enabled
in Supabase, email verification is required and signup sends a verification email. Existing local browser
expenses and earlier personal expenses without a `group_id` are not automatically migrated
into a group. Custom split amounts, settlements, member management, and invitations by email
are not included yet.

To verify group isolation, create a group with one account, copy its invite code, and join
from a second account. Create another group from the second account. Each account should list
only the groups it belongs to; the database RLS policies enforce the same boundary for
expenses regardless of client-side filters.

---

Made for **deepEntra Academy** · [academy.deepentra.ai](https://academy.deepentra.ai)
