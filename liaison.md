# Liaison — James Bomb 2

## Statut Claude (IA locale) — Étape 3 terminée

**Date :** 2026-05-30

---

## Étape 1 — Base (terminée)
- Grille 15×13, murs fixes, blocs destructibles, joueur, collisions, WASD/flèches

## Étape 2 — Bombes & explosions (terminée)
- Pose bombe (Espace), minuterie 3s, explosion en croix, réactions en chaîne, particules, 4 sons Web Audio

## Étape 3 — Bonus, score, vies, écrans fin (terminée)

### Power-ups cachés sous les blocs (30 % de chance)

| Icône | Type | Effet |
|-------|------|-------|
| 💣 | BombUp (orange) | +1 bombe max (jusqu'à 8) |
| 🔥 | RangeUp (rouge) | +1 portée explosion (jusqu'à 8) |
| ⚡ | SpeedUp (cyan) | +0.8 vitesse (jusqu'à 7) |
| ❤️ | LifeUp (vert) | +1 vie (jusqu'à 5) |

- Révélés quand leur bloc est détruit par une explosion
- Collectés automatiquement en marchant dessus
- +50 points + texte flottant coloré à la collecte

### Système de score
- +10 pts par bloc destructible détruit
- +50 pts par power-up collecté
- Affiché en temps réel dans le HUD (centre)

### Système de vies
- 3 vies au départ (❤️ dans le HUD gauche)
- Perd 1 vie si touché par une explosion
- 2 secondes d'invincibilité après chaque coup (joueur clignote)
- Game Over à 0 vies

### Écrans de fin
- **GAME OVER** (rouge) : 0 vies — affiche le score
- **VICTOIRE !** (vert) : 80 % des blocs détruits — affiche le score final
- **Entrée** pour rejouer (reset complet : grille, score, vies, stats joueur)

### HUD complet
- Gauche : ❤️ vies
- Centre : Score
- Droite : 💣bombes disponibles / 🔥portée / ⚡vitesse
- Bas : barre de progression (blocs détruits / objectif 80 %)

### Textes flottants
- "+10" blanc à chaque bloc détruit
- "+Vitesse", "+Bombe", etc. colorés à chaque power-up

### Testé et validé
- Power-ups révélés et collectés ✓  
  (bomb: 1→2 maxBombs, range: 2→3, speed: 3→3.8, life: 3→4, score: 0→200)
- Écran GAME OVER rouge avec score ✓
- Écran VICTOIRE ! vert avec score final ✓
- Restart complet via Entrée ✓ (stats + grille remis à zéro)

---

## Prêt pour l'étape suivante

En attente des directives pour l'étape 4 (ennemis avec IA, conditions de victoire enrichies).
