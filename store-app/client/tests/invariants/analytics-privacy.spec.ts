import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * Privacy 7.1: analytics receives page addresses "without their search text"
 * and never "anything you type". PostHog attaches the full address to every
 * event on its own, so `scrubEvent` runs as `before_send` in main.jsx. This
 * drives the real module in the page, because PostHog itself is off in mock
 * mode and capture() is a silent no-op under automation anyway.
 */
test('analytics events leave with the route pattern only, never typed text', async ({ page }) => {
  await gotoApp(page, '/dashboard');
  const origin = new URL(page.url()).origin;
  const out = await page.evaluate(async () => {
    const m = await import('/src/lib/analytics.js');
    const here = location.origin;
    return m.scrubEvent({
      uuid: 'u', event: '$pageview',
      properties: {
        $current_url: `${here}/item-history?code=QD-004821#history`,
        $pathname: '/customers/9f3c2b1a-1111-4222-8333-444455556666',
        $referrer: 'https://www.google.com/search?q=omek+gigs+accra',
        $initial_current_url: `${here}/inventory?q=Gino%20tomato`,
        // Found on the live site: PostHog adds this one itself.
        $session_entry_url: `${here}/login?q=typed-secret#frag`,
        $session_entry_query: 'q=typed-secret',
        $initial_person_info: { u: `${here}/returns?sale=abc`, r: 'https://mail.example.com/inbox?id=7' },
        title: 'Which item? QuadERP',
        task: 'sale', duration_ms: 41000,
      },
      $set_once: { $initial_referrer: '$direct', $initial_pathname: '/invoice/123?status=overdue' },
    });
  });
  expect(out.properties.$current_url).toBe(`${origin}/item-history`);
  expect(out.properties.$pathname).toBe('/customers/:id');
  expect(out.properties.$referrer).toBe('https://www.google.com');
  expect(out.properties.$initial_current_url).toBe(`${origin}/inventory`);
  expect(out.$set_once.$initial_referrer).toBe('$direct');
  expect(out.$set_once.$initial_pathname).toBe('/invoice/:id');
  expect(out.properties.$session_entry_url).toBe(`${origin}/login`);
  expect(out.properties).not.toHaveProperty('$session_entry_query');
  expect(out.properties.$initial_person_info).toEqual({ u: `${origin}/returns`, r: 'https://mail.example.com' });
  expect(out.properties.title).toBe('Which item? QuadERP');
  expect(out.properties).toMatchObject({ task: 'sale', duration_ms: 41000 });
  expect(JSON.stringify(out)).not.toMatch(/QD-004821|Gino|omek|overdue|typed-secret|frag|sale=abc|inbox/);
});

test('task timing is a silent no-op while analytics is off', async ({ page }) => {
  await gotoApp(page, '/dashboard');
  const threw = await page.evaluate(async () => {
    const m = await import('/src/lib/analytics.js');
    try { m.trackTask('sale', m.taskStart()); m.trackTask('not_a_task'); return false; } catch { return true; }
  });
  expect(threw).toBe(false);
});
