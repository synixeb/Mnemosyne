const c = require('../src/crypto_utils.js');

test('encrypt and decrypt JSON roundtrip', async ()=>{
  const payload = { hello: 'world', n: 42 };
  const pass = 'test-pass-123';
  const enc = await c.encryptJSON(payload, pass);
  expect(typeof enc).toBe('string');
  const dec = await c.decryptJSON(enc, pass);
  expect(dec.hello).toBe('world');
  expect(dec.n).toBe(42);
});
