# TOBEIMPROVED

## UI / UX / Behaviour

- `Sans PS` : la source d'évaluation peut changer (`Transcript brut` vs `Correction IA`) sans mécanisme explicite d'obsolescence du report déjà généré. Le toast dit bien "l'évaluation utilisera…", mais si un report existe déjà, rien ne signale clairement qu'il faut le relancer pour refléter cette nouvelle source.

- Le réglage `Afficher la transcription en direct` agit globalement sur `PS/PSS` et `Sans PS`, mais son wording ne l'explicite pas. En pratique, cela crée un effet de surprise : l'utilisateur peut croire avoir "cassé" la transcription d'un mode alors qu'il a seulement modifié un réglage partagé.

- Plusieurs barres d'actions sont forcées en `flex-nowrap` (`session controls`, actions du report, boutons de transcript). Cela crée un risque de débordement ou d'écrasement sur des largeurs intermédiaires.
