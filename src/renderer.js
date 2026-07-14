'use strict';

// ---------------------------------------------------------------------------
// Lucent renderer. Owns UI state and talks to the main process through the
// `lucent` bridge exposed by preload.js. No Node APIs are used here.
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['size', 'aspect', 'sharpness', 'compression', 'color', 'text', 'format', 'upscale', 'prep'];

const state = {
  lang: 'en',
  presets: [],
  images: [],        // { id, filePath, fileName, analysis, preset, level, fitMode, format }
  activeId: null,
  previewMode: 'slider',
  zoom: 'fit',
  seq: 0,
  previewToken: 0,
  optDims: null // dimensions of the current optimized output; sizes the slider frame
};

// ---- i18n -----------------------------------------------------------------
function t(key, vars) {
  const dict = STRINGS[state.lang] || STRINGS.en;
  let s = dict[key] != null ? dict[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
  return s;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

function setLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('.lang').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  applyI18n();
  const autoOpt = document.querySelector('#preset-select option[value="auto"]');
  if (autoOpt) autoOpt.textContent = t('preset.auto');
  updatePresetNote();
  renderList();
  renderActive();
}

// ---- helpers --------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const activeImage = () => state.images.find((im) => im.id === state.activeId) || null;
const statusClass = (s) => (s === 'good' ? 'good' : s === 'warn' ? 'warn' : 'bad');

function toast(msg, actionLabel, actionFn) {
  const el = $('#toast');
  el.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if (actionLabel) {
    const a = document.createElement('a');
    a.textContent = actionLabel;
    a.onclick = actionFn;
    el.appendChild(a);
  }
  el.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add('hidden'), 6000);
}

function defaultPresetForNew() {
  const sel = $('#preset-select');
  const p = state.presets.find((x) => x.id === sel.value) || state.presets[0];
  // Auto adopts each image's own dimensions once it has been analyzed, so we
  // leave the target unset here and fill it in after analysis.
  if (p.auto) return { ...p, width: 0, height: 0 };
  // Clone so each image can diverge, honoring current dimension overrides.
  return {
    ...p,
    width: parseInt($('#dim-w').value, 10) || p.width,
    height: parseInt($('#dim-h').value, 10) || p.height
  };
}

// ---- adding images --------------------------------------------------------
async function addPaths(paths) {
  const resolved = await window.lucent.resolvePaths(paths);
  for (const fp of resolved) {
    if (state.images.some((im) => im.filePath === fp)) continue;
    const id = ++state.seq;
    const img = {
      id,
      filePath: fp,
      fileName: fp.split(/[\\/]/).pop(),
      analysis: null,
      optimizedAnalysis: null,
      applied: false,
      preset: defaultPresetForNew(),
      level: currentLevel(),
      fitMode: $('#fit-select').value,
      format: $('#format-select').value
    };
    state.images.push(img);
    if (state.activeId == null) state.activeId = id;
    analyzeImage(img);
  }
  renderList();
  renderActive();
  updateExportButtons();
}

async function analyzeImage(img) {
  const res = await window.lucent.analyze(img.filePath, img.preset);
  if (res.ok) {
    img.analysis = res.data;
    // Auto adopts the detected native dimensions as its target.
    if (img.preset.auto) {
      img.preset.width = res.data.width;
      img.preset.height = res.data.height;
    }
  } else {
    img.analysis = { error: res.error, overall: 0, overallStatus: 'bad', issues: [], categories: {} };
  }
  renderList();
  if (img.id === state.activeId) { renderActive(); updateDimInputs(); }
  updateExportButtons();
}

// ---- image list -----------------------------------------------------------
function renderList() {
  const list = $('#image-list');
  list.innerHTML = '';
  $('#list-empty').classList.toggle('hidden', state.images.length > 0);

  for (const im of state.images) {
    const row = document.createElement('div');
    row.className = 'thumb-item' + (im.id === state.activeId ? ' active' : '');
    row.onclick = () => selectImage(im.id);

    const thumb = document.createElement('img');
    if (im.analysis && im.analysis.thumbDataUrl) thumb.src = im.analysis.thumbDataUrl;
    row.appendChild(thumb);

    const meta = document.createElement('div');
    meta.className = 'thumb-meta';
    const name = document.createElement('div');
    name.className = 'thumb-name';
    name.textContent = im.fileName;
    const sub = document.createElement('div');
    sub.className = 'thumb-sub';
    sub.textContent = im.analysis && !im.analysis.error
      ? `${im.analysis.width}×${im.analysis.height} · ${im.analysis.format.toUpperCase()}`
      : (im.analysis && im.analysis.error ? '⚠ ' + im.analysis.error : '…');
    meta.appendChild(name);
    meta.appendChild(sub);
    row.appendChild(meta);

    const badge = document.createElement('span');
    if (im.analysis && !im.analysis.error) {
      badge.className = 'thumb-badge badge-' + statusClass(im.analysis.overallStatus);
      badge.textContent = im.analysis.overall;
    } else {
      badge.className = 'thumb-badge badge-pending';
      badge.textContent = im.analysis && im.analysis.error ? '!' : '…';
    }
    row.appendChild(badge);

    const rm = document.createElement('span');
    rm.className = 'thumb-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.onclick = (e) => { e.stopPropagation(); removeImage(im.id); };
    row.appendChild(rm);

    list.appendChild(row);
  }
}

