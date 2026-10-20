# Render wake-up plan — make the web URL "just work"

Status: **B implemented locally, C awaiting setup** (2026-10-20).

- **A** — resilience patch D-25: committed and deployed (`0164f8b`);
  `/ready` returns 200.
- **B** — `frontend/src/instrumentation.ts` + 4 tests: done, ready to push.
- **C** — create the external monitor using §6: owner action.

Decision: **A + B + C**, with the API warm **06:00–22:00 Asia/Manila** on the
free plan.

Goal: a client opens `https://rgarage-web.onrender.com`, sees the login
screen, signs in, and lands on the dashboard — without anyone first opening
`https://rgarage-api.onrender.com` by hand.

---

## 1. Why it behaves this way

Render's free plan **spins a service down after ~15 minutes with no traffic**.
The next HTTP request wakes it, but the request is held while the container
boots (~30–60 s; occasionally longer).

The app is **two separate free services**:

```
browser ──► rgarage-web (Next.js) ──► rgarage-api (Node) ──► Aiven MySQL
```

- Waking the web does **not** wake the API. They sleep independently.
- A free service can only be started by **sending it a request** — Render has
  no "start service" button/API on the free plan.
- The web is the entry point; it cannot wake the API until it is itself awake.
  So the order is always: browser → web boots → web pings API → API boots.
  The two boots can overlap, but they cannot be reordered.
- Aiven's free MySQL may also power off after long inactivity. Keeping the
  API active with a DB-touching ping also keeps Aiven active.

Cold-start cost today, worst case: **web boot + API boot ≈ 1–2 minutes**, and
before the patch the UI showed a misleading error screen during it.

### What the resilience patch (D-25) already fixes

With the patch now deployed, the API **starts automatically** — no manual API
URL visit:

- the login page sends a fire-and-forget `GET /health` to the API as soon as
  it renders;
- the proxy retries a sleeping/restarting API for up to ~90 s with backoff;
- server-rendered pages (`/dashboard`, etc.) retry too;
- if the wait is too long, the user sees "server is starting up — press
  Retry" instead of a JSON/SyntaxError crash.

So after deploying, **opening the web URL already starts the API by itself**.
What the patch cannot remove is the waiting time itself.

---

## 2. Constraints (free plan)

| Constraint | Value |
|---|---|
| Sleep after inactivity | ~15 minutes |
| Wake time | ~30–60 s per service (can be longer) |
| Free instance hours | ~750 h/month **shared by all free services** in the workspace* |
| Two services awake 24/7 | ~1,440 h/month → **not possible on free** |
| Paid alternative | Render Starter ≈ $7/service/month (always on) |

\* Check the current figure in Render → Billing; plans change. The important
part: two always-on free services do not fit in a month.

Consequences:

- An external pinger cannot keep **both** services awake 24/7 for free.
- It **can** keep **one** service warm during shop hours and stay well inside
  the budget (math in §5).
- The web will always cold-start on the free plan. That is the one wait that
  cannot be removed without paying.

---

## 3. Options

| # | Option | What it does | Cost | First-visit wait | Effort / risk |
|---|---|---|---|---|---|
| **A** | Resilience patch only (already written) | Web wakes API automatically on login / page load; retries up to 90 s | $0 | up to ~1–2 min worst case, but never broken | none — deploy |
| **B** | Web boot ping (`instrumentation.ts`) | Web pings API `/health` the moment its own container boots, before/while the first page renders | $0 | overlaps the two boots → nearer to `max(web, api)` than the sum | tiny code change, safe |
| **C** | Business-hours keep-alive for the API | `cron-job.org` / UptimeRobot hits `GET /ready` every 5–10 min during shop hours | $0 | API is already awake → sign-in instant; only the web cold-starts (~30–60 s) | external monitor to set up |
| **D** | Keep **both** warm during business hours | Pingers on web + API | $0 | instant during the window | ~2× the hours; must stay ≤ ~12 h/day to fit 750 h — too tight to be safe |
| **E** | Render Starter | Always-on, no spin-down | ~$7/service/mo (~$14 for both) | instant, always | recurring cost, no code |
| **F** | Merge API into the Next.js service | One service → one cold start | $0 | ~30–60 s | large refactor of a daily-use app — **not recommended now** |

### Why B alone is not enough

The login page already pings the API as soon as it renders. B moves that ping
a few hundred milliseconds earlier (to container boot) and also covers
deep links/static requests. It is a nice guarantee, but the API still needs
30–60 s to boot — B does not make it fast.

### Why C is the real fix for "the API is not running"

If the API is kept warm during opening hours, the client's first visit only
waits for the **web** to wake; the API answers immediately once the page is
up. Sign-in feels normal. The DB also sees activity, which helps with Aiven's
idle power-off.

Use `/ready`, not `/health`, for the keep-alive: `/ready` performs a cached
DB ping and therefore keeps both the API and Aiven active. (Do **not** point
Render's own `healthCheckPath` at `/ready` — a DB outage would then restart a
healthy API.)

---

## 4. Recommended path

1. **Deploy the resilience patch first** (pending your push). Verify `/ready`
   returns `{"status":"ready"}`. This alone removes the "API must be started
   by hand" behaviour.
2. **Add B** — `frontend/src/instrumentation.ts`, fire-and-forget ping at web
   boot. Five lines, no startup delay.
3. **Set up C** — keep the API warm during shop hours with an external
   monitor. This is what makes the client experience feel normal.
4. **Re-evaluate after a few days.** If the remaining web cold-start is still
   unacceptable, upgrade the **web** service to Starter (~$7/mo) — or both
   for a fully instant app.

Do **not** ping both services 24/7 on the free plan; it will exhaust the
750-hour budget.

