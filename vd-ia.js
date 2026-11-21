/* VectorDrive web : assistant IA. Discussion avec Claude (Anthropic), ChatGPT (OpenAI) ou Mistral, avec la clé d'API
   de l'utilisateur, appelée directement depuis le navigateur (aucun serveur intermédiaire). L'assistant lit le dessin
   et le modifie par des outils (mêmes noms que l'assistant de l'application de bureau) ; chaque modification est un pas
   d'annulation. Les dépenses sont comptées comme dans l'application (extra.ia_credits du .vdz). */
(function () {
  'use strict';
  const W = window.VDWeb, O = window.VDOutils, F = window.VDFao, tr = (s, v) => (window.t ? window.t(s, v) : s);

  /* fournisseurs : modèle d'office et liste, comme l'application (agent/chat.py) */
  const FOURNISSEURS = {
    anthropic: { nom: 'Claude (Anthropic)', modele: 'claude-sonnet-5-5', modeles: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], cle: 'https://console.anthropic.com/settings/keys' },
    openai: { nom: 'ChatGPT (OpenAI)', modele: 'gpt-6-astra', modeles: ['gpt-6-astra', 'gpt-6.1-terra', 'gpt-6-luna'], cle: 'https://platform.openai.com/api-keys', url: 'https://api.openai.com/v1/chat/completions' },
    mistral: { nom: 'Mistral', modele: 'mistral-large-latest', modeles: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'], cle: 'https://console.mistral.ai/api-keys', url: 'https://api.mistral.ai/v1/chat/completions' }
  };
  /* prix d'office par million de jetons (entrée, sortie, entrée lue en cache) : ceux de l'application (agent/credits.py,
     relevés le 19/11/2026), à vérifier chez le fournisseur ; ChatGPT : pas de prix sûr, jetons comptés seulement */
  const PRIX = {
    'mistral:mistral-large-latest': [2.0, 6.0, 2.0], 'mistral:mistral-medium-latest': [1.5, 7.5, 1.5], 'mistral:mistral-small-latest': [0.2, 0.6, 0.2],
    'anthropic:claude-opus-5-5': [4.0, 20.0, 0.2], 'anthropic:claude-sonnet-5-5': [2.0, 10.0, 0.1], 'anthropic:claude-haiku-5-5': [0.1, 0.5, 0.01]
  };
  const ECRIT = { anthropic: 1.25 };

  function ajouterCredits(doc, fournisseur, modele, u) {
    const k = `${fournisseur}:${modele}`, p = PRIX[k], cout = p ? (u.entree * p[0] + u.sortie * p[1] + u.cache * p[2] + u.ecrit * p[0] * (ECRIT[fournisseur] || 1)) / 1e6 : 0;
    const c = { entree: 0, sortie: 0, cache: 0, ecrit: 0, tours: 0, cout: 0, par_modele: {}, devise: '$', ...(doc.extra && doc.extra.ia_credits) };
    const m = { entree: 0, sortie: 0, cache: 0, ecrit: 0, tours: 0, cout: 0, ...(c.par_modele[k] || {}) };
    for (const f of ['entree', 'sortie', 'cache', 'ecrit']) { c[f] += u[f]; m[f] += u[f]; }
    c.tours += 1; m.tours += 1; c.cout += cout; m.cout += cout;
    return { doc: { ...doc, extra: { ...doc.extra, ia_credits: { ...c, par_modele: { ...c.par_modele, [k]: m } } } }, cout };
  }

  /* ---------- outils ---------- */
  const N = { type: 'number' }, S = { type: 'string' }, IDS = { type: 'array', items: S, description: 'object ids' };
  const sch = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const OUTILS = [
    ['get_document', 'Plate, layers (with object counts), tool colours, selection and CAM operations of the open drawing. Units: mm, Y axis up.', sch({})],
    ['list_objects', 'Objects with id, kind, name, tool, layer and bounding box [x0,y0,x1,y1]. Optional layer name filter.', sch({ layer: S, limit: N })],
    ['add_rectangle', 'Add a rectangle (x, y = lower-left corner), optional corner radius.', sch({ x: N, y: N, width: N, height: N, radius: N, tool: N, layer: S }, ['x', 'y', 'width', 'height'])],
    ['add_ellipse', 'Add an ellipse or circle (centre cx, cy; radii rx, ry).', sch({ cx: N, cy: N, rx: N, ry: N, tool: N, layer: S }, ['cx', 'cy', 'rx'])],
    ['add_polygon', 'Add a regular polygon (centre, circumradius, sides) or a star when inner_radius is given.', sch({ cx: N, cy: N, radius: N, sides: N, inner_radius: N, tool: N, layer: S }, ['cx', 'cy', 'radius', 'sides'])],
    ['add_polyline', 'Add a polyline from points [[x,y],...], closed or not.', sch({ points: { type: 'array', items: { type: 'array', items: N } }, closed: { type: 'boolean' }, tool: N, layer: S }, ['points'])],
    ['add_arc', 'Add a circular arc (centre, radius, start and end angles in degrees, counter-clockwise).', sch({ cx: N, cy: N, radius: N, start: N, end: N, tool: N, layer: S }, ['cx', 'cy', 'radius', 'start', 'end'])],
    ['add_text', 'Add live text. size = capital height in mm; x, y = baseline origin; align left|center|right; font = a font name from get_document.fonts.', sch({ text: S, x: N, y: N, size: N, font: S, align: S, tool: N, layer: S }, ['text', 'x', 'y'])],
    ['add_code', 'Add a filled barcode: kind qr|datamatrix|code128|code39|ean13; x, y = lower-left; module = cell width mm; height for linear codes.', sch({ kind: S, text: S, x: N, y: N, module: N, height: N, tool: N, layer: S }, ['kind', 'text', 'x', 'y'])],
    ['move_objects', 'Move objects by dx, dy.', sch({ ids: IDS, dx: N, dy: N }, ['ids'])],
    ['rotate_objects', 'Rotate objects by angle degrees (counter-clockwise) around cx, cy (default: centre of their box).', sch({ ids: IDS, angle: N, cx: N, cy: N }, ['ids', 'angle'])],
    ['scale_objects', 'Scale objects by sx, sy (sy defaults to sx) around cx, cy (default: centre of their box).', sch({ ids: IDS, sx: N, sy: N, cx: N, cy: N }, ['ids', 'sx'])],
    ['mirror_objects', 'Mirror objects: axis h (left-right) or v (top-bottom), around their box centre.', sch({ ids: IDS, axis: S }, ['ids', 'axis'])],
    ['align_objects', 'Align objects: mode left|right|centerX|bottom|top|centerY, reference selection|plate.', sch({ ids: IDS, mode: S, reference: S }, ['ids', 'mode'])],
    ['duplicate_objects', 'Copy objects, offset by dx, dy; or an array of rows × columns with spacing dx, dy.', sch({ ids: IDS, dx: N, dy: N, rows: N, columns: N }, ['ids'])],
    ['delete_objects', 'Delete objects.', sch({ ids: IDS }, ['ids'])],
    ['set_style', 'Set tool colour index and/or filled for objects.', sch({ ids: IDS, tool: N, filled: { type: 'boolean' } }, ['ids'])],
    ['boolean', 'Boolean of closed objects: union, difference (first id minus the others), intersection, xor. Replaces them by the result unless keep is true.', sch({ ids: IDS, operation: S, keep: { type: 'boolean' } }, ['ids', 'operation'])],
    ['offset', 'Offset objects by distance mm (negative = inward); joint round|miter|square; keep the originals unless replace is true.', sch({ ids: IDS, distance: N, joint: S, replace: { type: 'boolean' } }, ['ids', 'distance'])],
    ['group_objects', 'Group objects, or ungroup when ungroup is true.', sch({ ids: IDS, ungroup: { type: 'boolean' } }, ['ids'])],
    ['set_plate', 'Set the plate: width, height, corner_radius, thickness, x, y, visible.', sch({ width: N, height: N, corner_radius: N, thickness: N, x: N, y: N, visible: { type: 'boolean' } })],
    ['add_layer', 'Add a layer and make it active.', sch({ name: S }, ['name'])],
    ['select_objects', 'Select objects in the view (empty list clears).', sch({ ids: IDS }, ['ids'])],
    ['add_operation', 'Add a CAM operation on the objects of the given tool colours: type contour|poche|gravure|percage; side ext|int|sur (contour); diameter, depth, step (depth per pass), stepover % (poche), feed, plunge (mm/min), spindle (rpm). Values are the user\'s: ask if unknown.', sch({ type: S, tools: { type: 'array', items: N }, side: S, diameter: N, depth: N, step: N, stepover: N, feed: N, plunge: N, spindle: N, name: S }, ['type', 'tools'])],
    ['compute_toolpaths', 'Compute the toolpaths of all CAM operations; returns passes count and estimated time per operation. Never writes the machine program to disk.', sch({})],
    ['undo', 'Undo the last change.', sch({})]
  ];

  const boiteDe = items => W.boite(items);
  function decrire(it, L) { const b = W.boite([it]); return { id: it.id, kind: it.kind, name: it.name || undefined, tool: it.tool, layer: L.name, filled: it.filled || undefined, text: it.text, bbox: b && b.map(v => Math.round(v * 1000) / 1000), solid: it.extra && it.extra.solide ? true : undefined }; }

  /* exécute un outil sur l'hôte : { lire(), ecrire(doc), choisir(ids), selection(), annuler(), resultats(r) } */
  async function executer(h, nom, a) {
    let doc = h.lire();
    const actif = () => (a.layer && doc.layers.find(L => L.name === a.layer)) || doc.layers.find(L => L.id === h.calqueActif()) || doc.layers[0];
    const ajouter = async it => { const L = actif(); if (L.locked) throw new Error('layer locked'); if (a.tool != null) it.tool = a.tool | 0; doc = { ...doc, layers: doc.layers.map(x => (x.id === L.id ? { ...x, items: [...x.items, it] } : x)) }; h.ecrire(doc); return { id: it.id, bbox: W.boite([it]) }; };
    const tous = () => doc.layers.flatMap(L => L.items.map(it => ({ it, L })));
    const lesquels = () => { const s = new Set(a.ids || []); const r = tous().filter(o => s.has(o.it.id)).map(o => o.it); if (!r.length) throw new Error('no object found for these ids'); return r; };
    const remplacer = (f, ids = new Set(a.ids)) => { doc = { ...doc, layers: doc.layers.map(L => ({ ...L, items: L.items.flatMap(it => (ids.has(it.id) ? [f(it)].flat().filter(Boolean) : [it])) })) }; h.ecrire(doc); };
    const centre = items => { const b = boiteDe(items); return [a.cx ?? (b[0] + b[2]) / 2, a.cy ?? (b[1] + b[3]) / 2]; };
    const t = a.tool ?? 0;
    switch (nom) {
      case 'get_document': return { plate: doc.plate, layers: doc.layers.map(L => ({ name: L.name, visible: L.visible, locked: L.locked, objects: L.items.length, active: L.id === h.calqueActif() })),
        tools: doc.tools.map(o => ({ index: o.index, color: o.color, name: o.name })), selection: h.selection(), fonts: [...O.polices.keys()].slice(0, 60), cam: F.reglages(doc), bbox: W.boite(W.visibles(doc)) };
      case 'list_objects': return tous().filter(o => !a.layer || o.L.name === a.layer).slice(0, a.limit || 200).map(o => decrire(o.it, o.L));
      case 'add_rectangle': return ajouter(W.rectangle(a.x, a.y, a.x + a.width, a.y + a.height, a.radius || 0, t));
      case 'add_ellipse': return ajouter(W.ellipse(a.cx, a.cy, a.rx, a.ry ?? a.rx, t));
      case 'add_polygon': return ajouter(a.inner_radius ? O.etoile(a.cx, a.cy, a.radius, a.inner_radius, a.sides | 0, t) : O.polygone(a.cx, a.cy, a.radius, a.sides | 0, t));
      case 'add_polyline': return ajouter(W.polyligne(a.points, !!a.closed, t));
      case 'add_arc': return ajouter(O.arc(a.cx, a.cy, a.radius, a.start, a.end, t));
      case 'add_text': return ajouter(await O.texte({ text: a.text, x: a.x, y: a.y, size: a.size || 10, font: a.font || 'Roboto', align: a.align || 'left', tool: t }));
      case 'add_code': return ajouter(O.code(a.kind, a.text, a.x, a.y, a.module || 0.5, a.height || 15, t));
      case 'move_objects': remplacer(it => W.transformer(it, W.translation(a.dx || 0, a.dy || 0))); return { moved: a.ids.length };
      case 'rotate_objects': { const [cx, cy] = centre(lesquels()); remplacer(it => W.transformer(it, W.rotation(a.angle, cx, cy))); return { rotated: a.ids.length }; }
      case 'scale_objects': { const [cx, cy] = centre(lesquels()); remplacer(it => W.transformer(it, W.echelle(a.sx, a.sy ?? a.sx, cx, cy))); return { scaled: a.ids.length }; }
      case 'mirror_objects': { const its = lesquels(), b = boiteDe(its), m = new Map(O.symetrie(its, a.axis === 'v' ? 'v' : 'h', b).map((x, i) => [its[i].id, x])); remplacer(it => m.get(it.id)); return { mirrored: its.length }; }
      case 'align_objects': { const its = lesquels(), P = doc.plate, ref = a.reference === 'plate' && P ? [P.x, P.y, P.x + P.width, P.y + P.height] : boiteDe(its), m = new Map(O.aligner(its, a.mode, ref).map((x, i) => [its[i].id, x])); remplacer(it => m.get(it.id)); return { aligned: its.length }; }
      case 'duplicate_objects': { const its = lesquels(), copies = a.rows || a.columns ? O.reseau(its, a.rows || 1, a.columns || 1, a.dx || 0, a.dy || 0) : its.map(it => W.transformer(W.copie(it), W.translation(a.dx ?? 5, a.dy ?? -5)));
        const L = actif(); doc = { ...doc, layers: doc.layers.map(x => (x.id === L.id ? { ...x, items: [...x.items, ...copies] } : x)) }; h.ecrire(doc); return { ids: copies.map(c => c.id) }; }
      case 'delete_objects': remplacer(() => null); return { deleted: a.ids.length };
      case 'set_style': remplacer(it => ({ ...it, ...(a.tool != null ? { tool: a.tool | 0 } : {}), ...(a.filled != null && it.kind === 'shape' ? { filled: !!a.filled } : {}) })); return { ok: true };
      case 'boolean': { const its = lesquels(), r = await O.booleen(its, a.operation); if (a.keep) return ajouter(r); const premier = its[0].id; remplacer(it => (it.id === premier ? r : null)); return { id: r.id, bbox: W.boite([r]) }; }
      case 'offset': { const its = lesquels(), res = []; for (const it of its) res.push(await O.decaler(it, a.distance, a.joint || 'round'));
        if (a.replace) { const m = new Map(its.map((it, i) => [it.id, res[i]])); remplacer(it => m.get(it.id)); } else { const L = actif(); doc = { ...doc, layers: doc.layers.map(x => (x.id === L.id ? { ...x, items: [...x.items, ...res] } : x)) }; h.ecrire(doc); }
        return { ids: res.map(r => r.id) }; }
      case 'group_objects': { if (a.ungroup) { remplacer(it => (it.kind === 'group' ? it.children : it)); return { ok: true }; } const its = lesquels(), g = O.grouper(its), premier = its[0].id; remplacer(it => (it.id === premier ? g : null)); return { id: g.id }; }
      case 'set_plate': { const p = { ...(doc.plate || W.nouveau().plate) }; for (const k of ['width', 'height', 'corner_radius', 'thickness', 'x', 'y', 'visible']) if (a[k] != null) p[k] = a[k]; doc = { ...doc, plate: p }; h.ecrire(doc); return { plate: p }; }
      case 'add_layer': { const L = { id: W.uid(), name: a.name, visible: true, locked: false, tool: 0, items: [] }; doc = { ...doc, layers: [...doc.layers, L] }; h.ecrire(doc); h.calqueActif(L.id); return { layer: a.name }; }
      case 'select_objects': h.choisir(a.ids || []); return { selected: (a.ids || []).length };
      case 'add_operation': { const R = F.reglages(doc), op = { ...F.operationDefaut(a.type, (a.tools || [0])[0]), outils: a.tools || [0], nom: a.name || '' };
        const map = { side: 'cote', diameter: 'diametre', depth: 'profondeur', step: 'passe', stepover: 'recouvrement', feed: 'avance', plunge: 'plongee', spindle: 'rotation' };
        for (const [k, v] of Object.entries(map)) if (a[k] != null) op[v] = a[k];
        doc = F.avecReglages(doc, { ...R, operations: [...R.operations, op] }); h.ecrire(doc); return { id: op.id, operation: op }; }
      case 'compute_toolpaths': { const res = await F.toutCalculer(doc); h.resultats(res); return res.map(r => ({ operation: r.op.nom || r.op.type, passes: r.chemins.length, minutes: Math.round(r.minutes * 100) / 100, notice: r.avis })); }
      case 'undo': h.annuler(); return { ok: true };
      default: throw new Error('unknown tool ' + nom);
    }
  }

  const SYSTEME = `You are the AI assistant of VectorDrive web, a browser drawing and CAM tool for engraving (milling and laser).
You read and modify the drawing open in the page through tools. Units are millimetres, the Y axis points up, the plate's lower-left corner is usually at (0, 0).
Tool colours (index 0, 1, …) group objects for CAM operations. Text size is the capital height in mm.
Work step by step: inspect with get_document / list_objects before changing things, then check your result.
Never invent cutting data (feeds, speeds, depths, tool diameters): use what the user gives, or ask. The machine program is never written by you.
Answer briefly, in the user's language.`;

  /* ---------- appels aux fournisseurs ---------- */
  async function appel(cfg, messages, signal) {
    const specs = OUTILS.map(([name, description, input_schema]) => ({ name, description, input_schema }));
    if (cfg.fournisseur === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-api-key': cfg.cle, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: cfg.modele, max_tokens: 8192, system: [{ type: 'text', text: SYSTEME + (cfg.consignes ? '\n\nUser instructions:\n' + cfg.consignes : ''), cache_control: { type: 'ephemeral' } }],
          tools: specs.map((s, i) => (i === specs.length - 1 ? { ...s, cache_control: { type: 'ephemeral' } } : s)), messages }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(erreur(r.status, j.error && j.error.message));
      const u = j.usage || {};
      return { texte: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'), appels: (j.content || []).filter(c => c.type === 'tool_use').map(c => ({ id: c.id, nom: c.name, args: c.input || {} })),
        brut: { role: 'assistant', content: j.content }, usage: { entree: u.input_tokens || 0, sortie: u.output_tokens || 0, cache: u.cache_read_input_tokens || 0, ecrit: u.cache_creation_input_tokens || 0 } };
    }
    const url = cfg.fournisseur === 'mistral' ? (cfg.url || FOURNISSEURS.mistral.url) : FOURNISSEURS.openai.url;
    const msgs = [{ role: 'system', content: SYSTEME + (cfg.consignes ? '\n\nUser instructions:\n' + cfg.consignes : '') }, ...messages];
    const r = await fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.cle },
      body: JSON.stringify({ model: cfg.modele, messages: msgs, tools: specs.map(s => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.input_schema } })) }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(erreur(r.status, (j.error && (j.error.message || j.error)) || j.message));
    const m = (j.choices && j.choices[0] && j.choices[0].message) || {}, u = j.usage || {}, cache = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
    return { texte: m.content || '', appels: (m.tool_calls || []).map(c => ({ id: c.id, nom: c.function.name, args: (() => { try { return JSON.parse(c.function.arguments || '{}'); } catch (e) { return {}; } })() })),
      brut: { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls }, usage: { entree: (u.prompt_tokens || 0) - cache, sortie: u.completion_tokens || 0, cache, ecrit: 0 } };
  }
  function erreur(code, msg) {
    const m = { 401: tr('clé refusée'), 403: tr('accès refusé'), 404: tr('modèle inconnu'), 429: tr('trop de demandes ou crédit épuisé'), 529: tr('fournisseur surchargé') }[code];
    return `${tr('Erreur du fournisseur')} (${code}${m ? ' : ' + m : ''})${msg ? ' — ' + String(msg).slice(0, 300) : ''}`;
  }
  const resultatOutil = (cfg, id, contenu, err) => (cfg.fournisseur === 'anthropic' ? { type: 'tool_result', tool_use_id: id, content: JSON.stringify(contenu).slice(0, 20000), is_error: !!err }
    : { role: 'tool', tool_call_id: id, content: JSON.stringify(contenu).slice(0, 20000) });

  /* une demande : boucle jusqu'à la réponse finale (tours au plus), rend {texte, modifie} ; cb.journal(type, texte) */
  async function demander(cfg, h, discussion, demande, cb = {}) {
    discussion.push({ role: 'user', content: demande });
    let modifie = false, tours = 0;
    while (tours++ < (cfg.tours || 25)) {
      if (cfg.plafond && h.depense() >= cfg.plafond) throw new Error(tr('Plafond des dépenses de la session atteint.'));
      const r = await appel(cfg, discussion, cb.signal);
      const c = ajouterCredits(h.lire(), cfg.fournisseur, cfg.modele, r.usage); h.credits(c.doc.extra.ia_credits, c.cout, r.usage);
      discussion.push(r.brut);
      if (r.texte) cb.journal && cb.journal('ia', r.texte);
      if (!r.appels.length) return { texte: r.texte, modifie };
      const resultats = [];
      for (const a of r.appels) {
        cb.journal && cb.journal('outil', `${a.nom} ${JSON.stringify(a.args).slice(0, 160)}`);
        try { const avant = h.version(); const res = await executer(h, a.nom, a.args); if (h.version() !== avant) modifie = true; resultats.push(resultatOutil(cfg, a.id, res)); }
        catch (e) { cb.journal && cb.journal('erreur', e.message); resultats.push(resultatOutil(cfg, a.id, { error: e.message }, true)); }
      }
      if (cfg.fournisseur === 'anthropic') discussion.push({ role: 'user', content: resultats }); else discussion.push(...resultats);
    }
    return { texte: tr('Arrêt : nombre de tours atteint.'), modifie };
  }
  /* vérifier la clé : courte demande à part (quelques jetons) */
  async function verifier(cfg) {
    if (cfg.fournisseur === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.cle, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: cfg.modele, max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(erreur(r.status, j.error && j.error.message)); } return true;
    }
    const url = cfg.fournisseur === 'mistral' ? (cfg.url || FOURNISSEURS.mistral.url) : FOURNISSEURS.openai.url;
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.cle }, body: JSON.stringify({ model: cfg.modele, max_tokens: 5, messages: [{ role: 'user', content: 'ok' }] }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(erreur(r.status, j.error && (j.error.message || j.error))); } return true;
  }
  const EXEMPLES = ['Dessine une plaque de 80 × 40 mm aux coins arrondis de 3 mm avec « BONJOUR » centré, 10 mm de haut.', 'Centre tous les objets sur la plaque.',
    'Ajoute un QR code de 20 mm vers https://example.com en bas à droite.', 'Fais un cadre décalé de 2 mm autour de tout le dessin.', 'Prépare un contour extérieur de la plaque avec une fraise de 3 mm, 2 mm de profondeur en passes de 0,5 mm.'];
  window.VDIA = { FOURNISSEURS, PRIX, OUTILS, executer, demander, verifier, ajouterCredits, EXEMPLES };
})();
