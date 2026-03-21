# TOBEIMPROVED

## UI / UX / Behaviour

- `Sans PS` : dans le panneau "Session de discussion", le titre reste `Session de discussion` alors que l'expérience est un monologue. Ce wording hérité du mode PS/PSS brouille la sémantique du mode.

- Le mode sombre n'est pas persisté. Dans `App.tsx`, `darkMode` est gardé en state local simple, contrairement aux autres préférences stockées via `settings`. Un refresh ou une navigation inter-mode fait donc perdre le choix de thème.

- `Sans PS` : le bouton de `Correction IA` mélange état et action. Quand la correction est active, le libellé devient `Correction IA active`, alors que le clic suivant va en réalité désactiver cette source. Il manque une séparation claire entre "statut courant" et "action disponible".

- `Sans PS` : le bouton de `Correction IA` est visible même quand il est structurellement indisponible (avant la fin de session / sans transcript exploitable), mais sans explication contextuelle. On voit un bouton grisé, sans comprendre clairement "pourquoi maintenant ce n'est pas possible".

- `Sans PS` : la source d'évaluation peut changer (`Transcript brut` vs `Correction IA`) sans mécanisme explicite d'obsolescence du report déjà généré. Le toast dit bien "l'évaluation utilisera…", mais si un report existe déjà, rien ne signale clairement qu'il faut le relancer pour refléter cette nouvelle source.

- Le réglage `Afficher la transcription en direct` agit globalement sur `PS/PSS` et `Sans PS`, mais son wording ne l'explicite pas. En pratique, cela crée un effet de surprise : l'utilisateur peut croire avoir "cassé" la transcription d'un mode alors qu'il a seulement modifié un réglage partagé.

- Plusieurs barres d'actions sont forcées en `flex-nowrap` (`session controls`, actions du report, boutons de transcript). Cela crée un risque de débordement ou d'écrasement sur des largeurs intermédiaires.

- `Sans PS` : si `Évaluer automatiquement en fin de session` est activé, l'évaluation part immédiatement à la fin du monologue, avant de laisser à l'utilisateur la possibilité d'activer `Correction IA`. Cela court-circuite la promesse fonctionnelle "l'IA corrigée comme source d'évaluation optionnelle".
