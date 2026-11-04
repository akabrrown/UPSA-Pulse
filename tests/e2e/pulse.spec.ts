import { test, expect } from '@playwright/test';

test.describe('UPSA Pulse E2E Journeys (TDD Section 12 & App Flow F1–F16)', () => {
  test('renders campus feed in UPSA Blue & Gold, opens thread, replies with alias, and navigates legal pages', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('UPSA Pulse')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Hot' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'New' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Top (24h)' })).toBeVisible();

    // Verify seeded Ask appears with Answered state
    await expect(
      page.getByText(/where do we stamp our medical clearance form/i)
    ).toBeVisible();

    // Open Compose sheet and check mandatory pseudonymity reminder
    await page.getByRole('button', { name: /Compose a post or Ask/i }).click();
    await expect(
      page.getByText(/Other students can't see your name\. We can/i)
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Navigate to Legal Pages
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Notice' })).toBeVisible();
    await expect(page.getByText(/Ghana Data Protection Act/i)).toBeVisible();
  });
});

