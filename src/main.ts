import './style.css';
import GenerationWorker from './worker/generation.worker?worker&inline';
import { BLOCK_PALETTE, PALETTE_PRESETS } from './data/palette';
import { matchImage } from './domain/color';
import { fitDimensions, importImage, resizeToRgb, rgbDataUrl } from './domain/image';
import type { BlockDefinition, CameraSpec, ImportedImage, OutputImage, VoxelSculpture, WorkerResponse } from './domain/types';
import { createLitematic, downloadLitematic } from './export/litematic';
import { SculptureViewer } from './preview/viewer';

type Tab='import'|'palette'|'camera'|'generate'|'preview'|'export';
const state:{image:ImportedImage|null;output:OutputImage|null;sculpture:VoxelSculpture|null;selected:Set<string>;matchedPalette:BlockDefinition[];maxWidth:number;maxHeight:number;camera:CameraSpec;maxDepth:number;layerSpacing:number;blockDensity:number;worker:Worker|null;sourceUrl:string|null}={
  image:null,output:null,sculpture:null,selected:new Set(PALETTE_PRESETS.concrete.map(b=>b.id)),matchedPalette:[],maxWidth:128,maxHeight:128,
  camera:{position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1},maxDepth:64,layerSpacing:1,blockDensity:50,worker:null,sourceUrl:null,
};
let viewer:SculptureViewer|null=null;
let viewerSculpture:VoxelSculpture|null=null;

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="topbar"><div class="brand"><span class="brand-mark">PB</span><div><strong>Parallax Blocks</strong><small>Minecraft anamorphic art</small></div></div><div class="header-actions"><span class="version">Java 1.20.1 · Offline</span><button id="help-button" class="help-button" type="button">? <span>User guide</span></button></div></header>
<main class="workspace">
 <aside><p class="eyebrow">Workflow</p><nav id="tabs" aria-label="Generator steps">
  ${(['import','palette','camera','generate','preview','export'] as Tab[]).map((tab,index)=>`<button class="tab ${index===0?'active':''}" data-tab="${tab}"><span>0${index+1}</span>${tab[0]!.toUpperCase()+tab.slice(1)}</button>`).join('')}
 </nav><div class="aside-note"><strong>First-hit guarantee</strong><p>Every pixel ray is independently verified before export.</p></div></aside>
 <section class="content">
  <article class="panel active" id="panel-import"><div class="panel-title"><div><p class="eyebrow">Step 01</p><h1>Choose an image</h1><p>PNG, JPEG, or BMP. Images stay entirely in your browser.</p></div></div>
   <label class="dropzone" id="dropzone"><input id="file-input" type="file" accept=".png,.jpg,.jpeg,.bmp,image/png,image/jpeg,image/bmp"><span class="drop-icon">＋</span><strong>Drop an image here</strong><span>or click to browse</span></label>
   <div id="import-error" class="notice error hidden" role="alert"></div><div id="import-result" class="hidden"></div>
  </article>
  <article class="panel" id="panel-palette"><div class="panel-title"><div><p class="eyebrow">Step 02</p><h1>Build the palette</h1><p>Pixels are matched perceptually with CIEDE2000.</p></div><div id="color-stats" class="stat-pill">Import an image first</div></div>
   <div class="toolbar"><div class="segmented" id="presets"><button data-preset="concrete">Concrete</button><button data-preset="wool">Wool</button><button data-preset="terracotta">Terracotta</button><button data-preset="full">Safe full cubes</button></div><input id="palette-search" type="search" placeholder="Search blocks…"></div>
   <div class="palette-layout"><div id="palette-grid" class="palette-grid"></div><div class="preview-card"><span>Matched preview</span><img id="matched-preview" alt="Palette matched preview"><p id="selected-count"></p></div></div>
  </article>
  <article class="panel" id="panel-camera"><div class="panel-title"><div><p class="eyebrow">Step 03</p><h1>Set the designed view</h1><p>The sculpture is guaranteed only from this perspective.</p></div></div>
   <div class="form-sections"><fieldset><legend>Camera position</legend><div class="triple">${numberInput('pos-x','X',0)}${numberInput('pos-y','Y',0)}${numberInput('pos-z','Z',0)}</div></fieldset>
   <fieldset><legend>Direction</legend><div class="triple">${numberInput('dir-x','X',0,.01)}${numberInput('dir-y','Y',0,.01)}${numberInput('dir-z','Z',-1,.01)}</div></fieldset>
   <fieldset><legend>Lens & depth</legend><div class="triple">${numberInput('fov','FOV',50,1,10,120,'Vertical field of view. Wider values spread neighboring pixel rays apart sooner.')}${numberInput('max-depth','Max depth',64,1,1,256,'Maximum front-to-back range available only when projection-plane conflicts need relocation.')}${numberInput('layer-spacing','Layer spacing',1,1,1,16,'Depth step used when a pixel cannot remain on the continuous front plane.')}</div><label class="range-field"><span>Block density ${tip('Sets how strongly conflict resolution must preserve a compact slab. Coverage and correct visibility always take priority; lower values permit more fallback depth.')} <output id="density-value">50%</output></span><input id="block-density" type="range" min="10" max="100" step="5" value="50"><small>Allow more depth</small><small>Compact</small></label></fieldset></div>
   <div class="notice">The sculpture may move farther from the camera to make every pixel ray collision-free. Camera settings never change automatically.</div>
  </article>
  <article class="panel" id="panel-generate"><div class="panel-title"><div><p class="eyebrow">Step 04</p><h1>Generate sculpture</h1><p>Assignment and first-hit verification run off the main thread.</p></div></div><div id="generate-summary" class="summary-grid"></div>
   <div id="generate-error" class="notice error hidden"></div><div class="progress-wrap hidden" id="progress-wrap"><div><strong id="progress-phase">Preparing</strong><span id="progress-value">0%</span></div><progress id="progress" max="1" value="0"></progress><p id="progress-message"></p></div>
   <div class="actions"><button class="primary" id="generate-button">Generate sculpture</button><button id="cancel-button" class="secondary hidden">Cancel</button></div><div id="generation-result"></div>
  </article>
  <article class="panel" id="panel-preview"><div class="panel-title"><div><p class="eyebrow">Step 05</p><h1>Inspect in 3D</h1><p>Drag to orbit, right-drag to pan, and scroll to zoom.</p></div><div class="actions compact"><button id="correct-view" class="primary">View from correct position</button><button id="free-view" class="secondary">Restore free view</button><button id="capture-view" class="secondary">Use this view as camera</button></div></div>
   <div id="viewer" class="viewer"><div class="empty-state">Generate a sculpture to open the 3D viewer.</div></div><div id="preview-legend" class="legend"></div>
  </article>
  <article class="panel" id="panel-export"><div class="panel-title"><div><p class="eyebrow">Step 06</p><h1>Export to Litematica</h1><p>A validated, gzip-compressed Minecraft Java 1.20.1 schematic.</p></div></div>
   <div class="export-layout"><div class="form-sections"><label>Name<input id="export-name" value="Anamorphic Art" maxlength="80"></label><label>Author<input id="export-author" value="Parallax Blocks" maxlength="80"></label><label>Description<textarea id="export-description" rows="3">Generated from a designed perspective camera.</textarea></label><button id="export-button" class="primary">Download .litematic</button></div><div id="export-summary" class="export-summary"></div></div>
  </article>
 </section>
