/**
 * App bootstrap and animation loop.
 * Responsibility: wire world + renderer + panel and run RAF with stable delta time.
 */

import { World } from './engine/world.js';
import { Renderer } from './render/renderer.js';
import { Panel } from './ui/panel.js';
import { isDevMode, onDevModeChanged, toggleDevMode } from './dev.js';

const DEFAULT_INITIAL_FISH_COUNT = 4;
const SAVE_STORAGE_KEY = 'aquatab_save_v1';
const SAVE_VERSION = 1;
const AUTOSAVE_INTERVAL_MS = 10_000;
const INACTIVITY_AWAY_THRESHOLD_SIM_SEC = 300;
const FULLSCREEN_HINT_SESSION_KEY = 'aquatab_fullscreen_hint_seen';
const RESIZE_DEBOUNCE_MS = 120;
const WORLD_DESKTOP_WIDTH = 1200;
const WORLD_DESKTOP_HEIGHT = 700;
const WORLD_MOBILE_WIDTH = 700;
const WORLD_MOBILE_HEIGHT = 1200;

const startScreen = document.getElementById('startScreen');
const appRoot = document.getElementById('appRoot');
const startFishSlider = document.querySelector('[data-start-control="initialFishCount"]');
const startFishValue = document.querySelector('[data-start-value="initialFishCount"]');
const startSimButton = document.getElementById('startSimButton');
const continueSimButton = document.getElementById('continueSimButton');
const savedStartMeta = document.querySelector('[data-saved-start-meta]');
const infoModalBackdrop = document.getElementById('infoModalBackdrop');
const infoModalTitle = document.getElementById('infoModalTitle');
const infoModalContent = document.getElementById('infoModalContent');
const infoModalClose = document.getElementById('infoModalClose');
const infoModalButtons = Array.from(document.querySelectorAll('[data-info-modal]'));
const buyCoffeeButton = document.getElementById('buyCoffeeButton');
const aboutSeoStart = document.getElementById('aboutSeoStart');
const aboutSeoFooter = document.getElementById('aboutSeoFooter');
const aboutSeoInGame = document.getElementById('aboutSeoInGame');

const canvas = document.getElementById('aquariumCanvas');
const panelRoot = document.getElementById('panelRoot');
const tankShell = canvas.closest('.tank-shell');
const fullscreenTarget = tankShell || canvas.parentElement || canvas;

let world = null;
let renderer = null;
let panel = null;
let started = false;
let canvasClickHandler = null;
let ecosystemFailed = false;

let pendingSavePayload = null;

let autosaveIntervalId = null;
let awaySnapshot = null;
let autoPauseOverlayOpen = false;
let lastInteractionSimTimeSec = 0;

let lastTimingDebugLogAtSec = -1;
let lastTrendSampleSimTimeSec = null;
let lastTrendSampleHygiene01 = null;
let smoothedHygieneDeltaPerMin = 0;
let resizeDebounceId = null;


const fullscreenHint = document.createElement('div');
fullscreenHint.className = 'fullscreen-hint';
fullscreenHint.textContent = 'Press F for fullscreen';
fullscreenHint.hidden = true;
fullscreenHint.setAttribute('data-cinema-hide', 'true');
document.body.appendChild(fullscreenHint);

function computeCleanlinessTrend(simTimeSec, hygiene01) {
  const currentSimTime = Number.isFinite(simTimeSec) ? simTimeSec : 0;
  const currentHygiene = Math.max(0, Math.min(1, hygiene01 ?? 1));

  if (lastTrendSampleSimTimeSec == null || lastTrendSampleHygiene01 == null) {
    lastTrendSampleSimTimeSec = currentSimTime;
    lastTrendSampleHygiene01 = currentHygiene;
    return 'Stable';
  }

  const dt = Math.max(0, currentSimTime - lastTrendSampleSimTimeSec);
  if (dt > 0) {
    const deltaPerMin = ((currentHygiene - lastTrendSampleHygiene01) / dt) * 60;
    const smoothing = 0.2;
    smoothedHygieneDeltaPerMin = smoothedHygieneDeltaPerMin * (1 - smoothing) + deltaPerMin * smoothing;
    lastTrendSampleSimTimeSec = currentSimTime;
    lastTrendSampleHygiene01 = currentHygiene;
  }

  if (smoothedHygieneDeltaPerMin <= -0.018) return 'Dropping fast';
  if (smoothedHygieneDeltaPerMin <= -0.004) return 'Dropping';
  return 'Stable';
}

function loadSavedWorldSnapshot() {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.saveVersion !== SAVE_VERSION) return null;
    if (!payload.worldState || payload.worldState.saveVersion !== SAVE_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}

function getDefaultWorldBounds() {
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const isMobileViewport = window.innerWidth < 860;
  if (isCoarsePointer || isMobileViewport) {
    return { width: WORLD_MOBILE_WIDTH, height: WORLD_MOBILE_HEIGHT };
  }
  return { width: WORLD_DESKTOP_WIDTH, height: WORLD_DESKTOP_HEIGHT };
}

function resolveSavedWorldBounds(payload) {
  const width = Number.isFinite(payload?.boundsWidth) ? payload.boundsWidth : null;
  const height = Number.isFinite(payload?.boundsHeight) ? payload.boundsHeight : null;
  if (width != null && height != null && width > 0 && height > 0) {
    return { width, height };
  }
  return getDefaultWorldBounds();
}

