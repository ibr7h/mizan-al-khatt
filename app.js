(() => {
  'use strict';

  const FALLBACK = {
    id:'alif-isolated-naskh',
    letter:'ا',
    nameAr:'الألف المفردة',
    script:'Naskh',
    measurement:{
      unit:'nib-point',
      heightPoints:5,
      nibAngleDeg:70,
      dotConnection:'gap',
      formula:'S*(cos(alpha)+sin(alpha))'
    },
    stroke:{
      count:1,
      direction:'top-to-bottom',
      start:{x:.5,y:0},
      end:{x:.5,y:1},
      centerline:[{x:.5,y:0},{x:.5,y:1}]
    },
    practice:{columns:9,rows:3,modelRowOpacity:1,ghostRowOpacity:.10,contextualExamples:[{id:'amwaj',display:'أَمْوَاجٌ',target:'أَ',rest:'مْوَاجٌ'},{id:'ibriq',display:'إِبْرِيقٌ',target:'إِ',rest:'بْرِيقٌ'},{id:'iqra',display:'اِقْرَأْ',target:'اِ',rest:'قْرَأْ'}]}
  };

  const state = {
    data:FALLBACK,
    mode:'explain',
    pointSize:48,
    nibAngleDeg:70,
    brushColor:'#173f3b',
    aliSmoothing:.28,
    guideOpacity:.32,
    showPoints:true,
    showDirection:true,
    showGuides:true,
    strokes:[],
    currentStroke:null,
    deferredPrompt:null
  };

  const $ = id => document.getElementById(id);
  const svg = $('guideSvg');
  const canvas = $('inkCanvas');
  const ctx = canvas.getContext('2d');

  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const rad = deg => deg * Math.PI / 180;

  async function loadData() {
    try {
      const r = await fetch('./data/alif.json', {cache:'no-store'});
      if (r.ok) state.data = await r.json();
    } catch (e) {}

    const savedPoint = Number(localStorage.getItem('mizan-point-size'));
    const savedAngle = Number(localStorage.getItem('mizan-nib-angle'));
    const savedOpacity = Number(localStorage.getItem('mizan-guide-opacity'));
    const savedColor = localStorage.getItem('mizan-brush-color');
    const savedSmoothing = Number(localStorage.getItem('mizan-ali-smoothing'));

    state.pointSize = Number.isFinite(savedPoint) ? clamp(savedPoint,24,64) : 48;
    state.nibAngleDeg = Number.isFinite(savedAngle)
      ? clamp(savedAngle,35,80)
      : clamp(Number(state.data.measurement?.nibAngleDeg) || 70,35,80);
    state.guideOpacity = Number.isFinite(savedOpacity)
      ? clamp(savedOpacity,5,100)/100
      : .32;
    state.brushColor = /^#[0-9a-f]{6}$/i.test(savedColor || '') ? savedColor : '#173f3b';
    state.aliSmoothing = Number.isFinite(savedSmoothing)
      ? clamp(savedSmoothing,0,70)/100
      : .28;

    $('pointSize').value = state.pointSize;
    $('pointSizeOut').textContent = state.pointSize + 'px';
    $('nibAngle').value = state.nibAngleDeg;
    $('nibAngleOut').textContent = state.nibAngleDeg + '°';
    $('guideOpacity').value = Math.round(state.guideOpacity * 100);
    $('guideOpacityOut').textContent = Math.round(state.guideOpacity * 100) + '%';
    $('brushColor').value = state.brushColor;
    $('aliSmoothing').value = Math.round(state.aliSmoothing * 100);
    $('aliSmoothingOut').textContent = Math.round(state.aliSmoothing * 100) + '%';

    $('letterName').textContent = state.data.nameAr;
    $('letterChip').textContent = state.data.letter;
    $('heightPoints').textContent = state.data.measurement.heightPoints + ' نقاط';

    render();
    renderWorksheet();
  }

  function getMizanGeometry(overrides = {}) {
    const S = Number(overrides.pointSize ?? state.pointSize);
    const alphaDeg = Number(overrides.angleDeg ?? state.nibAngleDeg);
    const alpha = rad(alphaDeg);
    const sinA = Math.abs(Math.sin(alpha));
    const cosA = Math.abs(Math.cos(alpha));
    const n = Number(state.data.measurement?.heightPoints) || 5;

    // "Gap connection" vertical unit from the geometric projection
    // of a square qalam dot of side S at placing angle alpha.
    const pointPitch = S * (cosA + sinA);
    const alifLength = n * pointPitch;

    // A vertical broad-nib stroke has horizontal width S*cos(alpha).
    const alifWidth = S * cosA;

    const baseline = Number(overrides.baseline ?? 600);
    const capLine = baseline - alifLength;
    const centerX = Number(overrides.centerX ?? 520);

    // The qalam edge itself contributes S*sin(alpha)/2 above/below
    // the centerline. Offset the centerline so the actual ink envelope
    // lands exactly on capLine and baseline.
    const nibHalfVertical = S * sinA / 2;
    const centerStartY = capLine + nibHalfVertical;
    const centerEndY = baseline - nibHalfVertical;

    return {
      S, alpha, alphaDeg, sinA, cosA, n,
      pointPitch, alifLength, alifWidth,
      baseline, capLine, centerX,
      centerStartY, centerEndY,
      nibHalfVertical
    };
  }

  function updateMizanReadouts() {
    const m = getMizanGeometry();
    $('pointPitchOut').textContent = m.pointPitch.toFixed(1) + 'px';
    $('alifLengthOut').textContent = m.alifLength.toFixed(1) + 'px';
    $('alifWidthOut').textContent = m.alifWidth.toFixed(1) + 'px';
  }

  function line(x1,y1,x2,y2,stroke='#d7d4cf',width=2,dash='') {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  }

  function qalamDotSvg(cx,cy,m,color='#b11f58',opacity=1) {
    const s = m.S;
    const x = cx - s/2;
    const y = cy - s/2;
    // SVG coordinates grow downward, so use -alpha for the qalam slant.
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.5"
      fill="${color}" opacity="${opacity}"
      transform="rotate(${-m.alphaDeg} ${cx} ${cy})"/>`;
  }

  function broadNibPolygon(points,m) {
    if (!points || points.length < 2) return '';
    const half = m.S / 2;
    const vx = Math.cos(m.alpha) * half;
    const vy = -Math.sin(m.alpha) * half;

    const sideA = points.map(p => [p.x + vx, p.y + vy]);
    const sideB = [...points].reverse().map(p => [p.x - vx, p.y - vy]);
    return [...sideA,...sideB].map(p => p[0].toFixed(2)+','+p[1].toFixed(2)).join(' ');
  }

  function alifCenterline(m) {
    return [
      {x:m.centerX,y:m.centerStartY},
      {x:m.centerX,y:m.centerEndY}
    ];
  }

  function alifSvg(m,opacity=1,color='#b11f58') {
    const polygon = broadNibPolygon(alifCenterline(m),m);
    return `<polygon points="${polygon}" fill="${color}" opacity="${opacity}"/>`;
  }

  function pointStackSvg(m,x=690,opacity=1,color='#b11f58') {
    let h = '';
    for (let i=0;i<m.n;i++) {
      const cy = m.capLine + m.pointPitch * (i + .5);
      h += qalamDotSvg(x,cy,m,color,opacity);
    }
    return h;
  }

  function guideLines(m,left=120,right=880) {
    if (!state.showGuides) return '';
    return [
      line(left,m.capLine,right,m.capLine,'#cfd3d5',2),
      line(left,m.baseline,right,m.baseline,'#cfd3d5',2),
      `<text x="930" y="${m.capLine+6}" text-anchor="end" fill="#9b938a" font-size="18">خط القمة</text>`,
      `<text x="930" y="${m.baseline+6}" text-anchor="end" fill="#9b938a" font-size="18">خط الأساس</text>`
    ].join('');
  }

  function directionSvg(m) {
    if (!state.showDirection) return '';
    const x = m.centerX - Math.max(55,m.S*1.4);
    const y1 = m.centerStartY + Math.min(40,m.alifLength*.14);
    const y2 = m.centerEndY - Math.min(35,m.alifLength*.10);
    return `
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L7,3 z" fill="#b11f58"/>
        </marker>
      </defs>
      <path d="M${x} ${y1} L${x} ${y2}" fill="none" stroke="#b11f58" stroke-width="4" marker-end="url(#arrow)"/>
      <text x="${x-24}" y="${(y1+y2)/2}" fill="#4e4944" font-size="28">١</text>`;
  }

  function measurementBracketSvg(m) {
    const x = 760;
    return `
      <line x1="${x}" y1="${m.capLine}" x2="${x}" y2="${m.baseline}" stroke="#b69336" stroke-width="2"/>
      <line x1="${x-10}" y1="${m.capLine}" x2="${x+10}" y2="${m.capLine}" stroke="#b69336" stroke-width="2"/>
      <line x1="${x-10}" y1="${m.baseline}" x2="${x+10}" y2="${m.baseline}" stroke="#b69336" stroke-width="2"/>
      <text x="${x+18}" y="${(m.capLine+m.baseline)/2}" fill="#8b6a20" font-size="17">
        ${m.n} × ${m.pointPitch.toFixed(1)} = ${m.alifLength.toFixed(1)}
      </text>`;
  }

  function buildExplain() {
    const m = getMizanGeometry();
    let h = guideLines(m,120,900);
    h += alifSvg(m,1,'#b11f58');
    if (state.showPoints) h += pointStackSvg(m,680,1,'#b11f58');
    h += directionSvg(m);
    h += measurementBracketSvg(m);
    return h;
  }

  function buildTrace() {
    const m = getMizanGeometry();
    let h = guideLines(m,100,900);
    h += alifSvg(m,state.guideOpacity,'#b11f58');
    if (state.showPoints) h += pointStackSvg(m,680,Math.min(.55,state.guideOpacity+.15),'#b11f58');
    return h;
  }

  function buildFree() {
    const m = getMizanGeometry();
    let h = guideLines(m,80,920);
    if (state.showGuides) {
      const mid = (m.capLine + m.baseline) / 2;
      h += line(80,mid,920,mid,'#eeeae4',1,'8 8');
    }
    return h;
  }

  function render() {
    $('stage').dataset.mode = state.mode;
    $('worksheet').hidden = state.mode !== 'worksheet';
    $('stage').hidden = state.mode === 'worksheet';

    $('workspaceTitle').textContent =
      state.mode==='explain' ? 'تشريح حرف الألف بالميزان'
      : state.mode==='trace' ? 'تتبّع الألف بسنّ القصبة'
      : state.mode==='free' ? 'كتابة الألف بحرية'
      : 'ورقة تدريب الألف';

    const m = getMizanGeometry();
    $('stageNote').textContent =
      state.mode==='explain'
        ? `5 نقاط × ${m.pointPitch.toFixed(1)} = ${m.alifLength.toFixed(1)}px — نفس القصبة تحكم النقطة والحرف.`
        : state.mode==='trace'
        ? 'ارسم من خط القمة إلى خط الأساس بنفس زاوية سنّ القصبة.'
        : 'اكتب الألف بين خط القمة وخط الأساس؛ الفرشاة الآن قصبة عريضة وليست فرشاة دائرية.';

    if (state.mode==='explain') svg.innerHTML = buildExplain();
    else if (state.mode==='trace') svg.innerHTML = buildTrace();
    else svg.innerHTML = buildFree();

    updateMizanReadouts();
    redrawInk();
  }

  function worksheetAlifMarkup(opacity=1) {
    const alphaDeg = state.nibAngleDeg;
    const alpha = rad(alphaDeg);
    const sinA = Math.abs(Math.sin(alpha));
    const cosA = Math.abs(Math.cos(alpha));
    const n = Number(state.data.measurement?.heightPoints) || 5;
    const desiredLength = 410;
    const S = desiredLength / (n * (sinA + cosA));
    const m = getMizanGeometry({
      pointSize:S,
      angleDeg:alphaDeg,
      baseline:475,
      centerX:50
    });
    return `<polygon points="${broadNibPolygon(alifCenterline(m),m)}" fill="#111" opacity="${opacity}"/>`;
  }

  function worksheetMarkerMarkup(kind, opacity=1) {
    if (!kind) return '';
    const y = kind === 'top' ? 44 : 512;
    return '<text x="50" y="'+y+'" text-anchor="middle" fill="#b11f58" opacity="'+opacity+'" font-size="24" font-weight="700" font-family="Amiri, serif">ء</text>';
  }

  function renderContextWord(example, opacity=1) {
    const target = example && (example.target || example.prefixTarget) ? (example.target || example.prefixTarget) : '';
    const rest = example && example.rest ? example.rest : '';
    const label = example && example.display ? example.display : (target + rest);
    return '<div class="context-word-line" style="--word-opacity:'+opacity+'" dir="rtl">' +
      '<div class="context-baseline"></div>' +
      '<div class="context-word-text" aria-label="'+label+'">' +
      '<span class="context-target-alif">'+target+'</span><span class="context-rest">'+rest+'</span>' +
      '</div></div>';
  }

  function renderWorksheet() {
    const host = $('practiceRows');
    const contextHost = $('contextExamples');
    if (!host || !contextHost) return;

    host.innerHTML = '';
    const columns = Number(state.data.practice && state.data.practice.columns) || 9;
    const rows = Number(state.data.practice && state.data.practice.rows) || 3;
    const modelOpacity = Number(state.data.practice && state.data.practice.modelRowOpacity !== undefined ? state.data.practice.modelRowOpacity : 1);
    const ghostOpacity = Number(state.data.practice && state.data.practice.ghostRowOpacity !== undefined ? state.data.practice.ghostRowOpacity : .10);

    for (let r=0;r<rows;r++) {
      const row = document.createElement('div');
      row.className = 'practice-row';
      row.style.setProperty('--worksheet-columns', columns);
      row.innerHTML = '<div class="practice-baseline"></div><span class="practice-label">'+(r===0?'نموذج':'تتبّع')+'</span>';

      for (let c=0;c<columns;c++) {
        const cell = document.createElement('div');
        cell.className = 'practice-cell';
        const opacity = r===0 ? modelOpacity : ghostOpacity;
        let marker = '';
        const firstThird = Math.ceil(columns/3);
        const secondThird = Math.ceil(columns*2/3);
        if (c >= firstThird && c < secondThird) marker = 'top';
        if (c >= secondThird) marker = 'bottom';
        cell.innerHTML = '<svg viewBox="0 0 100 520" aria-hidden="true">' + worksheetAlifMarkup(opacity) + worksheetMarkerMarkup(marker,opacity) + '</svg>';
        row.appendChild(cell);
      }
      host.appendChild(row);
    }

    const examples = state.data.practice && Array.isArray(state.data.practice.contextualExamples)
      ? state.data.practice.contextualExamples
      : FALLBACK.practice.contextualExamples;

    contextHost.innerHTML = '';
    examples.forEach(example => {
      const card = document.createElement('article');
      card.className = 'context-example-card';
      card.innerHTML = '<div class="context-example-name">'+(example.display || '')+'</div>' +
        renderContextWord(example,1) +
        renderContextWord(example,.10) +
        renderContextWord(example,.10);
      contextHost.appendChild(card);
    });
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x:(e.clientX-r.left)*canvas.width/r.width,
      y:(e.clientY-r.top)*canvas.height/r.height,
      pressure:(e.pressure && e.pressure > 0) ? e.pressure : .65
    };
  }

  function makeStroke(firstPoint) {
    return {
      points:[firstPoint],
      started:false,
      color:state.brushColor,
      pointSize:state.pointSize,
      nibAngleDeg:state.nibAngleDeg,
      smoothing:state.aliSmoothing
    };
  }

  function strokeGeometry(stroke) {
    return getMizanGeometry({
      pointSize:stroke.pointSize,
      angleDeg:stroke.nibAngleDeg
    });
  }

  function fillNibSegment(context,p0,p1,m) {
    const dx = p1.x-p0.x;
    const dy = p1.y-p0.y;
    if (Math.hypot(dx,dy) < .25) return;

    const half = m.S/2;
    const vx = Math.cos(m.alpha)*half;
    const vy = -Math.sin(m.alpha)*half;

    context.beginPath();
    context.moveTo(p0.x+vx,p0.y+vy);
    context.lineTo(p1.x+vx,p1.y+vy);
    context.lineTo(p1.x-vx,p1.y-vy);
    context.lineTo(p0.x-vx,p0.y-vy);
    context.closePath();
    context.fill();
  }

  function drawStrokeSegment(stroke,p0,p1) {
    const m = strokeGeometry(stroke);
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = .96;
    fillNibSegment(ctx,p0,p1,m);
    ctx.globalAlpha = 1;
  }

  function processPointerSample(e) {
    const stroke = state.currentStroke;
    if (!stroke) return;

    const raw = canvasPoint(e);
    const points = stroke.points;
    const prev = points[points.length-1];

    const distRaw = Math.hypot(raw.x-prev.x,raw.y-prev.y);

    // Ignore duplicate/coalesced samples and tiny contact jitter.
    // Do not create any ink merely because the pen touched the screen.
    const startThreshold = Math.max(2.5, stroke.pointSize * 0.055);
    if (!stroke.started) {
      if (distRaw < startThreshold) return;
      stroke.started = true;
      state.strokes.push(stroke);
    } else if (distRaw < .35) {
      return;
    }

    // Ported from AliQaseef: adaptive low-pass smoothing.
    // Slow movement gets more stabilization; fast movement gets more response.
    const smoothness = clamp(stroke.smoothing,0,.70);
    const baseAlpha = 1 - Math.min(.92,Math.max(.08,smoothness));
    const speedBoost = Math.min(.65,distRaw/28);
    const effectiveAlpha = Math.min(.96,baseAlpha+speedBoost);

    const smoothed = {
      x:prev.x+(raw.x-prev.x)*effectiveAlpha,
      y:prev.y+(raw.y-prev.y)*effectiveAlpha,
      pressure:prev.pressure+(raw.pressure-prev.pressure)*effectiveAlpha
    };

    const lastDrawn = points[points.length-1];
    const dist = Math.hypot(smoothed.x-lastDrawn.x,smoothed.y-lastDrawn.y);

    // Small interpolation steps keep curves continuous without redrawing
    // the whole canvas on every pointer event.
    const stepSize = Math.max(2.2,stroke.pointSize*.075);
    const steps = Math.max(1,Math.min(8,Math.ceil(dist/stepSize)));

    let from = lastDrawn;
    for (let i=1;i<=steps;i++) {
      const t=i/steps;
      const p={
        x:lastDrawn.x+(smoothed.x-lastDrawn.x)*t,
        y:lastDrawn.y+(smoothed.y-lastDrawn.y)*t,
        pressure:lastDrawn.pressure+(smoothed.pressure-lastDrawn.pressure)*t
      };
      points.push(p);
      drawStrokeSegment(stroke,from,p);
      from=p;
    }
  }

  canvas.addEventListener('pointerdown', e => {
    if (state.mode==='explain' || state.mode==='worksheet') return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);

    // Pending stroke only. A simple touch/tap must never leave a qalam dot.
    const first = canvasPoint(e);
    state.currentStroke = makeStroke(first);
  });

  canvas.addEventListener('pointermove', e => {
    if (!state.currentStroke) return;
    e.preventDefault();

    const events = typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents()
      : [e];

    if (events.length) {
      for (const sample of events) processPointerSample(sample);
    } else {
      processPointerSample(e);
    }
  });

  const endStroke = e => {
    if (!state.currentStroke) return;
    e.preventDefault();

    // A press/release without an actual move event is not a stroke.
    // Do not let release jitter create a synthetic qalam dot.
    if (!state.currentStroke.started) {
      state.currentStroke = null;
      return;
    }

    state.currentStroke = null;
  };

  canvas.addEventListener('pointerup',endStroke);
  canvas.addEventListener('pointercancel',()=>{
    if (state.currentStroke && !state.currentStroke.started) state.currentStroke = null;
    else state.currentStroke = null;
  });
  canvas.addEventListener('lostpointercapture',()=>{
    if (state.currentStroke && !state.currentStroke.started) state.currentStroke = null;
    else state.currentStroke = null;
  });

  function redrawInk() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    for (const stroke of state.strokes) {
      if (!stroke || !Array.isArray(stroke.points) || !stroke.points.length) continue;

      const m = strokeGeometry(stroke);
      ctx.fillStyle = stroke.color || '#173f3b';
      ctx.globalAlpha = .96;

      if (stroke.points.length < 2 || stroke.started === false) continue;

      for (let i=1;i<stroke.points.length;i++) {
        fillNibSegment(ctx,stroke.points[i-1],stroke.points[i],m);
      }
    }
    ctx.globalAlpha = 1;
  }

  function evaluate() {
    if (state.mode!=='trace' || !state.strokes.length) {
      showScore('—','انتقل إلى وضع التتبّع وارسم فوق الألف أولًا.');
      return;
    }

    const m = getMizanGeometry();
    const pts = state.strokes.flatMap(stroke =>
      stroke?.started !== false && Array.isArray(stroke?.points) ? stroke.points : []
    );
    if (!pts.length) return;

    let err=0,count=0,minY=Infinity,maxY=-Infinity;
    for (const p of pts) {
      if (p.y < m.capLine - m.S || p.y > m.baseline + m.S) continue;
      err += Math.abs(p.x - m.centerX);
      count++;
      minY = Math.min(minY,p.y);
      maxY = Math.max(maxY,p.y);
    }

    const avg = count ? err/count : 999;
    const tolerance = Math.max(10,m.alifWidth*1.7);
    const pathScore = clamp(100-(avg/tolerance)*100,0,100);
    const coverage = Number.isFinite(minY)
      ? clamp(((maxY-minY)/(m.centerEndY-m.centerStartY))*100,0,100)
      : 0;

    const first = pts[0], last = pts[pts.length-1];
    const directionScore = first && last && last.y > first.y ? 100 : 35;
    const score = Math.round(pathScore*.60 + coverage*.30 + directionScore*.10);

    let hint =
      score>=85 ? 'ممتاز: حافظت على مركز الألف واتجاه النزول.'
      : score>=70 ? 'جيد جدًا: راقب استقامة المركز وثبات زاوية القصبة.'
      : score>=50 ? 'جيد كبداية: ابدأ من القمة وانزل عموديًا مع إبقاء زاوية القصبة ثابتة.'
      : 'أعد المحاولة ببطء؛ لا تغيّر زاوية سنّ القصبة أثناء النزول.';

    showScore(score+'%',hint);
  }

  function showScore(value,hint) {
    $('scoreBox').hidden = false;
    $('scoreValue').textContent = value;
    $('scoreHint').textContent = hint;
  }

  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click',() => {
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.mode = btn.dataset.mode;
    state.strokes = [];
    $('scoreBox').hidden = true;
    render();
    renderWorksheet();
  }));

  $('pointSize').addEventListener('input', e => {
    state.pointSize = clamp(+e.target.value,24,64);
    $('pointSizeOut').textContent = state.pointSize+'px';
    localStorage.setItem('mizan-point-size',state.pointSize);
    render();
    renderWorksheet();
  });

  $('nibAngle').addEventListener('input', e => {
    state.nibAngleDeg = clamp(+e.target.value,35,80);
    $('nibAngleOut').textContent = state.nibAngleDeg+'°';
    localStorage.setItem('mizan-nib-angle',state.nibAngleDeg);
    render();
    renderWorksheet();
  });

  $('brushColor').addEventListener('input', e => {
    state.brushColor = e.target.value;
    localStorage.setItem('mizan-brush-color',state.brushColor);
  });

  $('aliSmoothing').addEventListener('input', e => {
    state.aliSmoothing = clamp(+e.target.value,0,70)/100;
    $('aliSmoothingOut').textContent = Math.round(state.aliSmoothing*100)+'%';
    localStorage.setItem('mizan-ali-smoothing',Math.round(state.aliSmoothing*100));
  });

  $('guideOpacity').addEventListener('input', e => {
    state.guideOpacity = +e.target.value/100;
    $('guideOpacityOut').textContent = e.target.value+'%';
    localStorage.setItem('mizan-guide-opacity',e.target.value);
    render();
  });

  $('showPoints').addEventListener('change',e=>{state.showPoints=e.target.checked;render();});
  $('showDirection').addEventListener('change',e=>{state.showDirection=e.target.checked;render();});
  $('showGuides').addEventListener('change',e=>{state.showGuides=e.target.checked;render();});

  $('undoBtn').addEventListener('click',()=>{state.strokes.pop();redrawInk();});
  $('clearBtn').addEventListener('click',()=>{state.strokes=[];$('scoreBox').hidden=true;redrawInk();});
  $('evaluateBtn').addEventListener('click',evaluate);

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    state.deferredPrompt=e;
    $('installBtn').hidden=false;
  });

  $('installBtn').addEventListener('click',async()=>{
    if(!state.deferredPrompt)return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt=null;
    $('installBtn').hidden=true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }

  loadData();
})();