</main>
<dialog id="user-guide" class="guide-dialog" aria-labelledby="guide-title"><div class="guide-header"><div><p class="eyebrow">Reference</p><h2 id="guide-title">How to build anamorphic art</h2></div><button id="guide-close" type="button" aria-label="Close user guide">×</button></div><div class="guide-body">
 <section><span>01</span><div><h3>Import and size</h3><p>Choose an opaque PNG, JPEG, or BMP. Set a target resolution or use a preset. The image keeps its aspect ratio; the fitted dimensions determine the exact block count.</p></div></section>
 <section><span>02</span><div><h3>Choose colors</h3><p>Select a block family or individual safe full cubes. The matched preview and Delta-E score show the color approximation before generation.</p></div></section>
 <section><span>03</span><div><h3>Design the viewpoint</h3><p>Position and direction define the one camera from which the sculpture reconstructs the image. FOV controls perspective. Density limits how much fallback depth may be used after the solver has maximized front-plane continuity.</p></div></section>
 <section><span>04</span><div><h3>Generate and verify</h3><p>The worker first fits neighboring pixels onto face-adjacent blocks on a shared projection plane. Only conflicting pixels move deeper. It then measures front coverage and independently verifies that every pixel ray hits its own block first.</p></div></section>
 <section><span>05</span><div><h3>Preview and export</h3><p>Inspect from any angle, jump back to the correct position, then export the verified structure as a Minecraft Java 1.20.1 .litematic file.</p></div></section>
 <aside><strong>Good starting point</strong><p>Try 64–128 px, 50% density, 64 blocks of depth, spacing 1, and a 50° FOV. Increase resolution only after checking the estimated block count.</p></aside>
