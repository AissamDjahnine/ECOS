# TOBEIMPROVED

## UI / UX / Behaviour

- Le réglage `Afficher la transcription en direct` agit globalement sur `PS/PSS` et `Sans PS`, mais son wording ne l'explicite pas. En pratique, cela crée un effet de surprise : l'utilisateur peut croire avoir "cassé" la transcription d'un mode alors qu'il a seulement modifié un réglage partagé.

- Plusieurs barres d'actions sont forcées en `flex-nowrap` (`session controls`, actions du report, boutons de transcript). Cela crée un risque de débordement ou d'écrasement sur des largeurs intermédiaires.
