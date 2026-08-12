async function injectPersonaIntoTab(tabId, persona, username, aliasEmail){
  try {
    const response = await chrome.tabs.sendMessage(tabId, {action:'injectPersona', persona, username, aliasEmail});
    if (response && response.ok) return response;
  } catch (err) {
    console.warn('sendMessage injection failed, falling back to scripting injection', err);
  }

  if (chrome.scripting && chrome.scripting.executeScript) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (data) => {
        function normalizeText(value){ return (value || '').toString().trim(); }
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
          return texts.join(' ').toLowerCase();
        }
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
        function splitDobValue(dateString){
          const raw = normalizeText(dateString);
          if (!raw) return { year: '', month: '', day: '' };
          const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
          if (iso) return { year: iso[1], month: String(iso[2]).padStart(2, '0'), day: String(iso[3]).padStart(2, '0') };
          const european = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (european) return { day: String(european[1]).padStart(2, '0'), month: String(european[2]).padStart(2, '0'), year: european[3] };
          return { year: raw.match(/\b(19|20)\d{2}\b/)?.[0] || '', month: '', day: '' };
        }
        function mapValueForField(input, persona, username, aliasEmail){
          const attr = getFieldHints(input);
          const type = (input.type || '').toLowerCase();
          const autocomplete = (input.autocomplete || '').toString().toLowerCase().split(/\s+/).filter(Boolean);
          const key = normalizeFieldKey(attr);
          const dobParts = splitDobValue(persona.dob || '');
          const autoMatch = autocomplete.join(' ');

          if (input.disabled || input.readOnly || type === 'hidden' || type === 'password') return null;

          const emailValue = aliasEmail || persona.email || '';
          const phoneValue = persona.phone || '';
          const addressValue = persona.address || '';

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
          if (matchesAny(attr, ['day', 'jour', 'dd']) || autoMatch.includes('day')) return dobParts.day || '';
          if (matchesAny(attr, ['month', 'mois', 'mm']) || autoMatch.includes('month')) return dobParts.month || '';
          if (matchesAny(attr, ['year', 'annee', 'yyyy', 'yy']) || autoMatch.includes('year')) return dobParts.year || '';
          if (matchesAny(attr, ['job', 'profession', 'metier', 'occupation', 'role']) || autoMatch.includes('organization-title')) return persona.job || '';
          if (matchesAny(attr, ['company', 'entreprise', 'organization', 'business']) || autoMatch.includes('organization')) return persona.company || '';

          if ((input.tagName || '').toLowerCase() === 'select' && (key.includes('day') || key.includes('jour'))) return dobParts.day || '';
          if ((input.tagName || '').toLowerCase() === 'select' && (key.includes('month') || key.includes('mois'))) return dobParts.month || '';
          if ((input.tagName || '').toLowerCase() === 'select' && (key.includes('year') || key.includes('annee'))) return dobParts.year || '';
          return null;
        }

        const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
        inputs.forEach(input => {
          try {
            const value = mapValueForField(input, data.persona, data.username || '', data.aliasEmail || '');
            if (value === null || value === undefined || value === '') return;
            const previous = input.value || '';
            if (previous !== value) {
              input.focus();
              input.value = value;
              input.setAttribute('value', value);
              ['input', 'change', 'blur'].forEach(name => input.dispatchEvent(new Event(name, { bubbles: true })));
            }
          } catch (err) {
            console.warn('fallback autofill error', err);
          }
        });
      },
      args: [{ persona, username, aliasEmail }]
    });
  }

  return { ok: true };
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const listEl = document.getElementById('list');
  const newBtn = document.getElementById('new');
  const settingsBtn = document.getElementById('settingsBtn');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', async () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else if (chrome.tabs) {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') });
      }
    });
  }

  async function refresh(){
    const res = await chrome.runtime.sendMessage({action:'listPersonas'});
    if(!res.ok){ listEl.textContent = 'Erreur'; return; }
    listEl.innerHTML = '';
    const personaContainers = (await chrome.storage.local.get(['personaContainers'])).personaContainers || [];
    const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
    const currentCookieStoreId = tab?.cookieStoreId || null;
    (res.personas||[]).forEach(p=>{
      const div = document.createElement('div'); div.className='persona';
      div.innerHTML = `<strong>${p.name}</strong><div>${p.firstname} ${p.lastname}</div>`;
      // show container mapping if any
      const mapping = personaContainers.find(m=>m.personaId===p.id);
      const info = document.createElement('div'); info.style.fontSize='12px'; info.style.color='#444';
      if(mapping && mapping.cookieStoreId){
        const badge = document.createElement('span');
        badge.textContent = mapping.containerName || mapping.cookieStoreId;
        badge.style.padding = '2px 6px'; badge.style.borderRadius='6px'; badge.style.color = '#fff';
        // try to set background color from mapping.containerColor (simple)
        if(mapping.containerColor) badge.style.background = mapping.containerColor;
        else badge.style.background = '#444';
        info.appendChild(badge);
        if(currentCookieStoreId && currentCookieStoreId === mapping.cookieStoreId){
          const active = document.createElement('span'); active.textContent = ' — Actif ici'; active.style.marginLeft='6px'; active.style.color='#080';
          info.appendChild(active);
        }
      }else{
        info.textContent = 'Aucun conteneur associé';
      }
      div.appendChild(info);
      const inject = document.createElement('button'); inject.textContent='Injecter ici';
      inject.onclick = async ()=>{
        // create alias and link
        const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
        const username = prompt('Pseudo pour ce site (laisser vide pour générer)', '') || '';
        let alias = '';
        // respect user preference for alias usage
        const cfgLocal = (await chrome.storage.local.get(['aliasConfig'])).aliasConfig || {};
        if(cfgLocal.useAlias === false){
          // aliases disabled: skip creating alias
          alias = '';
        }else{
          const linkRes = await chrome.runtime.sendMessage({action:'createAliasAndLink', siteURL:tab.url, personaId:p.id, username});
          alias = linkRes?.alias || linkRes?.compte?.aliasEmail || '';
          if(linkRes && linkRes.ok === true && linkRes.aliasCreated === false){
            console.warn('Alias creation returned no address', linkRes);
            alert('La création d\'alias a échoué ou n\'est pas disponible — injection sans alias.');
          }
          if(linkRes && linkRes.ok === true && linkRes.aliasCreated === true){
            // show alias to user briefly
            alert(`Alias créé : ${alias} (redirige vers votre adresse configurée)`);
          }
          if(!linkRes || linkRes.ok === false){
            alert('Échec de la création d\'alias — injection sans alias.');
          }
        }
        await injectPersonaIntoTab(tab.id, p, username, alias);
        window.close();
      };
      const openContainerBtn = document.createElement('button'); openContainerBtn.textContent = 'Ouvrir dans conteneur';
      openContainerBtn.onclick = async ()=>{
        const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
        const res = await chrome.runtime.sendMessage({action:'openUrlInPersonaContainer', url: tab.url, personaId: p.id});
        if(res && res.ok && res.inContainer){
          alert('Onglet ouvert dans le conteneur associé à la persona.');
        }else if(res && res.ok && !res.inContainer){
          alert('Conteneurs non supportés dans ce navigateur — onglet ouvert normalement.');
        }else{
          alert('Échec de l\'ouverture en conteneur : ' + (res?.error||'unknown'));
        }
      };
      div.appendChild(inject);
      div.appendChild(openContainerBtn);
      listEl.appendChild(div);
    });
    if((res.personas||[]).length===0) listEl.textContent='Aucune persona trouvée.';
  }

  newBtn.onclick = async ()=>{
    const theme = prompt('Nom thématique pour la persona (ex: Jeux, Achats)', 'Persona') || 'Persona';
    try {
      const gen = await chrome.runtime.sendMessage({action:'generateIdentity', theme});
      if(!gen || !gen.ok){
        throw new Error(gen?.error || 'Erreur de génération');
      }
      const p = gen.persona;
      const saveRes = await chrome.runtime.sendMessage({action:'savePersona', persona: p});
      if(saveRes && saveRes.ok && saveRes.container){
        alert(`Conteneur créé pour la Persona : ${saveRes.container.name || saveRes.container.cookieStoreId}`);
      }
      await refresh();
    } catch (err) {
      console.error('quick generate failed', err);
      alert('Échec de la génération rapide : ' + (err?.message || err));
    }
  };

  // display alias config status
  const aliasStatusEl = document.getElementById('aliasStatus');
  const cfg = (await chrome.storage.local.get(['aliasConfig'])).aliasConfig || {};
  if(cfg.useAlias === false){
    aliasStatusEl.textContent = 'Alias email : Désactivés (options)';
    aliasStatusEl.style.color = '#b00';
  }else if(cfg.provider){
    aliasStatusEl.textContent = `Alias email : activés → ${cfg.provider}`;
    aliasStatusEl.style.color = '#080';
  }else{
    aliasStatusEl.textContent = 'Alias email : non configurés';
    aliasStatusEl.style.color = '#666';
  }

  refresh();
});