</div></dialog>`;

function tip(text:string){return `<button class="help-tip" type="button" aria-label="Help: ${text}" data-tooltip="${text}">?</button>`;}
function numberInput(id:string,label:string,value:number,step=1,min?:number,max?:number,help?:string){return `<label><span>${label}${help?` ${tip(help)}`:''}</span><input id="${id}" type="number" value="${value}" step="${step}" ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''}></label>`;}
function byId<T extends HTMLElement>(id:string){return document.getElementById(id) as T;}
function showError(id:string,message=''){const element=byId(id);element.textContent=message;element.classList.toggle('hidden',!message);}
function formatBytes(value:number){return value<1024*1024?`${Math.round(value/1024)} KiB`:`${(value/1024/1024).toFixed(1)} MiB`;}

function openTab(tab:Tab){document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',(el as HTMLElement).dataset.tab===tab));document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('active',el.id===`panel-${tab}`));if(tab==='preview'&&state.sculpture)setTimeout(ensureViewer);}
byId('tabs').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');if(button)openTab(button.dataset.tab as Tab);});
const guide=byId<HTMLDialogElement>('user-guide');
byId('help-button').addEventListener('click',()=>guide.showModal());
byId('guide-close').addEventListener('click',()=>guide.close());
guide.addEventListener('click',event=>{if(event.target===guide)guide.close();});

const fileInput=byId<HTMLInputElement>('file-input'),dropzone=byId('dropzone');
fileInput.addEventListener('change',()=>{if(fileInput.files?.[0])void loadFile(fileInput.files[0]);});
for(const eventName of ['dragenter','dragover'])dropzone.addEventListener(eventName,event=>{event.preventDefault();dropzone.classList.add('dragging');});
for(const eventName of ['dragleave','drop'])dropzone.addEventListener(eventName,event=>{event.preventDefault();dropzone.classList.remove('dragging');});
dropzone.addEventListener('drop',event=>{const file=(event as DragEvent).dataTransfer?.files[0];if(file)void loadFile(file);});

async function loadFile(file:File){
  showError('import-error');dropzone.classList.add('loading');
  try{state.image=await importImage(file);if(state.sourceUrl)URL.revokeObjectURL(state.sourceUrl);state.sourceUrl=URL.createObjectURL(file);refreshOutput();renderImport();openTab('palette');}
  catch(error){showError('import-error',error instanceof Error?error.message:String(error));}
  finally{dropzone.classList.remove('loading');fileInput.value='';}
}

function refreshOutput(){
  state.sculpture=null;disposeViewer();if(!state.image){state.output=null;return;}
  const resized=resizeToRgb(state.image,state.maxWidth,state.maxHeight);state.matchedPalette=BLOCK_PALETTE.filter(block=>state.selected.has(block.id));
  try{state.output=matchImage(resized.rgb,resized.width,resized.height,state.matchedPalette);}catch{state.output=null;}
  renderMatched();renderGenerate();renderExport();
}

function renderImport(){
  if(!state.image)return;const image=state.image,[width,height]=fitDimensions(image.width,image.height,state.maxWidth,state.maxHeight);
  const target=byId('import-result');target.classList.remove('hidden');target.innerHTML=`<div class="import-card"><img src="${state.sourceUrl}" alt="Imported source"><div><h2>${escapeHtml(image.filename)}</h2><div class="meta-row"><span>${image.format.toUpperCase()}</span><span>${image.width} × ${image.height}</span><span>${formatBytes(image.fileSize)}</span><span>Opaque ✓</span></div><hr><h3>Target resolution ${tip('The image fits inside these dimensions without cropping or stretching. One fitted output pixel becomes one Minecraft block.')}</h3><div class="resolution-presets" aria-label="Target resolution presets"><button type="button" data-resolution="64">64 px</button><button type="button" data-resolution="128">128 px</button><button type="button" data-resolution="256">256 px</button></div><div class="double">${numberInput('max-width','Maximum width',state.maxWidth,1,1,256)}${numberInput('max-height','Maximum height',state.maxHeight,1,1,256)}</div><p class="result-size">Fitted output: <strong>${width} × ${height}</strong> · ${(width*height).toLocaleString()} blocks</p></div></div>`;
  for(const id of ['max-width','max-height'])byId<HTMLInputElement>(id).addEventListener('change',()=>{state.maxWidth=clamp(Number(byId<HTMLInputElement>('max-width').value),1,256);state.maxHeight=clamp(Number(byId<HTMLInputElement>('max-height').value),1,256);refreshOutput();renderImport();});
  target.querySelectorAll<HTMLButtonElement>('[data-resolution]').forEach(button=>button.addEventListener('click',()=>{const size=Number(button.dataset.resolution);state.maxWidth=size;state.maxHeight=size;refreshOutput();renderImport();}));
}

function renderPalette(filter=''){
  const grid=byId('palette-grid');grid.innerHTML=BLOCK_PALETTE.filter(block=>block.name.toLowerCase().includes(filter.toLowerCase())).map(block=>`<label class="block-choice"><input type="checkbox" value="${block.id}" ${state.selected.has(block.id)?'checked':''}><span class="swatch" style="--swatch:rgb(${block.rgb.join(',')})"></span><span><strong>${block.name}</strong><small>${block.family}</small></span></label>`).join('');
  grid.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.addEventListener('change',()=>{input.checked?state.selected.add(input.value):state.selected.delete(input.value);refreshOutput();renderPalette((byId<HTMLInputElement>('palette-search')).value);}));
  byId('selected-count').textContent=`${state.selected.size} safe full-cube blocks selected`;
}
byId('palette-search').addEventListener('input',event=>renderPalette((event.target as HTMLInputElement).value));
byId('presets').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-preset]');if(!button)return;const preset=PALETTE_PRESETS[button.dataset.preset as keyof typeof PALETTE_PRESETS];state.selected=new Set(preset.map(block=>block.id));refreshOutput();renderPalette();});

function renderMatched(){const image=byId<HTMLImageElement>('matched-preview');if(!state.output){image.removeAttribute('src');byId('color-stats').textContent=state.image?'Select at least one block':'Import an image first';return;}image.src=rgbDataUrl(state.output.matchedRgb,state.output.width,state.output.height);byId('color-stats').textContent=`Mean ΔE ${state.output.meanDeltaE.toFixed(1)} · max ${state.output.maxDeltaE.toFixed(1)}`;}

function readCamera(){
  const n=(id:string)=>Number(byId<HTMLInputElement>(id).value);const direction:[number,number,number]=[n('dir-x'),n('dir-y'),n('dir-z')];
  if(!direction.every(Number.isFinite)||Math.hypot(...direction)<1e-8)throw new Error('Camera direction must be a non-zero vector.');
  const position:[number,number,number]=[n('pos-x'),n('pos-y'),n('pos-z')];if(!position.every(Number.isFinite))throw new Error('Camera position must be finite.');
  state.camera={position,direction,worldUp:[0,1,0],verticalFov:clamp(n('fov'),10,120),aspect:state.output?state.output.width/state.output.height:1};state.maxDepth=clamp(n('max-depth'),1,256);state.layerSpacing=clamp(n('layer-spacing'),1,16);state.blockDensity=clamp(n('block-density'),10,100);
}
for(const id of ['pos-x','pos-y','pos-z','dir-x','dir-y','dir-z','fov','max-depth','layer-spacing','block-density'])byId(id).addEventListener('change',()=>{try{readCamera();state.sculpture=null;disposeViewer();renderGenerate();renderExport();}catch(error){showError('generate-error',error instanceof Error?error.message:String(error));}});
byId<HTMLInputElement>('block-density').addEventListener('input',event=>{byId<HTMLOutputElement>('density-value').value=`${(event.target as HTMLInputElement).value}%`;});

function renderGenerate(){
  const target=byId('generate-summary');if(!state.output){target.innerHTML='<div class="empty-state">Import an image and select a palette to continue.</div>';return;}
  target.innerHTML=`<div><small>Target output</small><strong>${state.output.width} × ${state.output.height}</strong></div><div><small>Blocks</small><strong>${state.output.paletteIndices.length.toLocaleString()}</strong></div><div><small>Block density</small><strong>${state.blockDensity}%</strong></div><div><small>Depth</small><strong>${state.maxDepth} / spacing ${state.layerSpacing}</strong></div>`;
}

byId('generate-button').addEventListener('click',()=>{
  showError('generate-error');try{readCamera();}catch(error){showError('generate-error',error instanceof Error?error.message:String(error));return;}
  if(!state.output){showError('generate-error','Import and match an image before generation.');return;}
  state.worker?.terminate();const worker=new GenerationWorker();state.worker=worker;
  byId('progress-wrap').classList.remove('hidden');byId('cancel-button').classList.remove('hidden');byId<HTMLButtonElement>('generate-button').disabled=true;byId('generation-result').innerHTML='';
  worker.onmessage=(event:MessageEvent<WorkerResponse>)=>handleWorker(event.data);
  const workerImage:OutputImage={...state.output,rgb:state.output.rgb.slice(),matchedRgb:state.output.matchedRgb.slice(),paletteIndices:state.output.paletteIndices.slice()};
  worker.postMessage({type:'generate',request:{image:workerImage,camera:state.camera,options:{maxDepth:state.maxDepth,layerSpacing:state.layerSpacing,blockDensity:state.blockDensity,maxOffset:8192},seed:(state.image?.hash??0)^state.output.width^state.output.height}},[workerImage.rgb.buffer,workerImage.matchedRgb.buffer,workerImage.paletteIndices.buffer]);
});
byId('cancel-button').addEventListener('click',()=>state.worker?.postMessage({type:'cancel'}));

function handleWorker(message:WorkerResponse){
  if(message.type==='progress'){byId<HTMLProgressElement>('progress').value=message.progress;byId('progress-value').textContent=`${Math.round(message.progress*100)}%`;byId('progress-phase').textContent=message.phase.replaceAll('-',' ');byId('progress-message').textContent=message.message;return;}
  byId<HTMLButtonElement>('generate-button').disabled=false;byId('cancel-button').classList.add('hidden');state.worker?.terminate();state.worker=null;
  if(message.type==='error'){showError('generate-error',message.message);return;}if(message.type==='cancelled'){byId('progress-message').textContent='Generation cancelled.';return;}
  state.sculpture=message.sculpture;byId<HTMLProgressElement>('progress').value=1;byId('progress-value').textContent='100%';byId('progress-phase').textContent='verified';byId('progress-message').textContent='Every pixel ray reaches its assigned block first.';
  const d=message.sculpture.diagnostics;byId('generation-result').innerHTML=`<div class="success-card"><strong>Visibility verified ✓</strong><span>${(d.frontCoverage*100).toFixed(1)}% front coverage · ${(d.adjacentPixelRatio*100).toFixed(1)}% adjacent neighbors · depth ${d.depthSpan.toFixed(1)} · ${d.blockCount.toLocaleString()} blocks</span></div>`;renderExport();openTab('preview');setTimeout(ensureViewer);
}

function ensureViewer(){if(!state.sculpture)return;const host=byId('viewer');if(!viewer){host.innerHTML='';viewer=new SculptureViewer(host);}if(viewerSculpture!==state.sculpture){viewer.setSculpture(state.sculpture,state.matchedPalette);viewerSculpture=state.sculpture;}renderLegend();}
function disposeViewer(){viewer?.dispose();viewer=null;viewerSculpture=null;const host=byId('viewer');host.innerHTML='<div class="empty-state">Generate a sculpture to open the 3D viewer.</div>';}
function renderLegend(){if(!state.sculpture)return;const counts=new Map<number,number>();state.sculpture.paletteIndices.forEach(value=>counts.set(value,(counts.get(value)??0)+1));byId('preview-legend').innerHTML=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([index,count])=>`<span><i style="--swatch:rgb(${state.matchedPalette[index]!.rgb.join(',')})"></i>${state.matchedPalette[index]!.name} <small>${count}</small></span>`).join('');}
byId('correct-view').addEventListener('click',()=>viewer?.viewCorrectPosition());byId('free-view').addEventListener('click',()=>viewer?.restoreFreePosition());
byId('capture-view').addEventListener('click',()=>{
  if(!viewer)return;const captured=viewer.captureCamera();
  const values:Record<string,number>={'pos-x':captured.position[0],'pos-y':captured.position[1],'pos-z':captured.position[2],'dir-x':captured.direction[0],'dir-y':captured.direction[1],'dir-z':captured.direction[2],fov:captured.verticalFov};
  for(const [id,value] of Object.entries(values))byId<HTMLInputElement>(id).value=String(Number(value.toFixed(4)));
  readCamera();state.sculpture=null;disposeViewer();renderGenerate();renderExport();openTab('camera');
});

function renderExport(){const target=byId('export-summary');if(!state.sculpture){target.innerHTML='<div class="empty-state">A verified sculpture is required before export.</div>';return;}const s=state.sculpture,d=s.diagnostics;target.innerHTML=`<h3>Validated schematic</h3><dl><div><dt>Dimensions</dt><dd>${s.dimensions.join(' × ')}</dd></div><div><dt>Front coverage</dt><dd>${(d.frontCoverage*100).toFixed(1)}%</dd></div><div><dt>Adjacent neighbors</dt><dd>${(d.adjacentPixelRatio*100).toFixed(1)}%</dd></div><div><dt>Depth span</dt><dd>${d.depthSpan.toFixed(1)} blocks</dd></div><div><dt>Blocks</dt><dd>${d.blockCount.toLocaleString()}</dd></div><div><dt>Volume</dt><dd>${d.volume.toLocaleString()}</dd></div><div><dt>Data version</dt><dd>3465</dd></div><div><dt>Camera</dt><dd>${s.camera.position.map(v=>v.toFixed(1)).join(', ')}</dd></div><div><dt>Direction</dt><dd>${s.camera.direction.map(v=>v.toFixed(3)).join(', ')}</dd></div></dl><p class="verified">First-hit visibility verified</p>`;}
byId('export-button').addEventListener('click',()=>{if(!state.sculpture){openTab('generate');showError('generate-error','Generate and verify a sculpture before export.');return;}const name=byId<HTMLInputElement>('export-name').value;const data=createLitematic(state.sculpture,state.matchedPalette,{name,author:byId<HTMLInputElement>('export-author').value,description:byId<HTMLTextAreaElement>('export-description').value,createdAt:Date.now()});downloadLitematic(data,name);});

function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,Number.isFinite(value)?value:min));}
function escapeHtml(value:string){const node=document.createElement('span');node.textContent=value;return node.innerHTML;}

renderPalette();renderMatched();renderGenerate();renderExport();
