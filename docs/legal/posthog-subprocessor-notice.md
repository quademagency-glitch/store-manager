# Adding PostHog as a sub-processor

> **Status, 2026-08-29.** Analytics is **live**. `VITE_POSTHOG_KEY`,
> `VITE_POSTHOG_HOST` and `VITE_POSTHOG_START=2026-08-29` are set in Vercel
> production and preview, verified by `POST https://us.i.posthog.com/e/`
> returning `200 {"status":"Ok"}`. The region decision in step 1 was settled:
> **United States**, disclosed rather than moved to the EU host.
>
> **The notice below has NOT been sent.** It was written to be sent 30 days
> *before* switching analytics on. That did not happen, so the wording has been
> corrected to describe what actually occurred. Send the version in
> [section 2](#2-the-notice-as-it-now-has-to-read), not the original.

The rest of this file is the order the work should have gone in, kept because
it is the right order next time.

---

## 1. Decide where the data goes — DECIDED: United States

The notice has to name a country, so this is decided first.

The code points at `https://us.i.posthog.com`. PostHog also runs an EU region.
Clause 8 of the Privacy Policy tells customers their data is held in the
European Union, in Stockholm, and the Supabase region was chosen deliberately
for that reason.

**Resolved by disclosure, not relocation.** Privacy clause 8.1 and DPA clause
6.1 now both say that product analytics goes to the United States while the
database and uploaded files stay in Stockholm. Both sentences are conditional
on the same `analyticsAllowed()` switch the rest of the pages read, so they
disappear again if analytics is ever switched off.

Choosing the EU host later would mean changing `VITE_POSTHOG_HOST`,
`EXPO_PUBLIC_POSTHOG_HOST`, the `connect-src` entry in the root `vercel.json`,
and those two clauses.

## 2. The notice, as it now has to read

Clause 5.3 of the Data Processing Agreement:

> We will give you at least 30 days' notice by email before adding or replacing
> a sub-processor. If you reasonably object on data protection grounds within
> that period, we will discuss it with you; if we cannot resolve it, you may
> terminate the affected Subscription and we will refund fees paid for the
> unused remainder of the Subscription Period.

That notice period was not given. The email therefore cannot say "we intend to
start using", which is what the original draft said — analytics was already
running when it would have gone out. It says what happened instead. Concealing
the sequence would be a second, worse problem than the late notice.

### Who it goes to

As at 2026-08-29 there are three businesses, and **none of them is a real
paying customer**:

| Business | `contact_email` | What it is |
|---|---|---|
| QuadERP Platform | `quadem.agency@gmail.com` | the owner's own platform account |
| John Dow | `fofig41476@luhupo.com` | a test signup; `luhupo.com` is a disposable mail domain |
| Adom Superstore (Demo) | `demo@quaderp.app` | the demo tenant |

So the practical exposure is nil. The obligation matters going forward: anyone
signing up **after** 2026-08-29 receives a DPA that already lists PostHog in
clause 5.2, so it is an existing sub-processor to them and clause 5.3 never
applies. Send it anyway, for the dated record.

### How to send it

**Platform Admin → Communications**, audience **All Businesses**, type
**Email**. That route sends to every business that is not banned, using each
one's `contact_email`.

Safe to use as of `54cc340`. Before that, `sendCustomEmail` passed the whole
recipient array as Resend's `to`, which puts every recipient's address in the
To header of every copy — one broadcast would have disclosed the entire
customer list to the entire customer list. It now sends one message per
recipient via Resend's batch endpoint.

Set the reply-to, or send from, `quadem.agency@gmail.com`: that is
`ENTITY.email.privacy`, the address the Privacy Policy tells people to write
to, and the notice invites a reply.

### Subject

    PostHog has been added as a sub-processor for QuadERP

### Body

    Hello,

    This is the notice our Data Processing Agreement requires when we add a
    sub-processor.

    WHAT HAS CHANGED
    On 29 August 2026 we started using PostHog, a product analytics service, as
    a sub-processor.

    WE SHOULD HAVE TOLD YOU FIRST
    Clause 5.3 of the Data Processing Agreement commits us to at least 30 days'
    notice by email before a new sub-processor begins processing. That did not
    happen: analytics was switched on before this notice went out. Your right to
    object is unaffected and is set out below.

    WHAT POSTHOG RECEIVES
    Which screens in QuadERP are opened and how often, together with the
    technical details any web request carries: your approximate location from
    your IP address, and your browser and device type. Page addresses are
    included, and some of those contain the identifier of a record, such as a
    sale.

    WHAT IT DOES NOT RECEIVE
    Your customer records, your products, your prices, your sales figures, or
    anything typed into the app. Click tracking, heatmaps and session recording
    are switched off, so the text on your screens is not collected. No profile
    is built against your name.

    WHERE
    The United States. Your database and uploaded files stay in the European
    Union, in Stockholm.

    WHY
    So we can see which parts of QuadERP are actually used, rather than guessing
    when we decide what to build and what to fix.

    IF YOU OBJECT
    Reply to this email. If we cannot resolve an objection made on data
    protection grounds, you may end the affected subscription and we will refund
    the fees you have paid for the unused remainder of your subscription period.

    You do not need to do anything if you are happy for this to continue.

    Quadem Digital Enterprise
    quadem.agency@gmail.com

Write the date it was actually sent here when it goes: **sent on ____________**

## 3. The start-date gate — DONE

`VITE_POSTHOG_START` and `EXPO_PUBLIC_POSTHOG_START` hold the effective date.
Analytics does not initialise until that date arrives, **even if the key is
set**, and with it off the PostHog provider is not mounted at all.

It is set to `2026-08-29`. The gate did its job — it is the reason the key
could sit in `store-app/client/.env` for days without anything being sent — but
it only enforces a date someone chooses, and the date chosen was today rather
than 30 days out.

## 4. The two legal pages — DONE, and now automatic

Both pages used to need hand-editing on the day, which is exactly the kind of
promise that gets broken: the first version of this change said analytics was
live two hours before it actually was.

Since `563bee1` they read the switch instead. `Privacy.jsx` and `Dpa.jsx` call
the same `analyticsAllowed()` the app uses, so clause 7's provider row, clause
14.2, DPA clause 5.2's sub-processor list, and now the two data-location
clauses all follow the key automatically. There is nothing left to remember.

**One thing still has to be watched by hand.** Clause 14.2's promise that no
third party builds a profile of you holds because `person_profiles` is
`'identified_only'` and nothing calls `posthog.identify()`. **The day anyone
adds an `identify()` call, that clause becomes false.**

## 5. Set the key — DONE

Vercel: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_START`, all
three non-sensitive on purpose — a `VITE_` variable is compiled into a public
browser bundle, so marking it Sensitive hides it from nobody and only makes it
unreadable to you later.

Two things that were wrong on the day and are worth knowing:

- **`autocapture: false` does not switch off click tracking.** Heatmaps, dead
  clicks, exception autocapture and surveys are four more config keys, each
  defaulting to whatever the PostHog *dashboard* says, and that project had all
  four on. They ran in production for about 25 minutes while `/privacy` told
  customers click tracking was off. Pinned off in `main.jsx` in `fb5a406`.
- **`us-assets.i.posthog.com` needs to be in `script-src`**, not just
  `us.i.posthog.com` in `connect-src`. posthog-js fetches its remote config and
  feature bundles from the assets host. Missing it filed four CSP violations
  per pageview into `csp_violations`; Report-Only, so nothing broke, but
  enforcing the policy later would have killed analytics silently.

To see what is really running, load the app with `?__posthog_debug=true` and
read the console. Note that PostHog **silently discards every event from an
automated browser** — Playwright trips all three of its bot signals, including
`navigator.webdriver`, which is set even in headed mode — so a test harness can
never confirm analytics works.

---

## If you decide to undo it

Clear `VITE_POSTHOG_KEY` (or move `VITE_POSTHOG_START` to a future date) and
redeploy. The provider stops being mounted, and both legal pages revert to
saying PostHog is not in use on their own. Removing `posthog-js` and
`posthog-react-native` would be tidier, and the pages would then need the
PostHog rows taken out by hand.
