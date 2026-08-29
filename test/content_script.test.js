/**
 * @jest-environment jsdom
 */
global.chrome = {
  runtime: {
    onMessage: { addListener: () => {} },
    sendMessage: () => {}
  }
};

const cs = require('../src/content_script.js');

const persona = {
  firstname: 'Alex',
  lastname: 'Martin',
  email: 'alex.martin@example.com',
  phone: '+33612345678',
  address: '12 Rue de la Paix, 75001 Paris, France',
  dob: '1995-04-12',
  job: 'Développeur',
  company: 'Acme'
};

function makeInput(attrs = {}, tag = 'input'){
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'type') el.type = v;
    else el.setAttribute(k, v);
  });
  document.body.appendChild(el);
  return el;
}

afterEach(() => { document.body.innerHTML = ''; });

test('détecte un champ email via type', () => {
  const input = makeInput({ id: 'foo', type: 'email' });
  const result = cs.mapValueForField(input, persona, 'alexm', null);
  expect(result).toBe(persona.email);
});

test('détecte prenom/nom sans confondre les deux (accents gérés)', () => {
  const first = makeInput({ name: 'prénom' });
  const last = makeInput({ name: 'nom' });
  expect(cs.mapValueForField(first, persona, '', null)).toBe('Alex');
  expect(cs.mapValueForField(last, persona, '', null)).toBe('Martin');
});

test('utilise autocomplete standard en priorité', () => {
  const input = makeInput({ id: 'field1', autocomplete: 'username' });
  expect(cs.mapValueForField(input, persona, 'monpseudo', null)).toBe('monpseudo');
});

test('ignore un champ caché (honeypot)', () => {
  const input = makeInput({ id: 'email', type: 'email' });
  input.style.display = 'none';
  expect(cs.mapValueForField(input, persona, '', null)).toBeNull();
});

test('ne remplit pas les champs password', () => {
  const input = makeInput({ id: 'password', type: 'password' });
  expect(cs.mapValueForField(input, persona, '', null)).toBeNull();
});

test('nom complet détecté seulement si pas de firstname/lastname/username', () => {
  const input = makeInput({ id: 'fullname' });
  expect(cs.mapValueForField(input, persona, '', null)).toBe('Alex Martin');
});
