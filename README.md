# Mnemosyne — Extension de protection de la vie privée

Prototype d'extension navigateur pour générer, gérer et injecter des identités fictives (Personas).

Structure principale:
- `manifest.json` — configuration MV3
- `src/background.js` — service worker, stockage et API interne
- `src/generator.js` — moteur de génération d'identités
- `src/content_script.js` — remplissage automatique des formulaires
- `src/popup.*`, `src/options.*` — UI

Modèles de données (local storage)
- `Persona` (stored under key `personas`):
	- `id` : string (unique)
	- `name` : string (nom thématique, ex: "Gaming")
	- `firstname`, `lastname` : string
	- `dob` : string (YYYY-MM-DD)
	- `address` : string
	- `avatar` : string (URL)
	- `job` : string
	- `phone` : string
	- optional: `container` / `containerName` / `containerColor` metadata

- `Compte_Site` (stored under key `comptes`):
	- `siteURL` : string
	- `personaId` : string (refers to `Persona.id`)
	- `username` : string
	- `aliasEmail` : string (email alias created)
	- `createdAt` : ISO timestamp

Autres clés de stockage:
- `personaContainers` : mapping objects { personaId, cookieStoreId, containerName, containerColor, containerIcon }
- `aliasConfig` : options for alias provider
- `personaConfig` : options such as `autoCreateContainer`

Prochaines étapes recommandées:
- Intégrer une API d'alias email (SimpleLogin/AnonAddy) côté background avec gestion sécurisée des clés.
- Ajouter isolation par conteneurs (Firefox) et notes sur cookie partitioning.
- Améliorer le mapping des champs et la détection des formulaires.
- Ajouter tests et packaging pour Chrome/Firefox.
- Isolation: support initial de Firefox Containers ajouté (création automatique et ouverture d'onglets dans le conteneur lié à une Persona). Chrome ne supporte pas les containers; fallback ouvre un onglet normal.
- Optionnel: modifier dynamiquement l'en-tête `User-Agent` ou utiliser `webRequest` si besoin — nécessite permissions supplémentaires et examen de confidentialité.
 - Export/Import: support pour export chiffré (PBKDF2 + AES-GCM) et export/import JSON non chiffré via l'interface Options.
Tests
- Pour lancer les tests unitaires (validators, crypto_utils, generator) :

```bash
npm install
npm test
```

Note: les tests utilisent `jest`. Ils vérifient le chiffrement/déchiffrement et les validateurs.
