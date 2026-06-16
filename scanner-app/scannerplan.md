# Scanner App Distribution Plan

To ensure a seamless, 1-click installation experience for users without scary Android security warnings or sideloading issues (like Play Protect delays), the app must be distributed through official channels.

**Note:** Android's OS-level security policies cannot be bypassed with code. Sideloading raw `.apk` files will always trigger security barriers.

To achieve a professional rollout, we must choose one of the following official distribution strategies:

## Option 1: Publish to the Google Play Store (Recommended)
This is the standard way to distribute Android apps. Users just click a link, go to the Play Store, and click "Install" with zero warnings.

**Requirements:**
1. A Google Play Developer account (one-time $25 fee).
2. App metadata (Name, Description, Screenshots, Privacy Policy).

**Technical Steps Required:**
1. Reconfigure `eas.json` to generate an `.aab` (Android App Bundle) for production instead of an `.apk`.
2. Run `eas build -p android --profile production`.
3. Upload the resulting `.aab` file to the Google Play Console and submit it for review.

*Note: The app can be published publicly, or published "Privately" so only users within the organization's Google Workspace can access it.*

## Option 2: Mobile Device Management (MDM)
If the phones running the scanner app are *company-owned* devices, the IT department can use an MDM solution (e.g., Google Workspace Endpoint Management, Microsoft Intune, Jamf).

**Requirements:**
1. Existing MDM infrastructure managing the company devices.

**Technical Steps Required:**
1. Generate the standalone `.apk` file (as we currently do via `eas.json` preview profile).
2. The IT administrator uploads the `.apk` to the MDM portal.
3. The MDM server silently forces the app to install on all employee phones automatically in the background. Users do not have to interact with prompts or warnings.
