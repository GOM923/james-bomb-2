# Liaison — James Bomb 2

## ✅ RAPPORT FINAL — Jeu prêt à tester

**Date :** 2026-05-30  
**Fichier principal :** `index.html` (ouvrir dans un navigateur moderne)  
**Dépôt :** https://github.com/GOM923/james-bomb-2

---

## Récapitulatif des 4 étapes livrées

### Étape 1 — Grille & déplacements
- Grille 15×13 procédurale (murs fixes + piliers, blocs destructibles 65 %, zone de spawn protégée)
- Déplacement fluide avec **glissement contre les murs** (wall-slide pixel-perfect, axe séparé)
- Contrôles P1 : WASD / Flèches + Espace

### Étape 2 — Bombes & explosions
- Pose de bombe (Espace), minuterie 3 s, explosion en croix, portée configurable
- **Réactions en chaîne** récursives
- Particules avec gravité, 5 sons Web Audio (sans fichier externe)

### Étape 3 — Power-ups, score, vies, écrans de fin
- 4 power-ups cachés sous les blocs (30 % de chance) : 💣 +Bombe, 🔥 +Portée, ⚡ +Vitesse, ❤️ +Vie
- Collecte automatique en marchant sur le bonus révélé
- Score : +10 pts/bloc détruit, +50 pts/power-up
- 3 vies, invincibilité 2 s après chaque coup (joueur clignote)
- Écran **GAME OVER** (rouge) et **VICTOIRE !** (vert) avec score final
- Victoire : détruire 80 % des blocs destructibles

### Étape 4 — Polissage, menu & mode 2 joueurs
- **Menu rétro** : titre avec glow orange animé, scanlines, curseur ▶, police Courier New
- **Mode 2 joueurs** : P2 bleu en bas à droite, contrôles IJKL + Entrée
  - HUD bifurqué (vies P1 à gauche, vies P2 à droite, scores séparés)
  - Victoire = l'autre joueur est éliminé
- **Design rétro** : damier vert clair/foncé, briques 3D empilées, bombes avec ombre et reflet
- **Glissement (wall-slide)** : collision axe-séparé — le joueur glisse le long des murs/blocs au lieu de bloquer net
- Power-ups avec pulse animé (glow qui bat)
- Textes flottants en Courier New
- Retour au menu depuis les écrans de fin (Entrée ou Espace)

---

## Contrôles complets

| Action | Joueur 1 | Joueur 2 |
|--------|----------|----------|
| Déplacer | Flèches / WASD | I J K L |
| Poser bombe | Espace | Entrée |
| Menu | Flèches + Entrée | — |

---

## Testé et validé ✓

- Menu 1P/2P avec sélection curseur ✓
- Lancement de partie et grille générée ✓
- Glissement contre les murs (movedRight: true, blockedUp: true) ✓
- Power-ups (+bomb, +range, +speed, +life) modifient bien les stats ✓
- Écrans GAME OVER et VICTOIRE avec scores ✓
- Restart via menu (Entrée depuis écran de fin) ✓
- 5 sons Web Audio sans dépendance externe ✓

---

## 🎮 Le jeu est prêt à être testé !

Ouvrir `index.html` dans Chrome/Firefox et jouer.  
Prochaine évolution possible : ennemis IA, power-up bombe à distance, mode survie chronométré.
