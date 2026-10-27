// DEMO scenario (synthetic, not real production data): DEMO — Resource contention
// Intended root-cause category: resource

test('server responds on port', async () => {
  const server = createServer().listen(4000);
  const res = await fetch('http://localhost:4000/health');
  expect(res.status).toBe(200);
  server.close();
});
