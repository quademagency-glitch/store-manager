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

## Where the APK is hosted

On a Railway volume mounted at `/data`, on our own server, reachable only
through `GET /api/scanner/app-download`, which requires a signed-in QuadERP
session. Customers get it from `/scanner` inside the app.

It is deliberately not public. It was briefly a GitHub release asset, which
anyone on the internet could fetch; that release has been deleted.

Object storage was the first choice and cannot hold it. Supabase Storage caps
uploads at 50MB on this plan, established by uploading the real file and
getting a 413 rather than by reading the docs. Trimming architectures does not
rescue it either: a 64-bit-only build is 60.6MB, still over, so dropping
`armeabi-v7a` would exclude older handsets and buy nothing.

## Publishing a new build

A Railway volume cannot be written to from outside the running service, so the
server fetches the build itself on startup.

1. Build it, and take the **Application Archive URL** from the finished build.
2. Set it on the API service and let Railway redeploy:

```sh
railway variables --set "SCANNER_APK_SOURCE_URL=<artifact url>" \
  --service store-manager-api --environment production
```

That is the whole process. The URL is the single source of truth: the server
records which one it last fetched beside the file, so a redeploy with an
unchanged URL does nothing, and changing it replaces the build. The download is
written to a temporary file and renamed into place, so a transfer that dies
halfway leaves the previous working APK where it was.

Check it took: the boot log carries `[scanner-apk] startup check complete` with
a status of `updated`, `already-current` or `not-configured`.

## Anything that must survive a build belongs in app.json

`/android` is gitignored. EAS builds from what git tracks, so it never receives
that folder and runs `expo prebuild` to regenerate it from app.json every time.

Editing `android/gradle.properties`, or anything else under `android/`,
therefore works perfectly on your own machine and is silently discarded in the
build. On 2026-09-13 an architecture change made that way looked applied
locally and would have produced an identical 145MB APK; `expo prebuild --clean`
is the quick way to see it happen, since it wipes and regenerates the folder
exactly as EAS does.

Native build settings go in a config plugin instead, as
`plugins/withAndroidArchitectures.js` does. Plugins are tracked, so they
survive. Verify one locally with:

```sh
npx expo prebuild --platform android --no-install --clean
grep reactNativeArchitectures android/gradle.properties
```

## Commit app.json after every build

`autoIncrement` raises `expo.android.versionCode` in **app.json in your working
tree**, because `cli.appVersionSource` is `local` and the repo is therefore the
record of what has been released. If you do not commit that bump, the next
build starts from the old number again and produces an APK that will not
install over the one already on people's phones.

The first two builds took it from 1 to 2 to 3. If a build number ever seems to
have gone backwards, this is why.

Switching `cli.appVersionSource` to `"remote"` moves the counter to Expo's
servers and removes the need to remember any of this. Worth doing; it needs one
build to verify, so it has been left as a deliberate choice rather than changed
underneath you.

## Sentry is disabled at build time, on purpose

`@sentry/react-native` 7.11.0 is the version Expo recommends for SDK 56, and
its Metro serializer crashes this project's build:

```
TypeError: Cannot read properties of undefined (reading 'match')
  at determineDebugIdFromBundleSource (@sentry/react-native/dist/js/tools/utils.js:37)
  at sentryMetroSerializer.js:63
```

It reads the bundle source to stamp a debug ID into it, and gets `undefined`,
because this SDK hands the serializer Hermes bytecode rather than JavaScript.
The first ever build of this app, on 2026-09-12, failed on exactly this after
about a minute, reported only as "See logs of the Bundle JavaScript build
phase".

Removing `@sentry/react-native` from `expo.plugins` and `withSentryConfig` from
metro.config.js makes the build succeed. Both were removed; the dependency and
the guarded `Sentry.init()` call are still there.

What that costs: no native crash capture and no source maps, so a future stack
trace would point at minified bytecode. What it does not cost anything today:
`EXPO_PUBLIC_SENTRY_DSN` is unset, so Sentry does nothing at runtime either
way. `Sentry.init()` is now wrapped in try/catch as well, because without the
config plugin the native module may not be linked and an error reporter that
crashes the app on boot is worse than no error reporter.

To restore it properly, wait for a `@sentry/react-native` release that supports
React Native 0.85, then put the plugin back and rebuild. Do not put it back
without rebuilding: the failure appears only at build time.

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
