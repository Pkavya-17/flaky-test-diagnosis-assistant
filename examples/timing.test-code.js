// DEMO scenario (synthetic, not real production data): DEMO — Timing / race condition
// Intended root-cause category: timing

test('user can complete checkout', async () => {
  await page.click('#add-to-cart');
  await page.click('#checkout');
  await sleep(2000);
  const total = await page.textContent('#order-total');
  expect(total).toBe('$49.99');
});
