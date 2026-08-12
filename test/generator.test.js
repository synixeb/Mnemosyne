const gen = require('../src/generator.js');

test('generateIdentity returns expected fields', ()=>{
  const p = gen.generateIdentity('Testing');
  expect(p).toHaveProperty('id');
  expect(p).toHaveProperty('firstname');
  expect(p).toHaveProperty('lastname');
  expect(p).toHaveProperty('dob');
});

test('generateUsername uses keyword and numbers', ()=>{
  const u = gen.generateUsername('purple');
  expect(typeof u).toBe('string');
  expect(/\d{3}/.test(u)).toBe(true);
});

test('fetchFakeAvatar returns URL', async ()=>{
  const url = await gen.fetchFakeAvatar();
  expect(typeof url).toBe('string');
  expect(url.length).toBeGreaterThan(0);
});
