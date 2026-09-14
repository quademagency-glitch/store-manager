import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const storeManagerApiVolume = volume("store-manager-api-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 5000 });
  const storeManagerApi = service("store-manager-api", {
    source: github("quademagency-glitch/store-manager", { checkSuites: false, rootDirectory: "store-app/server/" }),
    build: "",
    start: "npm start",
    replicas: { "sfo": 1 },
    volumeMounts: { "/data": storeManagerApiVolume },
    env: { APP_URL: preserve(), ARKESEL_API_KEY: preserve(), ARKESEL_SENDER_ID: preserve(), DEMO_ACCOUNT_EMAIL: preserve(), DEMO_ACCOUNT_PASSWORD: preserve(), DEMO_MODE_ENABLED: preserve(), DIRECT_URL: preserve(), FROM_EMAIL: preserve(), FRONTEND_URL: preserve(), HEALTH_CHECK_TOKEN: preserve(), JWT_SECRET: preserve(), NODE_ENV: preserve(), PLATFORM_ADMIN_EMAIL: preserve(), PORT: preserve(), RESEND_API_KEY: preserve(), SCANNER_APK_SOURCE_URL: preserve(), SUPABASE_JWKS_URL: preserve(), SUPABASE_JWT_KID: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve() },
  });

  return project("Quadem ERP", {
    resources: [storeManagerApi, storeManagerApiVolume],
  });
});
