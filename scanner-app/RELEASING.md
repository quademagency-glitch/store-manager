# Releasing the scanner app

The welcome email offers new customers a "Download the scanner app" button. It
renders only when `SCANNER_DOWNLOAD_URL` is set on the API service, so until
there is something to download the section is simply absent, which is the
correct behaviour and not an oversight.

As of 2026-09-12 **no build has ever been produced**. There is no APK, no Play
Store listing, and the Expo project has no published builds. This file is the
shortest path from that to a link you can put in front of a customer.

## Android only, decided 2026-09-12

The owner's call, and it settles a real constraint rather than a preference.
Android lets you install an app from a file, so a link in an email works. iOS
does not, at all, outside the App Store: there is no equivalent to handing
someone an APK, and TestFlight caps at 10,000 testers on builds that expire
every 90 days. So an emailed download button can only ever serve Android.

The welcome email says so in as many words, and a test asserts it, because the
first draft said "install it on any phone your staff use" and that is a promise
to every iPhone owner on a shop's team that cannot be kept.

The iOS project and bundle identifier are left in place. Nothing here removes
the ability to ship to Apple later; it only stops the email claiming it exists.

## Producing an Android build

Needs an Expo account. Nothing here needs Android Studio or a JDK; the build
runs on Expo's machines.

```sh
cd scanner-app
npx eas login
npx eas build --platform android --profile preview
```

The `preview` profile builds an **APK** (rather than the AAB the Play Store
wants) and is marked `distribution: internal`, which is what makes EAS hand
back a shareable install page. Without that flag the artifact is downloadable
only from the EAS dashboard by the account owner, so there is no URL to give
anyone — that was the state of this config until 2026-09-12.

## Pointing the email at it

Set the build's install URL on the Railway API service:

```sh
railway variables --set "SCANNER_DOWNLOAD_URL=https://expo.dev/accounts/<account>/projects/scanner-app/builds/<id>" \
  --service store-manager-api --environment production
```

**Prefer a stable URL you own.** An EAS build URL names one specific build, and
a welcome email sent today may be opened next year, long after that build is
superseded or expired. A page on the marketing site, `quaderp.app/scanner`,
that redirects to the current build means the link in every email already sent
keeps working, and swapping APK for Play Store later changes nothing anywhere
else. The email template does not care which it is given.

## versionCode, and why a second release fails without it

`android.versionCode` was unset until 2026-09-12, which means Expo stamped
every build as version 1. Android refuses to install an APK over an existing
one that is not a higher versionCode, so the first build would have installed
fine and the second would have failed on every phone already carrying it, with
"App not installed" and no explanation.

It is now `1` in app.json, and both the `preview` and `production` profiles set
`autoIncrement`, so EAS raises it per build without anyone remembering to.

## Known item, not yet addressed

`android.usesCleartextTraffic` is `true`, which permits plain HTTP from the
app. The API it talks to is HTTPS, so this is most likely a leftover from
testing against a machine on the local network. Turning it off is the safer
default for an app distributed to shop staff, but it will break any workflow
that points the scanner at a `http://` address, so it wants checking against
how the app is actually configured in the field before changing.
