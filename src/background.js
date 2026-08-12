importScripts(chrome.runtime.getURL('src/generator.js'));
importScripts(chrome.runtime.getURL('src/validators.js'));
importScripts(chrome.runtime.getURL('src/crypto_utils.js'));

const STORAGE_KEYS = { PERSONAS: 'personas', COMPTES: 'comptes' };

// Ensure additional keys exist: personaContainers stored under 'personaContainers'

function getStorage(key){
  return new Promise(resolve=>{
    chrome.storage.local.get([key], res => resolve(res[key]||[]));
  });
}

function setStorage(key, value){
  return new Promise(resolve=>{
    const obj = {}; obj[key] = value;
    chrome.storage.local.set(obj, ()=>resolve());
  });
}

async function addPersona(persona){
  const list = await getStorage(STORAGE_KEYS.PERSONAS);
  list.push(persona);
  await setStorage(STORAGE_KEYS.PERSONAS, list);
  return persona;
}

async function updatePersona(updated){
  const list = await getStorage(STORAGE_KEYS.PERSONAS);
  const idx = list.findIndex(p=>p.id===updated.id);
  if(idx>=0) list[idx]=updated;
  await setStorage(STORAGE_KEYS.PERSONAS, list);
  return updated;
}

async function listPersonas(){
  return await getStorage(STORAGE_KEYS.PERSONAS);
}

async function listComptes(){
  return await getStorage(STORAGE_KEYS.COMPTES);
}

async function getComptesByPersona(personaId){
  const all = await listComptes();
  return all.filter(c=>c.personaId === personaId);
}

async function deleteCompte(siteURL, personaId){
  const list = await getStorage(STORAGE_KEYS.COMPTES);
  const filtered = list.filter(c => !(c.siteURL === siteURL && c.personaId === personaId));
  await setStorage(STORAGE_KEYS.COMPTES, filtered);
  return true;
}

async function deletePersonaById(personaId){
  // remove persona
  const personas = await getStorage(STORAGE_KEYS.PERSONAS);
  const remaining = personas.filter(p=>p.id !== personaId);
  await setStorage(STORAGE_KEYS.PERSONAS, remaining);
  // remove linked comptes
  const comptes = await getStorage(STORAGE_KEYS.COMPTES);
  const remainingComptes = comptes.filter(c=>c.personaId !== personaId);
  await setStorage(STORAGE_KEYS.COMPTES, remainingComptes);
  // remove container mapping
  const containers = await getStorage('personaContainers');
  const remainingContainers = containers.filter(m=>m.personaId !== personaId);
  await setStorage('personaContainers', remainingContainers);
  return true;
}

async function linkCompte(siteURL, personaId, username, aliasEmail){
  const entry = { siteURL, personaId, username, aliasEmail, createdAt: new Date().toISOString() };
  const v = validators.validateCompte(entry);
  if(!v.valid) throw new Error('Compte validation failed: ' + v.errors.join(';'));
  const list = await getStorage(STORAGE_KEYS.COMPTES);
  list.push(entry);
  await setStorage(STORAGE_KEYS.COMPTES, list);
  return entry;
}

