/* Lecture des fichiers TypeEdit dans le navigateur : dessins (.vnd, .gvt) et symboles (.smb).
   Portage fidèle des lecteurs Python de VectorDrive (vectordrive/io/mfc.py, vnd.py, smb.py) : archive MFC (CArchive),
   calques, zones, courbes, contours (droites, coniques, Bézier cubiques), textes, cotes, codes-barres, cadrans,
   braille, trous, plaque et outils. Rend le JSON du format natif (document.json d'un .vdz).
   Non repris : images, reliefs (cartes de hauteurs), solides 3D, métafichiers, points et axes de construction
   (comptés dans doc.extra.te_ignores). Les glyphes des textes ne sont pas dans le fichier (TypeEdit garde le code,
   la police et la boîte de chaque caractère) : le texte est gardé, son contour est à recalculer (outline = null).

   Rappels du format :
   * en-tête 12 octets : signature, u32 début de l'archive, u32 ? ; aperçu ; table des polices ; archive MFC ;
   * unités du fichier : mètres ; points de contrôle en coordonnées homogènes (x·w, y·w, z·w, w), bit 0 du
     drapeau = nœud ; entre deux nœuds : 0 point → droite, 1 → conique (arc exact si w < 1), 2 → Bézier cubique. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const trv = (s, v) => tr(s, v).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const uid = () => (window.VDWeb && window.VDWeb.uid ? window.VDWeb.uid()
    : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '')
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')));

  const MAGIC = 0x00211173, GVT_MAGIC = 0x00290768, SMB_MAGIC = 0x00061074;
  const M_TO_MM = 1000;
  /* drapeaux d'un CObDao qui annoncent le format « moderne » (version, GUID, propriétés) */
  const MODERNE = [0x1000010, 0x1000100, 0x1001000];
  /* palette par défaut des outils TypeEdit (couleurs 1 à 8) */
  const COULEURS_TE = ['#000000', '#ff0000', '#00a000', '#0000ff', '#ff00ff', '#00c0c0', '#c08000', '#808080'];

  class ErreurArchive extends Error {}
  /* fin du flux d'un solide 3D (CObBrep) pas encore retrouvée */
  class FinBrep extends ErreurArchive {
    constructor(debut, posDonnees) { super(`solide 3D (CObBrep) à l'octet ${debut} : fin du flux introuvable`); this.debut = debut; this.posDonnees = posDonnees; }
  }

  /* ---------- décodage des chaînes ---------- */
  const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  let dec1252 = null, dec16 = null;
  try { dec1252 = new TextDecoder('windows-1252'); } catch (e) { dec1252 = null; }
  try { dec16 = new TextDecoder('utf-16le'); } catch (e) { dec16 = null; }
  const cp1252 = u8 => (dec1252 ? dec1252.decode(u8) : latin1(u8));
  const utf16 = u8 => {
    if (dec16) return dec16.decode(u8);
    let s = ''; for (let i = 0; i + 1 < u8.length; i += 2) s += String.fromCharCode(u8[i] | (u8[i + 1] << 8)); return s;
  };
  const octets = b => (b instanceof Uint8Array ? b : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));

  /* ---------- archive MFC (CArchive) ----------
     étiquette 16 bits : 0xFFFF = nouvelle classe (schéma, longueur du nom, nom), 0x8000|n = classe déjà vue,
     0x7FFF = étiquette longue sur 32 bits, autre = référence à un objet déjà lu (0 = pointeur nul) ;
     classes et objets partagent une seule table d'indices, qui commence à 1. */
  class Archive {
    constructor(u8, pos, lecteurs) {
      this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      this.pos = pos; this.lecteurs = lecteurs || {};
      this.table = [null];
      this.pile = [];                          // objets en cours de lecture (lecture partielle après une erreur)
      this.finsBrep = {};
    }
    besoin(n) { if (n < 0 || this.pos + n > this.u8.length) throw new ErreurArchive(`fin de fichier à ${this.pos} (lecture de ${n} octets)`); }
    u8b() { this.besoin(1); return this.u8[this.pos++]; }
    u16() { this.besoin(2); const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
    i16() { this.besoin(2); const v = this.dv.getInt16(this.pos, true); this.pos += 2; return v; }
    u32() { this.besoin(4); const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
    i32() { this.besoin(4); const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
    u64() { this.besoin(8); const lo = this.dv.getUint32(this.pos, true), hi = this.dv.getUint32(this.pos + 4, true); this.pos += 8; return hi * 4294967296 + lo; }
    f64() { this.besoin(8); const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }
    f64s(n) { this.besoin(8 * n); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = this.dv.getFloat64(this.pos + 8 * i, true); this.pos += 8 * n; return out; }
    brut(n) {
      if (n < 0 || this.pos + n > this.u8.length) throw new ErreurArchive(`longueur invalide ${n} à ${this.pos}`);
      const b = this.u8.subarray(this.pos, this.pos + n); this.pos += n; return b;
    }
    /* chaîne « maison » : longueur u32 puis octets (ANSI) */
    chaineStd() {
      const n = this.u32();
      if (n > (1 << 24)) throw new ErreurArchive(`chaîne trop longue (${n}) à ${this.pos - 4}`);
      return cp1252(this.brut(n));
    }
    /* CString MFC, ANSI ou UTF-16 (marqueur FF FE FF) */
    cstring() {
      let unicode = false, n = this.u8b();
      if (n === 0xFF) {
        n = this.u16();
        if (n === 0xFFFE) {
          unicode = true;
          n = this.u8b();
          if (n === 0xFF) { n = this.u16(); if (n === 0xFFFF) n = this.u32(); }
        } else if (n === 0xFFFF) n = this.u32();
      }
      return unicode ? utf16(this.brut(2 * n)) : cp1252(this.brut(n));
    }
    /* CArchive::ReadObject : étiquette, classe, puis données */
    lireObjet() {
      const debut = this.pos, tag = this.u16();
      const obTag = tag === 0x7FFF ? this.u32() : (tag & 0x8000 ? 0x80000000 : 0) + (tag & 0x7FFF);
      let cls;
      if (tag === 0xFFFF) {
        const schema = this.u16(), n = this.u16();
        cls = { nom: latin1(this.brut(n)), schema, estClasse: true };
        this.table.push(cls);
      } else if (obTag >= 0x80000000) {
        const idx = obTag - 0x80000000;
        if (idx >= this.table.length || !(this.table[idx] && this.table[idx].estClasse)) throw new ErreurArchive(`référence de classe invalide ${idx} à ${debut}`);
        cls = this.table[idx];
      } else {
        if (obTag >= this.table.length) throw new ErreurArchive(`référence d'objet invalide ${obTag} à ${debut}`);
        return this.table[obTag];
      }
      const obj = { cls, f: {}, enfants: [], debut, fin: 0 };
      this.table.push(obj);
      this.pile.push(obj);
      this.serialiser(obj);                     // en cas d'erreur, la pile reste en l'état
      this.pile.pop();
      obj.fin = this.pos;
      return obj;
    }
    serialiser(obj) {
      const lecteur = this.lecteurs[obj.cls.nom];
      if (!lecteur) throw new ErreurArchive(`classe inconnue « ${obj.cls.nom} » (schéma ${obj.cls.schema}) à l'octet ${obj.debut}`);
      lecteur(this, obj);
    }
    /* objet sérialisé directement par son parent (sans étiquette) */
    integre(nom, schema = 0) {
      const obj = { cls: { nom, schema, estClasse: true }, f: {}, enfants: [], debut: this.pos, fin: 0 };
      this.serialiser(obj);
      obj.fin = this.pos;
      return obj;
    }
  }
  const nouvelObjet = (nom, pos = 0) => ({ cls: { nom, schema: 0, estClasse: true }, f: {}, enfants: [], debut: pos, fin: 0 });

  /* ---------- lecteurs de classes ---------- */
  function guid(ar, f) {                         // CObjGuid::Serialize
    const ver = ar.u32();
    f.guid = Array.from(ar.brut(16), b => b.toString(16).padStart(2, '0')).join('');
    const props = {};
    if (ver < 3) {
      if (ver === 2) for (let i = 0, n = ar.u32(); i < n; i++) { const k = ar.chaineStd(); props[k] = ar.chaineStd(); }
    } else for (let i = 0, n = ar.u32(); i < n; i++) { const k = ar.cstring(); props[k] = ar.cstring(); }
    f.guid_props = props;
  }
  function mapParametres(ar) {
    const n = ar.u32();
    if (n > 0) throw new ErreurArchive(`CMapParam non encore décodé (${n} paramètres) à ${ar.pos}`);
  }
  /* CObDao::Serialize — en-tête commun à tous les objets du dessin */
  function lireObdao(ar, obj) {
    const f = obj.f;
    f.bbox = ar.f64s(6);
    const flags = ar.u32();
    f.flags = flags;
    if (!MODERNE.includes((flags & ~1) >>> 0)) return;
    const ver = ar.u32();
    f.version = ver;
    if (ver < 1) return;
    f.f88 = ar.u32();
    if (ver >= 2 && ver <= 7) f.name = ar.chaineStd();
    if (ver >= 3) f.f8c = ar.u32();
    if (ver < 4) return;
    f.f90 = ar.u32(); f.f94 = ar.u32();
    if (ver === 6) f.guid = Array.from(ar.brut(16), b => b.toString(16).padStart(2, '0')).join('');
    else if (ver > 6) guid(ar, f);
    const props = {};
    if (ver < 10) {
      if (ver > 7) for (let i = 0, n = ar.u64(); i < n; i++) { const k = ar.chaineStd(); props[k] = ar.chaineStd(); }
      if (ver > 8) mapParametres(ar);
    } else {
      for (let i = 0, n = ar.u64(); i < n; i++) { const k = ar.cstring(); props[k] = ar.cstring(); }
      mapParametres(ar);
    }
    f.props = props;
    if (!('name' in f) && 'NAME' in props) f.name = props.NAME;
  }
  const mode = obj => (obj.f.flags & ~1) >>> 0;
  /* enfant lu par référence ; une référence vers un objet dont la lecture n'est pas terminée (pointeur de retour
     d'anciens TypeEdit) n'est pas comptée comme enfant (sinon le dessin boucle) */
  function ajouterEnfant(obj, ch) { if (ch && ch.fin > 0) obj.enfants.push(ch); }
  function lireObdaoFin(ar, obj) {
    lireObdao(ar, obj);
    const m = mode(obj);
    if (m === 0x1000010 || m === 0x1000100) obj.f.fin = ar.u32();
  }
  /* CObDaoCtn::Serialize — objet qui contient d'autres objets, puis `nFixes` objets « fixes » sans étiquette */
  function lireObdaoCtn(ar, obj, nFixes = 0) {
    lireObdao(ar, obj);
    const m = mode(obj);
    if (m === 0x1001000) {
      obj.f.ctn_version = ar.u32();
      const n = ar.u32(), slots = [];
      for (let i = 0; i < n; i++) { const ch = ar.lireObjet(); slots.push(ch); ajouterEnfant(obj, ch); }
      obj.f.slots = slots;
    } else if (m === 0x1000100) {
      const lst = ar.lireObjet();               // format ancien : les enfants passent par un objet CObList
      obj.f.oblist = lst;
      if (lst) for (const c of (lst.f && lst.f.slots) || lst.enfants || []) ajouterEnfant(obj, c);
    } else {
      const lst = nouvelObjet('CObList', ar.pos);   // plus ancien encore : CObList::Serialize en ligne
      corpsOblist(ar, lst);
      obj.f.inline_list = lst;
      for (const c of lst.f.slots) ajouterEnfant(obj, c);
    }
    const fixes = [];
    for (let i = 0; i < nFixes; i++) fixes.push(ar.integre('CObDaoCtn', 0));
    if (fixes.length) obj.f.fixed = fixes;
    if (m === 0x1000010 || m === 0x1000100) obj.f.ctn_tail = ar.u32();
  }
  function corpsOblist(ar, obj) {                 // CObList::Serialize : compte (WORD, ou 0xFFFF + DWORD), objets
    let n = ar.u16();
    if (n === 0xFFFF) n = ar.u32();
    const slots = [];
    for (let i = 0; i < n; i++) { const ch = ar.lireObjet(); slots.push(ch); ajouterEnfant(obj, ch); }
    obj.f.slots = slots;
  }
  /* CCalque : zones, repère (schéma ≥ 8), nom, attributs en ligne (outil = 3ᵉ entier), nom du repère */
  function lireCalque(ar, obj) {
    const v = obj.cls.schema;
    lireObdaoCtn(ar, obj, v - 1 > 6 ? 1 : 0);
    obj.f.layer_name = ar.cstring();
    const nAttr = 4 * Math.min(Math.max(v - 1, 0), 4) + (v > 5 ? 16 : 0);
    obj.f.attrs = ar.brut(nAttr);
    if (v > 6) obj.f.axis_name = v < 9 ? ar.chaineStd() : ar.cstring();
  }
  const FIN_COURBE = 24;                          // fin de CCourbe lue en ligne (couleur TypeEdit en +8)
  function lireCourbe(ar, obj) { lireObdaoCtn(ar, obj); obj.f.trailer = ar.brut(FIN_COURBE); }
  /* CContour : type (0 ouvert, 1 fermé trigo, 2 fermé horaire), points (x, y, z, w, drapeau), propriétés */
  function lireContour(ar, obj) {
    lireObdaoFin(ar, obj);
    const f = obj.f;
    f.type = ar.i32();
    const n = ar.u32();
    if (n > 10000000) throw new ErreurArchive(`nombre de points aberrant ${n} à ${ar.pos - 4}`);
    ar.besoin(36 * n);
    const pts = new Array(n), dv = ar.dv;
    let fini = true;
    for (let i = 0, p = ar.pos; i < n; i++, p += 36) {
      const x = dv.getFloat64(p, true), y = dv.getFloat64(p + 8, true), z = dv.getFloat64(p + 16, true), w = dv.getFloat64(p + 24, true);
      if (fini && !(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(w))) fini = false;
      pts[i] = [x, y, z, w, dv.getUint32(p + 32, true)];
    }
    ar.pos += 36 * n;
    f.points = pts;
    f.finite = fini;
    if (obj.cls.schema > 1) {
      const ext = ar.lireObjet();
      f.ext_obj = ext;
      if (ext) f.ext = ext.f;
    }
  }
  /* CPropertyExtend : couleur, épaisseur, attributs */
  function lirePropriete(ar, obj) {
    const f = obj.f, v = ar.i32();
    f.version = v;
    if (v > 0) { f.f10 = ar.u64(); f.f0c = ar.u32(); f.color = ar.u32(); }
    if (v > 1) f.fill_color = ar.u32();
    if (v > 2) {
      for (let i = 0; i < 4; i++) ar.u32();
      for (let i = 0, n = ar.i32(); i < n; i++) ar.u32();
      ar.u32(); ar.u32();
    }
    if (v > 3) { ar.u64(); for (let i = 0, n = ar.i32(); i < n; i++) ar.f64(); }
    if (v < 5) return;
    ar.f64s(4);
    ar.brut(Math.max(0, ar.i32()));
    if (ar.u32()) f.zone_a = ar.integre('CZone', 1);
    ar.brut(Math.max(0, ar.i32()));
    if (ar.u32()) f.zone_b = ar.integre('CZone', 1);
  }
  /* CVnImage : image bitmap (ignorée, lue pour avancer) */
  function lireImage(ar, obj) {
    lireObdaoFin(ar, obj);
    const f = obj.f, v = obj.cls.schema;
    f.geom = ar.f64s(5);
    ar.brut(Math.max(0, ar.i32()));
    if (v < 2) return;
    f.f128 = ar.u32();
    if (v === 4 || v === 5) {
      f.has_courbe = ar.u32();
      if (f.has_courbe) { const ch = ar.lireObjet(); f.courbe = ch; ajouterEnfant(obj, ch); }
    }
  }

  /* --- texte --- */
  function attrPara(ar) { const st = ar.pos, v = ar.u32(); ar.brut(4 + 16 + (v >= 2 ? 8 : 0) + (v >= 3 ? 16 : 0) + (v > 3 ? 4 : 0)); return ar.u8.subarray(st, ar.pos); }
  function attrLigne(ar) { const st = ar.pos, v = ar.u32(); ar.brut(4 + 40 + (v > 1 ? 8 : 0) + (v > 2 ? 4 : 0) + (v > 3 ? 8 : 0)); return ar.u8.subarray(st, ar.pos); }
  const TAILLE_CAR = { 2: 80, 3: 84, 4: 92, 5: 204 };   // CTxtAttrChar selon sa version (version comprise)
  function attrCar(ar) {
    const st = ar.pos, v = ar.u32();
    if (!TAILLE_CAR[v]) throw new ErreurArchive(`attribut de caractère version ${v} non décodé à ${st}`);
    ar.brut(TAILLE_CAR[v] - 4);
    return ar.u8.subarray(st, ar.pos);
  }
  /* code Unicode, indice de police (table du fichier), hauteur des capitales (m), rapport de largeur */
  function attrsCar(raw) {
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    return { version: dv.getUint32(0, true), code: dv.getUint32(4, true), font: dv.getUint32(8, true),
      height: dv.getFloat64(12, true), ratio: dv.getFloat64(20, true) };
  }
  function txtPara(ar) {
    const para = attrPara(ar), lines = [];
    for (let i = 0, n = ar.u32(); i < n; i++) lines.push(attrLigne(ar));
    const n = ar.u32();
    if (n > 1000000) throw new ErreurArchive(`nombre de caractères aberrant ${n}`);
    const chars = [];
    for (let i = 0; i < n; i++) chars.push(attrCar(ar));
    return { para, lines, chars };
  }
  /* CParagraphe (texte vivant) : attributs, caractères, boîte de chaque caractère (4 coins float32, m), courbes */
  function lireParagraphe(ar, obj) {
    if (obj.cls.schema < 5) throw new ErreurArchive('texte TypeEdit ancien (CParagraphe < 5) non décodé');
    lireObdaoFin(ar, obj);
    const f = obj.f;
    f.f8 = ar.u32(); ar.brut(8);
    f.has_para2 = ar.u32(); f.f160 = ar.u32();
    f.origin = ar.f64s(3);
    f.para1 = txtPara(ar);
    if (f.has_para2) f.para2 = txtPara(ar);
    f.f164 = ar.u32();
    ar.brut(ar.u32());
    f.cube = ar.f64s(6);
    const nb = ar.u32();
    ar.besoin(36 * nb);
    f.boxes = [];
    for (let i = 0; i < nb; i++) {
      const p = ar.pos + 36 * i, b = [];
      for (let k = 0; k < 8; k++) b.push(ar.dv.getFloat32(p + 4 * k, true));
      b.push(ar.dv.getUint32(p + 32, true));
      f.boxes.push(b);
    }
    ar.pos += 36 * nb;
    f.courbe1 = ar.lireObjet();
    f.courbe2 = ar.lireObjet();
    for (const c of [f.courbe1, f.courbe2]) if (c) obj.enfants.push(c);
    if (obj.cls.schema > 5) f.f148 = ar.u32();
  }
  function texteParagraphe(obj) {
    let out = '';
    for (const raw of obj.f.para1.chars) {
      const c = attrsCar(raw).code;
      if (c === 0) break;
      out += c === 13 ? '\n' : (c <= 0x10FFFF ? String.fromCodePoint(c) : '�');
    }
    return out;
  }
  function lireTravail(ar, obj) { lireObdaoCtn(ar, obj); obj.f.tail_offset = ar.pos; }

  /* --- fin de document : support, plans, grille, variables, outils, machine --- */
  function lirePlan(ar) { const o = nouvelObjet('CPlan'); lireObdao(ar, o); return [o.f.bbox, ar.f64(), ar.u32()]; }
  /* CVariable (schéma ≥ 2) : n listes de k chaînes UTF-16 (nombre de caractères, caractères, nul), puis u32 */
  function lireVariable(ar, obj) {
    const n = ar.u32();
    if (n > 10000) throw new ErreurArchive(`variables TypeEdit : ${n} listes à ${ar.pos - 4}`);
    const listes = [];
    for (let i = 0; i < n; i++) {
      const vals = [];
      for (let j = 0, k = ar.u32(); j < k; j++) {
        const m = ar.u32();
        if (m > 100000) throw new ErreurArchive(`variable TypeEdit de ${m} caractères à ${ar.pos - 4}`);
        vals.push(utf16(ar.brut(2 * m)));
        if (m) { const z = ar.brut(2); if (z[0] || z[1]) throw new ErreurArchive(`variable TypeEdit non terminée à ${ar.pos - 2}`); }
      }
      listes.push(vals);
    }
    obj.f.variables = listes;
    obj.f.f18 = ar.u32();
  }
  function lireFinDocument(ar) {
    const out = {};
    const sup = nouvelObjet('CSupport');
    lireObdaoCtn(ar, sup);
    out.support_bbox = sup.f.bbox;
    out.planes = [];
    for (let i = 0; i < 12; i++) out.planes.push(lirePlan(ar));
    out.support_u32 = ar.u32();
    lireObdaoCtn(ar, nouvelObjet('CPlanRepere'));
    lireObdaoFin(ar, nouvelObjet('CGrille'));
    out.grille = ar.f64s(7);
    const avant = ar.lecteurs;
    ar.lecteurs = Object.assign({}, avant, { CVariable: lireVariable });
    let v;
    try { v = ar.lireObjet(); } finally { ar.lecteurs = avant; }
    out.variables = v && v.f && v.f.variables ? v.f.variables : [];
    out.model_version = ar.u32();
    const n = ar.i16(), outils = [];
    for (let i = 0; i < Math.max(0, Math.min(n, 200)); i++) {
      const couleur = ar.u32(), nom = ar.cstring(), taille = ar.u32();
      ar.brut(taille);
      outils.push([couleur, nom]);
    }
    out.tools = outils;
    out.machine = ar.cstring();
    out.postpro = ar.cstring();
    out.travel = ar.f64s(6);
    ar.brut(ar.u32());
    out.gii = ar.u32();
    return out;
  }
  /* COLORREF Windows (0x00BBGGRR) → '#rrggbb' */
  const hexCouleur = c => '#' + [c & 0xFF, (c >>> 8) & 0xFF, (c >>> 16) & 0xFF].map(x => x.toString(16).padStart(2, '0')).join('');

  /* --- cotations : en-tête, bloc « tag_Cotation_Infos », texte imposé (UTF-16), cube, 3 points, propriétés, dessin --- */
  const INFO_COTE = [
    ['u32'], ['u32'], ['u32'], ['u32'], ['f64'], ['f64'], ['f64'], ['u32'], ['f64'],
    ['u32'], ['f64'], ['f64'], ['u32'], ['u32'], ['f64'], ['f64'], ['wx'],
    ['ver', 0x1131, [['f64'], ['wx']]],
    ['ws'], ['ws'], ['ws'],
    ['u32'], ['u32'], ['f64'], ['f64'], ['f64'], ['u32'], ['u32'], ['u32'], ['u32'], ['u32'],
    ['u32'], ['f64'], ['f64'], ['f64'], ['f64'], ['f64'], ['f64'], ['f64'],
    ['u32'], ['u32'], ['u32'], ['bytes'], ['u32'], ['bytes'],
  ];
  function lireDisposition(ar, disp, version) {
    for (const op of disp) {
      const k = op[0];
      if (k === 'u32') ar.u32();
      else if (k === 'f64') ar.f64();
      else if (k === 'ws') { const n = ar.i32(); if (n > 0) ar.brut(2 * n); }
      else if (k === 'wx') { const n = ar.i32(); ar.u32(); if (n > 0) ar.brut(2 * n); }
      else if (k === 'bytes') { const n = ar.i32(); if (n > 0) ar.brut(n); }
      else if (k === 'ver') { if (version >= op[1]) lireDisposition(ar, op[2], version); }
    }
  }
  function lireCotation(ar, obj) {
    lireObdaoFin(ar, obj);
    const f = obj.f, v = f.cot_version = ar.u32();
    lireDisposition(ar, INFO_COTE, v);
    const n = ar.i32();
    f.text = n > 0 ? utf16(ar.brut(2 * n)) : '';
    f.cube = ar.f64s(6);
    f.v328 = ar.f64s(3);
    f.pts = ar.f64s(9);
    if (v > 0x112F) {
      for (let i = 0; i < 4; i++) ar.integre('CPropertyExtend');
      f.has_zone = ar.u32();
      f.zone = f.has_zone ? ar.lireObjet() : null;
      if (f.zone) obj.enfants.push(f.zone);
    }
    if (v > 0x1643) f.pts2 = ar.f64s(9);
  }
  function lireMarqueur(ar, obj) {               // CMarker : point de construction
    lireObdaoFin(ar, obj);
    obj.f.pos = ar.f64s(3);
    obj.f.ints = []; for (let i = 0; i < 7; i++) obj.f.ints.push(ar.u32());
  }
  /* --- codes-barres --- */
  const chaineCode = (ar, schema) => (schema < 4 ? ar.brut(ar.u32()) : ar.cstring());
  function lireCodeBarres(ar, obj) {             // CObBCode
    lireObdaoFin(ar, obj);
    const v = obj.cls.schema, f = obj.f;
    f.has_zone = ar.u8b();
    f.zone = f.has_zone ? ar.lireObjet() : null;
    const n = ar.u32();
    f.norme = n >= 4 ? ar.brut(n - 4) : new Uint8Array(0);
    f.data = chaineCode(ar, v);
    if (v >= 2) {
      f.var_flag = ar.u8b(); ar.u32();
      f.var = f.var_flag ? chaineCode(ar, v) : null;
      if (v > 2) ar.f64();
    }
  }
  function lireNouveauCode(ar, obj) {            // CObNewBCode1D / 2D (TypeEdit V15)
    lireObdaoFin(ar, obj);
    const f = obj.f;
    f.has_zone = ar.u8b();
    f.zone = f.has_zone ? ar.lireObjet() : null;
    const n = ar.u32();
    if (n < 4 || n - 4 > ar.u8.length - ar.pos) throw new ErreurArchive(`code-barres TypeEdit : bloc de norme de ${n} octets à ${ar.pos - 4}`);
    f.norme = ar.brut(n - 4);
    f.data = ar.cstring();
    f.var_flag = ar.u8b(); f.adv_var = ar.u8b(); ar.u32();
    f.var = f.var_flag || f.adv_var ? ar.cstring() : null;
    ar.f64();
    if (obj.cls.schema > 1) { ar.brut(0x58); ar.brut(0x50); }
  }
  const CODES_BARRES = { CObBCode: '', CObNewBCode1D: '1D', CObNewBCode2D: '2D' };
  const texteCode = v => (v instanceof Uint8Array ? latin1(v) : String(v || ''));
  function normeCode(obj) {
    const b = obj.f.norme || new Uint8Array(0), s = latin1(b.subarray(4)), m = /^[\x20-\x7e]{3,}/.exec(s);
    return m ? m[0] : '';
  }
  /* --- cadrans (CObCadran, MaudeCadran.dll) --- */
  function reglagesCadran(ar, schema) {
    const v = { has: ar.u32() };
    if (v.has) {
      ar.brut(0x70 + 36);
      v.police = ar.brut(Math.max(0, ar.i32()));
      ar.brut(40);
      ar.brut(Math.max(0, ar.i32()));
      ar.brut(8);
      v.texte = ar.brut(Math.max(0, ar.i32()));
      const n = ar.i32();
      if (n > 0) { v.graduations = ar.brut(schema < 6 ? n : 2 * n); ar.brut(48 * n); }
    }
    ar.u32();
    attrCar(ar); attrLigne(ar); attrPara(ar);
    return v;
  }
  function texteCadran(b, schema) {
    if (!b || !b.length) return '';
    if (schema >= 6) return utf16(b.subarray(0, Math.floor(b.length / 2) * 2)).replace(/\0+$/, '');
    return cp1252(b).replace(/\0+$/, '');
  }
  function lireCadran(ar, obj) {
    lireObdaoFin(ar, obj);
    const v = obj.cls.schema, f = obj.f;
    if (v >= 1 && v <= 7) {
      for (const k of ['courbe', 'zone']) {
        f['has_' + k] = ar.u32();
        f[k] = f['has_' + k] ? ar.lireObjet() : null;
        if (f[k]) obj.enfants.push(f[k]);
      }
      ar.u32(); ar.u32();
      if (v < 7) {
        const n = ar.u32();
        if (n) {
          f.name = v < 6 ? ar.brut(v < 2 ? 4 : n) : ar.brut(2 * n);
          if (v >= 6) ar.brut(6 * n);
        }
      } else f.name = ar.cstring();
      f.has_var = ar.u32();
      f.var = f.has_var ? ar.lireObjet() : null;
      f.has_vernier = ar.u32();
      f.vernier = f.has_vernier ? reglagesCadran(ar, v) : null;
    }
    if (v > 2) {
      ar.integre('CPropertyExtend'); ar.integre('CPropertyExtend');
      if (v > 3 && f.vernier && f.vernier.has) ar.f64();
    }
  }
  const nomCadran = obj => (typeof obj.f.name === 'string' ? obj.f.name : texteCadran(obj.f.name, obj.cls.schema));
  /* --- braille (CObBraille, MaudeExt.dll) --- */
  function lireBraille(ar, obj) {
    lireObdaoFin(ar, obj);
    const v = obj.cls.schema, f = obj.f;
    if (!(v >= 1 && v <= 10)) throw new ErreurArchive(`texte braille TypeEdit : schéma ${v} inconnu`);
    const enfant = cle => { if (ar.u32()) { const o = ar.lireObjet(); f[cle] = o; ajouterEnfant(obj, o); } };
    const texte = cle => {
      if (v >= 9) { const s = ar.cstring(); if (cle) f[cle] = s; return; }
      const n = ar.u32();
      if (n) { const b = ar.brut(v < 2 ? 4 : n); if (cle) f[cle] = b; }
    };
    enfant('par'); enfant('zone');
    ar.u32();
    texte('texte'); texte('texte2');
    for (let i = 0; i < 4; i++) ar.u32();
    attrCar(ar); attrLigne(ar); attrPara(ar);
    ar.f64(); ar.f64(); ar.f64();
    ar.u32(); ar.u32(); ar.u32(); ar.f64(); ar.f64();
    if (v >= 9) {
      ar.cstring(); ar.f64();
      for (let i = 0; i < 3; i++) ar.u32();
      if (v === 10) { ar.f64(); ar.u32(); }
    } else if (v > 2) {
      texte(null);                                // texte d'affichage
      if (v > 3) {
        texte('police');
        if (v > 4) ar.f64();
        for (const depuis of [6, 7, 8]) if (v >= depuis) ar.u32();
      }
    }
  }
  const texteBraille = (obj, cle = 'texte') => { const t = obj.f[cle]; return t instanceof Uint8Array ? cp1252(t).replace(/\0+$/, '') : (t || ''); };
  function lireTrou(ar, obj) { lireMarqueur(ar, obj); obj.f.rayon = ar.f64(); obj.f.profondeur = ar.f64(); }

  /* --- solides 3D (CObBrep) : flux SMLib sans longueur, fin retrouvée par relectures --- */
  function lireBrep(ar, obj) {
    lireObdaoFin(ar, obj);
    ar.u32();
    const fin = ar.finsBrep[obj.debut];
    if (fin === undefined) throw new FinBrep(obj.debut, ar.pos);
    ar.brut(fin - ar.pos);
  }
  const OCTETS_DRAPEAUX = [];
  for (const fl of MODERNE) for (const b of [0, 1]) { const v = (fl | b) >>> 0; OCTETS_DRAPEAUX.push([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }
  function chercher(u8, motif, depuis) {
    const n = motif.length, b0 = motif[0];
    for (let i = Math.max(0, depuis), fin = u8.length - n; i <= fin; i++) {
      if (u8[i] !== b0) continue;
      let k = 1; while (k < n && u8[i + k] === motif[k]) k++;
      if (k === n) return i;
    }
    return -1;
  }
  function enteteVraisemblable(u8, dv, p) {
    if (p < 0 || p + 56 > u8.length) return false;
    const bb = []; for (let i = 0; i < 6; i++) bb.push(dv.getFloat64(p + 8 * i, true));
    if (bb.every(v => Math.abs(v) >= 1e99)) { if (!(bb[0] > 0 && 0 > bb[3])) return false; }
    else if (!(bb.every(v => Number.isFinite(v) && Math.abs(v) < 100) && bb[0] <= bb[3] && bb[1] <= bb[4] && bb[2] <= bb[5])) return false;
    const ver = dv.getUint32(p + 52, true);
    return ver >= 1 && ver <= 30;
  }
  function finsCandidates(u8, debut, table) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = new Set();
    const noms = Object.keys(LECTEURS).map(n => [n, Array.from(n, c => c.charCodeAt(0))]);
    for (const fb of OCTETS_DRAPEAUX) {
      let i = chercher(u8, fb, debut + 48);
      while (i >= 0) {
        const p = i - 48;
        if (enteteVraisemblable(u8, dv, p)) {
          out.add(p);
          const tag = p >= debut + 2 ? dv.getUint16(p - 2, true) : 0;
          if ((tag & 0x8000) && tag !== 0xFFFF) {
            const idx = tag & 0x7FFF;
            if (idx < table.length && table[idx] && table[idx].estClasse && LECTEURS[table[idx].nom]) out.add(p - 2);
          }
          for (const [, nb] of noms) {
            const q = p - 6 - nb.length;
            if (q >= debut && u8[q] === 0xFF && u8[q + 1] === 0xFF && dv.getUint16(q + 4, true) === nb.length && nb.every((c, k) => u8[q + 6 + k] === c)) out.add(q);
          }
        }
        i = chercher(u8, fb, i + 1);
      }
    }
    return [...out].sort((a, b) => a - b);
  }
  function lireAxe(ar, obj) {                     // CCenterLine : axe de construction
    lireObdaoFin(ar, obj);
    obj.f.p = ar.f64s(6);
    for (let i = 0; i < 3; i++) ar.u32();
  }
  /* --- objets des GVT : relief (carte de hauteurs) et métafichier --- */
  function carteZ(ar) {
    const z = { origin: ar.f64s(2), f: ar.f64(), step: ar.f64s(2) };
    const w = ar.i32(), h = ar.i32();
    if (w < 0 || h < 0 || w * h > 200000000) throw new ErreurArchive(`carte de hauteurs aberrante ${w} × ${h} à ${ar.pos}`);
    z.w = w; z.h = h;
    ar.brut(4 * w * h);
    return z;
  }
  function lireRelief(ar, obj) {                  // CVbitmap
    lireObdaoFin(ar, obj);
    const f = obj.f, v = obj.cls.schema;
    f.map = carteZ(ar);
    if (v > 1) {
      const hv = ar.u32(), n = ar.u32();
      if (n) throw new ErreurArchive(`relief avec historique d'édition (${n} commandes) : pas encore lu par VectorDrive`);
      if (hv > 2) ar.u32();
      if (v >= 3) ar.u8b();
      if (v >= 4) ar.u8b();
      if (v >= 5) {
        if (ar.u8b()) carteZ(ar);
        if (v === 6) ar.brut(16);
      }
    }
  }
  function lireMetafichier(ar, obj) {             // CMetaObj : métafichier Windows (EMF) dans un cadre
    lireObdaoFin(ar, obj);
    ar.u32();
    obj.f.geom = ar.f64s(5);
    ar.brut(ar.u32());
  }
  const COTATIONS = ['CCotationLineaire', 'CCotationHorizontale', 'CCotationVerticale', 'CCotationLaterale',
    'CCotationAngle', 'CCotationRadial', 'CCotationDiameter'];
  const LECTEURS = {
    CTravail: lireTravail, CCalque: lireCalque, CZone: (ar, o) => lireObdaoCtn(ar, o), CCourbe: lireCourbe,
    CContour: lireContour, CPropertyExtend: lirePropriete, CObList: corpsOblist, CVnImage: lireImage,
    CObDaoCtn: (ar, o) => lireObdaoCtn(ar, o), CParagraphe: lireParagraphe, CMarker: lireMarqueur,
    CObBCode: lireCodeBarres, CObNewBCode1D: lireNouveauCode, CObNewBCode2D: lireNouveauCode, CObCadran: lireCadran,
    CObBraille: lireBraille, CTrou: lireTrou, CCenterLine: lireAxe, CObBrep: lireBrep, CVbitmap: lireRelief,
    CMetaObj: lireMetafichier,
  };
  for (const n of COTATIONS) LECTEURS[n] = lireCotation;

  /* ---------- géométrie ---------- */
  /* points TypeEdit (homogènes, drapeau bit 0 = nœud) → segments en mm */
  function segmentsContour(points, ferme) {
    const n = points.length;
    if (n < 2) return [];
    const k = M_TO_MM;
    let seq;
    if (ferme) {
      // le premier nœud est le dernier point marqué : la liste tourne pour commencer par lui
      let dernier = -1;
      for (let i = n - 1; i >= 0; i--) if (points[i][4] & 1) { dernier = i; break; }
      if (dernier < 0) return [];
      seq = points.slice(dernier).concat(points.slice(0, dernier));
      seq.push(seq[0]);
    } else seq = points;
    const xy = seq.map(([x, y, , w]) => ((w > 1e-15 || w < -1e-15) ? [x / w * k, y / w * k] : [x * k, y * k]));
    const segs = [];
    let debut = xy[0], c0 = -1, nc = 0;
    for (let j = 1; j < seq.length; j++) {
      if (!(seq[j][4] & 1)) { if (nc === 0) c0 = j; nc++; continue; }
      const fin = xy[j];
      if (nc === 0) {
        const dx = fin[0] - debut[0], dy = fin[1] - debut[1];
        if (dx * dx + dy * dy > 1e-18) segs.push(['L', debut[0], debut[1], fin[0], fin[1]]);
      } else if (nc === 1) {
        const w = seq[c0][3];
        segs.push(['Q', debut[0], debut[1], xy[c0][0], xy[c0][1], fin[0], fin[1], (w > 1e-15 || w < -1e-15) ? w : 1.0]);
      } else if (nc === 2) {
        segs.push(['C', debut[0], debut[1], xy[c0][0], xy[c0][1], xy[c0 + 1][0], xy[c0 + 1][1], fin[0], fin[1]]);
      } else {
        let prec = debut;                          // degré > 3 : rare ; on passe par les points de contrôle
        for (let q = c0; q < c0 + nc; q++) { segs.push(['L', prec[0], prec[1], xy[q][0], xy[q][1]]); prec = xy[q]; }
        segs.push(['L', prec[0], prec[1], fin[0], fin[1]]);
      }
      debut = fin;
      nc = 0;
    }
    return segs;
  }
  /* matrice affine (a, b, c, d, e, f) : x' = a·x + c·y + e, y' = b·x + d·y + f */
  const mul = (m, o) => [m[0] * o[0] + m[2] * o[1], m[1] * o[0] + m[3] * o[1], m[0] * o[2] + m[2] * o[3], m[1] * o[2] + m[3] * o[3],
    m[0] * o[4] + m[2] * o[5] + m[4], m[1] * o[4] + m[3] * o[5] + m[5]];
  const appliquer = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const rotation = deg => { const t = deg * Math.PI / 180, co = Math.cos(t), si = Math.sin(t); return [co, si, -si, co, 0 - co * 0 + si * 0, 0 - si * 0 - co * 0]; };
  /* cercle exact : 4 coniques de 90° (geom.circle) */
  function cercle(cx, cy, r) {
    const n = 4, pas = (360 * Math.PI / 180) / n, w = Math.cos(pas / 2), kk = 1 / Math.cos(pas / 2);
    const m = mul(mul([1, 0, 0, 1, cx, cy], rotation(0)), [r, 0, 0, r, 0, 0]);
    const segs = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      const a0 = t, a1 = t + pas, mi = a0 + pas / 2;
      const p0 = appliquer(m, Math.cos(a0), Math.sin(a0)), p1 = appliquer(m, Math.cos(mi) * kk, Math.sin(mi) * kk), p2 = appliquer(m, Math.cos(a1), Math.sin(a1));
      segs.push(['Q', p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], w]);
      t = a1;
    }
    return { closed: true, segs };
  }
  /* encombrement exact d'un segment (comme geom.py) */
  function racinesQuad(a, b, c) {
    if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
    const d = b * b - 4 * a * c;
    if (d < 0) return [];
    const r = Math.sqrt(d);
    return [(-b + r) / (2 * a), (-b - r) / (2 * a)];
  }
  function boiteSegment(s) {
    if (s[0] === 'L') return [Math.min(s[1], s[3]), Math.min(s[2], s[4]), Math.max(s[1], s[3]), Math.max(s[2], s[4])];
    if (s[0] === 'C') {
      const xs = [s[1], s[7]], ys = [s[2], s[8]];
      for (const [i, acc] of [[0, xs], [1, ys]]) {
        const a = s[1 + i], b = s[3 + i], c = s[5 + i], d = s[7 + i];
        for (const t of racinesQuad(-a + 3 * b - 3 * c + d, 2 * (a - 2 * b + c), b - a)) {
          if (t > 0 && t < 1) { const u = 1 - t; acc.push(u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d); }
        }
      }
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    const w = s[7], xs = [s[1], s[5]], ys = [s[2], s[6]];
    const d0 = 1.0, d1 = 2 * w - 2, d2 = 2 - 2 * w;
    for (const [i, acc] of [[0, xs], [1, ys]]) {
      const a0 = s[1 + i], a1 = s[3 + i], a2 = s[5 + i];
      const n0 = a0, n1 = 2 * w * a1 - 2 * a0, n2 = a0 - 2 * w * a1 + a2;
      const A = n2 * d1 - n1 * d2, B = 2 * (n2 * d0 - n0 * d2), C = n1 * d0 - n0 * d1;
      const ech = Math.max(Math.abs(A), Math.abs(B), Math.abs(C), 1e-300);
      let rac;
      if (Math.abs(A) <= 1e-14 * ech) rac = Math.abs(B) > 1e-14 * ech ? [-C / B] : [];
      else {
        const disc = B * B - 4 * A * C;
        if (disc < 0) rac = [];
        else { const sq = Math.sqrt(disc), q = -0.5 * (B + (B >= 0 ? sq : -sq)); rac = [q / A].concat(q !== 0 ? [C / q] : []); }
      }
      for (const t of rac) if (t > 0 && t < 1) {
        const u = 1 - t, b0 = u * u, b1 = 2 * u * t * w, b2 = t * t;
        acc.push((b0 * a0 + b1 * a1 + b2 * a2) / (b0 + b1 + b2));
      }
    }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const union = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  function boiteChemin(path) {
    let bb = null;
    for (const c of path || []) for (const s of c.segs) bb = union(bb, boiteSegment(s));
    return bb;
  }
  /* encombrement d'un objet du document (texte sans contour : estimation de Text.bbox) */
  function boite(it) {
    if (Array.isArray(it)) { let bb = null; for (const x of it) bb = union(bb, boite(x)); return bb; }
    if (!it) return null;
    if (it.kind === 'shape') return boiteChemin(it.path);
    if (it.kind === 'text') {
      if (it.outline && it.outline.length) return boiteChemin(it.outline);
      const m = it.matrix || [1, 0, 0, 1, 0, 0];
      return [m[4], m[5], m[4] + it.size * 0.6 * Math.max(1, [...it.text].length), m[5] + it.size];
    }
    if (it.kind === 'group') {
      let bb = null;
      for (const c of it.children) if (c.visible !== false) bb = union(bb, boite(c));
      return bb || boite(it.children.filter(c => c.visible === false));
    }
    return null;
  }

  /* ---------- objets du document ---------- */
  const IGNORE = '_ignore';
  const FRACTION_DESCENTE = 434 / 2288;
  const base = (nom, extra) => ({ id: uid(), name: nom || '', tool: 0, visible: true, locked: false, extra: extra || {} });
  const forme = (path, nom, extra) => Object.assign(base(nom, extra), { kind: 'shape', path, filled: false });
  const groupe = (children, nom, extra) => Object.assign(base(nom, extra), { kind: 'group', children });
  const ignore = () => ({ kind: IGNORE });

  /* texte TypeEdit sans les glyphes : chaîne, police (table du fichier), hauteur des capitales, alignement, rapport de
     largeur ; placement (ligne de base de la 1re ligne, au point d'alignement) tiré des boîtes des caractères (approché :
     la mise en page exacte demande la police). Le contour est à recalculer avec la police (outline = null). */
  function texteTE(obj, polices) {
    const f = obj.f, chars = f.para1.chars.map(attrsCar), boxes = f.boxes || [];
    const texte = texteParagraphe(obj);
    let police = 'Arial';
    if (chars.length) { const i = chars[0].font; if (i >= 0 && i < polices.length) police = polices[i]; }
    const hauteur = chars.length ? chars[0].height * M_TO_MM : 0.0;
    const t = Object.assign(base(f.name || ''), { kind: 'text', text: texte, font: police, size: hauteur,
      matrix: [1, 0, 0, 1, 0, 0], align: 'left', spacing: 0.0, line_spacing: 1.2, width_ratio: 1.0, outline: null });
    const blancs = c => c === 0 || c === 9 || c === 10 || c === 13 || c === 32;
    const rapports = new Set(chars.filter(c => !blancs(c.code)).map(c => Math.round((c.ratio || 1.0) * 1e6) / 1e6));
    if (rapports.size === 1) t.width_ratio = [...rapports][0];
    const la = f.para1.lines;
    if (la.length && la[0].length >= 8) {
      const fl = new DataView(la[0].buffer, la[0].byteOffset, la[0].byteLength).getUint32(4, true) & 3;
      t.align = { 0: 'left', 1: 'right', 2: 'center' }[fl] || t.align;
    }
    let ang = 0.0;
    if (boxes.length) {
      const [x0, y0] = boxes[0], x3 = boxes[0][6], y3 = boxes[0][7];
      if (Math.hypot(x3 - x0, y3 - y0) > 1e-12) ang = Math.atan2(y3 - y0, x3 - x0);
    }
    const rot = rotation(ang * 180 / Math.PI), inv = rotation(-ang * 180 / Math.PI);
    // étendue de chaque ligne le long de la ligne de base (repère du texte)
    const lignes = [[]];
    let bas = null, haut = null;
    chars.forEach((c, i) => {
      const bx = boxes[i];
      if (!bx) return;
      if (c.code === 13) { lignes.push([]); return; }
      if (blancs(c.code)) return;
      const coins = [0, 2, 4, 6].map(k => appliquer(inv, bx[k] * M_TO_MM, bx[k + 1] * M_TO_MM));
      lignes[lignes.length - 1].push(...coins);
      if (bas === null) { bas = Math.min(...coins.map(p => p[1])); haut = Math.max(...coins.map(p => p[1])); }
    });
    const rangs = lignes.filter(l => l.length).map(l => [Math.min(...l.map(p => p[0])), Math.max(...l.map(p => p[0]))]);
    // ligne de base : la boîte d'un caractère va de la descente à la montée de la police ; sans la police, la part
    // de la descente est celle d'Arial (434 / 2288) — VectorDrive la tire de la police installée
    const yb = bas === null ? null : bas + (haut - bas) * FRACTION_DESCENTE;
    if (rangs.length && yb !== null) {
      const [g, d] = rangs[0], xa = t.align === 'center' ? (g + d) / 2 : t.align === 'right' ? d : g;
      const [ox, oy] = appliquer(rot, xa, yb);
      t.matrix = [rot[0], rot[1], rot[2], rot[3], ox, oy];
    }
    // ce qu'il faut pour recaler la mise en page avec la police : largeur de la plus longue ligne, pas des lignes
    const info = { largeur_mm: rangs.length ? Math.max(...rangs.map(r => r[1] - r[0])) : 0, boite_mm: rangs.length ? [rangs[0][0], bas, rangs[0][1], haut] : null };
    const ys = la.filter(l => l.length >= 48).map(l => new DataView(l.buffer, l.byteOffset, l.byteLength).getFloat64(16, true));
    if (ys.length >= 2 && texte.includes('\n')) info.pas_lignes_mm = Math.abs(ys[1] - ys[0]) * M_TO_MM;
    t.extra.te_texte = info;
    return t;
  }

  /* arbre MFC → objets du document (comme vnd._to_items) ; les objets non repris laissent une marque, retirée à la
     fin (les zones à un seul objet et les groupes restent ceux de VectorDrive) */
  function versObjets(obj, rapport, ctx) {
    const nom = obj.cls.nom, f = obj.f;
    if (nom === 'CParagraphe') {
      const t = texteTE(obj, ctx.fonts || []);
      if (t.text.trim()) rapport.push(`texte TypeEdit en police « ${t.font} » : glyphes non enregistrés dans le fichier, contour à recalculer`);
      return [t];
    }
    if (nom === 'CObList') return obj.enfants.flatMap(ch => versObjets(ch, rapport, ctx));
    if (nom === 'CCourbe') {
      const contours = [];
      for (const ch of obj.enfants) {
        if (ch.cls.nom !== 'CContour') { rapport.push(`objet ${ch.cls.nom} ignoré dans une courbe`); continue; }
        const t = ch.f.type || 0, pts = ch.f.points || [];
        if (ch.f.finite === false) { rapport.push('contour corrompu (coordonnées invalides) ignoré dans une courbe'); continue; }
        const segs = segmentsContour(pts, t !== 0);
        if (segs.length) contours.push({ closed: t !== 0, segs });
      }
      const extra = {};
      const fin = f.trailer;
      // la couleur que TypeEdit montre : la 3ᵉ valeur de la fin de courbe
      if (fin && fin.length >= 12) extra.te_color = [hexCouleur(new DataView(fin.buffer, fin.byteOffset, fin.byteLength).getUint32(8, true)), 0];
      return [forme(contours, f.name, extra)];
    }
    if (nom === 'CVnImage') { rapport.push('image bitmap ignorée'); return [ignore()]; }
    if (nom === 'CVbitmap') { rapport.push('relief (carte de hauteurs) ignoré'); return [ignore()]; }
    if (nom === 'CMetaObj') { rapport.push('métafichier Windows (EMF) ignoré'); return [ignore()]; }
    if (nom === 'CZone') {
      const items = obj.enfants.flatMap(ch => versObjets(ch, rapport, ctx));
      if (items.length === 1) return items;      // zone à un seul objet : l'objet lui-même
      return [groupe(items, f.name)];
    }
    if (nom === 'CContour') {
      const t = f.type || 0, segs = segmentsContour(f.points || [], t !== 0);
      return segs.length ? [forme([{ closed: t !== 0, segs }])] : [];
    }
    const dessin = (zone) => {
      let parts = zone ? versObjets(zone, rapport, ctx) : [];
      if (parts.length === 1 && parts[0].kind === 'group') parts = parts[0].children;
      return parts;
    };
    if (nom in CODES_BARRES) {
      const donnee = texteCode(f.data), parts = dessin(f.zone);
      if (!parts.length) rapport.push('code-barres sans dessin enregistré : ignoré');
      return [groupe(parts, `Code-barres : ${donnee}`, { typeedit_barcode: { donnee, norme: normeCode(obj), famille: CODES_BARRES[nom],
        variable: f.var ? texteCode(f.var) : '' } })];
    }
    if (nom === 'CObBraille') {
      const label = texteBraille(obj), parts = dessin(f.zone);
      if (!parts.length) rapport.push('braille sans dessin enregistré : ignoré');
      return [groupe(parts, label ? `Braille : ${label}` : 'Braille', { typeedit_braille: { texte: label, police: texteBraille(obj, 'police') } })];
    }
    if (nom === 'CObCadran') {
      const label = nomCadran(obj), parts = dessin(f.zone), ver = f.vernier || {};
      if (!parts.length) rapport.push('cadran TypeEdit sans dessin enregistré : ignoré');
      return [groupe(parts, label ? `Cadran : ${label}` : 'Cadran', { typeedit_cadran: { nom: label,
        graduations: texteCadran(ver.graduations, obj.cls.schema), police: texteCadran(ver.police, obj.cls.schema),
        texte: texteCadran(ver.texte, obj.cls.schema) } })];
    }
    if (COTATIONS.includes(nom)) {
      // dessin de la cote tel que TypeEdit l'a calculé : ligne de cote, texte, lignes d'attache, flèches
      const label = f.text || '';
      if (!f.zone) { rapport.push('cote sans dessin enregistré : ignorée'); return []; }
      let parts = dessin(f.zone);
      const finis = v => Number.isFinite(v);
      if (!f.pts.slice(0, 6).every(finis) || !parts.every(it => it.kind === IGNORE || (boite(it) || []).every(finis))) {
        rapport.push('cote aux coordonnées invalides : non affichée');
        parts = [];
      }
      return [groupe(parts, 'Cote', { cotation: { classe: nom, texte: label, points_mm: f.pts.slice(0, 6).map(v => Math.round(v * M_TO_MM * 1e6) / 1e6) } })];
    }
    if (nom === 'CTrou') {
      // trou de perçage : cercle à son diamètre, profondeur gardée
      const x = f.pos[0] * M_TO_MM, y = f.pos[1] * M_TO_MM;
      let r = f.rayon * M_TO_MM;
      if (r <= 0) { rapport.push('trou de rayon nul : dessiné en cercle de 0,5 mm'); r = 0.5; }
      return [forme([cercle(x, y, r)], f.name || 'Trou', { trou: { profondeur: Math.round(f.profondeur * M_TO_MM * 1e9) / 1e9, ints: f.ints.slice() } })];
    }
    if (nom === 'CObBrep') { rapport.push('solide 3D ignoré'); return [ignore()]; }
    if (nom === 'CMarker') { rapport.push('point de construction ignoré'); return [ignore()]; }
    if (nom === 'CCenterLine') { rapport.push('axe de construction ignoré'); return [ignore()]; }
    rapport.push(`objet ${nom} non converti`);
    return [];
  }
  function nettoyer(items) {
    return items.filter(it => it.kind !== IGNORE).map(it => (it.kind === 'group' ? Object.assign(it, { children: nettoyer(it.children) }) : it));
  }
  function poserOutil(items, outil) {
    for (const it of items) {
      it.tool = outil;
      if (it.extra && it.extra.te_color) it.extra.te_color[1] = outil;
      if (it.kind === 'group') poserOutil(it.children, outil);
    }
  }
  /* remarques identiques regroupées (« … (× 12) »), ordre gardé */
  function resumer(rapport) {
    const n = new Map();
    for (const r of rapport) n.set(r, (n.get(r) || 0) + 1);
    return [...n].map(([r, k]) => (k === 1 ? r : `${r} (× ${k})`));
  }

  /* ---------- en-tête, table des polices ---------- */
  function debutArchive(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), start = dv.getUint32(4, true);
    if (start + 4 <= u8.length && u8[start + 2] === 0xFF && u8[start + 3] === 0xFF) return start + 2;      // VND
    if (start >= 2 && start <= u8.length && u8[start - 2] === 0xFF && u8[start - 1] === 0xFF) return start - 2;   // GVT
    return chercher(u8, [0xFF, 0xFF], start);
  }
  /* table des polices des textes, juste avant l'archive : u32 n puis n noms ANSI de 64 octets */
  function tablePolices(u8, a) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    for (let n = 64; n > 0; n--) {
      const p = a - 4 - 64 * n;
      if (p < 12 || dv.getUint32(p, true) !== n) continue;
      const noms = [];
      let ok = true;
      for (let k = 0; k < n; k++) {
        const b = u8.subarray(p + 4 + 64 * k, p + 4 + 64 * (k + 1)), z = b.indexOf(0), nb = z < 0 ? b : b.subarray(0, z);
        if (!nb.length || nb.some(c => c < 32)) { ok = false; break; }
        noms.push(cp1252(nb));
      }
      if (ok) return noms;
    }
    return [];
  }

  /* ---------- lecture de l'archive (solides 3D : fins candidates essayées tour à tour) ---------- */
  const MAX_ESSAIS_BREP = 60;
  function lireUneFois(u8, pos, fins) {
    const ar = new Archive(u8, pos, LECTEURS);
    ar.finsBrep = fins;
    try { return [ar.lireObjet(), ar, null]; } catch (ex) {
      if (ex instanceof ErreurArchive || ex instanceof RangeError) return [null, ar, ex];
      throw ex;
    }
  }
  function lireAvecBreps(u8, pos) {
    const fins = {}, pile = [];
    let meilleur = [-1, {}];
    for (let essai = 0; essai <= MAX_ESSAIS_BREP; essai++) {
      const [racine, ar, ex] = lireUneFois(u8, pos, fins);
      if (!ex) return [racine, ar, null];
      if (ar.pos > meilleur[0]) meilleur = [ar.pos, Object.assign({}, fins)];
      if (ex instanceof FinBrep && (!pile.length || ex.debut > fins[pile[pile.length - 1][0]])) pile.push([ex.debut, finsCandidates(u8, ex.posDonnees, ar.table), -1]);
      while (pile.length) {
        const h = pile[pile.length - 1];
        h[2]++;
        if (h[2] < h[1].length) { fins[h[0]] = h[1][h[2]]; break; }
        delete fins[h[0]];
        pile.pop();
      }
      if (!pile.length) break;
    }
    return lireUneFois(u8, pos, meilleur[1]);
  }
  /* racine CTravail et archive ; lecture partielle : ce qui précède l'objet illisible, erreur dans partial_error */
  function analyser(buf) {
    const u8 = octets(buf);
    if (u8.length < 12) throw new Error(tr('Fichier TypeEdit trop court.'));
    const magic = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(0, true);
    if (magic !== MAGIC && magic !== GVT_MAGIC) throw new Error(tr('Ce fichier n\'est pas un dessin TypeEdit (.vnd, .gvt).'));
    const pos = debutArchive(u8);
    if (pos < 0) throw new Error(tr('Dessin TypeEdit illisible : archive introuvable.'));
    let [racine, ar, ex] = lireAvecBreps(u8, pos);
    if (ex) {
      if (!ar.pile.length || ar.pile[0].cls.nom !== 'CTravail') throw new Error(trv('Dessin TypeEdit illisible : {e}', { e: ex.message }));
      for (let i = 0; i + 1 < ar.pile.length; i++) if (!ar.pile[i].enfants.includes(ar.pile[i + 1])) ar.pile[i].enfants.push(ar.pile[i + 1]);
      racine = ar.pile[0];
      racine.f.partial_error = ex.message;
      return { racine, ar, u8 };
    }
    if (!racine || racine.cls.nom !== 'CTravail') throw new Error(tr('Dessin TypeEdit illisible : racine inattendue.'));
    return { racine, ar, u8 };
  }
  const outilsParDefaut = () => COULEURS_TE.map((color, index) => ({ index, color, name: `Outil ${index + 1}`, width: 0.0 }));
  const outilCalque = c => { const a = c.f.attrs; return a && a.length >= 12 ? new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(8, true) : 0; };

  /* dessin .vnd ou .gvt → document VectorDrive (JSON natif) */
  function lireVND(buf) {
    const { racine, ar, u8 } = analyser(buf);
    const partiel = racine.f.partial_error;
    const gvt = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(0, true) === GVT_MAGIC;
    const polices = tablePolices(u8, debutArchive(u8));
    const rapport = [], ctx = { fonts: polices };
    const doc = { format: 'VectorDrive', version: 1, plate: null, tools: outilsParDefaut(), active: '', layers: [],
      extra: { te_format: gvt ? 'gvt' : 'vnd', vnd_fonts: polices } };
    for (const calque of racine.enfants) {
      if (calque.cls.nom !== 'CCalque') { rapport.push(`${calque.cls.nom} au niveau des calques, ignoré`); continue; }
      const outil = outilCalque(calque);
      let items = [];
      for (const zone of calque.enfants) items = items.concat(versObjets(zone, rapport, ctx));
      items = nettoyer(items);
      poserOutil(items, outil);
      doc.layers.push({ id: uid(), name: calque.f.layer_name || calque.f.name || 'Plan', visible: true, locked: false, tool: outil, items });
    }
    let fin = null;
    if (partiel) {
      doc.extra.vnd_partial = String(partiel);
      rapport.push(`lecture interrompue (${partiel}) : dessin partiel, plaque et réglages TypeEdit non lus`);
    } else {
      try { fin = lireFinDocument(ar); } catch (ex) {
        if (!(ex instanceof ErreurArchive || ex instanceof RangeError)) throw ex;
        rapport.push(`réglages TypeEdit non lus : ${ex.message}`);
      }
    }
    if (fin) {
      const [x0, y0, z0, x1, y1, z1] = fin.support_bbox.map(v => v * M_TO_MM);
      doc.plate = { width: x1 - x0, height: y1 - y0, corner_radius: 0.0, material: '', x: x0, y: y0, visible: true, thickness: z1 - z0, margins: [0.0, 0.0, 0.0, 0.0] };
      if (fin.tools.length) doc.tools = fin.tools.map(([c, n], i) => ({ index: i, color: hexCouleur(c), name: n, width: 0.0 }));
      doc.extra.vnd_machine = { nom: fin.machine, postpro: fin.postpro, courses_mm: fin.travel.map(v => v * M_TO_MM) };
      if (fin.variables.length) doc.extra.typeedit_variables = fin.variables;
    } else if (racine.f.bbox) doc.extra.page_mm = racine.f.bbox.map(v => v * M_TO_MM);
    doc.extra.te_ignores = resumer(rapport);
    return doc;
  }

  /* ---------- symboles (.smb) ---------- */
  const COULEURS_MAGIC = 'VDSMBCOL';
  /* bloc des couleurs de VectorDrive après l'archive (JSON : couleur des outils, outil de chaque zone), {} s'il manque */
  function blocCouleurs(u8, pos) {
    if (pos + 12 > u8.length || latin1(u8.subarray(pos, pos + 8)) !== COULEURS_MAGIC) return {};
    const n = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(pos + 8, true);
    try {
      const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(u8.subarray(pos + 12, pos + 12 + n)));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  const feuilles = it => (it.kind === 'group' ? it.children.flatMap(feuilles) : [it]);
  const entier = v => Number.isInteger(v);
  function poserOutils(items, spec) {
    const fl = items.flatMap(feuilles);
    let outils;
    if (entier(spec)) outils = fl.map(() => spec);
    else if (Array.isArray(spec) && spec.length && spec.every(entier)) outils = spec.length === fl.length ? spec : fl.map(() => spec[0]);
    else return;
    fl.forEach((lf, i) => { lf.tool = outils[i]; });
    for (const it of items) if (it.kind === 'group' && outils.length) it.tool = outils[0];
  }
  function poserAspects(items, spec) {
    const fl = items.flatMap(feuilles);
    if (!Array.isArray(spec) || !spec.length || !spec.every(x => x && typeof x === 'object' && !Array.isArray(x))) return;
    if (spec.length !== fl.length) {
      if (spec.some(x => JSON.stringify(x) !== JSON.stringify(spec[0]))) return;
      spec = fl.map(() => spec[0]);
    }
    fl.forEach((lf, i) => {
      const c = spec[i].c;
      if (typeof c === 'string' && c.length === 7 && c[0] === '#') lf.extra.couleur = c;
      if (spec[i].f && 'filled' in lf) lf.filled = true;
    });
  }
  /* symbole TypeEdit → { symboles: [{ nom, items, tools, polices, ignores }] } (un fichier = un symbole) */
  function lireSMB(buf, nom) {
    const u8 = octets(buf);
    if (u8.length < 12) throw new Error(tr('Fichier TypeEdit trop court.'));
    if (latin1(u8.subarray(0, 5)) === '%PDF-') throw new Error(tr('Ce symbole est un fichier PDF portant l\'extension .smb : ouvrez-le comme un PDF.'));
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), magic = dv.getUint32(0, true), start = dv.getUint32(4, true);
    if (magic !== SMB_MAGIC) throw new Error(tr('Ce fichier n\'est pas un symbole TypeEdit (.smb).'));
    if (start + 4 > u8.length) throw new Error(tr('Symbole TypeEdit illisible : début des données hors du fichier.'));
    const ar = new Archive(u8, start, LECTEURS);
    let racine, polices;
    try {
      const n = ar.u32();
      if (n > 64) throw new ErreurArchive(`table des polices aberrante (${n})`);
      polices = [];
      for (let i = 0; i < n; i++) { const b = ar.brut(64), z = b.indexOf(0); polices.push(cp1252(z < 0 ? b : b.subarray(0, z))); }
      racine = ar.integre('CObDaoCtn', 0);
    } catch (ex) {
      if (!(ex instanceof ErreurArchive || ex instanceof RangeError)) throw ex;
      throw new Error(trv('Symbole TypeEdit illisible : {e}', { e: ex.message }));
    }
    const couleurs = blocCouleurs(u8, ar.pos), zones = couleurs.zones || [], aspects = couleurs.objets || [];
    const rapport = [];
    let items = [];
    racine.enfants.forEach((ch, i) => {
      const obtenus = nettoyer(versObjets(ch, rapport, { fonts: polices }));
      if (i < zones.length) poserOutils(obtenus, zones[i]);
      if (i < aspects.length) poserAspects(obtenus, aspects[i]);
      items = items.concat(obtenus);
    });
    let outils = outilsParDefaut();
    for (const [k, col] of Object.entries(couleurs.tools || {})) {
      const idx = Number(k);
      if (!Number.isInteger(idx)) continue;
      outils = outils.filter(t => t.index !== idx).concat([{ index: idx, color: String(col), name: `Outil ${idx + 1}`, width: 0.0 }]);
    }
    outils.sort((a, b) => a.index - b.index);
    const nomSym = nom || racine.f.name || 'Symbole';
    if (items.length > 1) items = [groupe(items, nomSym)];
    return { symboles: [{ nom: nomSym, items, tools: outils, polices, couleurs: Object.keys(couleurs).length > 0, ignores: resumer(rapport) }] };
  }

  window.VDTypeEdit = { lireVND, lireSMB, analyser, segmentsContour, boite, boiteChemin, boiteSegment, tablePolices, debutArchive,
    texteParagraphe, ErreurArchive, LECTEURS };
})();
