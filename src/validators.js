// Minimal JSON Schema-like validators for Persona and Compte_Site
(function(exports){
  function isString(v){ return typeof v === 'string'; }
  function isISODate(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  const personaSchema = {
    required: ['id','name','firstname','lastname','dob','address','job','phone'],
    type: 'object'
  };

  const compteSchema = {
    required: ['siteURL','personaId','createdAt'],
    type: 'object'
  };

  function validatePersona(p){
    const errors = [];
    if(typeof p !== 'object' || p === null){ errors.push('persona must be object'); return {valid:false, errors}; }
    for(const k of personaSchema.required){ if(!p[k]) errors.push(`missing ${k}`); }
    if(p.dob && !isISODate(p.dob)) errors.push('dob must be YYYY-MM-DD');
    if(p.id && !isString(p.id)) errors.push('id must be string');
    return { valid: errors.length===0, errors };
  }

  function validateCompte(c){
    const errors = [];
    if(typeof c !== 'object' || c === null){ errors.push('compte must be object'); return {valid:false, errors}; }
    for(const k of compteSchema.required){ if(!c[k]) errors.push(`missing ${k}`); }
    // basic URL check
    if(c.siteURL && typeof c.siteURL === 'string' && !/^https?:\/\//.test(c.siteURL)) errors.push('siteURL should start with http(s)://');
    return { valid: errors.length===0, errors };
  }

  exports.validatePersona = validatePersona;
  exports.validateCompte = validateCompte;
})(typeof exports === 'undefined' ? this.validators = {} : exports);
