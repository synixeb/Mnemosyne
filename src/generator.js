// Moteur de génération d'identités fictives
(function(exports){
  const firstNames = ["Alex", "Camille", "Léa", "Marc", "Sophie", "Julien", "Emma", "Lucas"];
  const lastNames = ["Martin","Dubois","Moreau","Leroy","Rousseau","Faure"];
  const jobs = ["Étudiant","Développeur","Designer","Vendeur","Journaliste","Freelance"];

  function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function generateUsername(keywords){
    const word = keywords && keywords.length ? keywords.split(/\s+/)[0] : rand(firstNames).toLowerCase();
    const suffix = Math.floor(100 + Math.random()*900);
    return `${word}${rand(lastNames).toLowerCase()}${suffix}`;
  }

  function generateDOB(ageMin=18, ageMax=60){
    const age = Math.floor(ageMin + Math.random()*(ageMax-ageMin));
    const year = new Date().getFullYear() - age;
    const month = String(1 + Math.floor(Math.random()*12)).padStart(2,'0');
    const day = String(1 + Math.floor(Math.random()*28)).padStart(2,'0');
    return `${year}-${month}-${day}`;
  }

  async function fetchFakeAvatar(){
    // Utilise DiceBear comme source d'avatar généré (visage stylisé).
    // Pour visages photoréalistes, remplacer par une API appropriée en respectant la vie privée.
    const seed = Math.random().toString(36).slice(2,10);
    return `https://api.dicebear.com/8.x/fun-emoji/svg?seed=${seed}`;
  }

  function generateAddress(){
    // Adresse simple et cohérente : ville + code postal plausible
    const villes = [
      {city:'Paris',zip:'75001'},{city:'Lyon',zip:'69001'},{city:'Marseille',zip:'13001'},{city:'Nantes',zip:'44000'},{city:'Toulouse',zip:'31000'}
    ];
    const v = rand(villes);
    const streetNum = 1 + Math.floor(Math.random()*200);
    const streetNames = ['Rue de la Paix','Avenue Victor Hugo','Boulevard Saint-Germain','Place de la République','Rue du Port'];
    return `${streetNum} ${rand(streetNames)}, ${v.zip} ${v.city}, France`;
  }

  function generateIdentity(themeName){
    const firstname = rand(firstNames);
    const lastname = rand(lastNames);
    const dob = generateDOB();
    const avatar = null; // fetch on demand
    const job = rand(jobs);
    const phone = `+33${Math.floor(600000000 + Math.random()*399999999)}`;
    return {
      id: `persona_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      name: themeName||'Persona',
      firstname,
      lastname,
      dob,
      address: generateAddress(),
      avatar,
      job,
      phone
    };
  }

  exports.generateUsername = generateUsername;
  exports.generateIdentity = generateIdentity;
  exports.fetchFakeAvatar = fetchFakeAvatar;
})(typeof exports === 'undefined' ? this.generator = {} : exports);
