// Detection améliorée des formulaires et UI d'injection
(function(){
  function normalizeText(value){ return (value || '').toString().trim(); }

  function normalizeFieldKey(value){
    return (value || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function matchesAny(text, patterns){
    const normalized = normalizeFieldKey(text);
    return patterns.some(pattern => {
      const key = normalizeFieldKey(pattern);
      return normalized === key || normalized.includes(key);
    });
  }

  function applyValueToField(input, value){
    if (value === null || value === undefined || value === '') return;

    const previous = input.value || '';
    if (previous === value) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    input.focus();
    input.value = value;
    input.setAttribute('value', value);

    ['input', 'change', 'blur'].forEach(eventName => {
      input.dispatchEvent(new Event(eventName, { bubbles: true }));
    });

    if (typeof input.oninput === 'function') {
      input.oninput({ target: input, currentTarget: input, bubbles: true });
    }
  }

  function getFieldHints(input){
    const texts = [
      input.name || '',
      input.id || '',
      input.placeholder || '',
      input.autocomplete || '',
      input.getAttribute('aria-label') || '',
      input.getAttribute('data-name') || ''
    ];

    const labelEl = input.closest('label');
    if (labelEl) texts.push(labelEl.textContent || '');

    const form = input.closest('form');
    if (form) {
      Array.from(form.querySelectorAll('label')).forEach(label => {
        if (label.contains(input) || label.control === input) texts.push(label.textContent || '');
      });
    }

    return texts.join(' ').toLowerCase();
  }

  function getAutocompleteTokens(input){
    const raw = (input.autocomplete || '').toString().toLowerCase();
    return raw.split(/\s+/).map(token => token.trim()).filter(Boolean).flatMap(token => token.split(/[,;_]/).filter(Boolean));
  }

  function splitDobValue(dateString){
    const raw = normalizeText(dateString);
    if (!raw) return { year: '', month: '', day: '' };

    const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (iso) return { year: iso[1], month: String(iso[2]).padStart(2, '0'), day: String(iso[3]).padStart(2, '0') };

    const european = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (european) return { day: String(european[1]).padStart(2, '0'), month: String(european[2]).padStart(2, '0'), year: european[3] };

    const american = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (american) {
      const first = Number(american[1]);
      const second = Number(american[2]);
      const year = american[3].length === 2 ? `20${american[3]}` : american[3];
      if (first > 12 && second <= 12) return { day: String(first).padStart(2, '0'), month: String(second).padStart(2, '0'), year };
      if (second > 12 && first <= 12) return { day: String(second).padStart(2, '0'), month: String(first).padStart(2, '0'), year };
      return { day: String(first).padStart(2, '0'), month: String(second).padStart(2, '0'), year };
    }

    return { year: raw.match(/\b(19|20)\d{2}\b/)?.[0] || '', month: '', day: '' };
  }

  function mapValueForField(input, persona, username, aliasEmail){
    const attr = getFieldHints(input);
    const type = (input.type || '').toLowerCase();
    const autocomplete = getAutocompleteTokens(input);
    const key = normalizeFieldKey(attr);
    const dobParts = splitDobValue(persona.dob || '');

    if (input.disabled || input.readOnly || type === 'hidden' || type === 'password') return null;

    const emailValue = aliasEmail || persona.email || '';
    const phoneValue = persona.phone || '';
    const addressValue = persona.address || '';

    const autoMatch = autocomplete.join(' ');

    if (type === 'email' || matchesAny(attr, ['email', 'e mail', 'mail', 'confirm email']) || autoMatch.includes('email')) return emailValue;
    if (matchesAny(attr, ['firstname', 'first name', 'first', 'given', 'given name', 'forename', 'prenom', 'prénom', 'fname']) || autoMatch.includes('given-name')) return persona.firstname || '';
    if (matchesAny(attr, ['lastname', 'last name', 'last', 'family', 'family name', 'surname', 'nom', 'lname']) || autoMatch.includes('family-name')) return persona.lastname || '';
    if (matchesAny(attr, ['full name', 'nom complet', 'complete name', 'name']) && !matchesAny(attr, ['firstname', 'lastname', 'username', 'company', 'business', 'organization'])) return `${persona.firstname} ${persona.lastname}`;
    if (matchesAny(attr, ['username', 'user name', 'pseudo', 'login', 'handle', 'nickname']) || autoMatch.includes('username')) return username || '';
    if (type === 'tel' || matchesAny(attr, ['phone', 'telephone', 'mobile', 'portable', 'cell', 'gsm', 'tel', 'phone number']) || autoMatch.includes('tel')) return phoneValue;
    if (matchesAny(attr, ['address', 'street', 'home address', 'adresse', 'rue', 'avenue', 'via', 'residence', 'street address']) || autoMatch.includes('street-address')) return addressValue;
    if (matchesAny(attr, ['city', 'ville', 'town', 'locality', 'address level 2']) || autoMatch.includes('address-level2')) return (addressValue.split(',').map(s => s.trim()).filter(Boolean).slice(-2, -1)[0] || '');
    if (matchesAny(attr, ['postal', 'zip', 'postcode', 'code postal', 'cp', 'postal code']) || autoMatch.includes('postal-code')) {
      const match = addressValue.match(/\b\d{4,5}\b/);
      return match ? match[0] : '';
    }
    if (matchesAny(attr, ['birth', 'birthday', 'dob', 'date de naissance', 'naissance', 'date of birth']) || autoMatch.includes('bday') || type === 'date') return persona.dob || '';
    if (matchesAny(attr, ['day', 'jour', 'dd']) || autoMatch.includes('day') || autoMatch.includes('bday-day')) return dobParts.day || '';
    if (matchesAny(attr, ['month', 'mois', 'mm']) || autoMatch.includes('month') || autoMatch.includes('bday-month')) return dobParts.month || '';
    if (matchesAny(attr, ['year', 'annee', 'yyyy', 'yy']) || autoMatch.includes('year') || autoMatch.includes('bday-year')) return dobParts.year || '';
    if (matchesAny(attr, ['job', 'profession', 'metier', 'occupation', 'role']) || autoMatch.includes('organization-title')) return persona.job || '';
    if (matchesAny(attr, ['company', 'entreprise', 'organization', 'business']) || autoMatch.includes('organization')) return persona.company || '';

    const normalizedType = (input.tagName || '').toLowerCase();
    if (normalizedType === 'select' && (key.includes('day') || key.includes('jour'))) return dobParts.day || '';
    if (normalizedType === 'select' && (key.includes('month') || key.includes('mois'))) return dobParts.month || '';
    if (normalizedType === 'select' && (key.includes('year') || key.includes('annee'))) return dobParts.year || '';

    return null;
  }

  function injectIntoForm(persona, username, aliasEmail){
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    inputs.forEach(input=>{
      try{
        const val = mapValueForField(input, persona, username, aliasEmail);
        if (val === null || val === undefined) return;
        applyValueToField(input, normalizeText(val));
      }catch(e){console.warn('inject error', e);}
    });
  }

  if (typeof document !== 'undefined') {
    // Floating button shown near focused input
    const floatBtn = document.createElement('button');
    floatBtn.textContent = '🛡️ Persona';
    Object.assign(floatBtn.style, {position:'absolute',display:'none',zIndex:2147483647,padding:'6px',fontSize:'12px'});
    document.documentElement.appendChild(floatBtn);

    let currentInput = null;
    document.addEventListener('focusin', (e)=>{
      const t = e.target;
      if(t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.tagName==='SELECT')){
        currentInput = t;
        const rect = t.getBoundingClientRect();
        floatBtn.style.top = (window.scrollY + rect.top - 8) + 'px';
        floatBtn.style.left = (window.scrollX + rect.right + 6) + 'px';
        floatBtn.style.display = 'block';
      }else{
        currentInput = null; floatBtn.style.display='none';
      }
    });

    document.addEventListener('click', (e)=>{ if(!floatBtn.contains(e.target)) {
      // hide chooser if clicking outside
      const chooser = document.getElementById('persona-chooser'); if(chooser) chooser.remove();
    }});

    floatBtn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      // request personas from background
      const res = await new Promise(r => chrome.runtime.sendMessage({action:'listPersonas'}, r));
      const personas = (res && res.personas) || [];
      // show chooser
      const existing = document.getElementById('persona-chooser'); if(existing) existing.remove();
      const chooser = document.createElement('div'); chooser.id='persona-chooser';
      Object.assign(chooser.style,{position:'absolute',zIndex:2147483647,background:'#fff',border:'1px solid #ccc',padding:'6px'});
      chooser.style.top = floatBtn.style.top; chooser.style.left = (parseInt(floatBtn.style.left) + 40) + 'px';
      if(personas.length===0){
        const el = document.createElement('div'); el.textContent='Aucune persona'; chooser.appendChild(el);
      }
      personas.forEach(p=>{
        const btn = document.createElement('button'); btn.textContent = p.name + ' — ' + p.firstname;
        btn.style.display='block'; btn.style.width='100%'; btn.style.marginBottom='4px';
        btn.onclick = async ()=>{
          // optionally ask username or generate
          const username = prompt('Pseudo pour ce site (laisser vide pour générer):','') || '';
          const tabUrl = location.origin;
          // ask background to create alias and link
          const linkRes = await new Promise(r => chrome.runtime.sendMessage({action:'createAliasAndLink', siteURL: tabUrl, personaId: p.id, username}, r));
          const alias = linkRes?.compte?.aliasEmail || '';
          injectIntoForm(p, username, alias);
          chooser.remove();
        };
        chooser.appendChild(btn);
      });
      document.documentElement.appendChild(chooser);
    });

    // also allow programmatic injection from background/popup
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
      if(msg?.action === 'injectPersona' && msg.persona){
        try{
          injectIntoForm(msg.persona, msg.username || '', msg.aliasEmail || '');
          sendResponse({ok:true});
        }catch(e){ sendResponse({ok:false, error:e.message}); }
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { splitDobValue, normalizeFieldKey, matchesAny, mapValueForField };
  }
})();

