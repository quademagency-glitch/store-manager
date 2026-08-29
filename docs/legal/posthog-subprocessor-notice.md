# Adding PostHog as a sub-processor

PostHog is installed in the web app and the scanner app and is **switched off**.
Turning it on is not a configuration change. It is a change to two published
legal pages and it triggers a contractual obligation to every paying customer.

This is the order. Doing it in a different order breaks a promise.

---

## 1. Decide where the data goes, before you send anything

The notice has to name a country, so this is decided first.

The code currently points at `https://us.i.posthog.com`. PostHog also runs an
EU region. Clause 8 of the Privacy Policy tells customers their data is held in
the European Union, in Stockholm, and the Supabase region was chosen
deliberately for that reason. Sending usage data to the United States is
defensible if disclosed, but it sits awkwardly next to what is already
published, and a Ghanaian owner who asks where their data goes now gets two
different answers.

Choosing the EU host means changing `VITE_POSTHOG_HOST`,
`EXPO_PUBLIC_POSTHOG_HOST`, and the `connect-src` entry in the root
`vercel.json`, which currently allows `https://us.i.posthog.com` only.

## 2. Send the notice, and write down the date you sent it

Clause 5.3 of the Data Processing Agreement:

> We will give you at least 30 days' notice by email before adding or replacing
> a sub-processor. If you reasonably object on data protection grounds within
> that period, we will discuss it with you; if we cannot resolve it, you may
> terminate the affected Subscription and we will refund fees paid for the
> unused remainder of the Subscription Period.

Send it from **Platform Admin → Communications**, audience **All Businesses**,
type **Email**. That route sends to every business that is not banned, using
each one's `contact_email`.

### Subject

    A new sub-processor for QuadERP, from <effective date>

### Body

    Hello,

    We are writing to give you advance notice, as clause 5.3 of our Data
    Processing Agreement requires, that we intend to start using a new
    sub-processor from <effective date>.

    Who: PostHog, a product analytics service.

    What it will receive: which screens in QuadERP are opened and how often,
    along with the technical details any web request carries, which are your
    approximate location from your IP address and your browser and device type.
    Page addresses are included, and some of those contain the identifier of a
    record, such as a sale.

    What it will not receive: your customer records, your products, your
    prices, your sales figures, or anything typed into the app. Click tracking
    and session recording are switched off, so the text on your screens is not
    collected.

    Where: <United States / European Union>.

    Why we are doing it: so we can see which parts of QuadERP are actually
    used, and stop guessing when we decide what to build and what to fix.

    If you object on data protection grounds, reply to this email before
    <effective date> and we will discuss it with you. If we cannot resolve it,
    you may end the affected subscription and we will refund the fees you have
    paid for the unused remainder of your subscription period.

    You do not need to do anything if you are happy for this to go ahead.

    <sender name>
    Quadem Digital Enterprise
    info@quaderp.app

## 3. Wait. The code will not let you skip this

`VITE_POSTHOG_START` and `EXPO_PUBLIC_POSTHOG_START` hold the effective date.
Analytics does not initialise until that date arrives, **even if the key is
set**, and with it off the PostHog provider is not mounted at all, so nothing
can capture by accident. Set it to the date in the notice, which is at least 30
days after the day you send it.

That gate exists because setting an environment variable does not feel like
publishing a legal change, and the person doing it months from now will not
have read this file.

## 4. On the effective date, change the two legal pages first

Both currently say PostHog is not in use. They stop being true the moment
analytics starts, so they are edited on the day, not afterwards.

**`store-app/client/src/pages/Privacy.jsx`**

- Clause 7, the provider table: the PostHog row says
  "**Not currently in use**: the integration exists in the web app and the
  scanner app but has no key configured, so nothing is sent to it." Replace
  that with what it does, and put the real region in the Where column instead
  of "None".
- Clause 14.2: it currently says a product analytics integration "is built into
  the application but is switched off and sends nothing". That sentence goes.
  The bolded promise before it, that there is no third-party analytics that
  profiles you, needs care: with `person_profiles: 'identified_only'` and no
  `identify()` call anywhere in the app, no profile is built, so the sentence
  can stand. **If anyone ever calls `posthog.identify()`, it becomes false.**
- The header comment lists the facts that were checked rather than assumed.
  Update the PostHog bullet.

**`store-app/client/src/pages/Dpa.jsx`**

- Clause 5.2 lists the sub-processors that actually process. Add PostHog with
  what it does. Sentry is deliberately absent from this list because it is not
  in use; PostHog belongs here only once it is.

## 5. Then set the key

Vercel: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_START`.

Confirm afterwards that events arrive, and that `connect-src` in the root
`vercel.json` names the host you chose. The CSP is Report-Only, so a wrong host
would still work while filling `csp_violations` with one row per pageview, and
would then break silently the day the policy is enforced.

---

## If you decide not to do it

Nothing needs undoing. The integration is inert, the legal pages are accurate
as they stand, and no notice has gone out. Removing `posthog-js` and
`posthog-react-native` would be tidier, and the pages would then need the
PostHog rows taken out.
