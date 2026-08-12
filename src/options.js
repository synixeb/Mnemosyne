async function refresh(){
  const res = await chrome.runtime.sendMessage({action:'listPersonas'});
  const listEl = document.getElementById('list');
  const comptesEl = document.getElementById('comptes');
  listEl.innerHTML=''; comptesEl.innerHTML='';
  (res.personas||[]).forEach(p=>{
    const div = document.createElement('div');
    div.innerHTML = `<strong>${p.name}</strong> — ${p.firstname} ${p.lastname} `;
    const edit = document.createElement('button'); edit.textContent='Éditer';
    edit.onclick = ()=>fillForm(p);
    const del = document.createElement('button'); del.textContent='Supprimer';
    del.onclick = async ()=>{
      const res = await chrome.runtime.sendMessage({action:'deletePersona', personaId: p.id});
      if(res && res.ok) refresh();
      else alert('Échec suppression Persona');
    };
    div.appendChild(edit); div.appendChild(del);
    listEl.appendChild(div);
  });

  const resC = await chrome.runtime.sendMessage({action:'listComptes'});
  const comptes = (resC && resC.comptes) || [];
  if(comptes.length===0) comptesEl.textContent='Aucune liaison.';
  comptes.forEach(c=>{
    const d = document.createElement('div'); d.textContent = `${c.siteURL} -> ${c.aliasEmail} (persona ${c.personaId})`;
    const delc = document.createElement('button'); delc.textContent='Supprimer liaison';
    delc.onclick = async ()=>{
      const r = await chrome.runtime.sendMessage({action:'deleteCompte', siteURL: c.siteURL, personaId: c.personaId});
      if(r && r.ok) refresh(); else alert('Échec suppression liaison');
    };
    d.appendChild(delc);
    comptesEl.appendChild(d);
  });
}

function fillForm(p){
  document.getElementById('id').value = p.id||'';
  document.getElementById('name').value = p.name||'';
  document.getElementById('firstname').value = p.firstname||'';
  document.getElementById('lastname').value = p.lastname||'';
  document.getElementById('dob').value = p.dob||'';
  document.getElementById('address').value = p.address||'';
  document.getElementById('job').value = p.job||'';
  document.getElementById('phone').value = p.phone||'';
}

document.getElementById('form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = document.getElementById('id').value;
  const persona = {
    id: id || `persona_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    name: document.getElementById('name').value,
    firstname: document.getElementById('firstname').value,
    lastname: document.getElementById('lastname').value,
    dob: document.getElementById('dob').value,
    address: document.getElementById('address').value,
    job: document.getElementById('job').value,
    phone: document.getElementById('phone').value
  };
  if(id){
    await chrome.runtime.sendMessage({action:'updatePersona', persona});
  }else{
    await chrome.runtime.sendMessage({action:'savePersona', persona});
  }
  fillForm({});
  refresh();
});

document.getElementById('new').addEventListener('click', (e)=>{
  e.preventDefault(); fillForm({});
});

refresh();

// Alias config handling
async function loadAliasConfig(){
  const cfg = (await chrome.storage.local.get(['aliasConfig'])).aliasConfig || {};
  document.getElementById('aliasProvider').value = cfg.provider || '';
  document.getElementById('aliasApiKey').value = cfg.apiKey || '';
  document.getElementById('aliasForward').value = cfg.forwardingEmail || '';
  document.getElementById('aliasUse').checked = cfg.useAlias !== false; // default true
}

document.getElementById('saveAlias').addEventListener('click', async (e)=>{
  e.preventDefault();
  const cfg = {
    provider: document.getElementById('aliasProvider').value,
    apiKey: document.getElementById('aliasApiKey').value,
    forwardingEmail: document.getElementById('aliasForward').value,
    useAlias: document.getElementById('aliasUse').checked
  };
  await chrome.storage.local.set({aliasConfig: cfg});
  alert('Configuration enregistrée.');
});

loadAliasConfig();

// Persona config (auto container)
async function loadPersonaConfig(){
  const pconf = (await chrome.storage.local.get(['personaConfig'])).personaConfig || {};
  document.getElementById('autoCreateContainer').checked = !!pconf.autoCreateContainer;
}

document.getElementById('save').addEventListener('click', async ()=>{
  // also save personaConfig
  const pconf = { autoCreateContainer: document.getElementById('autoCreateContainer').checked };
  await chrome.storage.local.set({personaConfig: pconf});
});

loadPersonaConfig();

// Export / Import handlers
document.getElementById('exportBtn').addEventListener('click', async ()=>{
  const pass = document.getElementById('exportPass').value;
  if(!pass) return alert('Entrez un mot de passe pour chiffrer l\'export');
  const res = await chrome.runtime.sendMessage({action:'exportData', password: pass});
  if(res && res.ok){
    // create downloadable blob
    const blob = new Blob([res.data], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `mnemosyne-export-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }else alert('Export failed: ' + (res?.error || 'unknown'));
});

document.getElementById('importBtn').addEventListener('click', async ()=>{
  const pass = document.getElementById('exportPass').value;
  if(!pass) return alert('Entrez le mot de passe utilisé pour chiffrer l\'export');
  const data = document.getElementById('importData').value.trim();
  if(!data) return alert('Collez la chaîne chiffrée à importer');
  const res = await chrome.runtime.sendMessage({action:'importData', data, password: pass});
  if(res && res.ok){ alert('Import réussi'); refresh(); }
  else alert('Import failed: ' + (res?.error || 'unknown'));
});

// Plain JSON export/import
document.getElementById('exportPlainBtn').addEventListener('click', async ()=>{
  const res = await chrome.runtime.sendMessage({action:'exportDataPlain'});
  if(res && res.ok){
    const blob = new Blob([JSON.stringify(res.payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `mnemosyne-export-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }else alert('Export failed: ' + (res?.error || 'unknown'));
});

document.getElementById('importFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const text = await f.text(); document.getElementById('importPlainData').value = text;
});

document.getElementById('importPlainBtn').addEventListener('click', async ()=>{
  const text = document.getElementById('importPlainData').value.trim();
  if(!text) return alert('Collez ou chargez un fichier JSON à importer');
  let payload;
  try{ payload = JSON.parse(text); }catch(e){ return alert('JSON invalide: ' + e.message); }
  const res = await chrome.runtime.sendMessage({action:'importDataPlain', payload});
  if(res && res.ok){ alert('Import JSON réussi'); refresh(); }
  else alert('Import failed: ' + (res?.error || 'unknown'));
});
