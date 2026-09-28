# Mentions et licences

Le code de ce site (HTML, CSS, JavaScript, traductions, tests) est publié sous **licence MIT** – voir [LICENSE](LICENSE).
Les éléments ci-dessous ne sont **pas** couverts par cette licence : ils restent la propriété de leurs auteurs, sous leurs propres conditions.

## Versions bureau : hors licence

La licence MIT couvre **uniquement cette version web**. Les applications de bureau **NeoDrive**, **DaThread**, **TauDrive**
et **TauConvert pour Windows** sont des œuvres distinctes : elles ne sont pas publiées sous licence MIT, leur code n'est pas
dans ce dépôt, et aucun droit de les copier, modifier ou redistribuer n'est accordé ici.

**TauConvert pour Windows** fait exception pour la diffusion : il est proposé en **téléchargement gratuit** (page TauConvert,
releases GitHub), pour un usage libre. Seul le programme compilé est distribué ; son code n'est pas publié et n'est pas sous
licence MIT. Cette version réduite ne contient que la conversion de dessins et le menu contextuel : ni gravure, ni pilotage
de machine, ni protocole machine, ni recette ou donnée d'atelier.

## Données DATRON

- `catalogue-datron.json`, `catalogue-datron.csv` et les références d'outils de `tools-demo.json` reprennent des références,
  cotes, désignations et prix liste publiés par **DATRON AG** (catalogue outils DATRON FR 2022 V4.0, liste de prix DE
  « Stand April 2026 », DATRON High-Speed Cutting Guide). Ces données appartiennent à DATRON AG ; elles sont reproduites à titre
  indicatif, et les documents DATRON font foi. Aucune donnée de coupe DATRON n'est publiée.
- Les coefficients du modèle de `coupe.js` ont été ajustés sur les tableaux du guide DATRON ; les valeurs exactes ne sont
  calculées qu'à partir de l'exemplaire du guide que l'utilisateur charge dans son navigateur.
- **DATRON** est une marque de DATRON AG. Ce site est indépendant, sans lien avec DATRON.

## Autres marques et formats

- **Cielle**, **ClTerm** : marques de leurs propriétaires. Les formats ISO et CLJOB sont reproduits à des fins d'interopérabilité.
- **Notepad++**, **CorelDRAW**, **Illustrator**, **Inkscape**, **LibreOffice** : marques de leurs propriétaires, citées pour décrire des fonctions.

## Bibliothèques chargées depuis des CDN (non incluses dans le dépôt)

| Bibliothèque | Usage | Licence |
|---|---|---|
| [CodeMirror 5](https://codemirror.net/5/) | éditeur SimPL | MIT |
| [pdf.js](https://mozilla.github.io/pdf.js/) | lecture des PDF et AI | Apache 2.0 |
| [opentype.js](https://opentype.js.org/) | vectorisation des textes | MIT |
| [JSZip](https://stuk.github.io/jszip/) | téléchargement des jobs en .zip | MIT ou GPLv3 (au choix) |
| [Lucide](https://lucide.dev/) | icônes | ISC |

## Polices

Chargées depuis Google Fonts et Fontsource : Barlow, Barlow Condensed, JetBrains Mono, Roboto, Roboto Mono, Oswald,
Playfair Display, Great Vibes, Stardos Stencil – sous **SIL Open Font License 1.1** ou **Apache 2.0** selon la police.
Les polices restent la propriété de leurs auteurs ; les tracés gravés produits avec elles sont libres d'usage.

## Tests

`tests/fixtures/` contient des codes de référence générés avec TauDrive (`barcode.py`) et, pour le Code 128,
avec [python-barcode](https://github.com/WhyNotHugo/python-barcode) (MIT). Seuls les résultats y figurent, pas le code de ces bibliothèques.

## Médias

- Les vidéos de démonstration sont hébergées sur YouTube ; leur musique utilise le **Salamander Grand Piano** (CC BY 3.0, Alexander Holm).
- `NeoDrive.png` : © RomDuch.
