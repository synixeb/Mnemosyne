// Detection des champs par système de score pondéré multi-signaux (inspiré des gestionnaires de mots de passe)
(function(){
  function normalizeText(value){ return (value || '').toString().trim(); }

  // Minuscule + suppression des accents + normalisation des séparateurs, pour comparer id/name/label de façon fiable
  function normalizeFieldKey(value){
    return (value || '').toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Conservé pour compatibilité: teste une égalité ou inclusion simple entre texte normalisé et motifs
  function matchesAny(text, patterns){
    const normalized = normalizeFieldKey(text);
    return patterns.some(pattern => {
      const key = normalizeFieldKey(pattern);
      return normalized === key || normalized.includes(key);
    });
  }

  // Poids des signaux, du plus fiable (autocomplete standard, type HTML) au moins fiable (placeholder)
  const WEIGHTS = { AUTOCOMPLETE: 100, TYPE: 70, ID_NAME: 90, ARIA_LABEL: 45, LABEL_TEXT: 40, PLACEHOLDER: 35 };
  const MIN_SCORE_THRESHOLD = 35;

  // Chaque catégorie définit ses propres signaux; les motifs utilisent \b pour éviter les faux positifs (ex: "nom" ne matche pas dans "prenom")
  const FIELD_CATEGORIES = {
    email: {
      types: ['email'],
      autocomplete: ['email'],
      keywords: [/\bemail\b/, /\be ?mail\b/, /\bmail\b/, /\bcourriel\b/, /\bconfirm(ation)? ?email\b/]
    },
    firstname: {
      autocomplete: ['given-name'],
      keywords: [/\bfirst ?name\b/, /\bfirstname\b/, /\bgiven ?name\b/, /\bforename\b/, /\bprenom\b/, /\bfname\b/, /^first$/]
    },
    lastname: {
      autocomplete: ['family-name'],
      keywords: [/\blast ?name\b/, /\blastname\b/, /\bfamily ?name\b/, /\bsurname\b/, /\bnom\b/, /\blname\b/]
    },
    fullname: {
      keywords: [/\bfull ?name\b/, /\bnom complet\b/, /\bcomplete ?name\b/, /\byour ?name\b/, /^name$/],
      exclude: [/\buser ?name\b/, /\bfirst ?name\b/, /\blast ?name\b/, /\bcompany\b/, /\bentreprise\b/, /\borganization\b/, /\bbusiness\b/]
    },
    username: {
      autocomplete: ['username'],
      keywords: [/\buser ?name\b/, /\bpseudo\b/, /\blogin\b/, /\bhandle\b/, /\bnickname\b/, /\buid\b/]
    },
    phone: {
      types: ['tel'],
      autocomplete: ['tel'],
      keywords: [/\bphone\b/, /\btelephone\b/, /\bmobile\b/, /\bportable\b/, /\bcell\b/, /\bgsm\b/, /\btel\b/]
    },
    address: {
      autocomplete: ['street-address', 'address-line1'],
      keywords: [/\baddress\b/, /\bstreet\b/, /\badresse\b/, /\brue\b/, /\bavenue\b/, /\bvia\b/, /\bresidence\b/]
    },
    city: {
      autocomplete: ['address-level2'],
      keywords: [/\bcity\b/, /\bville\b/, /\btown\b/, /\blocality\b/]
    },
    postalCode: {
      autocomplete: ['postal-code'],
      keywords: [/\bpostal\b/, /\bzip\b/, /\bpostcode\b/, /\bcode postal\b/, /^cp$/]
    },
    dob: {
      types: ['date'],
      autocomplete: ['bday'],
      keywords: [/\bbirth\b/, /\bbirthday\b/, /\bdob\b/, /\bdate de naissance\b/, /\bnaissance\b/, /\bdate of birth\b/]
    },
    dobDay: {
      autocomplete: ['bday-day'],
      keywords: [/\bday\b/, /\bjour\b/, /^dd$/]
    },
    dobMonth: {
      autocomplete: ['bday-month'],
      keywords: [/\bmonth\b/, /\bmois\b/, /^mm$/]
    },
    dobYear: {
      autocomplete: ['bday-year'],
      keywords: [/\byear\b/, /\bannee\b/, /^yyyy$/, /^yy$/]
    },
    job: {
      autocomplete: ['organization-title'],
      keywords: [/\bjob\b/, /\bprofession\b/, /\bmetier\b/, /\boccupation\b/, /\brole\b/]
    },
    company: {
      autocomplete: ['organization'],
      keywords: [/\bcompany\b/, /\bentreprise\b/, /\borganization\b/, /\bbusiness\b/]
    }
  };

  function getAutocompleteTokens(input){
    const raw = (input.autocomplete || '').toString().toLowerCase();
    return raw.split(/\s+/).map(token => token.trim()).filter(Boolean).flatMap(token => token.split(/[,;_]/).filter(Boolean));
  }

  function getLabelText(input){
    const texts = [];
    const labelEl = input.closest && input.closest('label');
    if (labelEl) texts.push(labelEl.textContent || '');

    const form = input.closest && input.closest('form');
    if (form) {
      Array.from(form.querySelectorAll('label')).forEach(label => {
        if (label.contains(input) || label.control === input) texts.push(label.textContent || '');
      });
    }
    return texts.join(' ');
  }

  // Champ invisible/hors-écran : on l'ignore pour ne pas remplir un piège anti-bot (honeypot)
  function isFieldVisible(input){
    if (input.hidden) return false;
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return true;
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity || '1') === 0) return false;

    const width = parseFloat(style.width);
    const height = parseFloat(style.height);
    if (!Number.isNaN(width) && !Number.isNaN(height) && width <= 1 && height <= 1) return false;

    const left = parseFloat(style.left);
    if (style.position === 'absolute' && !Number.isNaN(left) && left < -1000) return false;

    return true;
  }

  function collectFieldSources(input){
    return {
      idName: normalizeFieldKey([input.id, input.name, input.getAttribute('data-name') || ''].join(' ')),
      placeholder: normalizeFieldKey(input.placeholder || ''),
      aria: normalizeFieldKey(input.getAttribute('aria-label') || ''),
      label: normalizeFieldKey(getLabelText(input)),
      autocomplete: getAutocompleteTokens(input),
      type: (input.type || '').toLowerCase()
    };
  }

  function scoreCategory(sources, def){
    let score = 0;
    if (def.types && def.types.includes(sources.type)) score += WEIGHTS.TYPE;
    if (def.autocomplete && def.autocomplete.some(tok => sources.autocomplete.includes(tok))) score += WEIGHTS.AUTOCOMPLETE;

    if (def.keywords) {
      if (sources.idName && def.keywords.some(re => re.test(sources.idName))) score += WEIGHTS.ID_NAME;
      if (sources.aria && def.keywords.some(re => re.test(sources.aria))) score += WEIGHTS.ARIA_LABEL;
      if (sources.label && def.keywords.some(re => re.test(sources.label))) score += WEIGHTS.LABEL_TEXT;
      if (sources.placeholder && def.keywords.some(re => re.test(sources.placeholder))) score += WEIGHTS.PLACEHOLDER;
    }

    if (def.exclude) {
      const excluded = def.exclude.some(re => re.test(sources.idName) || re.test(sources.label) || re.test(sources.aria));
      if (excluded) return -Infinity;
    }

    return score;
  }

  // Détecte la meilleure catégorie pour un champ en comparant les scores de toutes les catégories candidates
  function detectFieldCategory(input){
    const sources = collectFieldSources(input);
    let best = null;
    let bestScore = MIN_SCORE_THRESHOLD - 1;

    Object.keys(FIELD_CATEGORIES).forEach(category => {
      const score = scoreCategory(sources, FIELD_CATEGORIES[category]);
      if (score > bestScore) { bestScore = score; best = category; }
    });

    if (!best) return null;
    return { category: best, score: bestScore };
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

  function buildValueForCategory(category, persona, username, aliasEmail, dobParts){
    const addressValue = persona.address || '';
    switch(category){
      case 'email': return aliasEmail || persona.email || '';
      case 'firstname': return persona.firstname || '';
      case 'lastname': return persona.lastname || '';
      case 'fullname': return `${persona.firstname || ''} ${persona.lastname || ''}`.trim();
      case 'username': return username || '';
      case 'phone': return persona.phone || '';
      case 'address': return addressValue;
      case 'city': return addressValue.split(',').map(s => s.trim()).filter(Boolean).slice(-2, -1)[0] || '';
      case 'postalCode': return addressValue.match(/\b\d{4,5}\b/)?.[0] || '';
      case 'dob': return persona.dob || '';
      case 'dobDay': return dobParts.day || '';
      case 'dobMonth': return dobParts.month || '';
      case 'dobYear': return dobParts.year || '';
      case 'job': return persona.job || '';
      case 'company': return persona.company || '';
      default: return null;
    }
  }

  function mapValueForField(input, persona, username, aliasEmail){
    const type = (input.type || '').toLowerCase();
    if (input.disabled || input.readOnly || type === 'hidden' || type === 'password') return null;
    if (!isFieldVisible(input)) return null;

    const detection = detectFieldCategory(input);
    if (!detection) {
      // repli: cas des <select> jour/mois/année sans libellé assez explicite pour le score
      const key = normalizeFieldKey([input.id, input.name].join(' '));
      const dobParts = splitDobValue(persona.dob || '');
      if ((input.tagName || '').toLowerCase() === 'select') {
        if (key.includes('day') || key.includes('jour')) return dobParts.day || '';
        if (key.includes('month') || key.includes('mois')) return dobParts.month || '';
        if (key.includes('year') || key.includes('annee')) return dobParts.year || '';
      }
      return null;
    }

    const dobParts = splitDobValue(persona.dob || '');
    return buildValueForCategory(detection.category, persona, username, aliasEmail, dobParts);
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
    module.exports = { splitDobValue, normalizeFieldKey, matchesAny, mapValueForField, detectFieldCategory, isFieldVisible, FIELD_CATEGORIES };
  }
})();

