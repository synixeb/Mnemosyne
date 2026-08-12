const v = require('../src/validators.js');

test('validatePersona accepts valid persona', ()=>{
  const p = { id:'p1', name:'Test', firstname:'A', lastname:'B', dob:'1990-01-01', address:'1 rue', job:'Dev', phone:'+33123456789' };
  const r = v.validatePersona(p);
  expect(r.valid).toBe(true);
});

test('validatePersona rejects missing fields', ()=>{
  const p = { id:'p2', name:'X' };
  const r = v.validatePersona(p);
  expect(r.valid).toBe(false);
  expect(r.errors.length).toBeGreaterThan(0);
});

test('validateCompte basic', ()=>{
  const c = { siteURL:'https://example.com', personaId:'p1', createdAt: new Date().toISOString() };
  const r = v.validateCompte(c);
  expect(r.valid).toBe(true);
});
