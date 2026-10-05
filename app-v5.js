(() => {
  'use strict';

  const LETTER_FILES = {
    alif: './data/alif.json',
    baa: './data/baa.json',
    taa: './data/taa.json',
    thaa: './data/thaa.json'
  };

  const FALLBACK = {
    id: 'alif-isolated-naskh',
    letter: 'ا',
    nameAr: 'الألف المفردة',
    script: 'Naskh',
    measurement: {
      unit: 'nib-point',
      heightPoints: 5,
      nibAngleDeg: 70,
      dotConnection: 'gap'
    },
    stroke: {
      count: 1,
      direction: 'top-to-bottom',
      summary: 'ضربة واحدة من أعلى إلى أسفل.',
      reference: 'خط القمة ← خط الأساس.'
    },
    practice: {
      columns: 9,
      rows: 3,
      modelRowOpacity: 1,
      ghostRowOpacity: 0.10,
      contextualExamples: [
        { id: 'amwaj', display: 'أَمْوَاجٌ', target: 'أَ', rest: 'مْوَاجٌ' },
        { id: 'ibriq', display: 'إِبْرِيقٌ', target: 'إِ', rest: 'بْرِيقٌ' },
        { id: 'iqra', display: 'اِقْرَأْ', target: 'اِ', rest: 'قْرَأْ' }
      ]
    }
  };

  const state = {
    data: FALLBACK,
    currentLetterFile: 'alif',
    mode: 'explain',
    pointSize: 48,
    nibAngleDeg: 70,
    brushColor: '#173f3b',
    aliSmoothing: 0.28,
    guideOpacity: 0.32,
    showPoints: true,
    showDirection: true,
    showGuides: true,
    strokes: [],
    currentStroke: null,
    deferredPrompt: null
  };

  const $ = id => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rad = deg => deg * Math.PI / 180;

  const svg = $('guideSvg');
  const canvas = $('inkCanvas');
  const ctx = canvas ? canvas.getContext('2d', { desynchronized: true }) : null;
  const worksheetCanvas = $('worksheetInkCanvas');
  const worksheetCtx = worksheetCanvas ? worksheetCanvas.getContext('2d', { desynchronized: true }) : null;

  const worksheetState = {
    enabled: true,
    strokes: [],
    currentStroke: null,
    saveTimer: null
  };

  function isBaaFamily() {
    return state.data && state.data.family === 'baa-group';
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function line(x1, y1, x2, y2, stroke = '#d7d4cf', width = 2, dash = '') {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="' + width + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
  }

  function getMizanGeometry(overrides = {}) {
    const S = Number(overrides.pointSize ?? state.pointSize);
    const alphaDeg = Number(overrides.angleDeg ?? state.nibAngleDeg);
    const alpha = rad(alphaDeg);
    const sinA = Math.abs(Math.sin(alpha));
    const cosA = Math.abs(Math.cos(alpha));
    const n = Number(state.data.measurement && state.data.measurement.heightPoints) || 5;
    const pointPitch = S * (cosA + sinA);
    const alifLength = n * pointPitch;
    const alifWidth = S * cosA;
    const baseline = Number(overrides.baseline ?? 600);
    const capLine = baseline - alifLength;
    const centerX = Number(overrides.centerX ?? 520);
    const nibHalfVertical = S * sinA / 2;
    const centerStartY = capLine + nibHalfVertical;
    const centerEndY = baseline - nibHalfVertical;
    return {
      S, alpha, alphaDeg, sinA, cosA, n,
      pointPitch, alifLength, alifWidth,
      baseline, capLine, centerX,
      centerStartY, centerEndY, nibHalfVertical
    };
  }

  function broadNibPolygon(points, m) {
    if (!points || points.length < 2) return '';
    const half = m.S / 2;
    const vx = Math.cos(m.alpha) * half;
    const vy = -Math.sin(m.alpha) * half;
    const sideA = points.map(p => [p.x + vx, p.y + vy]);
    const sideB = [...points].reverse().map(p => [p.x - vx, p.y - vy]);
    return [...sideA, ...sideB].map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
  }

  function alifCenterline(m) {
    return [
      { x: m.centerX, y: m.centerStartY },
      { x: m.centerX, y: m.centerEndY }
    ];
  }

  function qalamDotSvg(cx, cy, size, opacity = 1, color = '#b11f58', angleDeg = null) {
    const angle = angleDeg == null ? -state.nibAngleDeg : angleDeg;
    return '<rect x="' + (cx - size / 2) + '" y="' + (cy - size / 2) + '" width="' + size + '" height="' + size + '" rx="2" fill="' + color + '" opacity="' + opacity + '" transform="rotate(' + angle + ' ' + cx + ' ' + cy + ')"/>';
  }

  function syncLetterSelector() {
    document.querySelectorAll('.letter-select-btn').forEach(btn => {
      const active = btn.dataset.letterFile === state.currentLetterFile;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function syncLetterUI() {
    const d = state.data || FALLBACK;
    setText('letterName', d.nameAr || 'الحرف');
    setText('letterChip', d.letter || '');
    setText('familyName', d.familyNameAr || 'الألف + مجموعة الباء');
    setText('lessonTitle', 'قاعدة ' + (d.nameAr || 'الحرف'));

    if (isBaaFamily()) {
      const mw = Number(d.measurement && d.measurement.bodyWidthPoints) || 4;
      const mh = Number(d.measurement && d.measurement.bodyHeightPoints) || 3;
      setText('measurementSummary', mw + ' نقاط عرضًا × ' + mh + ' نقاط ارتفاعًا');
      setText('strokeSummary', d.stroke && d.stroke.summary ? d.stroke.summary : 'ثلاث مراحل مترابطة.');
      setText('dotSummary', d.dots && d.dots.summary ? d.dots.summary : '');
      setText('referenceSummary', d.stroke && d.stroke.reference ? d.stroke.reference : 'خط الأساس.');
      setText('primaryMeasureLabel', d.measurement && d.measurement.primaryLabel ? d.measurement.primaryLabel : 'امتداد جسم الحرف');
      setText('secondaryMeasureLabel', d.measurement && d.measurement.secondaryLabel ? d.measurement.secondaryLabel : 'ارتفاع الجسم');
    } else {
      const n = Number(d.measurement && d.measurement.heightPoints) || 5;
      setText('measurementSummary', n + ' نقاط رأسيًا');
      setText('strokeSummary', 'ضربة واحدة من أعلى إلى أسفل بالقصبة العريضة.');
      setText('dotSummary', 'لا توجد نقاط بنيوية للحرف.');
      setText('referenceSummary', 'خط القمة ← خط الأساس.');
      setText('primaryMeasureLabel', 'طول الألف = ' + n + ' نقاط');
      setText('secondaryMeasureLabel', 'عرض الألف النظري');
    }

    const label = d.nameAr || 'الحرف';
    const screenTitle = document.querySelector('.worksheet-title strong');
    if (screenTitle) screenTitle.textContent = label + ' في خط النسخ';
    const badge = document.querySelector('.worksheet-badge');
    if (badge) badge.textContent = isBaaFamily() ? 'مجموعة الباء' : '5 نقاط';
    setText('worksheetPrintTitle', 'ورقة تدريب ' + label + ' — خط النسخ');
    setText('worksheetLetterSectionTitle', 'التدريب على ' + label);
    setText('worksheetContextTitle', (d.letter || '') + ' داخل الكلمات');
    setText('worksheetContextSubtitle', 'تمييز الحرف المستهدف ثم التتبّع السياقي');
    setText('worksheetFooterLabel', 'حرف ' + (d.letter || '') + ' — ميزان النسخ');

    if (svg) svg.setAttribute('aria-label', 'هندسة ' + label);
    if (canvas) canvas.setAttribute('aria-label', 'لوحة تدريب ' + label);
    syncLetterSelector();
  }

  function updateMizanReadouts() {
    const m = getMizanGeometry();
    setText('pointPitchOut', m.pointPitch.toFixed(1) + 'px');
    if (isBaaFamily()) {
      setText('alifLengthOut', (Number(state.data.measurement && state.data.measurement.bodyWidthPoints) || 4) + ' نقاط');
      setText('alifWidthOut', (Number(state.data.measurement && state.data.measurement.bodyHeightPoints) || 3) + ' نقاط');
    } else {
      setText('alifLengthOut', m.alifLength.toFixed(1) + 'px');
      setText('alifWidthOut', m.alifWidth.toFixed(1) + 'px');
    }
  }

  async function loadLetter(letterFile = null, switching = false) {
    const requested = letterFile || localStorage.getItem('mizan-current-letter') || 'alif';
    const safeKey = LETTER_FILES[requested] ? requested : 'alif';

    if (switching) {
      saveWorksheetInk();
      saveWorksheetMeta();
    }

    let nextData = safeKey === 'alif' ? FALLBACK : null;
    try {
      const response = await fetch(LETTER_FILES[safeKey], { cache: 'no-store' });
      if (response.ok) nextData = await response.json();
    } catch (e) {}

    if (!nextData) {
      state.currentLetterFile = 'alif';
      state.data = FALLBACK;
    } else {
      state.currentLetterFile = safeKey;
      state.data = nextData;
    }
    localStorage.setItem('mizan-current-letter', state.currentLetterFile);

    const savedPoint = Number(localStorage.getItem('mizan-point-size'));
    const savedAngle = Number(localStorage.getItem('mizan-nib-angle'));
    const savedOpacity = Number(localStorage.getItem('mizan-guide-opacity'));
    const savedColor = localStorage.getItem('mizan-brush-color');
    const savedSmoothing = Number(localStorage.getItem('mizan-ali-smoothing'));

    state.pointSize = Number.isFinite(savedPoint) ? clamp(savedPoint, 24, 64) : 48;
    state.nibAngleDeg = Number.isFinite(savedAngle) ? clamp(savedAngle, 35, 80) : clamp(Number(state.data.measurement && state.data.measurement.nibAngleDeg) || 70, 35, 80);
    state.guideOpacity = Number.isFinite(savedOpacity) ? clamp(savedOpacity, 5, 100) / 100 : 0.32;
    state.brushColor = /^#[0-9a-f]{6}$/i.test(savedColor || '') ? savedColor : '#173f3b';
    state.aliSmoothing = Number.isFinite(savedSmoothing) ? clamp(savedSmoothing, 0, 70) / 100 : 0.28;

    $('pointSize').value = state.pointSize;
    setText('pointSizeOut', state.pointSize + 'px');
    $('nibAngle').value = state.nibAngleDeg;
    setText('nibAngleOut', state.nibAngleDeg + '°');
    $('guideOpacity').value = Math.round(state.guideOpacity * 100);
    setText('guideOpacityOut', Math.round(state.guideOpacity * 100) + '%');
    $('brushColor').value = state.brushColor;
    $('aliSmoothing').value = Math.round(state.aliSmoothing * 100);
    setText('aliSmoothingOut', Math.round(state.aliSmoothing * 100) + '%');

    state.strokes = [];
    state.currentStroke = null;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    syncLetterUI();
    render();
    renderWorksheet();

    worksheetState.strokes = [];
    worksheetState.currentStroke = null;
    if (worksheetCtx) worksheetCtx.clearRect(0, 0, worksheetCanvas.width, worksheetCanvas.height);
    loadWorksheetSession();
    fitWorksheetPage();
  }

  function alifSvg(m, opacity = 1, color = '#b11f58') {
    return '<polygon points="' + broadNibPolygon(alifCenterline(m), m) + '" fill="' + color + '" opacity="' + opacity + '"/>';
  }

  function alifGuides(m, left = 120, right = 880) {
    if (!state.showGuides) return '';
    return [
      line(left, m.capLine, right, m.capLine, '#cfd3d5', 2),
      line(left, m.baseline, right, m.baseline, '#cfd3d5', 2),
      '<text x="930" y="' + (m.capLine + 6) + '" text-anchor="end" fill="#9b938a" font-size="18">خط القمة</text>',
      '<text x="930" y="' + (m.baseline + 6) + '" text-anchor="end" fill="#9b938a" font-size="18">خط الأساس</text>'
    ].join('');
  }

  function alifPoints(m, opacity = 1) {
    if (!state.showPoints) return '';
    let h = '';
    for (let i = 0; i < m.n; i++) {
      h += qalamDotSvg(690, m.capLine + m.pointPitch * (i + 0.5), Math.max(24, state.pointSize * 0.72), opacity);
    }
    return h;
  }

  function alifDirection(m) {
    if (!state.showDirection) return '';
    const x = m.centerX - Math.max(55, m.S * 1.4);
    const y1 = m.centerStartY + 40;
    const y2 = m.centerEndY - 35;
    return '<defs><marker id="arrow-a" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#b11f58"/></marker></defs>' +
      '<path d="M' + x + ' ' + y1 + ' L' + x + ' ' + y2 + '" fill="none" stroke="#b11f58" stroke-width="4" marker-end="url(#arrow-a)"/>' +
      '<text x="' + (x - 24) + '" y="' + ((y1 + y2) / 2) + '" fill="#312b27" font-size="28">١</text>';
  }

  function familyStageTransform() {
    return { scale: 1.25, tx: 175, ty: 130 };
  }

  function transformFamilyPoint(p) {
    const t = familyStageTransform();
    return { x: t.tx + p.x * t.scale, y: t.ty + p.y * t.scale };
  }

  function familyGuideSvg() {
    const g = state.data.glyph;
    if (!g || !state.showGuides) return '';
    const base = transformFamilyPoint({ x: 0, y: g.baselineY });
    const cap = transformFamilyPoint({ x: 0, y: g.capLineY });
    return [
      line(100, cap.y, 900, cap.y, '#cfd3d5', 2),
      line(100, base.y, 900, base.y, '#cfd3d5', 2),
      '<text x="930" y="' + (cap.y + 6) + '" text-anchor="end" fill="#9b938a" font-size="18">خط القمة</text>',
      '<text x="930" y="' + (base.y + 6) + '" text-anchor="end" fill="#9b938a" font-size="18">خط الأساس</text>'
    ].join('');
  }

  function familyBodySvg(opacity = 1, colored = false) {
    const g = state.data.glyph;
    if (!g) return '';
    const t = familyStageTransform();
    const transform = 'translate(' + t.tx + ' ' + t.ty + ') scale(' + t.scale + ')';
    if (colored && Array.isArray(g.segments)) {
      return '<g transform="' + transform + '" opacity="' + opacity + '">' +
        g.segments.map(seg => '<path d="' + seg.path + '" fill="' + seg.color + '"/>').join('') + '</g>';
    }
    return '<g transform="' + transform + '" opacity="' + opacity + '"><path d="' + g.bodyPath + '" fill="#171412"/></g>';
  }

  function familyDotsSvg(opacity = 1) {
    const dots = state.data.dots && Array.isArray(state.data.dots.positions) ? state.data.dots.positions : [];
    const size = Math.max(23, state.pointSize * 0.70);
    return dots.map(dot => {
      const p = transformFamilyPoint(dot);
      return qalamDotSvg(p.x, p.y, size, opacity, '#b11f58');
    }).join('');
  }

  function familyArrowsSvg() {
    if (!state.showDirection) return '';
    const g = state.data.glyph;
    if (!g) return '';
    const t = familyStageTransform();
    let body = '<defs><marker id="arrow-f" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#b11f58"/></marker></defs>';
    for (const a of (g.arrows || [])) {
      body += '<g transform="translate(' + t.tx + ' ' + t.ty + ') scale(' + t.scale + ')">' +
        '<path d="' + a.path + '" fill="none" stroke="#b11f58" stroke-width="2.6" marker-end="url(#arrow-f)"/>' +
        '<text x="' + a.textX + '" y="' + a.textY + '" fill="#312b27" font-size="20" font-weight="700">' + a.n + '</text></g>';
    }
    return body;
  }

  function familyMeasureDotsSvg() {
    if (!state.showPoints) return '';
    const count = Number(state.data.measurement && state.data.measurement.bodyWidthPoints) || 4;
    const size = Math.max(24, state.pointSize * 0.70);
    let h = '';
    for (let i = 0; i < count; i++) {
      const x = 690 - i * size * 1.45;
      h += qalamDotSvg(x, 565, size, 1, '#b11f58', -45);
    }
    return h;
  }

  function familyTracePoints() {
    const points = state.data.glyph && Array.isArray(state.data.glyph.traceCenterline) ? state.data.glyph.traceCenterline : [];
    return points.map(transformFamilyPoint);
  }

  function buildExplain() {
    if (isBaaFamily()) {
      return familyGuideSvg() + familyBodySvg(1, true) + familyDotsSvg(1) + familyArrowsSvg() + familyMeasureDotsSvg();
    }
    const m = getMizanGeometry();
    return alifGuides(m) + alifSvg(m, 1, '#b11f58') + alifPoints(m, 1) + alifDirection(m);
  }

  function buildTrace() {
    if (isBaaFamily()) {
      return familyGuideSvg() + familyBodySvg(state.guideOpacity, false) + familyDotsSvg(Math.min(0.55, state.guideOpacity + 0.15));
    }
    const m = getMizanGeometry();
    return alifGuides(m, 100, 900) + alifSvg(m, state.guideOpacity, '#b11f58') + alifPoints(m, Math.min(0.55, state.guideOpacity + 0.15));
  }

  function buildFree() {
    if (isBaaFamily()) {
      let h = familyGuideSvg();
      const g = state.data.glyph;
      if (state.showGuides && g) {
        const base = transformFamilyPoint({ x: 0, y: g.baselineY });
        h += line(100, base.y - 120, 900, base.y - 120, '#eeeae4', 1, '8 8');
      }
      return h;
    }
    const m = getMizanGeometry();
    let h = alifGuides(m, 80, 920);
    if (state.showGuides) h += line(80, (m.capLine + m.baseline) / 2, 920, (m.capLine + m.baseline) / 2, '#eeeae4', 1, '8 8');
    return h;
  }

  function render() {
    if (!svg) return;
    $('stage').dataset.mode = state.mode;
    $('worksheet').hidden = state.mode !== 'worksheet';
    $('stage').hidden = state.mode === 'worksheet';

    const d = state.data || FALLBACK;
    const label = d.nameAr || 'الحرف';
    setText('workspaceTitle',
      state.mode === 'explain' ? 'تشريح ' + label + ' بالميزان' :
      state.mode === 'trace' ? 'تتبّع ' + label + ' بسنّ القصبة' :
      state.mode === 'free' ? 'كتابة ' + label + ' بحرية' :
      'ورقة تدريب ' + label
    );

    const m = getMizanGeometry();
    if (isBaaFamily()) {
      setText('stageNote',
        state.mode === 'explain' ? (d.stroke && d.stroke.summary ? d.stroke.summary : 'الجسم المشترك لمجموعة الباء.') :
        state.mode === 'trace' ? 'ابدأ من الطرف الأيمن، اسحب الجسم نحو اليسار، ثم أنهِ الطرف الأيسر.' :
        'اكتب ' + (d.letter || '') + ' على خط الأساس مع ثبات زاوية القصبة.'
      );
    } else {
      setText('stageNote',
        state.mode === 'explain' ? '5 نقاط × ' + m.pointPitch.toFixed(1) + ' = ' + m.alifLength.toFixed(1) + 'px — نفس القصبة تحكم النقطة والحرف.' :
        state.mode === 'trace' ? 'ارسم من خط القمة إلى خط الأساس بنفس زاوية سنّ القصبة.' :
        'اكتب الألف بين خط القمة وخط الأساس.'
      );
    }

    svg.innerHTML = state.mode === 'explain' ? buildExplain() : state.mode === 'trace' ? buildTrace() : buildFree();
    updateMizanReadouts();
    redrawInk();
  }

  function worksheetAlifMarkup(opacity = 1) {
    const alphaDeg = state.nibAngleDeg;
    const alpha = rad(alphaDeg);
    const sinA = Math.abs(Math.sin(alpha));
    const cosA = Math.abs(Math.cos(alpha));
    const n = Number(state.data.measurement && state.data.measurement.heightPoints) || 5;
    const desiredLength = 120;
    const S = desiredLength / (n * (sinA + cosA));
    const m = getMizanGeometry({ pointSize: S, angleDeg: alphaDeg, baseline: 145, centerX: 110 });
    return '<polygon points="' + broadNibPolygon(alifCenterline(m), m) + '" fill="#111" opacity="' + opacity + '"/>';
  }

  function worksheetFamilyMarkup(opacity = 1) {
    const g = state.data.glyph;
    if (!g) return '';
    let h = '<g transform="translate(6 35) scale(.40)" opacity="' + opacity + '"><path d="' + g.bodyPath + '" fill="#111"/></g>';
    const dotSize = 18;
    const dots = state.data.dots && Array.isArray(state.data.dots.positions) ? state.data.dots.positions : [];
    for (const dot of dots) {
      const x = 6 + dot.x * 0.40;
      const y = 35 + dot.y * 0.40;
      h += qalamDotSvg(x, y, dotSize, opacity, '#111', -45);
    }
    return h;
  }

  function worksheetLetterMarkup(opacity = 1) {
    return isBaaFamily() ? worksheetFamilyMarkup(opacity) : worksheetAlifMarkup(opacity);
  }

  function worksheetMarkerMarkup(kind, opacity = 1) {
    if (!kind || isBaaFamily()) return '';
    const y = kind === 'top' ? 18 : 163;
    return '<text x="110" y="' + y + '" text-anchor="middle" fill="#b11f58" opacity="' + opacity + '" font-size="18" font-weight="700" font-family="Amiri,serif">ء</text>';
  }

  function renderContextWord(example, opacity = 1) {
    const label = example && example.display ? example.display : '';
    let pieces = '';
    if (example && Array.isArray(example.parts)) {
      pieces = example.parts.map(part => '<span class="' + (part.target ? 'context-target-letter' : 'context-rest') + '">' + (part.text || '') + '</span>').join('');
    } else {
      const target = example && (example.target || example.prefixTarget) ? (example.target || example.prefixTarget) : '';
      const rest = example && example.rest ? example.rest : '';
      pieces = '<span class="context-target-letter">' + target + '</span><span class="context-rest">' + rest + '</span>';
    }
    return '<div class="context-word-line" style="--word-opacity:' + opacity + '" dir="rtl"><div class="context-baseline"></div><div class="context-word-text" aria-label="' + label + '">' + pieces + '</div></div>';
  }

  function renderWorksheet() {
    const host = $('practiceRows');
    const contextHost = $('contextExamples');
    if (!host || !contextHost) return;

    host.innerHTML = '';
    const columns = Number(state.data.practice && state.data.practice.columns) || (isBaaFamily() ? 6 : 9);
    const rows = Number(state.data.practice && state.data.practice.rows) || 3;
    const modelOpacity = Number(state.data.practice && state.data.practice.modelRowOpacity !== undefined ? state.data.practice.modelRowOpacity : 1);
    const ghostOpacity = Number(state.data.practice && state.data.practice.ghostRowOpacity !== undefined ? state.data.practice.ghostRowOpacity : 0.10);

    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div');
      row.className = 'practice-row';
      row.style.setProperty('--worksheet-columns', columns);
      row.innerHTML = '<div class="practice-baseline"></div><span class="practice-label">' + (r === 0 ? 'نموذج' : 'تتبّع') + '</span>';

      for (let c = 0; c < columns; c++) {
        const cell = document.createElement('div');
        cell.className = 'practice-cell';
        const opacity = r === 0 ? modelOpacity : ghostOpacity;
        let marker = '';
        if (!isBaaFamily()) {
          const firstThird = Math.ceil(columns / 3);
          const secondThird = Math.ceil(columns * 2 / 3);
          if (c >= firstThird && c < secondThird) marker = 'top';
          if (c >= secondThird) marker = 'bottom';
        }
        cell.innerHTML = '<svg viewBox="0 0 220 170" aria-hidden="true">' + worksheetLetterMarkup(opacity) + worksheetMarkerMarkup(marker, opacity) + '</svg>';
        row.appendChild(cell);
      }
      host.appendChild(row);
    }

    const examples = state.data.practice && Array.isArray(state.data.practice.contextualExamples) ? state.data.practice.contextualExamples : FALLBACK.practice.contextualExamples;
    contextHost.innerHTML = '';
    for (const example of examples) {
      const card = document.createElement('article');
      card.className = 'context-example-card';
      card.innerHTML = renderContextWord(example, 1) + renderContextWord(example, 0.10) + renderContextWord(example, 0.10);
      contextHost.appendChild(card);
    }
  }

  function fillNibSegment(context, p0, p1, m) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    if (Math.hypot(dx, dy) < 0.25) return;
    const half = m.S / 2;
    const vx = Math.cos(m.alpha) * half;
    const vy = -Math.sin(m.alpha) * half;
    context.beginPath();
    context.moveTo(p0.x + vx, p0.y + vy);
    context.lineTo(p1.x + vx, p1.y + vy);
    context.lineTo(p1.x - vx, p1.y - vy);
    context.lineTo(p0.x - vx, p0.y - vy);
    context.closePath();
    context.fill();
  }

  function makeStroke(firstPoint) {
    return {
      points: [firstPoint],
      started: false,
      color: state.brushColor,
      pointSize: state.pointSize,
      nibAngleDeg: state.nibAngleDeg,
      smoothing: state.aliSmoothing
    };
  }

  function strokeGeometry(stroke) {
    return getMizanGeometry({ pointSize: stroke.pointSize, angleDeg: stroke.nibAngleDeg });
  }

  function canvasPoint(e, targetCanvas = canvas) {
    const r = targetCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * targetCanvas.width / r.width,
      y: (e.clientY - r.top) * targetCanvas.height / r.height,
      pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.65
    };
  }

  function processStrokeSample(e, stroke, targetCtx, targetCanvas) {
    if (!stroke) return;
    const raw = canvasPoint(e, targetCanvas);
    const points = stroke.points;
    const prev = points[points.length - 1];
    const distRaw = Math.hypot(raw.x - prev.x, raw.y - prev.y);
    const startThreshold = Math.max(2.5, stroke.pointSize * 0.055);

    if (!stroke.started) {
      if (distRaw < startThreshold) return;
      stroke.started = true;
    } else if (distRaw < 0.35) {
      return;
    }

    const smoothness = clamp(stroke.smoothing, 0, 0.70);
    const baseAlpha = 1 - Math.min(0.92, Math.max(0.08, smoothness));
    const speedBoost = Math.min(0.65, distRaw / 28);
    const effectiveAlpha = Math.min(0.96, baseAlpha + speedBoost);
    const smoothed = {
      x: prev.x + (raw.x - prev.x) * effectiveAlpha,
      y: prev.y + (raw.y - prev.y) * effectiveAlpha,
      pressure: prev.pressure + (raw.pressure - prev.pressure) * effectiveAlpha
    };

    const lastDrawn = points[points.length - 1];
    const dist = Math.hypot(smoothed.x - lastDrawn.x, smoothed.y - lastDrawn.y);
    const stepSize = Math.max(2.2, stroke.pointSize * 0.075);
    const steps = Math.max(1, Math.min(8, Math.ceil(dist / stepSize)));
    let from = lastDrawn;
    const m = strokeGeometry(stroke);
    targetCtx.fillStyle = stroke.color;
    targetCtx.globalAlpha = 0.96;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = {
        x: lastDrawn.x + (smoothed.x - lastDrawn.x) * t,
        y: lastDrawn.y + (smoothed.y - lastDrawn.y) * t,
        pressure: lastDrawn.pressure + (smoothed.pressure - lastDrawn.pressure) * t
      };
      points.push(p);
      fillNibSegment(targetCtx, from, p, m);
      from = p;
    }
    targetCtx.globalAlpha = 1;
  }

  function redrawStrokeCollection(context, targetCanvas, strokes) {
    if (!context || !targetCanvas) return;
    context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    for (const stroke of strokes) {
      if (!stroke || stroke.started === false || !Array.isArray(stroke.points) || stroke.points.length < 2) continue;
      const m = strokeGeometry(stroke);
      context.fillStyle = stroke.color || '#173f3b';
      context.globalAlpha = 0.96;
      for (let i = 1; i < stroke.points.length; i++) fillNibSegment(context, stroke.points[i - 1], stroke.points[i], m);
    }
    context.globalAlpha = 1;
  }

  function redrawInk() {
    redrawStrokeCollection(ctx, canvas, state.strokes);
  }

  if (canvas) {
    canvas.addEventListener('pointerdown', e => {
      if (state.mode === 'explain' || state.mode === 'worksheet') return;
      e.preventDefault();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      state.currentStroke = makeStroke(canvasPoint(e));
    });

    canvas.addEventListener('pointermove', e => {
      if (!state.currentStroke) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const sample of (events.length ? events : [e])) {
        const wasStarted = state.currentStroke.started;
        processStrokeSample(sample, state.currentStroke, ctx, canvas);
        if (!wasStarted && state.currentStroke.started) state.strokes.push(state.currentStroke);
      }
    });

    const endMain = e => {
      if (!state.currentStroke) return;
      e.preventDefault();
      state.currentStroke = null;
    };
    canvas.addEventListener('pointerup', endMain);
    canvas.addEventListener('pointercancel', () => { state.currentStroke = null; });
    canvas.addEventListener('lostpointercapture', () => { state.currentStroke = null; });
  }

  function pointSegmentDistance(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  }

  function evaluate() {
    if (state.mode !== 'trace' || !state.strokes.length) {
      showScore('—', 'انتقل إلى وضع التتبّع وارسم فوق النموذج أولًا.');
      return;
    }
    const pts = state.strokes.flatMap(stroke => stroke && stroke.started !== false && Array.isArray(stroke.points) ? stroke.points : []);
    if (!pts.length) return;

    if (isBaaFamily()) {
      const target = familyTracePoints();
      let total = 0;
      for (const p of pts) {
        let best = Infinity;
        for (let i = 1; i < target.length; i++) best = Math.min(best, pointSegmentDistance(p, target[i - 1], target[i]));
        total += best;
      }
      const avg = total / pts.length;
      const tolerance = Math.max(20, state.pointSize * 0.95);
      const pathScore = clamp(100 - avg / tolerance * 100, 0, 100);
      const first = pts[0];
      const userWidth = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
      const targetWidth = Math.max(...target.map(p => p.x)) - Math.min(...target.map(p => p.x));
      const correctDirection = Math.hypot(first.x - target[0].x, first.y - target[0].y) < Math.hypot(first.x - target[target.length - 1].x, first.y - target[target.length - 1].y);
      const coverage = clamp(userWidth / Math.max(1, targetWidth) * 100, 0, 100);
      const score = Math.round(pathScore * 0.65 + coverage * 0.25 + (correctDirection ? 100 : 45) * 0.10);
      const hint = score >= 85 ? 'ممتاز: حافظت على انسياب الجسم واتجاه الحركة.' : score >= 70 ? 'جيد جدًا: راقب الانحناء وثبات خط الأساس.' : score >= 50 ? 'جيد كبداية: وسّع السحب الأفقي وانهِ الطرف الأيسر بهدوء.' : 'أعد المحاولة من الطرف الأيمن ثم اسحب الجسم نحو اليسار.';
      showScore(score + '%', hint);
      return;
    }

    const m = getMizanGeometry();
    let err = 0, count = 0, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.y < m.capLine - m.S || p.y > m.baseline + m.S) continue;
      err += Math.abs(p.x - m.centerX);
      count++;
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const avg = count ? err / count : 999;
    const pathScore = clamp(100 - avg / Math.max(10, m.alifWidth * 1.7) * 100, 0, 100);
    const coverage = Number.isFinite(minY) ? clamp((maxY - minY) / (m.centerEndY - m.centerStartY) * 100, 0, 100) : 0;
    const directionScore = pts[pts.length - 1].y > pts[0].y ? 100 : 35;
    const score = Math.round(pathScore * 0.60 + coverage * 0.30 + directionScore * 0.10);
    showScore(score + '%', score >= 85 ? 'ممتاز: حافظت على مركز الألف واتجاه النزول.' : score >= 70 ? 'جيد جدًا: راقب استقامة المركز.' : 'أعد المحاولة ببطء من خط القمة إلى خط الأساس.');
  }

  function showScore(value, hint) {
    $('scoreBox').hidden = false;
    setText('scoreValue', value);
    setText('scoreHint', hint);
  }

  function worksheetStorageKey() {
    return 'mizan-worksheet-' + (state.data && state.data.id ? state.data.id : 'alif') + '-ink-v1';
  }

  function worksheetMetaStorageKey() {
    return 'mizan-worksheet-' + (state.data && state.data.id ? state.data.id : 'alif') + '-meta-v1';
  }

  function saveWorksheetInk() {
    try {
      const clean = worksheetState.strokes.map(stroke => ({
        started: true,
        color: stroke.color,
        pointSize: stroke.pointSize,
        nibAngleDeg: stroke.nibAngleDeg,
        smoothing: stroke.smoothing,
        points: stroke.points.map(p => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)), pressure: Number((p.pressure || 0.65).toFixed(3)) }))
      }));
      localStorage.setItem(worksheetStorageKey(), JSON.stringify(clean));
    } catch (e) {}
  }

  function saveWorksheetMeta() {
    try {
      localStorage.setItem(worksheetMetaStorageKey(), JSON.stringify({
        student: $('worksheetStudentName') ? $('worksheetStudentName').value : '',
        date: $('worksheetDate') ? $('worksheetDate').value : ''
      }));
    } catch (e) {}
  }

  function loadWorksheetSession() {
    worksheetState.strokes = [];
    worksheetState.currentStroke = null;
    try {
      const saved = JSON.parse(localStorage.getItem(worksheetStorageKey()) || '[]');
      if (Array.isArray(saved)) worksheetState.strokes = saved.filter(s => s && Array.isArray(s.points) && s.points.length > 1).map(s => ({
        started: true,
        color: s.color || '#173f3b',
        pointSize: clamp(Number(s.pointSize) || 48, 12, 96),
        nibAngleDeg: clamp(Number(s.nibAngleDeg) || 70, 0, 90),
        smoothing: clamp(Number(s.smoothing) || 0.28, 0, 0.70),
        points: s.points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0, pressure: Number(p.pressure) || 0.65 }))
      }));
    } catch (e) {}

    if ($('worksheetStudentName')) $('worksheetStudentName').value = '';
    if ($('worksheetDate')) $('worksheetDate').value = '';
    try {
      const meta = JSON.parse(localStorage.getItem(worksheetMetaStorageKey()) || '{}');
      if ($('worksheetStudentName') && typeof meta.student === 'string') $('worksheetStudentName').value = meta.student;
      if ($('worksheetDate') && typeof meta.date === 'string') $('worksheetDate').value = meta.date;
    } catch (e) {}

    if ($('worksheetDate') && !$('worksheetDate').value) {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      $('worksheetDate').value = pad(d.getDate()) + ' / ' + pad(d.getMonth() + 1) + ' / ' + d.getFullYear();
    }
    redrawWorksheetInk();
  }

  function redrawWorksheetInk() {
    redrawStrokeCollection(worksheetCtx, worksheetCanvas, worksheetState.strokes);
  }

  function queueWorksheetSave() {
    clearTimeout(worksheetState.saveTimer);
    worksheetState.saveTimer = setTimeout(saveWorksheetInk, 120);
  }

  function setWorksheetDrawEnabled(enabled) {
    worksheetState.enabled = !!enabled;
    const btn = $('worksheetDrawToggle');
    if (btn) {
      btn.classList.toggle('is-active', worksheetState.enabled);
      btn.setAttribute('aria-pressed', worksheetState.enabled ? 'true' : 'false');
      const label = btn.querySelector('span:last-child');
      if (label) label.textContent = worksheetState.enabled ? 'الكتابة' : 'التمرير';
    }
    if (worksheetCanvas) worksheetCanvas.classList.toggle('is-disabled', !worksheetState.enabled);
  }

  function prepareWorksheetPrintInk() {
    const image = $('worksheetPrintInk');
    if (!image || !worksheetCanvas) return;
    try { image.src = worksheetCanvas.toDataURL('image/png'); } catch (e) { image.removeAttribute('src'); }
  }

  function fitWorksheetPage() {
    const viewport = document.querySelector('.worksheet-page-viewport');
    const page = $('worksheetPage');
    if (!viewport || !page) return;
    const available = Math.max(280, viewport.clientWidth - 2);
    const scale = Math.min(1, available / 794);
    viewport.style.setProperty('--worksheet-scale', String(scale));
    viewport.style.height = (1123 * scale) + 'px';
  }

  if (worksheetCanvas) {
    worksheetCanvas.addEventListener('pointerdown', e => {
      if (!worksheetState.enabled || state.mode !== 'worksheet') return;
      e.preventDefault();
      worksheetCanvas.setPointerCapture && worksheetCanvas.setPointerCapture(e.pointerId);
      worksheetState.currentStroke = makeStroke(canvasPoint(e, worksheetCanvas));
    });
    worksheetCanvas.addEventListener('pointermove', e => {
      if (!worksheetState.enabled || !worksheetState.currentStroke) return;
      e.preventDefault();
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const sample of (events.length ? events : [e])) {
        const wasStarted = worksheetState.currentStroke.started;
        processStrokeSample(sample, worksheetState.currentStroke, worksheetCtx, worksheetCanvas);
        if (!wasStarted && worksheetState.currentStroke.started) worksheetState.strokes.push(worksheetState.currentStroke);
      }
    });
    const endWorksheet = e => {
      if (!worksheetState.currentStroke) return;
      e.preventDefault();
      worksheetState.currentStroke = null;
      queueWorksheetSave();
    };
    worksheetCanvas.addEventListener('pointerup', endWorksheet);
    worksheetCanvas.addEventListener('pointercancel', () => { worksheetState.currentStroke = null; queueWorksheetSave(); });
    worksheetCanvas.addEventListener('lostpointercapture', () => { worksheetState.currentStroke = null; queueWorksheetSave(); });
  }

  document.querySelectorAll('.letter-select-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.letterFile;
      if (!key || key === state.currentLetterFile) return;
      await loadLetter(key, true);
      if (state.mode === 'worksheet') requestAnimationFrame(() => { fitWorksheetPage(); redrawWorksheetInk(); });
    });
  });

  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.mode = btn.dataset.mode;
    state.strokes = [];
    state.currentStroke = null;
    $('scoreBox').hidden = true;
    render();
    renderWorksheet();
    if (state.mode === 'worksheet') requestAnimationFrame(() => { fitWorksheetPage(); redrawWorksheetInk(); });
  }));

  $('pointSize').addEventListener('input', e => {
    state.pointSize = clamp(+e.target.value, 24, 64);
    setText('pointSizeOut', state.pointSize + 'px');
    localStorage.setItem('mizan-point-size', state.pointSize);
    render();
    renderWorksheet();
  });

  $('nibAngle').addEventListener('input', e => {
    state.nibAngleDeg = clamp(+e.target.value, 35, 80);
    setText('nibAngleOut', state.nibAngleDeg + '°');
    localStorage.setItem('mizan-nib-angle', state.nibAngleDeg);
    render();
    renderWorksheet();
  });

  $('brushColor').addEventListener('input', e => {
    state.brushColor = e.target.value;
    localStorage.setItem('mizan-brush-color', state.brushColor);
  });

  $('aliSmoothing').addEventListener('input', e => {
    state.aliSmoothing = clamp(+e.target.value, 0, 70) / 100;
    setText('aliSmoothingOut', Math.round(state.aliSmoothing * 100) + '%');
    localStorage.setItem('mizan-ali-smoothing', Math.round(state.aliSmoothing * 100));
  });

  $('guideOpacity').addEventListener('input', e => {
    state.guideOpacity = +e.target.value / 100;
    setText('guideOpacityOut', e.target.value + '%');
    localStorage.setItem('mizan-guide-opacity', e.target.value);
    render();
  });

  $('showPoints').addEventListener('change', e => { state.showPoints = e.target.checked; render(); });
  $('showDirection').addEventListener('change', e => { state.showDirection = e.target.checked; render(); });
  $('showGuides').addEventListener('change', e => { state.showGuides = e.target.checked; render(); });

  $('undoBtn').addEventListener('click', () => { state.strokes.pop(); redrawInk(); });
  $('clearBtn').addEventListener('click', () => { state.strokes = []; $('scoreBox').hidden = true; redrawInk(); });
  $('evaluateBtn').addEventListener('click', evaluate);

  if ($('worksheetDrawToggle')) $('worksheetDrawToggle').addEventListener('click', () => setWorksheetDrawEnabled(!worksheetState.enabled));
  if ($('worksheetUndoBtn')) $('worksheetUndoBtn').addEventListener('click', () => { worksheetState.strokes.pop(); redrawWorksheetInk(); saveWorksheetInk(); });
  if ($('worksheetClearBtn')) $('worksheetClearBtn').addEventListener('click', () => {
    if (!worksheetState.strokes.length) return;
    if (!window.confirm('مسح جميع الكتابة اليدوية من ورقة التدريب؟')) return;
    worksheetState.strokes = [];
    redrawWorksheetInk();
    saveWorksheetInk();
  });
  if ($('worksheetPrintBtn')) $('worksheetPrintBtn').addEventListener('click', () => { prepareWorksheetPrintInk(); saveWorksheetInk(); saveWorksheetMeta(); window.print(); });
  if ($('worksheetStudentName')) $('worksheetStudentName').addEventListener('input', saveWorksheetMeta);
  if ($('worksheetDate')) $('worksheetDate').addEventListener('input', saveWorksheetMeta);

  window.addEventListener('beforeprint', prepareWorksheetPrintInk);
  window.addEventListener('resize', fitWorksheetPage);
  if (typeof ResizeObserver !== 'undefined') {
    const viewport = document.querySelector('.worksheet-page-viewport');
    if (viewport) new ResizeObserver(fitWorksheetPage).observe(viewport);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.deferredPrompt = e;
    if ($('installBtn')) $('installBtn').hidden = false;
  });

  if ($('installBtn')) $('installBtn').addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    $('installBtn').hidden = true;
  });

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  loadLetter(localStorage.getItem('mizan-current-letter') || 'alif');
})();