function selectImage(id) {
  state.activeId = id;
  const im = activeImage();
  if (im) {
    // Reflect this image's settings in the control panel.
    syncControlsFromImage(im);
  }
  renderList();
  renderActive();
}

function removeImage(id) {
  const idx = state.images.findIndex((im) => im.id === id);
  if (idx === -1) return;
  state.images.splice(idx, 1);
  if (state.activeId === id) state.activeId = state.images.length ? state.images[Math.max(0, idx - 1)].id : null;
  renderList();
  renderActive();
  updateExportButtons();
}

// ---- control panel sync ---------------------------------------------------
function currentLevel() {
  const active = document.querySelector('.seg-btn.active');
  return active ? active.dataset.level : 'balanced';
}

function syncControlsFromImage(im) {
  // Set preset select to matching id if present.
  const sel = $('#preset-select');
  if ([...sel.options].some((o) => o.value === im.preset.id)) sel.value = im.preset.id;
  if (!im.preset.auto) {
    $('#dim-w').value = im.preset.width;
    $('#dim-h').value = im.preset.height;
  }
  $('#fit-select').value = im.fitMode;
  $('#format-select').value = im.format;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.level === im.level));
  updatePresetNote();
  updateDimInputs();
}

function updatePresetNote() {
  const sel = $('#preset-select');
  const p = state.presets.find((x) => x.id === sel.value);
  $('#preset-note').textContent = !p ? '' : (p.auto ? t('preset.autoNote') : p.note);
}

// Keep the dimension inputs in sync with the chosen preset. For "Auto detected"
// the inputs are read-only and mirror the active image's detected size.
function updateDimInputs() {
  const sel = $('#preset-select');
  const isAuto = sel.value === 'auto';
  const w = $('#dim-w');
  const h = $('#dim-h');
  w.disabled = isAuto;
  h.disabled = isAuto;
  if (isAuto) {
    const im = activeImage();
    if (im && im.analysis && !im.analysis.error) {
      w.value = im.analysis.width;
      h.value = im.analysis.height;
    } else {
      w.value = '';
      h.value = '';
    }
  }
}

// Apply current control-panel settings to the active image (or all images).
function applyControls() {
  const sel = $('#preset-select');
  const basePreset = state.presets.find((x) => x.id === sel.value) || state.presets[0];
  const level = currentLevel();
  const fitMode = $('#fit-select').value;
  const format = $('#format-select').value;
  const applyAll = $('#apply-all').checked;

  const targets = applyAll ? state.images : [activeImage()].filter(Boolean);
  for (const im of targets) {
    let preset;
    if (basePreset.auto) {
      // Each image keeps its own detected dimensions under Auto.
      const a = im.analysis && !im.analysis.error ? im.analysis : null;
      preset = { ...basePreset, width: a ? a.width : 0, height: a ? a.height : 0 };
    } else {
      preset = {
        ...basePreset,
        width: parseInt($('#dim-w').value, 10) || basePreset.width,
        height: parseInt($('#dim-h').value, 10) || basePreset.height
      };
    }
    const presetChanged =
      im.preset.id !== preset.id ||
      im.preset.width !== preset.width ||
      im.preset.height !== preset.height;
    im.preset = preset;
    im.level = level;
    im.fitMode = fitMode;
    im.format = format;
    // Changing settings changes the optimized output, so drop the applied
    // state and let the user review and re-apply against the original score.
    im.applied = false;
    // Re-analyze only when the target size/preset changed (analysis depends on it).
    if (presetChanged) analyzeImage(im);
  }
  renderActive();
  updateDimInputs();
}

