// DEMO scenario (synthetic, not real production data): DEMO — Test-order dependency
// Intended root-cause category: order

let cachedUser;
beforeAll(() => { cachedUser = createUser(); });

test('user has default role', () => {
  expect(cachedUser.role).toBe('member');
});

test('promote user to admin', () => {
  cachedUser.role = 'admin';
  expect(cachedUser.role).toBe('admin');
});