function formatRelativeSavedAt(epochMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return 'unknown';
  const deltaMs = Math.max(0, Date.now() - epochMs);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (deltaMs < 15_000) return 'just now';
  if (deltaMs < hourMs) {
    const minutes = Math.max(1, Math.round(deltaMs / minuteMs));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (deltaMs < dayMs) {
    const hours = Math.max(1, Math.round(deltaMs / hourMs));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.round(deltaMs / dayMs));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function saveWorldSnapshot() {
  if (!started || !world || ecosystemFailed) return false;

  try {
    const payload = {
      saveVersion: SAVE_VERSION,
      savedAtEpochMs: Date.now(),
      boundsWidth: world.bounds.width,
      boundsHeight: world.bounds.height,
      worldState: world.toJSON()
    };
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function startAutosave() {
  if (autosaveIntervalId != null) return;
  autosaveIntervalId = setInterval(() => {
    saveWorldSnapshot();
  }, AUTOSAVE_INTERVAL_MS);
}

function stopAutosave() {
  if (autosaveIntervalId == null) return;
  clearInterval(autosaveIntervalId);
  autosaveIntervalId = null;
}


function measureCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const hostRect = tankShell?.getBoundingClientRect();

  return {
    width: Math.max(1, Math.floor(rect.width || hostRect?.width || canvas.clientWidth || 1)),
    height: Math.max(1, Math.floor(rect.height || hostRect?.height || canvas.clientHeight || 1))
  };
}

startFishSlider?.addEventListener('input', (event) => {
  const value = Number.parseInt(event.target.value, 10) || DEFAULT_INITIAL_FISH_COUNT;
  if (startFishValue) startFishValue.textContent = String(value);
});

const corpseActionButton = document.createElement('button');
corpseActionButton.type = 'button';
corpseActionButton.textContent = 'Remove from tank';
corpseActionButton.hidden = true;
corpseActionButton.style.position = 'fixed';
corpseActionButton.style.zIndex = '12';
corpseActionButton.style.padding = '6px 10px';
corpseActionButton.style.borderRadius = '999px';
corpseActionButton.style.border = '1px solid rgba(255,255,255,0.38)';
corpseActionButton.style.background = 'rgba(20, 28, 38, 0.86)';
corpseActionButton.style.color = '#eaf7ff';
corpseActionButton.style.fontSize = '12px';
corpseActionButton.style.cursor = 'pointer';
document.body.appendChild(corpseActionButton);
corpseActionButton.setAttribute('data-cinema-hide', 'true');

const filterToast = document.createElement('div');
filterToast.hidden = true;
filterToast.style.position = 'fixed';
filterToast.style.left = '50%';
filterToast.style.bottom = '22px';
filterToast.style.transform = 'translateX(-50%)';
filterToast.style.padding = '6px 10px';
filterToast.style.borderRadius = '999px';
filterToast.style.border = '1px solid rgba(255,255,255,0.34)';
filterToast.style.background = 'rgba(18, 30, 41, 0.88)';
filterToast.style.color = '#e8f4ff';
filterToast.style.fontSize = '12px';
filterToast.style.zIndex = '30';
filterToast.style.pointerEvents = 'none';
document.body.appendChild(filterToast);
filterToast.setAttribute('data-cinema-hide', 'true');

const ecosystemFailedOverlay = document.createElement('div');
ecosystemFailedOverlay.hidden = true;
ecosystemFailedOverlay.style.position = 'fixed';
ecosystemFailedOverlay.style.inset = '0';
ecosystemFailedOverlay.style.display = 'grid';
ecosystemFailedOverlay.style.placeItems = 'center';
ecosystemFailedOverlay.style.background = 'rgba(2, 7, 12, 0.8)';
ecosystemFailedOverlay.style.backdropFilter = 'blur(2px)';
ecosystemFailedOverlay.style.zIndex = '120';

const ecosystemFailedCard = document.createElement('div');
ecosystemFailedCard.style.width = 'min(420px, calc(100vw - 32px))';
ecosystemFailedCard.style.padding = '18px';
ecosystemFailedCard.style.borderRadius = '12px';
ecosystemFailedCard.style.border = '1px solid rgba(255, 255, 255, 0.28)';
ecosystemFailedCard.style.background = 'rgba(13, 20, 28, 0.95)';
ecosystemFailedCard.style.boxShadow = '0 16px 34px rgba(0, 0, 0, 0.44)';

const ecosystemFailedTitle = document.createElement('h2');
ecosystemFailedTitle.textContent = 'Ecosystem Failed';
ecosystemFailedTitle.style.margin = '0 0 8px';
ecosystemFailedTitle.style.fontSize = '22px';
ecosystemFailedTitle.style.color = '#eaf7ff';

const ecosystemFailedBody = document.createElement('p');
ecosystemFailedBody.textContent = 'All fish are gone. This run cannot be continued.';
ecosystemFailedBody.style.margin = '0 0 16px';
ecosystemFailedBody.style.color = 'rgba(232, 244, 255, 0.9)';

const ecosystemFailedActions = document.createElement('div');
ecosystemFailedActions.style.display = 'flex';
ecosystemFailedActions.style.justifyContent = 'flex-end';

const ecosystemFailedRestartButton = document.createElement('button');
ecosystemFailedRestartButton.type = 'button';
ecosystemFailedRestartButton.textContent = 'Restart';
ecosystemFailedRestartButton.style.padding = '8px 12px';
ecosystemFailedRestartButton.style.borderRadius = '999px';
ecosystemFailedRestartButton.style.border = '1px solid rgba(255, 255, 255, 0.4)';
ecosystemFailedRestartButton.style.background = 'rgba(23, 50, 82, 0.92)';
ecosystemFailedRestartButton.style.color = '#eaf7ff';
ecosystemFailedRestartButton.style.fontWeight = '600';
ecosystemFailedRestartButton.style.cursor = 'pointer';

ecosystemFailedActions.append(ecosystemFailedRestartButton);
ecosystemFailedCard.append(ecosystemFailedTitle, ecosystemFailedBody, ecosystemFailedActions);
ecosystemFailedOverlay.append(ecosystemFailedCard);
document.body.appendChild(ecosystemFailedOverlay);
ecosystemFailedOverlay.setAttribute('data-cinema-hide', 'true');

const autoPauseOverlay = document.createElement('div');
autoPauseOverlay.hidden = true;
autoPauseOverlay.style.position = 'fixed';
autoPauseOverlay.style.inset = '0';
autoPauseOverlay.style.display = 'grid';
autoPauseOverlay.style.placeItems = 'center';
autoPauseOverlay.style.background = 'rgba(2, 7, 12, 0.74)';
autoPauseOverlay.style.backdropFilter = 'blur(2px)';
autoPauseOverlay.style.zIndex = '118';

const autoPauseCard = document.createElement('div');
autoPauseCard.style.width = 'min(430px, calc(100vw - 32px))';
autoPauseCard.style.padding = '16px';
autoPauseCard.style.borderRadius = '12px';
autoPauseCard.style.border = '1px solid rgba(255, 255, 255, 0.28)';
autoPauseCard.style.background = 'rgba(12, 20, 28, 0.95)';
autoPauseCard.style.boxShadow = '0 16px 34px rgba(0, 0, 0, 0.44)';

const autoPauseTitle = document.createElement('h2');
autoPauseTitle.textContent = 'Auto-pause due to inactivity';
autoPauseTitle.style.margin = '0 0 6px';
autoPauseTitle.style.fontSize = '20px';
autoPauseTitle.style.color = '#eaf7ff';

const autoPauseSubtitle = document.createElement('p');
autoPauseSubtitle.textContent = 'While you were away';
autoPauseSubtitle.style.margin = '0 0 10px';
autoPauseSubtitle.style.color = 'rgba(232, 244, 255, 0.92)';

const autoPauseList = document.createElement('ul');
autoPauseList.style.margin = '0 0 12px';
autoPauseList.style.paddingLeft = '18px';
autoPauseList.style.color = 'rgba(232, 244, 255, 0.94)';
autoPauseList.style.fontSize = '14px';

const autoPauseStarving = document.createElement('p');
autoPauseStarving.style.margin = '0 0 14px';
autoPauseStarving.style.color = 'rgba(255, 213, 164, 0.95)';
autoPauseStarving.style.fontSize = '13px';

const autoPauseActions = document.createElement('div');
autoPauseActions.style.display = 'flex';
autoPauseActions.style.justifyContent = 'flex-end';

const autoPauseResumeButton = document.createElement('button');
autoPauseResumeButton.type = 'button';
autoPauseResumeButton.textContent = 'OK · Resume';
autoPauseResumeButton.style.padding = '8px 12px';
autoPauseResumeButton.style.borderRadius = '999px';
autoPauseResumeButton.style.border = '1px solid rgba(255, 255, 255, 0.4)';
autoPauseResumeButton.style.background = 'rgba(28, 80, 54, 0.92)';
autoPauseResumeButton.style.color = '#eaf7ff';
autoPauseResumeButton.style.fontWeight = '600';
autoPauseResumeButton.style.cursor = 'pointer';

autoPauseActions.append(autoPauseResumeButton);
autoPauseCard.append(autoPauseTitle, autoPauseSubtitle, autoPauseList, autoPauseStarving, autoPauseActions);
autoPauseOverlay.append(autoPauseCard);
document.body.appendChild(autoPauseOverlay);
autoPauseOverlay.setAttribute('data-cinema-hide', 'true');

function syncCinemaMode() {
  const inFullscreen = document.fullscreenElement === fullscreenTarget;
  document.body.classList.toggle('cinema-mode', inFullscreen);
  if (inFullscreen) {
    fullscreenHint.hidden = true;
    fullscreenHint.classList.remove('is-visible');
  }
}

async function toggleFullscreen() {
  if (!started || !fullscreenTarget) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await fullscreenTarget.requestFullscreen();
  }
}

function showFullscreenHintOnce() {
  if (sessionStorage.getItem(FULLSCREEN_HINT_SESSION_KEY) === '1') return;
  sessionStorage.setItem(FULLSCREEN_HINT_SESSION_KEY, '1');
  fullscreenHint.hidden = false;
  requestAnimationFrame(() => fullscreenHint.classList.add('is-visible'));
  window.setTimeout(() => {
    fullscreenHint.classList.remove('is-visible');
    window.setTimeout(() => {
      fullscreenHint.hidden = true;
    }, 420);
  }, 3600);
}


const infoModalCopy = {
  howToPlay: {
    title: 'How to Play',
    body: `This simulation is interaction-driven. The tank responds to your actions — and to your inaction.

Feeding the Fish

Click anywhere inside the aquarium to drop food.

Hungry fish will detect food from a distance and swim toward it. Very hungry fish react even more urgently. Well-fed fish ignore it.

Feeding sustains life — but it also affects water quality. Overfeeding without filtration will gradually reduce cleanliness. Clean water supports wellbeing. Poor water creates long-term consequences.

Selecting and Observing

Click directly on a fish to inspect it.

You can:

View its life stage, hunger level, growth and wellbeing.

See its history (parents, children, lifespan, cause of death).

Rename it.

Track reproduction and pregnancy states.

Every fish carries its own timeline. The inspector reveals only part of the underlying system.

Reproduction & Eggs

When environmental and biological conditions align, adult fish may reproduce.

Pregnancy progresses over time. Eggs are laid and incubate within the tank. Once ready, they hatch — introducing new fish that inherit traits from their parents.

Population growth changes the balance of the ecosystem. More fish means more consumption, more waste, more system pressure.

Water & Cleanliness

Cleanliness gradually declines as fish eat, grow and live.

When enough care has been shown (by feeding consistently), the Water Filter becomes available.
You must:

Unlock it through interaction.

Install it (installation takes time).

Turn it on.

Maintain it periodically.

The filter does not run forever. Its efficiency decreases. If ignored, water quality will suffer.

Speed & Time

You control simulation speed.

Increasing speed accelerates:

Aging

Hunger cycles

Reproduction

Water decay

Filter wear

Time never stops progressing logically. Faster time means faster consequences.

Death & Removal

Fish can die from:

Old age

Starvation

Dead fish sink. You may remove them from the tank.
Their history remains part of the simulation memory.`
  },
  about: {
    title: 'About',
    body: `This is not a decorative aquarium.

It is a living, time-driven ecosystem where every fish exists within a network of invisible variables, thresholds and cascading consequences.

Each fish has its own life cycle. It grows, consumes energy, feels hunger, reacts to water conditions and interacts with other fish. Hunger does not simply “increase” — it shifts behavior. Movement patterns change. Risk tolerance changes. Wellbeing slowly responds to long-term conditions.

Feeding creates more than just a meal. It alters water quality. Water quality influences stress. Stress influences reproduction and survival. The system remembers what has happened.

Reproduction is not guaranteed. It depends on maturity, health, environment and timing. Eggs inherit traits. New life enters the tank carrying the statistical echo of its parents. Lineages form. Histories accumulate.

Death is not random decoration. Fish can die from old age. They can die from neglect. Their life span is measured in aquarium time, and their history remains recorded.

Water itself is a dynamic layer. Cleanliness degrades with activity. Filtration is not cosmetic — it is unlocked through care, installed over time, maintained periodically and powered intentionally. A neglected filter slowly loses efficiency. An inactive filter changes the fate of the entire tank.

Time in this world is canonical. When you speed up the simulation, you accelerate life, decay and consequence together. When you leave, the system continues logically. When you return, nothing was frozen — it evolved.

There are no visible formulas, but behind every visible change lies a structured set of relationships. Multiple internal states influence each other continuously. Small actions compound.

This simulation is not about winning.

It is about managing a closed system where balance is fragile, memory matters, and every intervention shifts the trajectory of life inside the glass.`
  }
};

function openInfoModal(key) {
  const modalData = infoModalCopy[key];
  if (!modalData || !infoModalBackdrop || !infoModalTitle || !infoModalContent) return;

  infoModalTitle.textContent = modalData.title;
  const paragraphs = modalData.body
    .split('\n\n')
    .map((line) => line.trim())
    .filter(Boolean);
  infoModalContent.innerHTML = paragraphs.map((line) => `<p>${line}</p>`).join('');
  infoModalBackdrop.hidden = false;
}

function closeInfoModal() {
  if (!infoModalBackdrop) return;
  infoModalBackdrop.hidden = true;
}

function refreshSavedStartPanel() {
  const payload = loadSavedWorldSnapshot();
  pendingSavePayload = payload;

  const hasSave = Boolean(payload);
  if (continueSimButton) continueSimButton.disabled = !hasSave;

  if (!savedStartMeta) return;
  if (!hasSave) {
    savedStartMeta.textContent = 'Saved simulation found: no';
    return;
  }

  const relative = formatRelativeSavedAt(payload.savedAtEpochMs);
  savedStartMeta.textContent = `Saved simulation found: yes (last saved ${relative})`;
}

let filterToastTimeoutId = null;
function showFilterToast(textValue) {
  filterToast.textContent = textValue;
  filterToast.hidden = false;
  if (filterToastTimeoutId) clearTimeout(filterToastTimeoutId);
  filterToastTimeoutId = setTimeout(() => {
    filterToast.hidden = true;
    filterToastTimeoutId = null;
  }, 2000);
}

function speciesLabel(speciesId) {
  if (speciesId === 'AZURE_DART') return 'Azure Dart';
  if (speciesId === 'SILT_SIFTER') return 'Silt Sifter';
  return 'Lab Minnow';
}

function summarizeEggsBySpecies() {
  if (!world) return [];
  const counts = new Map();
  for (const egg of world.eggs ?? []) {
    const speciesId = egg?.speciesId ?? 'LAB_MINNOW';
    counts.set(speciesId, (counts.get(speciesId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([speciesId, count]) => ({ speciesLabel: speciesLabel(speciesId), count }))
    .sort((a, b) => a.speciesLabel.localeCompare(b.speciesLabel));
}

function fishDisplayName(fish) {
  if (!fish) return 'Unknown fish';
  const name = String(fish.name ?? '').trim() || `Fish #${fish.id}`;
  return `${name} (${speciesLabel(fish.speciesId)})`;
}

function captureAwaySnapshot() {
  if (!world) return null;
  const deadIds = new Set();
  const gravidIds = new Set();

  for (const fish of world.getFishInspectorList?.() ?? world.fish) {
    if (fish.lifeState === 'DEAD') deadIds.add(fish.id);
    if (fish.repro?.state === 'GRAVID' || fish.repro?.state === 'LAYING') gravidIds.add(fish.id);
  }

  return {
    atSimSec: world.simTimeSec,
    birthsCount: world.birthsCount,
    foodsConsumedCount: world.foodsConsumedCount,
    deadIds,
    gravidIds
  };
}

function clearAwaySnapshot() {
  awaySnapshot = null;
}

function isAway() {
  if (!started || !world) return false;
  if (document.visibilityState === 'hidden') return true;
  const inactivitySimSec = Math.max(0, world.simTimeSec - lastInteractionSimTimeSec);
  return inactivitySimSec >= INACTIVITY_AWAY_THRESHOLD_SIM_SEC;
}

function ensureAwaySnapshotState() {
  if (!started || !world || ecosystemFailed || autoPauseOverlayOpen) {
    clearAwaySnapshot();
    return;
  }

  if (isAway()) {
    if (!awaySnapshot) awaySnapshot = captureAwaySnapshot();
    return;
  }

  clearAwaySnapshot();
}

function buildAwayReport() {
  if (!world || !awaySnapshot) {
    return {
      birthsDelta: 0,
      foodsDelta: 0,
      deathsDelta: 0,
      newlyPregnantDelta: 0,
      starvingNowNames: []
    };
  }

  const currentDeadIds = new Set();
  const currentGravidIds = new Set();
  const starvingNowNames = [];

  for (const fish of world.getFishInspectorList?.() ?? world.fish) {
    if (fish.lifeState === 'DEAD') currentDeadIds.add(fish.id);
    if (fish.repro?.state === 'GRAVID' || fish.repro?.state === 'LAYING') currentGravidIds.add(fish.id);
    if (fish.lifeState === 'ALIVE' && fish.hungerState === 'STARVING') starvingNowNames.push(fishDisplayName(fish));
  }

  let deathsDelta = 0;
  for (const id of currentDeadIds) {
    if (!awaySnapshot.deadIds.has(id)) deathsDelta += 1;
  }

  let newlyPregnantDelta = 0;
  for (const id of currentGravidIds) {
    if (!awaySnapshot.gravidIds.has(id)) newlyPregnantDelta += 1;
  }

  return {
    birthsDelta: Math.max(0, world.birthsCount - awaySnapshot.birthsCount),
    foodsDelta: Math.max(0, world.foodsConsumedCount - awaySnapshot.foodsConsumedCount),
    deathsDelta,
    newlyPregnantDelta,
    starvingNowNames
  };
}

function renderAutoPauseReport(report) {
  autoPauseList.replaceChildren();
  const rows = [];
  if (report.birthsDelta > 0) rows.push(`${report.birthsDelta} born`);
  if (report.deathsDelta > 0) rows.push(`${report.deathsDelta} died while away`);
  if (report.foodsDelta > 0) rows.push(`${report.foodsDelta} meals eaten`);
  if (report.newlyPregnantDelta > 0) rows.push(`${report.newlyPregnantDelta} became pregnant`);

  if (rows.length === 0) rows.push('No major population changes while away.');

  for (const text of rows) {
    const item = document.createElement('li');
    item.textContent = text;
    autoPauseList.appendChild(item);
  }

  autoPauseStarving.textContent = report.starvingNowNames.length
    ? `Starving now: ${report.starvingNowNames.join(', ')}`
    : 'No fish are currently starving.';
}

function triggerAutoPauseDueToAway() {
  if (!started || !world || ecosystemFailed || autoPauseOverlayOpen) return;
  world.paused = true;
  stopBackgroundSim();
  stopRaf();
  hideCorpseAction();
  renderAutoPauseReport(buildAwayReport());
  autoPauseOverlay.hidden = false;
  autoPauseOverlayOpen = true;
}

function maybeAutoPauseOnStarvingAway() {
  if (!started || !world || ecosystemFailed || autoPauseOverlayOpen) return;
  ensureAwaySnapshotState();
  if (!awaySnapshot) return;

  const hasStarvingFish = world.fish.some((fish) => fish.lifeState === 'ALIVE' && fish.hungerState === 'STARVING');
  if (hasStarvingFish) triggerAutoPauseDueToAway();
}

function markUserInteraction() {
  if (!started || !world || ecosystemFailed) return;
  lastInteractionSimTimeSec = world.simTimeSec;
  if (!autoPauseOverlayOpen) ensureAwaySnapshotState();
}

autoPauseResumeButton.addEventListener('click', () => {
  if (!started || !world || ecosystemFailed || !autoPauseOverlayOpen) return;
  autoPauseOverlay.hidden = true;
  autoPauseOverlayOpen = false;
  clearAwaySnapshot();
  world.paused = false;
  lastInteractionSimTimeSec = world.simTimeSec;
  syncDriversToVisibility();
});

const trackedInteractionEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
for (const eventName of trackedInteractionEvents) {
  document.addEventListener(eventName, markUserInteraction, { passive: true });
}


function refreshDevModeUI() {
  if (!panel) return;
  panel.sync({
    speedMultiplier: world?.speedMultiplier ?? 1,
    paused: world?.paused ?? false,
    speedCap: world?.getAvailableSimSpeedMultiplierCap?.() ?? 1
  });
}

function worldToClientPoint(worldX, worldY) {
  if (!renderer || !world) return null;
  const screenPoint = renderer.toScreenPoint(worldX, worldY);
  if (!screenPoint) return null;
  const canvasRect = canvas.getBoundingClientRect();
  return { x: canvasRect.left + screenPoint.x, y: canvasRect.top + screenPoint.y };
}

function hideCorpseAction() {
  corpseActionButton.hidden = true;
}

function updateCorpseActionButton() {
  if (!world) return;
  const selectedFish = world.getSelectedFish?.();
  if (!selectedFish || selectedFish.lifeState !== 'DEAD') {
    hideCorpseAction();
    return;
  }

  const point = worldToClientPoint(selectedFish.position.x, selectedFish.position.y - selectedFish.size * 1.4);
  if (!point) {
    hideCorpseAction();
    return;
  }

  corpseActionButton.hidden = false;
  corpseActionButton.style.left = `${Math.round(point.x)}px`;
  corpseActionButton.style.top = `${Math.round(point.y)}px`;
  corpseActionButton.style.transform = 'translate(-50%, -100%)';
}

corpseActionButton.addEventListener('click', () => {
  if (!world) return;
  const selectedFish = world.getSelectedFish?.();
  if (!selectedFish || selectedFish.lifeState !== 'DEAD') {
    hideCorpseAction();
    return;
  }

  world.removeCorpse(selectedFish.id);
  hideCorpseAction();
});

function resize() {
  if (!started || !world || !renderer) return;
  const { width, height } = measureCanvasSize();
  renderer.resize(width, height);
}

function queueResize() {
  window.clearTimeout(resizeDebounceId);
  resizeDebounceId = window.setTimeout(() => {
    resizeDebounceId = null;
    resize();
  }, RESIZE_DEBOUNCE_MS);
}

window.addEventListener('resize', queueResize);
window.addEventListener('orientationchange', queueResize);
window.visualViewport?.addEventListener('resize', queueResize);
new ResizeObserver(resize).observe(tankShell || canvas);
document.addEventListener('fullscreenchange', () => {
  syncCinemaMode();
  queueResize();
});

/* -------------------------------------------------------------------------- */
/* Simulation/render drivers (single active driver rule)                       */
/* -------------------------------------------------------------------------- */

let rafId = null;
let bgIntervalId = null;

let lastTime = performance.now();

const VISIBLE_MAX_STEP_SEC = 0.25;
const HIDDEN_STEP_SEC = 0.25;
const HIDDEN_TICK_MS = 1000;

function checkEcosystemFailure() {
  if (!world || ecosystemFailed) return;

  const aliveCount = world.fish.reduce((count, fish) => {
    return count + (fish.lifeState === 'ALIVE' ? 1 : 0);
  }, 0);

  if (aliveCount === 0) triggerEcosystemFailed();
}

function triggerEcosystemFailed() {
  if (!started || ecosystemFailed || !world) return;

  ecosystemFailed = true;
  world.paused = true;
  stopRaf();
  stopBackgroundSim();
  stopAutosave();
  hideCorpseAction();
  autoPauseOverlay.hidden = true;
  autoPauseOverlayOpen = false;
  clearAwaySnapshot();
  localStorage.removeItem(SAVE_STORAGE_KEY);
  ecosystemFailedOverlay.hidden = false;
}

function stepVisibleSim(rawDeltaSec) {
  if (!world || ecosystemFailed) return;
  const dt = Math.min(VISIBLE_MAX_STEP_SEC, Math.max(0, rawDeltaSec));
  if (dt <= 0) return;
  world.update(dt);
  maybeAutoPauseOnStarvingAway();
  checkEcosystemFailure();
}

function stepHiddenSim(rawDeltaSec) {
  if (!world || ecosystemFailed) return;
  let remaining = Math.max(0, rawDeltaSec);
  if (remaining <= 0) return;

  while (remaining > 0) {
    const dt = Math.min(HIDDEN_STEP_SEC, remaining);
    world.update(dt);
    maybeAutoPauseOnStarvingAway();
    checkEcosystemFailure();
    if (ecosystemFailed) return;
    if (autoPauseOverlayOpen) return;
    remaining -= dt;
  }
}

function tick(now) {
  if (!world || !renderer || !panel) return;

  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;

  const renderDelta = Math.min(0.05, Math.max(0.000001, rawDelta));

  stepVisibleSim(rawDelta);
  if (ecosystemFailed) return;
  renderer.render(now, renderDelta);

  const speedUnlockState = world.getSpeedUnlockState?.() ?? { speedCap: world.getAvailableSimSpeedMultiplierCap?.() ?? 1, pendingUnlocks: [] };

  panel.updateStats({
    simTimeSec: world.simTimeSec,
    fishCount: world.fish.length,
    cleanliness01: world.water.hygiene01,
    cleanlinessTrend: computeCleanlinessTrend(world.simTimeSec, world.water.hygiene01),
    filterUnlocked: world.isFeatureUnlocked?.('waterFilter') ?? world.filterUnlocked,
    foodsConsumedCount: world.foodsConsumedCount,
    filterUnlockThreshold: world.filterUnlockThreshold,
    filterInstalled: world.water.filterInstalled,
    filterEnabled: world.water.filterEnabled,
    filter01: world.water.filter01,
    filterTier: world.water.filterTier,
    filterNextTierUnlockFeeds: world.getFilterTierUnlockFeeds?.((world.water.filterTier ?? 0) + 1) ?? 0,
    foodsNeededForNextTier: Math.max(0, (world.getFilterTierUnlockFeeds?.((world.water.filterTier ?? 0) + 1) ?? 0) - world.foodsConsumedCount),
    installProgress01: world.water.installProgress01,
    upgradeProgress01: world.water.upgradeProgress01,
    maintenanceProgress01: world.water.maintenanceProgress01,
    maintenanceCooldownSec: world.water.maintenanceCooldownSec,
    filterDepletedThreshold01: world.filterDepletedThreshold01,
    birthsCount: world.birthsCount,
    nestbrushUnlockBirths: 3,
    canAddNestbrush: world.canAddNestbrush?.() ?? false,
    nestbrushAdded: Boolean(world.nestbrush),
    berryReedUnlockBirths: 4,
    berryReedUnlockCleanlinessPct: 80,
    canAddBerryReed: world.canAddBerryReedPlant?.() ?? false,
    berryReedPlantCount: world.berryReedPlants?.length ?? 0,
    canAddAzureDart: world.canAddAzureDart?.() ?? false,
    azureDartCount: world.getAzureDartCount?.() ?? 0,
    canAddSiltSifter: world.canAddSiltSifter?.() ?? false,
    siltSifterCount: world.getSiltSifterCount?.() ?? 0,
    siltSifterUnlockBirths: 10,
    simSpeedCap: speedUnlockState.speedCap,
    simSpeedPendingUnlocks: speedUnlockState.pendingUnlocks,
    eggsBySpecies: summarizeEggsBySpecies(),
    waterDebug: {
      hygiene01: world.water?.hygiene01,
      dirt01: world.water?.dirt01,
      filter01: world.water?.filter01,
      effectiveFilter01: world.water?.effectiveFilter01,
      filterEnabled: world.water?.filterEnabled
    }
  });
  panel.updateFishInspector(world.getFishInspectorList?.() ?? world.fish, world.selectedFishId, world.simTimeSec);
  updateCorpseActionButton();

  const timing = world.debugTiming;
  const logSecond = Math.floor(world.simTimeSec);
  if (timing && logSecond > lastTimingDebugLogAtSec) {
    lastTimingDebugLogAtSec = logSecond;
    console.log('[sim-timing]', {
      speedMultiplier: timing.speedMultiplier,
      rawDelta: Number(timing.rawDelta.toFixed(4)),
      simDt: Number(timing.simDt.toFixed(4)),
      motionDt: Number(timing.motionDt.toFixed(4)),
      simTimeSec: Number(timing.simTimeSec.toFixed(2))
    });
  }

  rafId = requestAnimationFrame(tick);
}

function startRaf() {
  if (!started || rafId != null) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopRaf() {
  if (rafId == null) return;
  cancelAnimationFrame(rafId);
  rafId = null;
}

function startBackgroundSim() {
  if (!started || ecosystemFailed || bgIntervalId != null) return;

  let last = performance.now();
  bgIntervalId = setInterval(() => {
    const now = performance.now();
    const rawDelta = (now - last) / 1000;
    last = now;
    stepHiddenSim(rawDelta);
  }, HIDDEN_TICK_MS);
}

function stopBackgroundSim() {
  if (bgIntervalId == null) return;
  clearInterval(bgIntervalId);
  bgIntervalId = null;
}

function syncDriversToVisibility() {
  if (!started || ecosystemFailed) return;
  ensureAwaySnapshotState();

  if (autoPauseOverlayOpen) {
    stopBackgroundSim();
    stopRaf();
    if (document.visibilityState !== 'hidden') startRaf();
    return;
  }

  if (document.visibilityState === 'hidden') {
    saveWorldSnapshot();
    stopRaf();
    hideCorpseAction();
    stopBackgroundSim();
    startBackgroundSim();
    maybeAutoPauseOnStarvingAway();
  } else {
    stopBackgroundSim();
    stopRaf();
    startRaf();
  }
}

document.addEventListener('visibilitychange', syncDriversToVisibility);
window.addEventListener('beforeunload', () => {
  saveWorldSnapshot();
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const isEditableTarget = target instanceof Element
    && (target.matches('input, textarea, [contenteditable]:not([contenteditable="false"])') || target.closest('[contenteditable]:not([contenteditable="false"])'));

  if (!isEditableTarget && event.code === 'KeyF' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    fullscreenHint.hidden = true;
    fullscreenHint.classList.remove('is-visible');
    toggleFullscreen().catch(() => {});
    return;
  }

  if (!isEditableTarget && event.key === 'Enter' && event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    fullscreenHint.hidden = true;
    fullscreenHint.classList.remove('is-visible');
    toggleFullscreen().catch(() => {});
    return;
  }

  if (!event.ctrlKey || !event.shiftKey || event.code !== 'KeyD') return;
  event.preventDefault();
  const enabled = toggleDevMode();
  showFilterToast(`Dev mode ${enabled ? 'ON' : 'OFF'}`);
});

onDevModeChanged(() => {
  if (world) world.setSpeedMultiplier(world.speedMultiplier);
  refreshDevModeUI();
});


function restartToStartScreen() {
  if (!started) return;

  saveWorldSnapshot();
  stopRaf();
  stopBackgroundSim();
  stopAutosave();
  hideCorpseAction();
  ecosystemFailedOverlay.hidden = true;
  autoPauseOverlay.hidden = true;
  autoPauseOverlayOpen = false;
  clearAwaySnapshot();

  started = false;
  ecosystemFailed = false;
  pendingSavePayload = null;
  world = null;
  renderer = null;
  lastInteractionSimTimeSec = 0;
  lastTrendSampleSimTimeSec = null;
  lastTrendSampleHygiene01 = null;
  smoothedHygieneDeltaPerMin = 0;

  if (canvasClickHandler) {
    canvas.removeEventListener('click', canvasClickHandler);
    canvasClickHandler = null;
  }

  appRoot.hidden = true;
  startScreen.hidden = false;
  if (aboutSeoFooter) aboutSeoFooter.hidden = true;
  if (aboutSeoStart) aboutSeoStart.open = true;
  refreshSavedStartPanel();
}

function syncAboutSeoForSimulation() {
  if (!aboutSeoStart || !aboutSeoFooter || !aboutSeoInGame) return;

  aboutSeoStart.open = false;
  aboutSeoInGame.open = false;
  aboutSeoFooter.hidden = false;
}

function startSimulation({ savedPayload = null } = {}) {
  if (started) return;

  syncAboutSeoForSimulation();

  const selectedFishCount = Number.parseInt(startFishSlider?.value ?? String(DEFAULT_INITIAL_FISH_COUNT), 10);
  const initialFishCount = Number.isFinite(selectedFishCount) ? selectedFishCount : DEFAULT_INITIAL_FISH_COUNT;

  appRoot.hidden = false;
  startScreen.hidden = true;
  pendingSavePayload = null;
  ecosystemFailed = false;
  ecosystemFailedOverlay.hidden = true;
  autoPauseOverlay.hidden = true;
  autoPauseOverlayOpen = false;
  clearAwaySnapshot();

  if (savedPayload?.saveVersion === SAVE_VERSION) {
    const { width, height } = resolveSavedWorldBounds(savedPayload);
    world = World.fromJSON(savedPayload, {
      width,
      height,
      initialFishCount
    });
  } else {
    const { width, height } = getDefaultWorldBounds();
    world = new World(width, height, initialFishCount);
  }
  renderer = new Renderer(canvas, world);
  lastInteractionSimTimeSec = world.simTimeSec;
  lastTrendSampleSimTimeSec = null;
  lastTrendSampleHygiene01 = null;
  smoothedHygieneDeltaPerMin = 0;

  const panelHandlers = {
    onSpeedChange: (value) => world.setSpeedMultiplier(value),
    onPauseToggle: () => world.togglePause(),
    onFishSelect: (fishId) => world.toggleFishSelection(fishId),
    onFishFocus: (fishId) => world.selectFish(fishId),
    onFishRename: (fishId, name) => world.renameFish(fishId, name),
    onFishDiscard: (fishId) => world.discardFish(fishId),
    onGetFishById: (fishId) => world.getFishById?.(fishId),
    onFilterInstall: () => world.installWaterFilter?.(),
    onFilterMaintain: () => world.maintainWaterFilter?.(),
    onFilterTogglePower: () => world.toggleWaterFilterEnabled?.(),
    onFilterUpgrade: () => world.upgradeWaterFilter?.(),
    onAddNestbrush: () => {
      const result = world.addNestbrush?.() ?? { ok: false, reason: 'WORLD_NOT_READY' };
      if (result.ok) {
        showFilterToast('Nestbrush added');
        return result;
      }

      if (result.reason === 'MAX_COUNT') showFilterToast('Nestbrush already added');
      else if (result.reason === 'LOCKED') showFilterToast('Nestbrush locked');
      else if (result.reason === 'WORLD_NOT_READY') showFilterToast('Not ready yet');

      return result;
    },
    onAddBerryReed: () => {
      const result = world.addBerryReedPlant?.() ?? { ok: false, reason: 'WORLD_NOT_READY' };
      if (result.ok) {
        showFilterToast('Berry Reed added');
        return result;
      }

      if (result.reason === 'MAX_COUNT') showFilterToast('Berry Reed already added');
      else if (result.reason === 'LOCKED') showFilterToast('Berry Reed locked');
      else if (result.reason === 'WORLD_NOT_READY') showFilterToast('Not ready yet');

      if (isDevMode()) {
        console.warn('[BerryReed]', result.reason, {
          birthsCount: world.birthsCount,
          hygiene01: world.water?.hygiene01,
          plantCount: world.berryReedPlants?.length ?? 0,
          maxCount: world.getBerryReedMaxCount?.() ?? 1,
          bounds: world.bounds
        });
      }

      return result;
    },
    onAddAzureDart: () => world.addAzureDartSchool?.(),
    onAddSiltSifter: () => world.addSiltSifterSchool?.(),
    onGrantUnlockPrereqs: () => world.grantAllUnlockPrerequisites?.(),
    onRestartConfirm: () => restartToStartScreen()
  };
  if (!panel) {
    panel = new Panel(panelRoot, panelHandlers);
  } else {
    panel.handlers = panelHandlers;
  }

  if (canvasClickHandler) {
    canvas.removeEventListener('click', canvasClickHandler);
  }

  canvasClickHandler = (event) => {
    if (!world || !renderer) return;

    if (renderer.isFilterModuleHit?.(event.clientX, event.clientY) && world.water.filterInstalled) {
      const enabled = world.toggleWaterFilterEnabled?.();
      showFilterToast(enabled ? 'Filter ON' : 'Filter OFF');
      return;
    }

    const worldPoint = renderer.toWorldPoint(event.clientX, event.clientY);
    if (!worldPoint) return;

    const clickedFish = world.findFishAt(worldPoint.x, worldPoint.y);
    if (clickedFish) {
      world.toggleFishSelection(clickedFish.id);
      if (clickedFish.lifeState !== 'DEAD') panel.selectTab('fish');
      return;
    }

    hideCorpseAction();
    world.spawnFood(worldPoint.x, worldPoint.y);
  };
  canvas.addEventListener('click', canvasClickHandler);

  panel.sync({
    speedMultiplier: world.speedMultiplier,
    paused: world.paused,
    speedCap: world.getAvailableSimSpeedMultiplierCap?.() ?? 1
  });

  resize();
  requestAnimationFrame(resize);

  started = true;
  checkEcosystemFailure();
  if (ecosystemFailed) return;

  startAutosave();
  syncDriversToVisibility();
  showFullscreenHintOnce();
}

continueSimButton?.addEventListener('click', () => {
  if (!pendingSavePayload) refreshSavedStartPanel();
  if (!pendingSavePayload) return;

  startSimulation({ savedPayload: pendingSavePayload });
});

infoModalButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.getAttribute('data-info-modal');
    if (!key) return;
    openInfoModal(key);
  });
});

infoModalClose?.addEventListener('click', closeInfoModal);
infoModalBackdrop?.addEventListener('click', (event) => {
  if (event.target === infoModalBackdrop) closeInfoModal();
});

buyCoffeeButton?.addEventListener('click', () => {
  window.open('https://buymeacoffee.com/dizgioyunu', '_blank', 'noopener,noreferrer');
});

startSimButton?.addEventListener('click', () => {
  startSimulation();
});

ecosystemFailedRestartButton.addEventListener('click', () => {
  restartToStartScreen();
});

refreshSavedStartPanel();
