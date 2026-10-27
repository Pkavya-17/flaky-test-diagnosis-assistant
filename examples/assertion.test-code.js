// DEMO scenario (synthetic, not real production data): DEMO — Non-deterministic assertion
// Intended root-cause category: assertion

test('creates unique session', () => {
  const id = uuid();
  const session = createSession(id);
  expect(session.id).toBe('a1b2c3');
});
