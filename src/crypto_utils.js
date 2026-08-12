// Utilities: derive key from passphrase and AES-GCM encrypt/decrypt
(function(exports){
  const webCrypto = (() => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
    if (typeof require === 'function') {
      try {
        return require('node:crypto').webcrypto;
      } catch (error) {
        try {
          return require('crypto').webcrypto;
        } catch (innerError) {
          return undefined;
        }
      }
    }
    return undefined;
  })();

  if (!webCrypto) {
    throw new Error('Web Crypto API is not available in this environment.');
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function randBytes(len){
    const a = new Uint8Array(len); webCrypto.getRandomValues(a); return a;
  }

  async function deriveKey(password, salt){
    const baseKey = await webCrypto.subtle.importKey('raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
    return webCrypto.subtle.deriveKey({name:'PBKDF2', salt, iterations: 100000, hash:'SHA-256'}, baseKey, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }

  function toBase64(buf){
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  }

  function fromBase64(str){
    const binary = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    const arr = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) arr[i]=binary.charCodeAt(i);
    return arr;
  }

  async function encryptJSON(obj, password){
    const salt = randBytes(16);
    const iv = randBytes(12);
    const key = await deriveKey(password, salt);
    const plain = enc.encode(JSON.stringify(obj));
    const cipher = await webCrypto.subtle.encrypt({name:'AES-GCM', iv}, key, plain);
    // concat salt + iv + cipher
    const out = new Uint8Array(salt.byteLength + iv.byteLength + cipher.byteLength);
    out.set(new Uint8Array(salt), 0);
    out.set(new Uint8Array(iv), salt.byteLength);
    out.set(new Uint8Array(cipher), salt.byteLength + iv.byteLength);
    return toBase64(out.buffer);
  }

  async function decryptJSON(b64, password){
    const data = fromBase64(b64);
    if(data.length < 16+12) throw new Error('Invalid data');
    const salt = data.slice(0,16);
    const iv = data.slice(16, 28);
    const cipher = data.slice(28);
    const key = await deriveKey(password, salt);
    const plain = await webCrypto.subtle.decrypt({name:'AES-GCM', iv}, key, cipher);
    return JSON.parse(dec.decode(plain));
  }

  exports.encryptJSON = encryptJSON;
  exports.decryptJSON = decryptJSON;
})(typeof exports === 'undefined' ? this.cryptoUtils = {} : exports);