// Create alias email using configured provider if available
async function createEmailAlias(siteURL){
  const cfg = (await new Promise(r=>chrome.storage.local.get(['aliasConfig'], r))).aliasConfig || {};
  // If the user disabled alias usage, skip external calls and return null
  if(cfg && cfg.useAlias === false){
    return null;
  }
  if(cfg && cfg.provider === 'simplelogin' && cfg.apiKey){
    try{
      const endpoint = cfg.simpleloginEndpoint || 'https://app.simplelogin.io/api/v2/aliases';
      const payload = { note: `alias for ${siteURL}` };
      if(cfg.forwardingEmail) payload.email = cfg.forwardingEmail;

      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 8000);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if(!resp.ok){
        const text = await resp.text().catch(()=>'<no body>');
        console.warn('SimpleLogin API error', resp.status, text);
        throw new Error(`SimpleLogin API ${resp.status}`);
      }
      const data = await resp.json().catch(()=>null);
      // data can contain different fields depending on API version; try common keys
      const address = data?.address || data?.alias || data?.email || null;
      if(address) return { address, raw: data };
      // If API succeeded but didn't return address, return raw data
      return { address: null, raw: data };
    }catch(err){
      console.warn('alias api failed', err);
      // fallthrough to local alias fallback
    }
  }
  // fallback local alias
  const domain = 'alias.local';
  const local = `p_${Math.random().toString(36).slice(2,8)}@${domain}`;
  return { address: local, raw: { fallback: true } };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async ()=>{
    try{
      if(message?.action === 'generateIdentity'){
        const p = generator.generateIdentity(message.theme);
        // fetch avatar asynchronously
        p.avatar = await generator.fetchFakeAvatar();
        sendResponse({ok:true, persona: p});
        return;
      }
        if(message?.action === 'savePersona'){
          const v = validators.validatePersona(message.persona);
          if(!v.valid){ sendResponse({ok:false, error: 'Persona validation failed: ' + v.errors.join(';')}); return; }
          const saved = await addPersona(message.persona);
          // If configured, auto-create a container for this persona
          const pconf = (await new Promise(r=>chrome.storage.local.get(['personaConfig'], r))).personaConfig || {};
          let containerInfo = null;
          if(pconf.autoCreateContainer){
            try{
              const createRes = await new Promise(r=>chrome.runtime.sendMessage({action:'createContainerForPersona', personaId: saved.id, name: saved.name}, r));
              if(createRes && createRes.ok){
                saved.container = createRes.cookieStoreId;
                saved.containerName = createRes.containerName || null;
                saved.containerColor = createRes.containerColor || null;
                saved.containerIcon = createRes.containerIcon || null;
                containerInfo = { cookieStoreId: createRes.cookieStoreId, name: createRes.containerName, color: createRes.containerColor, icon: createRes.containerIcon };
              }
            }catch(e){ console.warn('auto create container failed', e); }
          }
          sendResponse({ok:true, persona: saved, container: containerInfo});
        return;
      }
      if(message?.action === 'updatePersona'){
        const saved = await updatePersona(message.persona);
        sendResponse({ok:true, persona: saved});
        return;
      }
      if(message?.action === 'listPersonas'){
        const list = await listPersonas();
        sendResponse({ok:true, personas: list});
        return;
      }
      if(message?.action === 'listComptes'){
        const list = await listComptes();
        sendResponse({ok:true, comptes: list});
        return;
      }
      if(message?.action === 'getComptesByPersona'){
        const list = await getComptesByPersona(message.personaId);
        sendResponse({ok:true, comptes: list});
        return;
      }
      if(message?.action === 'deleteCompte'){
        await deleteCompte(message.siteURL, message.personaId);
        sendResponse({ok:true});
        return;
      }
      if(message?.action === 'deletePersona'){
        await deletePersonaById(message.personaId);
        sendResponse({ok:true});
        return;
      }
      if(message?.action === 'exportData'){
        // Export personas, comptes, personaContainers, aliasConfig, personaConfig
        const personas = await getStorage(STORAGE_KEYS.PERSONAS);
        const comptes = await getStorage(STORAGE_KEYS.COMPTES);
        const containers = await getStorage('personaContainers');
        const aliasConfig = (await new Promise(r=>chrome.storage.local.get(['aliasConfig'], r))).aliasConfig || {};
        const personaConfig = (await new Promise(r=>chrome.storage.local.get(['personaConfig'], r))).personaConfig || {};
        const payload = { personas, comptes, containers, aliasConfig, personaConfig, exportedAt: new Date().toISOString() };
        try{
          const encrypted = await cryptoUtils.encryptJSON(payload, message.password);
          sendResponse({ok:true, data: encrypted});
        }catch(e){ sendResponse({ok:false, error: e.message}); }
        return;
      }
      if(message?.action === 'importData'){
        try{
          const payload = await cryptoUtils.decryptJSON(message.data, message.password);
          // validate and merge
          const personas = payload.personas || [];
          const comptes = payload.comptes || [];
          const containers = payload.containers || [];
          // validate personas and comptes
          for(const p of personas){ const v = validators.validatePersona(p); if(!v.valid) throw new Error('Invalid persona in import: '+v.errors.join(';')); }
          for(const c of comptes){ const v = validators.validateCompte(c); if(!v.valid) throw new Error('Invalid compte in import: '+v.errors.join(';')); }
          // merge: append items
          const existingP = await getStorage(STORAGE_KEYS.PERSONAS);
          const mergedP = existingP.concat(personas);
          await setStorage(STORAGE_KEYS.PERSONAS, mergedP);
          const existingC = await getStorage(STORAGE_KEYS.COMPTES);
          const mergedC = existingC.concat(comptes);
          await setStorage(STORAGE_KEYS.COMPTES, mergedC);
          const existingCont = await getStorage('personaContainers');
          const mergedCont = existingCont.concat(containers);
          await setStorage('personaContainers', mergedCont);
          // also restore configs
          await chrome.storage.local.set({aliasConfig: payload.aliasConfig || {}});
          await chrome.storage.local.set({personaConfig: payload.personaConfig || {}});
          sendResponse({ok:true});
        }catch(e){ sendResponse({ok:false, error: e.message}); }
        return;
      }
      if(message?.action === 'exportDataPlain'){
        const personas = await getStorage(STORAGE_KEYS.PERSONAS);
        const comptes = await getStorage(STORAGE_KEYS.COMPTES);
        const containers = await getStorage('personaContainers');
        const aliasConfig = (await new Promise(r=>chrome.storage.local.get(['aliasConfig'], r))).aliasConfig || {};
        const personaConfig = (await new Promise(r=>chrome.storage.local.get(['personaConfig'], r))).personaConfig || {};
        const payload = { personas, comptes, containers, aliasConfig, personaConfig, exportedAt: new Date().toISOString() };
        sendResponse({ok:true, payload});
        return;
      }
      if(message?.action === 'importDataPlain'){
        try{
          const payload = message.payload || {};
          const personas = payload.personas || [];
          const comptes = payload.comptes || [];
          const containers = payload.containers || [];
          for(const p of personas){ const v = validators.validatePersona(p); if(!v.valid) throw new Error('Invalid persona in import: '+v.errors.join(';')); }
          for(const c of comptes){ const v = validators.validateCompte(c); if(!v.valid) throw new Error('Invalid compte in import: '+v.errors.join(';')); }
          const existingP = await getStorage(STORAGE_KEYS.PERSONAS);
          const mergedP = existingP.concat(personas);
          await setStorage(STORAGE_KEYS.PERSONAS, mergedP);
          const existingC = await getStorage(STORAGE_KEYS.COMPTES);
          const mergedC = existingC.concat(comptes);
          await setStorage(STORAGE_KEYS.COMPTES, mergedC);
          const existingCont = await getStorage('personaContainers');
          const mergedCont = existingCont.concat(containers);
          await setStorage('personaContainers', mergedCont);
          await chrome.storage.local.set({aliasConfig: payload.aliasConfig || {}});
          await chrome.storage.local.set({personaConfig: payload.personaConfig || {}});
          sendResponse({ok:true});
        }catch(e){ sendResponse({ok:false, error: e.message}); }
        return;
      }
      if(message?.action === 'createAliasAndLink'){
          const aliasObj = await createEmailAlias(message.siteURL);
          // aliasObj may be null, or {address, raw}, or a simple string in old fallback
          let aliasAddress = null;
          if(typeof aliasObj === 'string') aliasAddress = aliasObj;
          else if(aliasObj && typeof aliasObj === 'object') aliasAddress = aliasObj.address || null;
          const compte = await linkCompte(message.siteURL, message.personaId, message.username || '', aliasAddress);
          const aliasCreated = !!aliasAddress;
          sendResponse({ok:true, compte, aliasCreated, alias: aliasAddress, aliasRaw: aliasObj?.raw || null});
        return;
      }
      if(message?.action === 'createContainerForPersona'){
        // Create or return a contextual identity (Firefox Containers)
        const personaId = message.personaId;
        const name = message.name || `Persona ${personaId}`;
        // check existing mapping
        const store = await getStorage('personaContainers');
        const mapping = store.find(m=>m.personaId===personaId);
        if(mapping && mapping.cookieStoreId){ sendResponse({ok:true, cookieStoreId: mapping.cookieStoreId}); return; }
        // Try to create a contextual identity (Firefox)
        try{
          const ci = (typeof browser !== 'undefined' && browser.contextualIdentities) ? browser.contextualIdentities : chrome.contextualIdentities;
          if(!ci || !ci.create) throw new Error('contextualIdentities not supported');
          const color = 'blue'; const icon='fingerprint';
          const result = await ci.create({name, color, icon});
          const cookieStoreId = result.cookieStoreId || result.id || null;
          const containerName = result.name || name;
          const containerColor = result.color || color;
          const containerIcon = result.icon || icon;
          // save mapping with metadata
          store.push({personaId, cookieStoreId, containerName, containerColor, containerIcon});
          await setStorage('personaContainers', store);
          sendResponse({ok:true, cookieStoreId, containerName, containerColor, containerIcon});
        }catch(err){
          console.warn('createContainerForPersona failed', err);
          sendResponse({ok:false, error: err.message});
        }
        return;
      }
      if(message?.action === 'openUrlInPersonaContainer'){
        const {url, personaId} = message;
        const store = await getStorage('personaContainers');
        let mapping = store.find(m=>m.personaId===personaId);
        if(!mapping){
          const createRes = await new Promise(r=>chrome.runtime.sendMessage({action:'createContainerForPersona', personaId, name: `Persona ${personaId}`}, r));
          if(createRes && createRes.ok && createRes.cookieStoreId){
            mapping = {personaId, cookieStoreId: createRes.cookieStoreId};
          }
        }
        try{
          if(mapping && mapping.cookieStoreId){
            // open tab in container (Firefox supports cookieStoreId)
            await chrome.tabs.create({url, cookieStoreId: mapping.cookieStoreId});
            sendResponse({ok:true, inContainer:true, cookieStoreId: mapping.cookieStoreId});
          }else{
            // fallback: open normal tab and inform caller
            await chrome.tabs.create({url});
            sendResponse({ok:true, inContainer:false});
          }
        }catch(err){
          console.warn('openUrlInPersonaContainer failed', err);
          sendResponse({ok:false, error:err.message});
        }
        return;
      }
      sendResponse({ok:false, error:'unknown action'});
    }catch(err){
      sendResponse({ok:false, error:err.message});
    }
  })();
  return true; // indicate async response
});
