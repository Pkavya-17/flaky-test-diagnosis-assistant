// DEMO scenario (synthetic, not real production data): DEMO — Environment/data dependency
// Intended root-cause category: environment

test('report shows correct date range', () => {
  const report = generateReport();
  const expected = new Date('2024-06-01');
  expect(report.startDate).toEqual(expected);
});
