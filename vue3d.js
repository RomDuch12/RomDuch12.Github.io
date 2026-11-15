/* Vue 3D commune (three.js, chargé à la demande) : scène Z en haut comme sur la machine,
   rotation au bouton gauche, déplacement au bouton droit ou du milieu, zoom à la molette, double-clic : vue iso.
   Fournit aussi le solide d'un outil (révolution de son profil, partie coupante en or) et le maillage d'un STEP. */
(function () {
  'use strict';
  const URL3 = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  let threeP = null;
  const three = () => threeP || (threeP = import(URL3).catch(e => { threeP = null; throw new Error((window.t ? t('three.js indisponible (connexion requise au premier usage).') : 'three.js indisponible') + ' ' + e.message); }));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const OR = 0xd9ad40, GRIS = 0x9ea3ad;

  async function creer(el, opts = {}) {
    const T = await three();
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opts.capture });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    el.append(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' });
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(35, 1, 0.01, 1e6);
    camera.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xffffff, 0x445066, 1.1));
    const sol = new T.DirectionalLight(0xffffff, 1.6); sol.position.set(0.6, -0.8, 1.4); scene.add(sol);
    const contre = new T.DirectionalLight(0xffffff, 0.5); contre.position.set(-1, 1, 0.3); scene.add(contre);
    const racine = new T.Group(); scene.add(racine);
    // caméra en coordonnées sphériques autour d'une cible
    const etat = { cible: new T.Vector3(), dist: 100, az: -Math.PI / 4, el: Math.PI / 5.5 };
    let boite = new T.Box3(new T.Vector3(-10, -10, -10), new T.Vector3(10, 10, 10)), demande = false;
    const placer = () => {
      const c = Math.cos(etat.el);
      camera.position.set(etat.cible.x + etat.dist * c * Math.cos(etat.az), etat.cible.y + etat.dist * c * Math.sin(etat.az), etat.cible.z + etat.dist * Math.sin(etat.el));
      camera.near = Math.max(etat.dist / 1000, 0.001); camera.far = etat.dist * 100; camera.updateProjectionMatrix(); camera.lookAt(etat.cible);
    };
    const rendre = () => { if (demande) return; demande = true; requestAnimationFrame(() => { demande = false; placer(); renderer.render(scene, camera); }); };
    const taille = () => { const w = el.clientWidth || 300, h = el.clientHeight || 200; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); rendre(); };
    const ro = new ResizeObserver(taille); ro.observe(el);
    function cadrer(b, iso = true) {
      if (b && !b.isEmpty()) boite = b.clone();
      const s = boite.getBoundingSphere(new T.Sphere());
      const v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect);           // le demi-champ le plus étroit
      etat.cible.copy(s.center); etat.dist = Math.max(s.radius, 0.5) / Math.sin(Math.min(v, h)) * 1.05;
      if (iso) { etat.az = -Math.PI / 4; etat.el = Math.PI / 5.5; }
      rendre();
    }
    // souris et toucher
    const cv = renderer.domElement, pts = new Map();
    let mode = null, x0 = 0, y0 = 0, bouge = 0, pinch = 0;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      mode = pts.size === 2 ? 'pinch' : (e.button === 0 && !e.shiftKey ? 'rot' : 'pan'); x0 = e.clientX; y0 = e.clientY; bouge = 0;
      if (mode === 'pinch') { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      cv.style.cursor = 'grabbing';
    });
    cv.addEventListener('pointermove', e => {
      if (!mode || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (mode === 'pinch' && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) etat.dist *= pinch / d; pinch = d; rendre(); return; }
      const dx = e.clientX - x0, dy = e.clientY - y0; x0 = e.clientX; y0 = e.clientY; bouge += Math.abs(dx) + Math.abs(dy);
      if (mode === 'rot') { etat.az -= dx * 0.008; etat.el = Math.max(-1.55, Math.min(1.55, etat.el + dy * 0.008)); }
      else {
        const k = etat.dist * 2 * Math.tan(camera.fov * Math.PI / 360) / (cv.clientHeight || 1);
        const dr = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        etat.cible.addScaledVector(dr, -dx * k).addScaledVector(up, dy * k);
      }
      rendre();
    });
    const fin = e => {
      if (mode === 'rot' && bouge < 4 && opts.onPick) {                   // un clic sans glisser : sélection
        const r = cv.getBoundingClientRect(), ray = new T.Raycaster();
        ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
        opts.onPick(ray.intersectObjects(racine.children, true).find(h => h.object.visible && h.object.userData.pick) || null);
      }
      pts.delete(e.pointerId); if (!pts.size) { mode = null; cv.style.cursor = 'grab'; } else mode = 'rot';
    };
    cv.addEventListener('pointerup', fin); cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => { e.preventDefault(); etat.dist *= Math.exp(e.deltaY * 0.0012); rendre(); }, { passive: false });
    cv.addEventListener('dblclick', () => cadrer(null, true));
    taille(); cadrer(boite);
    return { T, scene, camera, renderer, racine, rendre, cadrer, etat,
      vider() { racine.children.slice().forEach(o => { racine.remove(o); liberer(o); }); rendre(); },
      detruire() { ro.disconnect(); renderer.dispose(); cv.remove(); } };
  }
  function liberer(o) { o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) [].concat(x.material).forEach(m => m.dispose()); }); }

  /* solide de l'outil : un tour de chaque segment du profil (normales justes aux épaulements), Z en haut */
  function outil(T, points, zCoupe, opts = {}) {
    const g = new T.Group(), seg = opts.segments || 48;
    const mOr = new T.MeshStandardMaterial({ color: OR, metalness: 0.55, roughness: 0.35, side: T.DoubleSide, transparent: opts.opacite < 1, opacity: opts.opacite ?? 1 });
    const mGris = new T.MeshStandardMaterial({ color: GRIS, metalness: 0.6, roughness: 0.4, side: T.DoubleSide, transparent: opts.opacite < 1, opacity: opts.opacite ?? 1 });
    const pts = [[0, points[0][1]], ...points, [0, points[points.length - 1][1]]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ra, za] = pts[i], [rb, zb] = pts[i + 1];
      if (Math.abs(ra - rb) < 1e-9 && Math.abs(za - zb) < 1e-9) continue;
      const geo = new T.LatheGeometry([new T.Vector2(ra, za), new T.Vector2(rb, zb)], seg);
      const m = new T.Mesh(geo, (za + zb) / 2 <= (zCoupe ?? -1) + 1e-9 ? mOr : mGris);
      g.add(m);
    }
    g.rotation.x = Math.PI / 2;                                           // l'axe du tour (Y) devient Z
    const h = new T.Group(); h.add(g); return h;
  }
  /* maillage d'un STEP lu par Vecteurs.readSTEP3D : couleurs des faces si le fichier en donne */
  function solide(T, s, opts = {}) {
    const g = new T.Group();
    for (const m of s.meshes) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(m.pos, 3));
      if (m.normal && m.normal.length === m.pos.length) geo.setAttribute('normal', new T.BufferAttribute(m.normal, 3));
      geo.setIndex(new T.BufferAttribute(m.index, 1));
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      const col = new Float32Array(m.pos.length), base = m.color || opts.couleur || [0.72, 0.75, 0.8];
      col.fill(0); for (let i = 0; i < col.length; i += 3) { col[i] = base[0]; col[i + 1] = base[1]; col[i + 2] = base[2]; }
      const faceDe = new Int32Array(m.index.length / 3).fill(-1);
      m.faces.forEach((f, k) => {
        for (let t = f.first; t <= f.last; t++) { faceDe[t] = k; if (f.color) for (let j = 0; j < 3; j++) { const v = m.index[3 * t + j]; col[3 * v] = f.color[0]; col[3 * v + 1] = f.color[1]; col[3 * v + 2] = f.color[2]; } }
      });
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      const mat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55, side: T.DoubleSide, transparent: (opts.opacite ?? 1) < 1, opacity: opts.opacite ?? 1,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new T.Mesh(geo, mat); mesh.userData = { pick: true, faceDe, source: m };
      g.add(mesh);
      if (opts.aretes !== false) g.add(new T.LineSegments(new T.EdgesGeometry(geo, 25), new T.LineBasicMaterial({ color: 0x333a44, transparent: true, opacity: 0.45 })));
    }
    return g;
  }
  /* surligne une face B-rep (indices de triangles) d'un maillage STEP */
  function surligner(T, hit, couleur = 0x4aa3ff) {
    const mesh = hit.object, k = mesh.userData.faceDe[hit.faceIndex], f = mesh.userData.source.faces[k];
    if (!f) return null;
    const src = mesh.geometry, idx = [];
    for (let t = f.first; t <= f.last; t++) idx.push(src.index.array[3 * t], src.index.array[3 * t + 1], src.index.array[3 * t + 2]);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', src.getAttribute('position')); geo.setIndex(idx);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.55, side: T.DoubleSide, depthTest: false }));
    m.renderOrder = 5; m.userData.face = k;
    return m;
  }
  window.Vue3D = { three, creer, outil, solide, surligner, liberer, css };
})();
