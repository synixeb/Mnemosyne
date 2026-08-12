// Detection améliorée des formulaires et UI d'injection
(function(){
  function mapValueForField(input, persona, username, aliasEmail){
    const attr = ((input.name||'') + ' ' + (input.id||'') + ' ' + (input.placeholder||'')).toLowerCase();
    const type = (input.type||'').toLowerCase();
    if(type === 'email' || /\bemail\b|e-mail|mail/.test(attr)) return aliasEmail || '';
    if(type === 'password') return null;
    if(/firstname|given-name|prenom/.test(attr)) return persona.firstname || '';
    if(/lastname|family-name|nom/.test(attr)) return persona.lastname || '';
    if(/name\b(?!.*email)/.test(attr) && !/lastname|firstname/.test(attr)) return `${persona.firstname} ${persona.lastname}`;
    if(/user(name)?\b|pseudo|login/.test(attr)) return username || '';
    if(type === 'tel' || /phone|telephone|mobile/.test(attr)) return persona.phone || '';
    if(/address|street|adresse/.test(attr)) return persona.address || '';
    return null;
  }

  function injectIntoForm(persona, username, aliasEmail){
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
    inputs.forEach(input=>{
      try{
        const val = mapValueForField(input, persona, username, aliasEmail);
        if(val === null) return;
        if(val !== undefined){
          input.focus(); input.value = val;
          input.dispatchEvent(new Event('input',{bubbles:true}));
        }
      }catch(e){console.warn('inject error', e);}
    });
  }

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

})();