---

## 5. Hours math for option C

Assumptions: shop window 06:00–22:00 PH (16 h/day), 30 days.

- API kept warm 16 h/day → 16 × 30 = **480 instance-hours/month**
- Web wakes only when someone opens it (say 5–10 visits/day, 10–15 min
  each, plus the first boot) → roughly **50–100 h/month**
- Total ≈ **530–580 h** of the ~750 h budget → ~170–220 h buffer

If the window were 24/7 for the API only: 720 h + web wakes → likely over
750 h. Do not do that.

If the shop window is longer (e.g., 05:00–23:00 = 18 h), API alone = 540 h;
still fits with a smaller buffer. Keep the web **out** of the pinger.

---

## 6. Implementation

### B — web boot ping (implemented)

`frontend/src/instrumentation.ts` now runs when the web server boots:

- resolves `BACKEND_URL` with the same rules as the rest of the app;
- fires `GET /health` with a 60 s timeout and never awaits it, because
  `register()` must return before Next.js serves requests;
- logs `startup_wake` on success and `startup_wake_failed` on timeout/error;
- a bad `BACKEND_URL` logs `startup_wake_skipped` instead of crashing startup
  (the actionable config error still appears on the first page request).

Four unit tests live in `frontend/src/instrumentation.test.ts`. The existing
login-page wake ping (D-25) remains the fallback.

### C — external keep-alive

Use **cron-job.org** (free; per-minute schedules and time windows) or an
equivalent uptime monitor:

| Setting | Value |
|---|---|
| URL | `https://rgarage-api.onrender.com/ready` |
| Method | GET |
| Interval | every 10 minutes (5 is fine too) |
| Window | 06:00–22:00 Asia/Manila, every day (`*/10 6-21 * * *`) |
| Expected | HTTP 200, body `{"status":"ready"}` |
| Alert | email on failure (optional; see the timeout note) |
| Second job | **none** — do not also ping the web |

**Setup steps (owner, ~5 minutes):**

1. Create a free account at <https://console.cron-job.org/signup> and verify
   the email.
2. **Create cronjob** with:
   - Title: `R Garage API keep-alive`
   - URL: `https://rgarage-api.onrender.com/ready`
   - Schedule: every 10 minutes, timezone `Asia/Manila`, active 06:00–22:00.
     If the form asks for a cron expression, use `*/10 6-21 * * *` (last run
     21:50, so the API sleeps shortly after 22:00).
   - Optional: enable saving responses so you can inspect the JSON.
3. Save, then run **Test run**. If the API was asleep, the first test can hit
   cron-job.org's 30-second timeout while the API boots — wait 1–2 minutes and
   run it again; expect **200** with `{"status":"ready"}`.
4. Confirm in **Render → rgarage-api → Logs** that `/ready` requests arrive
   every 10 minutes and the service does not spin down during the window.

Notes:

- **30-second timeout:** cron-job.org gives up after 30 s. The first ping after
  an overnight sleep can be recorded as a timeout even though it successfully
  wakes Render; the next ping succeeds. This is expected once per day. If you
  enable failure emails, set the threshold above one failure.
- Do not use GitHub Actions cron for this: scheduled runs are routinely
  delayed 5–20 min, which is longer than the 15-minute sleep threshold.
- If the monitor lapses, the app still works — the patch makes the cold start
  safe, just slower.

---

## 7. Verification checklist

**After the patch deploys**

- [x] `https://rgarage-api.onrender.com/ready` → 200 `{"status":"ready"}`
      (verified 2026-10-20)
- [x] `/health` → `ok` (verified 2026-10-20)
- [ ] API logs: `server_started`, `startup_db_check reachable:true`

**Cold start, before any pinger**

- [ ] Leave both services idle >16 min.
- [ ] Open the web URL **only** (never the API URL).
- [ ] Sign in; expect the "waking up" note, then the dashboard.
- [ ] API logs show the request arriving without any manual visit.
- [ ] No "This screen hit a problem" / JSON error.

**After B** — verified locally 2026-10-20

- [x] 44/44 frontend tests pass (4 new instrumentation tests).
- [x] Production `next start` against a mock API logged
      `startup_wake status:200`, and the mock received `/health` before the
      first page was served.
- [ ] After the next deploy: restarting the web should show a `/health` request
      before the first sign-in.

**After C**

- [ ] During the window, leave it idle >16 min: Render → rgarage-api →
      Events should **not** show a spin-down; `/ready` stays 200.
- [ ] Client sign-in is immediate once the web page is up.
- [ ] Outside the window, a cold start still happens — and is still safe.

---

## 8. Decision (2026-10-20)

Owner chose **A + B + C** with the API warm **06:00–22:00 Asia/Manila**.

- **A** — D-25 resilience patch deployed (`0164f8b`); `/ready` returns 200.
- **B** — implemented in `frontend/src/instrumentation.ts`; ready to push.
- **C** — owner to create the cron-job.org job in §6.
- **E** (Render Starter) remains the fallback if the remaining web cold start
  becomes unacceptable later.

## 9. Risks and notes

- **Free-hour cap**: exceeding it can suspend free services; the 480 h plan
  leaves a healthy buffer. Re-check Render Billing after the first month.
- **External monitor dependency**: if it stops, cold starts return — the
  resilience patch keeps that safe.
- **Aiven can still power off** (policy outside this repo); pinging `/ready`
  keeps it active during shop hours. If sign-in fails while the API is warm,
  check Aiven console status first.
- **Render health checks do not keep a spun-down service awake**; only real
  external traffic does.
- **Do not** point Render's `healthCheckPath` at `/ready`.
- **Do not** keep both services awake 24/7 on free.
