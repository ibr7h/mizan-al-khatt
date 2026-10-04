(() => {
  'use strict';

  const FALLBACK = {
    id:'alif-isolated-naskh',letter:'ا',nameAr:'الألف المفردة',script:'Naskh',
    measurement:{unit:'nib-point',heightPoints:5,widthPointsApprox:.65,baseline:.86,capLine:.14,nibAngleDeg:70},
    stroke:{count:1,direction:'top-to-bottom',start:{x:.52,y:.14},end:{x:.50,y:.86},centerline:[{x:.52,y:.14},{x:.505,y:.28},{x:.505,y:.45},{x:.515,y:.64},{x:.50,y:.86}]},
    svgPath:'M54 25 C46 42 45 64 47 91 L58 430 C59 452 55 476 49 493 C44 472 42 451 43 430 L36 91 C34 62 38 38 54 25 Z',
    practice:{columns:8,rows:3,modelRowOpacity:1,ghostRowOpacity:.10}
  };

  const state={data:FALLBACK,mode:'explain',pointSize:24,guideOpacity:.32,showPoints:true,showDirection:true,showGuides:true,strokes:[],currentStroke:null,deferredPrompt:null};
  const $=id=>document.getElementById(id);
  const svg=$('guideSvg'), canvas=$('inkCanvas'), ctx=canvas.getContext('2d');

  async function loadData(){
    try{const r=await fetch('./data/alif.json',{cache:'no-store'});if(r.ok)state.data=await r.json();}catch(e){}
    $('letterName').textContent=state.data.nameAr;$('letterChip').textContent=state.data.letter;$('heightPoints').textContent=state.data.measurement.heightPoints+' نقاط';
    render();renderWorksheet();
  }

  function line(x1,y1,x2,y2,stroke='#d7d4cf',width=2,dash=''){
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
  }
  function diamond(cx,cy,size,color='#b11f58'){
    const s=size/2;return `<rect x="${cx-s}" y="${cy-s}" width="${size}" height="${size}" rx="2" fill="${color}" transform="rotate(45 ${cx} ${cy})"/>`;
  }
  function alifGroup(x,y,scale=1,opacity=1,color='#b11f58'){
    return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}"><path d="${state.data.svgPath}" fill="${color}"/></g>`;
  }
  function buildExplain(){
    const baseline=620,cap=110;let h='';
    if(state.showGuides){h+=line(140,cap,860,cap,'#cfd3d5',2);h+=line(140,baseline,860,baseline,'#cfd3d5',2);h+=`<text x="915" y="${cap+5}" text-anchor="end" fill="#9b938a" font-size="18">خط القمة</text><text x="915" y="${baseline+5}" text-anchor="end" fill="#9b938a" font-size="18">خط الأساس</text>`;}
    h+=`<g transform="translate(445 95) scale(1.03)"><path d="${state.data.svgPath}" fill="#b11f58"/></g>`;
    if(state.showPoints){const step=82,startY=175;for(let i=0;i<5;i++)h+=diamond(650,startY+i*step,34);h+=`<circle cx="622" cy="145" r="9" fill="none" stroke="#b11f58" stroke-width="3"/>`;}
    if(state.showDirection){h+=`<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#b11f58"/></marker></defs><path d="M420 195 C425 300 430 430 438 535" fill="none" stroke="#b11f58" stroke-width="4" marker-end="url(#arrow)"/><text x="390" y="300" fill="#4e4944" font-size="28">١</text>`;}
    return h;
  }
  function buildTrace(){
    const baseline=620,cap=110;let h='';
    if(state.showGuides){h+=line(100,cap,900,cap,'#d6d3cf',2);h+=line(100,baseline,900,baseline,'#d6d3cf',2);}
    h+=`<g transform="translate(445 95) scale(1.03)" opacity="${state.guideOpacity}"><path d="${state.data.svgPath}" fill="#b11f58"/></g>`;
    if(state.showPoints){const step=82,startY=175;for(let i=0;i<5;i++)h+=diamond(650,startY+i*step,30,'rgba(177,31,88,.45)');}
    return h;
  }
  function buildFree(){
    const baseline=620,cap=110;let h='';if(state.showGuides){h+=line(80,cap,920,cap,'#ddd8d0',2);h+=line(80,baseline,920,baseline,'#cfd3d5',2);h+=line(80,365,920,365,'#eeeae4',1,'8 8');}return h;
  }
  function render(){
    $('stage').dataset.mode=state.mode;$('worksheet').hidden=state.mode!=='worksheet';$('stage').hidden=state.mode==='worksheet';
    $('workspaceTitle').textContent=state.mode==='explain'?'تشريح حرف الألف':state.mode==='trace'?'تتبّع الألف':state.mode==='free'?'كتابة الألف بحرية':'ورقة تدريب الألف';
    $('stageNote').textContent=state.mode==='explain'?'ضربة واحدة من خط القمة إلى خط الأساس.':state.mode==='trace'?'ارسم فوق النموذج الشبح من أعلى إلى أسفل.':'اكتب الألف بين خط القمة وخط الأساس.';
    if(state.mode==='explain')svg.innerHTML=buildExplain();else if(state.mode==='trace')svg.innerHTML=buildTrace();else svg.innerHTML=buildFree();
    redrawInk();
  }
  function renderWorksheet(){
    const host=$('practiceRows');host.innerHTML='';
    for(let r=0;r<3;r++){
      const row=document.createElement('div');row.className='practice-row';row.innerHTML='<div class="practice-baseline"></div><span class="practice-label">'+(r===0?'نموذج':'تتبّع')+'</span>';
      for(let c=0;c<8;c++){
        const cell=document.createElement('div');cell.className='practice-cell';const op=r===0?1:.10;
        cell.innerHTML=`<svg viewBox="0 0 100 520" aria-hidden="true"><path d="${state.data.svgPath}" fill="#111" opacity="${op}"/><circle cx="48" cy="500" r="5" fill="#b11f58" opacity="${op}"/></svg>`;row.appendChild(cell);
      }host.appendChild(row);
    }
  }
  function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height,pressure:e.pressure||.6};}
  canvas.addEventListener('pointerdown',e=>{if(state.mode==='explain'||state.mode==='worksheet')return;e.preventDefault();canvas.setPointerCapture?.(e.pointerId);state.currentStroke=[canvasPoint(e)];state.strokes.push(state.currentStroke);redrawInk();});
  canvas.addEventListener('pointermove',e=>{if(!state.currentStroke)return;e.preventDefault();const p=canvasPoint(e),last=state.currentStroke[state.currentStroke.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>2)state.currentStroke.push(p);redrawInk();});
  const endStroke=e=>{if(!state.currentStroke)return;state.currentStroke.push(canvasPoint(e));state.currentStroke=null;redrawInk();};canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',()=>{state.currentStroke=null;});
  function redrawInk(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#15726f';ctx.globalAlpha=.92;for(const stroke of state.strokes){if(stroke.length<2)continue;ctx.beginPath();stroke.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.lineWidth=Math.max(5,state.pointSize*.42);ctx.stroke();}}
  function evaluate(){if(state.mode!=='trace'||!state.strokes.length){showScore('—','انتقل إلى وضع التتبّع وارسم فوق الألف أولًا.');return;}const pts=state.strokes.flat();if(!pts.length)return;const top=101,bottom=619;let err=0,count=0,minY=9999,maxY=-1;for(const p of pts){if(p.y<70||p.y>660)continue;const t=Math.max(0,Math.min(1,(p.y-top)/(bottom-top)));const xTarget=520-8*t+8*Math.sin(t*Math.PI*.8);err+=Math.abs(p.x-xTarget);count++;minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}const avg=count?err/count:200;const pathScore=Math.max(0,100-avg*.85);const coverage=Math.max(0,Math.min(100,((maxY-minY)/(bottom-top))*100));const score=Math.round(pathScore*.72+coverage*.28);let hint=score>=85?'ممتاز: المسار قريب جدًا من النموذج.':score>=70?'جيد جدًا: راقب استقامة الجذع وبداية الضربة.':score>=50?'جيد كبداية: قرّب المسار من مركز النموذج وحافظ على النزول المستقيم.':'أعد المحاولة ببطء من خط القمة إلى خط الأساس.';showScore(score+'%',hint);}
  function showScore(value,hint){$('scoreBox').hidden=false;$('scoreValue').textContent=value;$('scoreHint').textContent=hint;}

  document.querySelectorAll('.mode-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('is-active'));btn.classList.add('is-active');state.mode=btn.dataset.mode;state.strokes=[];$('scoreBox').hidden=true;render();}));
  $('pointSize').addEventListener('input',e=>{state.pointSize=+e.target.value;$('pointSizeOut').textContent=state.pointSize+'px';localStorage.setItem('mizan-point-size',state.pointSize);redrawInk();});
  $('guideOpacity').addEventListener('input',e=>{state.guideOpacity=+e.target.value/100;$('guideOpacityOut').textContent=e.target.value+'%';localStorage.setItem('mizan-guide-opacity',e.target.value);render();});
  $('showPoints').addEventListener('change',e=>{state.showPoints=e.target.checked;render();});$('showDirection').addEventListener('change',e=>{state.showDirection=e.target.checked;render();});$('showGuides').addEventListener('change',e=>{state.showGuides=e.target.checked;render();});
  $('undoBtn').addEventListener('click',()=>{state.strokes.pop();redrawInk();});$('clearBtn').addEventListener('click',()=>{state.strokes=[];$('scoreBox').hidden=true;redrawInk();});$('evaluateBtn').addEventListener('click',evaluate);

  const savedPoint=localStorage.getItem('mizan-point-size'),savedOpacity=localStorage.getItem('mizan-guide-opacity');if(savedPoint){state.pointSize=+savedPoint;$('pointSize').value=savedPoint;$('pointSizeOut').textContent=savedPoint+'px';}if(savedOpacity){state.guideOpacity=+savedOpacity/100;$('guideOpacity').value=savedOpacity;$('guideOpacityOut').textContent=savedOpacity+'%';}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e;$('installBtn').hidden=false;});$('installBtn').addEventListener('click',async()=>{if(!state.deferredPrompt)return;state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null;$('installBtn').hidden=true;});
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  loadData();
})();