// The analysis currently shown: the optimized result once the user has applied
// it, otherwise the original. This is what the score/issue panel reflects.
function shownAnalysis(im) {
  if (!im) return null;
  if (im.applied && im.optimizedAnalysis) return im.optimizedAnalysis;
  return im.analysis || null;
}

// ---- active image rendering ----------------------------------------------
async function renderActive() {
  const im = activeImage();
  const hasImg = !!im;
  const noImages = state.images.length === 0;
  $('#dropzone').classList.toggle('hidden', !noImages);
  // The empty-preview hint only applies when images exist but none is selected.
  $('#preview-empty').classList.toggle('hidden', noImages || hasImg);
  $('#preview-wrap').classList.toggle('hidden', !hasImg);

  refreshScorePanel(im);
  if (!hasImg) return;

  await renderPreview(im);
}

// Re-render the score, issues, and action buttons together.
function refreshScorePanel(im) {
  renderScore(im);
  renderIssues(im);
  updateActionButtons(im);
}

function renderScore(im) {
  const ring = $('#score-ring');
  const val = $('#score-value');
  const scope = $('#score-scope');
  const delta = $('#score-delta');
  const catList = $('#category-list');
  catList.innerHTML = '';

  const a = shownAnalysis(im);
  if (!a || a.error) {
    val.textContent = '—';
    ring.style.setProperty('--val', 0);
    ring.style.setProperty('--col', 'var(--muted)');
    scope.textContent = '';
    delta.classList.add('hidden');
    return;
  }
  val.textContent = a.overall;
  ring.style.setProperty('--val', a.overall);
  ring.style.setProperty('--col', `var(--${statusClass(a.overallStatus)})`);

  // Scope chip + before→after delta.
  const showingOptimized = im.applied && im.optimizedAnalysis;
  scope.textContent = showingOptimized ? t('score.scope.optimized') : t('score.scope.original');
  scope.className = 'score-scope ' + (showingOptimized ? 'scope-opt' : 'scope-orig');
  if (showingOptimized && im.analysis && !im.analysis.error) {
    const before = im.analysis.overall;
    const after = im.optimizedAnalysis.overall;
    const diff = after - before;
    if (diff > 0) {
      delta.innerHTML = `${t('score.scope.original')} <b>${before}</b> → <b>${after}</b> <span class="c-good">(+${diff})</span>`;
    } else if (diff < 0) {
      delta.innerHTML = `${t('score.scope.original')} <b>${before}</b> → <b>${after}</b> <span class="c-warn">(${diff})</span>`;
    } else {
      // Optimization still standardizes color/format/compression, but there
      // were no scored deficiencies to raise — say so plainly.
      delta.innerHTML = `<span class="c-good">✓</span> ${t('score.alreadyGood')}`;
    }
    delta.classList.remove('hidden');
  } else {
    delta.classList.add('hidden');
  }

  for (const key of CATEGORY_ORDER) {
    const c = a.categories[key];
    if (!c) continue;
    const cls = statusClass(c.status);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-name"><span class="dot bg-${cls}"></span>${t('cat.' + key)}</span>
      <span class="cat-val c-${cls}">${c.value != null ? c.value : ''}</span>
      <span class="cat-bar"><i class="bg-${cls}" style="width:${c.score}%"></i></span>`;
    catList.appendChild(row);
  }
}

function renderIssues(im) {
  const box = $('#issues-list');
  box.innerHTML = '';
  const a = shownAnalysis(im);
  if (!a) return;
  if (a.error) {
    box.innerHTML = `<div class="issue sev-bad"><span class="i-icon">!</span><span>${a.error}</span></div>`;
    return;
  }
  const all = a.issues || [];
  const problems = all.filter((i) => i.severity === 'bad' || i.severity === 'warn');
  const infos = all.filter((i) => i.severity === 'info');

  if (problems.length === 0) {
    box.innerHTML += `<div class="issue-none">✓ ${t('issues.none')}</div>`;
  } else {
    problems.sort((x, y) => (x.severity === 'bad' ? -1 : 1) - (y.severity === 'bad' ? -1 : 1));
    for (const iss of problems) {
      const el = document.createElement('div');
      el.className = 'issue sev-' + (iss.severity === 'bad' ? 'bad' : 'warn');
      el.innerHTML = `<span class="i-icon">${iss.severity === 'bad' ? '!' : '⚠'}</span><span>${iss.detail}</span>`;
      box.appendChild(el);
    }
  }
  // Informational tips (e.g. the AI / compression caution) always show last.
  for (const iss of infos) {
    const el = document.createElement('div');
    el.className = 'issue sev-info';
    el.innerHTML = `<span class="i-icon">ℹ</span><span>${iss.detail}</span>`;
    box.appendChild(el);
  }
}

// Apply / Export / Revert visibility based on whether optimization is applied.
function updateActionButtons(im) {
  const apply = $('#btn-apply');
  const exp = $('#btn-export');
  const revert = $('#btn-revert');
  const valid = im && !(im.analysis && im.analysis.error);
  const canApply = valid && !!im.optimizedAnalysis;
  const applied = valid && im.applied;

  apply.classList.toggle('hidden', applied);
  apply.disabled = !canApply || applied;
  exp.classList.toggle('hidden', !applied);
  revert.classList.toggle('hidden', !applied);
}

function applyOptimization() {
  const im = activeImage();
  if (!im || !im.optimizedAnalysis) return;
  im.applied = true;
  refreshScorePanel(im);
}

function revertOptimization() {
  const im = activeImage();
  if (!im) return;
  im.applied = false;
  refreshScorePanel(im);
}

// ---- preview (original vs optimized vs simulation) ------------------------
async function renderPreview(im) {
  if (!im || (im.analysis && im.analysis.error)) return;
  const token = ++state.previewToken;
  $('#preview-loading').classList.remove('hidden');

  const [orig, prev] = await Promise.all([
    window.lucent.originalPreview(im.filePath),
    window.lucent.preview(im.filePath, {
      preset: im.preset, level: im.level, fitMode: im.fitMode, format: im.format
    })
  ]);
  if (token !== state.previewToken) return; // superseded by a newer request
  $('#preview-loading').classList.add('hidden');

  const origUrl = orig.ok ? orig.dataUrl : '';
  const optUrl = prev.ok ? prev.data.optimizedDataUrl : '';
  const simUrl = prev.ok ? prev.data.simDataUrl : '';

  $('#slider-original').src = origUrl;
  $('#slider-optimized').src = optUrl;
  $('#side-original').src = origUrl;
  $('#side-optimized').src = optUrl;
  $('#sim-optimized').src = optUrl;
  $('#sim-image').src = simUrl;
  $('#mobile-img').src = optUrl;

  // The optimized output defines the comparison frame's shape, so switching a
  // preset reshapes the whole frame and BOTH images re-fit to the new target.
  state.optDims = prev.ok ? prev.data.optimizedDimensions : null;
  $('#slider-optimized').onload = layoutSlider;
  $('#slider-original').onload = layoutSlider;
  layoutSlider();

  // Store the freshly computed optimized score and refresh the panel so the
  // Apply button enables and, if already applied, the "after" score updates.
  im.optimizedAnalysis = prev.ok ? prev.data.optimizedAnalysis : null;
  refreshScorePanel(im);
}

// Size the slider frame to the optimized target's aspect ratio and fit both
// images into it (object-fit: contain). Both layers share one fixed frame, so
// the original and optimized always reflect the selected preset's size/ratio;
// dragging only changes how much of the front layer is revealed.
function layoutSlider() {
  const frame = $('#slider-frame');
  const inner = $('#clip-inner');
  const d = state.optDims;
  if (!frame || !inner || !d || !d.width || !d.height) return;

  let w;
  let h;
  if (state.zoom === '100') {
    w = d.width;
    h = d.height;
  } else {
    const stage = $('#stage');
    const maxW = Math.max(80, (stage.clientWidth || 600) - 28);
    const maxH = Math.max(80, (stage.clientHeight || 500) - 28);
    const scale = Math.min(maxW / d.width, maxH / d.height, 1);
    w = Math.round(d.width * scale);
    h = Math.round(d.height * scale);
  }
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  inner.style.width = w + 'px'; // pin so the revealed layer never reflows while sliding
}

function setPreviewMode(mode) {
  state.previewMode = mode;
  document.querySelectorAll('.ptab[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#view-slider').classList.toggle('hidden', mode !== 'slider');
  $('#view-side').classList.toggle('hidden', mode !== 'side');
  $('#view-sim').classList.toggle('hidden', mode !== 'sim');
  $('#view-mobile').classList.toggle('hidden', mode !== 'mobile');
  // Zoom applies only to the slider; the mobile note replaces the sim note.
  document.querySelectorAll('.ptab.zoom').forEach((b) => b.classList.toggle('hidden', mode !== 'slider'));
  $('.sim-note') && $('.sim-note').classList.toggle('hidden', mode === 'mobile');
  $('.mobile-note') && $('.mobile-note').classList.toggle('hidden', mode !== 'mobile');
  if (mode === 'slider') layoutSlider();
}

function setZoom(z) {
  state.zoom = z;
  document.querySelectorAll('.ptab.zoom').forEach((b) => b.classList.toggle('active', b.dataset.zoom === z));
  $('#slider-frame').classList.toggle('zoom100', z === '100');
  layoutSlider();
}

// ---- slider drag ----------------------------------------------------------
function initSlider() {
  const frame = $('#slider-frame');
  const clip = $('#slider-clip');
  const handle = $('#slider-handle');
  let dragging = false;
  const move = (clientX) => {
    const rect = frame.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(0, Math.min(100, pct));
    clip.style.width = pct + '%';
    handle.style.left = pct + '%';
  };
  const down = (e) => { dragging = true; move(e.clientX); e.preventDefault(); };
  frame.addEventListener('mousedown', down);
  window.addEventListener('mousemove', (e) => dragging && move(e.clientX));
  window.addEventListener('mouseup', () => { dragging = false; });
}

// ---- export ---------------------------------------------------------------
function jobFor(im) {
  return { filePath: im.filePath, options: { preset: im.preset, level: im.level, fitMode: im.fitMode, format: im.format } };
}

async function doExport(images) {
  const jobs = images.filter((im) => !(im.analysis && im.analysis.error)).map(jobFor);
  if (jobs.length === 0) return;
  const res = await window.lucent.export(jobs);
  if (!res.ok) return; // canceled
  const okCount = res.results.filter((r) => r.ok).length;
  toast(t('export.done', { n: okCount }), t('export.openFolder'), () => window.lucent.openFolder(res.outDir));
}

function updateExportButtons() {
  const any = state.images.some((im) => im.analysis && !im.analysis.error);
  $('#btn-export-all').disabled = !any;
  updateActionButtons(activeImage()); // Apply/Export/Revert visibility
}

// ---- init -----------------------------------------------------------------
async function init() {
  state.presets = await window.lucent.getPresets();
  const sel = $('#preset-select');
  for (const p of state.presets) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.auto ? t('preset.auto') : p.name;
    sel.appendChild(opt);
  }
  // Default to "Auto detected".
  sel.value = 'auto';
  updatePresetNote();
  updateDimInputs();
  applyI18n();
  setPreviewMode('slider');
  setZoom('fit');
  initSlider();
  renderActive(); // establish the correct empty state on launch

  // Preset select -> load its default dims, then apply.
  sel.addEventListener('change', () => {
    const p = state.presets.find((x) => x.id === sel.value);
    if (p && !p.auto) { $('#dim-w').value = p.width; $('#dim-h').value = p.height; }
    updatePresetNote();
    applyControls();
  });
  $('#dim-w').addEventListener('change', applyControls);
  $('#dim-h').addEventListener('change', applyControls);
  $('#fit-select').addEventListener('change', applyControls);
  $('#format-select').addEventListener('change', applyControls);
  document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    applyControls();
  }));

  // Preview tabs
  document.querySelectorAll('.ptab[data-mode]').forEach((b) => b.addEventListener('click', () => setPreviewMode(b.dataset.mode)));
  document.querySelectorAll('.ptab.zoom').forEach((b) => b.addEventListener('click', () => setZoom(b.dataset.zoom)));

  // Toolbar
  $('#btn-add').addEventListener('click', async () => {
    const files = await window.lucent.pickFiles();
    if (files.length) addPaths(files);
  });
  $('#btn-clear').addEventListener('click', () => {
    state.images = []; state.activeId = null;
    renderList(); renderActive(); updateExportButtons();
  });
  $('#btn-apply').addEventListener('click', applyOptimization);
  $('#btn-revert').addEventListener('click', revertOptimization);
  $('#btn-export').addEventListener('click', () => { const im = activeImage(); if (im) doExport([im]); });
  $('#btn-export-all').addEventListener('click', () => doExport(state.images));

  // Language
  document.querySelectorAll('.lang').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  // Drag & drop
  const dz = document.body;
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); $('#dropzone').classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragleave' && e.relatedTarget) return;
    $('#dropzone').classList.remove('drag');
  }));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    const paths = [];
    for (const f of e.dataTransfer.files) {
      const p = window.lucent.pathForFile(f);
      if (p) paths.push(p);
    }
    if (paths.length) addPaths(paths);
  });
  $('#dropzone').addEventListener('click', async () => {
    const files = await window.lucent.pickFiles();
    if (files.length) addPaths(files);
  });

  // Keep slider aligned on resize.
  window.addEventListener('resize', layoutSlider);
}

window.addEventListener('DOMContentLoaded', init);
