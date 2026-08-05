/**
 * Per-run identity for the dev server, read from the environment.
 *
 * Lives in its own module rather than in playwright.config.ts: importing the
 * config from a spec makes the runner load it recursively while it is still
 * resolving, which fails with MODULE_NOT_FOUND.
 *
 * playwright.config.ts mints the value into `process.env` before workers
 * spawn, so every worker inherits the same one.
 */
export const TEST_NONCE = process.env.PW_TEST_NONCE ?? '';
