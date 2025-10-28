const { test, expect } = require('@playwright/test');

test('user can submit a comparison request and view the refreshed history', async ({ page }) => {
  const historyEntry = {
    id: 'comparison-smoke-test',
    title: 'https://reference.example.com → https://target.example.com',
    status: 'success',
    createdAt: new Date('2025-10-27T16:00:00Z').toISOString(),
    diffPercent: '1% change',
    href: '/reports/comparison-smoke-test.html'
  };

  let getCount = 0;

  await page.route('**/api/comparisons**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      getCount += 1;
      const payload = getCount === 1
        ? { items: [], pagination: { currentPage: 1, totalPages: 1 } }
        : { items: [historyEntry], pagination: { currentPage: 1, totalPages: 1 } };

      await route.fulfill({
        status: 200,
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' }
      });
      return;
    }

    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          reportPath: historyEntry.href,
          changeSummary: historyEntry.diffPercent,
          comparisonId: historyEntry.id
        }),
        headers: { 'content-type': 'application/json' }
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/');

  await page.getByLabel('Reference URL').fill('https://reference.example.com');
  await page.getByLabel('Target URL').fill('https://target.example.com');
  await page.getByRole('button', { name: /submit/i }).click();

  await expect(page.getByText(/Comparison requested successfully\./i)).toBeVisible();
  await expect(page.getByText(historyEntry.title)).toBeVisible();
  await expect(page.getByRole('link', { name: /View report/i })).toBeVisible();
});
