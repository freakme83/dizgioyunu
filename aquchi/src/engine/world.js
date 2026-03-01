/**
 * World simulation container.
 * Responsibility: hold fish + bubble state and update simulation with delta time.
 */

import { Fish } from './fish.js';
import { CONFIG, DEFAULT_SPECIES_ID, SPECIES } from '../config.js';
import { getMaxSimSpeedMultiplier, isDevMode } from '../dev.js';

const MAX_TILT = CONFIG.world.maxTiltRad;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clamp01 = (v) => clamp(v, 0, 1);
const FOOD_DEFAULT_AMOUNT = CONFIG.world.food.defaultAmount;
const FOOD_DEFAULT_TTL = CONFIG.world.food.defaultTtlSec;
const FOOD_FALL_ACCEL = CONFIG.world.food.fallAccel;
const FOOD_FALL_DAMPING = CONFIG.world.food.fallDamping;
const FOOD_MAX_FALL_SPEED = CONFIG.world.food.maxFallSpeed;
const POOP_DEFAULT_TTL_SEC = Math.max(1, CONFIG.world.poop?.defaultTtlSec ?? 120);
const POOP_DIRT_PER_SEC = Math.max(0, CONFIG.world.poop?.dirtPerSec ?? 0);
const POOP_BASE_DRIFT_SPEED = Math.max(0, CONFIG.world.poop?.baseDriftSpeed ?? CONFIG.world.poop?.riseSpeed ?? 4);
const POOP_DRIFT_DAMPING = clamp(CONFIG.world.poop?.driftDamping ?? 0.99, 0.9, 0.9999);
const POOP_JITTER = Math.max(0, CONFIG.world.poop?.jitter ?? 0.04);
const AGE_CONFIG = CONFIG.fish.age;
const INITIAL_MAX_AGE_SEC = Math.max(0, AGE_CONFIG.INITIAL_MAX_AGE_SEC ?? 1200);
const GROWTH_CONFIG = CONFIG.fish.growth;
const WATER_CONFIG = CONFIG.world.water;
const REPRO_CONFIG = CONFIG.reproduction ?? {};
const REPRO_ENABLED = REPRO_CONFIG.REPRO_ENABLED !== false;
const MATE_ENCOUNTER_RADIUS_PX = Math.max(0, REPRO_CONFIG.MATE_ENCOUNTER_RADIUS_PX ?? 70);
const MATE_PAIR_RETRY_MIN_SEC = Math.max(0, REPRO_CONFIG.MATE_PAIR_RETRY_MIN_SEC ?? 25);
const MATE_BASE_CHANCE = Math.max(0, REPRO_CONFIG.MATE_BASE_CHANCE ?? 0.08);
const MATE_FATHER_COOLDOWN_SEC = REPRO_CONFIG.MATE_FATHER_COOLDOWN_SEC ?? [120, 240];
const MATE_MIN_WELLBEING = clamp01(REPRO_CONFIG.MATE_MIN_WELLBEING ?? 0.8);
const MATE_MIN_HYGIENE = clamp01(REPRO_CONFIG.MATE_MIN_HYGIENE ?? 0.6);
const GESTATION_SEC = REPRO_CONFIG.GESTATION_SEC ?? [300, 360];
const EGG_INCUBATION_SEC = REPRO_CONFIG.EGG_INCUBATION_SEC ?? [120, 300];
const MOTHER_COOLDOWN_SEC = REPRO_CONFIG.MOTHER_COOLDOWN_SEC ?? [600, 1080];
const CLUTCH_SIZE = REPRO_CONFIG.CLUTCH_SIZE ?? [2, 4];
const SPECIES_MAP = SPECIES ?? {};
const LAB_MINNOW_SPECIES_ID = 'LAB_MINNOW';
const AZURE_DART_SPECIES_ID = 'AZURE_DART';
const AZURE_DART_UNLOCK_HYGIENE01 = 0.8;
const AZURE_DART_MAX_PLAYER_COUNT = 4;
const SILT_SIFTER_SPECIES_ID = 'SILT_SIFTER';
const SILT_SIFTER_UNLOCK_BIRTHS = 10;
const SILT_SIFTER_MAX_PLAYER_COUNT = 4;
const SILT_SIFTER_RECENT_POOP_MIN_SEC = 180;
const SILT_SIFTER_RECENT_POOP_MAX_SEC = 300;
const SILT_SIFTER_EGG_MATE_BOOST_WINDOW_SEC = 300;
const SILT_SIFTER_EGG_MATE_BOOST_MULTIPLIER = 3.2;
const POOP_DISSOLVE_DIRT_UNITS = Math.max(0, CONFIG.world.poop?.dissolveDirtUnits ?? POOP_DIRT_PER_SEC * POOP_DEFAULT_TTL_SEC);
const NESTBRUSH_UNLOCK_BIRTHS = 3;
const NESTBRUSH_GROWTH_MIN_HYGIENE01 = 0.85;
const NESTBRUSH_STAGE_GROWTH_SEC = 720;
const NESTBRUSH_MAX_STAGE = 3;
const NESTBRUSH_CAPACITY_BY_STAGE = [4, 8, 12];
const NESTBRUSH_INCUBATION_PENALTY_MULTIPLIER = 1.18;
const NESTBRUSH_HATCH_PENALTY_MULTIPLIER = 0.86;
const NESTBRUSH_MIN_HEIGHT_RATIO = 0.07;
const NESTBRUSH_MAX_HEIGHT_RATIO = 0.17;

const FEMALE_NAME_POOL = Array.isArray(CONFIG.FEMALE_NAME_POOL) ? CONFIG.FEMALE_NAME_POOL : [];
const MALE_NAME_POOL = Array.isArray(CONFIG.MALE_NAME_POOL) ? CONFIG.MALE_NAME_POOL : [];
const WATER_INITIAL_HYGIENE01 = 1;
const WATER_INITIAL_DIRT01 = 0;
const WATER_REFERENCE_FISH_COUNT = Math.max(1, WATER_CONFIG.referenceFishCount ?? 20);
const WATER_BASELINE_DECAY_PER_SEC = Math.max(0, WATER_CONFIG.baselineDecayPerSec ?? 0);
const WATER_BIOLOAD_DIRT_PER_SEC = Math.max(0, WATER_CONFIG.bioloadDirtPerSec ?? 0);
const WATER_DIRT_PER_EXPIRED_FOOD = Math.max(0, WATER_CONFIG.dirtPerExpiredFood ?? 0);
const WATER_DIRT_TO_DECAY_MULTIPLIER = Math.max(0, WATER_CONFIG.dirtToDecayMultiplier ?? 3);
const WATER_DIRT_DECAY_POWER = Math.max(1, WATER_CONFIG.dirtDecayPower ?? 1);
const WATER_DIRT_DECAY_STRENGTH = Math.max(0, WATER_CONFIG.dirtDecayStrength ?? WATER_DIRT_TO_DECAY_MULTIPLIER);
const WATER_HYGIENE_DROP_PER_EXPIRED_FOOD = Math.max(0, WATER_CONFIG.hygieneDropPerExpiredFood ?? 0);
const WATER_HYGIENE_DROP_PER_POOP_SPAWN = Math.max(0, WATER_CONFIG.hygieneDropPerPoopSpawn ?? 0);
const FILTER_DIRT_REMOVE_PER_SEC = Math.max(0, WATER_CONFIG.filterDirtRemovePerSec ?? 0);
const FILTER_WEAR_BASE_PER_SEC = Math.max(0, WATER_CONFIG.wearBasePerSec ?? 0);
const FILTER_WEAR_BIOLOAD_FACTOR = Math.max(0, WATER_CONFIG.wearBioloadFactor ?? 0);
const FILTER_WEAR_DIRT_FACTOR = Math.max(0, WATER_CONFIG.wearDirtFactor ?? 0);
const FILTER_BIOLOAD_MITIGATION_FACTOR = Math.max(0, WATER_CONFIG.bioloadMitigationFactor ?? 0);
const FILTER_TIER_DIRT_REMOVAL_STEP = Math.max(0, WATER_CONFIG.filterTierDirtRemovalStep ?? 0.25);
const FILTER_TIER_BIOLOAD_STEP = Math.max(0, WATER_CONFIG.filterTierBioloadStep ?? 0.15);
const FILTER_TIER_WEAR_STEP = Math.max(0, WATER_CONFIG.filterTierWearStep ?? 0.08);
const HYGIENE_RECOVERY_PER_SEC = Math.max(0, WATER_CONFIG.hygieneRecoveryPerSec ?? 0.00006);
const FILTER_DEPLETED_THRESHOLD_01 = clamp(WATER_CONFIG.filterDepletedThreshold01 ?? 0.1, 0, 1);
const FILTER_INSTALL_DURATION_SEC = Math.max(0.001, WATER_CONFIG.installDurationSec ?? 12);
const FILTER_MAINTENANCE_DURATION_SEC = Math.max(0.001, WATER_CONFIG.maintenanceDurationSec ?? 12);
const FILTER_MAINTENANCE_COOLDOWN_SEC = Math.max(0, WATER_CONFIG.maintenanceCooldownSec ?? 25);
const FILTER_MAINTENANCE_RESTORE_TO_01 = clamp(WATER_CONFIG.maintenanceRestoreTo01 ?? 1, 0, 1);
const CORPSE_GRACE_SEC = 120;
const CORPSE_DIRT_STEP_SEC = 60;
const CORPSE_DIRT_INITIAL01 = 0.07;
const CORPSE_DIRT_STEP01 = 0.01;
const CORPSE_DIRT_MAX01 = 0.12;
const BERRY_REED_UNLOCK_BIRTHS = 4;
const BERRY_REED_UNLOCK_HYGIENE01 = 0.8;
const BERRY_REED_MAX_COUNT = 1;
const BERRY_REED_FRUIT_INTERVAL_MIN_SEC = 16;
const BERRY_REED_FRUIT_INTERVAL_MAX_SEC = 48;
const BERRY_REED_FRUIT_INTERVAL_JITTER_SEC = 4;
const BERRY_REED_FRUIT_TTL_SEC = 90;
const BERRY_REED_MAX_FRUITS = 24;
const BERRY_REED_MAX_FRUITS_PER_PLANT = 20;
const BERRY_REED_INITIAL_CAPACITY = 4;
const BERRY_REED_MID_CAPACITY = 6;
const BERRY_REED_MAX_CAPACITY = 12;
const BERRY_REED_MIN_SPAWN_HEIGHT_SCALE = 0.56;
const BERRY_REED_MAX_SPAWN_HEIGHT_SCALE = 0.66;
const BERRY_REED_MAX_GROWTH_PHASES = 2;
const BERRY_REED_GROWTH_REFERENCE_SEC = Math.max(60, AGE_CONFIG.stageBaseSec?.juvenileEndSec ?? 50 * 60);
const BERRY_REED_MAX_GROWTH_ELAPSED_SEC = BERRY_REED_GROWTH_REFERENCE_SEC * BERRY_REED_MAX_GROWTH_PHASES;
const MIN_SIM_SPEED_MULTIPLIER = 0.5;
const SPEED_UNLOCK_2X_AT_SEC = 30 * 60;
const SPEED_UNLOCK_3X_AT_SEC = 120 * 60;
const REPRO_PRESSURE_START_COUNT = Math.max(6, Math.round(WATER_REFERENCE_FISH_COUNT * 0.9));
const REPRO_PRESSURE_CRITICAL_COUNT = Math.max(REPRO_PRESSURE_START_COUNT + 2, Math.round(WATER_REFERENCE_FISH_COUNT * 1.7));
const LAB_AUTHORITY_STRESS_START_AZURE_COUNT = 6;
const LAB_AUTHORITY_STRESS_MAX_PENALTY = 0.60;
const LAB_AUTHORITY_STRESS_CURVE_POWER = 1.6;
const LAB_AUTHORITY_STRESS_HALF_EFFECT_AZURE_DELTA = 6;

const WORLD_SAVE_VERSION = 1;
export const WATER_SAVE_KEYS = [
  'hygiene01',
  'dirt01',
  'filterInstalled',
  'filter01',
  'installProgress01',
  'maintenanceProgress01',
  'maintenanceCooldownSec',
  'upgradeProgress01',
  'upgradeTargetTier',
  'filterUnlocked',
  'filterEnabled',
  'effectiveFilter01',
  'filterTier'
];
export const FOOD_SAVE_KEYS = ['id', 'x', 'y', 'amount', 'ttl', 'vy'];
export const POOP_SAVE_KEYS = ['id', 'x', 'y', 'ttlSec', 'maxTtlSec', 'vx', 'vy', 'type', 'canBeEaten', 'nutrition', 'bioloadFactor'];
export const EGG_SAVE_KEYS = [
  'id',
  'x',
  'y',
  'laidAtSec',
  'hatchAtSec',
  'motherId',
  'fatherId',
  'motherTraits',
  'fatherTraits',
  'speciesId',
  'state',
  'canBeEaten',
  'nutrition',
  'isProtectedByNestbrush',
  'nestbrushAttachment'
];
export const NESTBRUSH_SAVE_KEYS = ['id', 'x', 'bottomY', 'height', 'stage', 'growthProgressSec', 'swayPhase', 'swayRate'];
export const BERRY_REED_BRANCH_SAVE_KEYS = ['t', 'side', 'len'];
export const BERRY_REED_PLANT_SAVE_KEYS = [
  'id',
  'x',
  'bottomY',
  'height',
  'spawnHeight',
  'maxHeight',
  'swayPhase',
  'swayRate',
  'branches',
  'nextFruitAtSec',
  'growthElapsedSec'
];
export const BERRY_REED_FRUIT_SAVE_KEYS = ['id', 'plantId', 'branchIndex', 'u', 'v', 'radius', 'createdAtSec', 'ttlSec'];

function deepCopyPlain(value) {
  if (Array.isArray(value)) return value.map((entry) => deepCopyPlain(entry));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = deepCopyPlain(entry);
    return out;
  }
  return value;
}

function pickSavedKeys(source, keys) {
  const out = {};
  for (const key of keys) out[key] = deepCopyPlain(source?.[key]);
  return out;
}

function clampPosition(position, bounds, swimHeight) {
  const x = Number.isFinite(position?.x) ? clamp(position.x, 0, bounds.width) : bounds.width * 0.5;
  const y = Number.isFinite(position?.y) ? clamp(position.y, 0, swimHeight) : swimHeight * 0.5;
  return { x, y };
}

function serializeFood(food) {
  return pickSavedKeys(food, FOOD_SAVE_KEYS);
}

function deserializeFood(data, bounds, swimHeight) {
  const source = data && typeof data === 'object' ? data : {};
  const position = clampPosition(source, bounds, swimHeight);
  return {
    id: Number.isFinite(source.id) ? source.id : 0,
    x: position.x,
    y: position.y,
    amount: Math.max(0.05, Number.isFinite(source.amount) ? source.amount : FOOD_DEFAULT_AMOUNT),
    ttl: Number.isFinite(source.ttl) ? source.ttl : FOOD_DEFAULT_TTL,
    vy: Number.isFinite(source.vy) ? source.vy : 0
  };
}

function serializePoop(poop) {
  return pickSavedKeys(poop, POOP_SAVE_KEYS);
}

function deserializePoop(data, bounds, swimHeight) {
  const source = data && typeof data === 'object' ? data : {};
  const position = clampPosition(source, bounds, swimHeight);
  const type = 'pellet';
  return {
    id: Number.isFinite(source.id) ? source.id : 0,
    x: position.x,
    y: position.y,
    ttlSec: Math.max(0, Number.isFinite(source.ttlSec) ? source.ttlSec : POOP_DEFAULT_TTL_SEC),
    maxTtlSec: Math.max(1, Number.isFinite(source.maxTtlSec) ? source.maxTtlSec : POOP_DEFAULT_TTL_SEC),
    vx: Number.isFinite(source.vx) ? source.vx : 0,
    vy: Math.abs(Number.isFinite(source.vy) ? source.vy : POOP_BASE_DRIFT_SPEED),
    type,
    canBeEaten: Boolean(source.canBeEaten ?? true),
    nutrition: Math.max(0, Number.isFinite(source.nutrition) ? source.nutrition : 0.1),
    bioloadFactor: Math.max(0, Number.isFinite(source.bioloadFactor) ? source.bioloadFactor : 1)
  };
}

function pickPoopTypeByWeight() {
  const roll = Math.random();
  if (roll < 0.7) return 'pellet';
  if (roll < 0.9) return 'neutral';
  return 'floaty';
}

function serializeEgg(egg) {
  return pickSavedKeys(egg, EGG_SAVE_KEYS);
}

function deserializeEgg(data, bounds, swimHeight) {
  const source = data && typeof data === 'object' ? data : {};
  const position = clampPosition(source, bounds, swimHeight);
  return {
    id: Number.isFinite(source.id) ? source.id : 0,
    x: position.x,
    y: position.y,
    laidAtSec: Number.isFinite(source.laidAtSec) ? source.laidAtSec : 0,
    hatchAtSec: Number.isFinite(source.hatchAtSec) ? source.hatchAtSec : 0,
    motherId: source.motherId ?? null,
    fatherId: source.fatherId ?? null,
    motherTraits: deepCopyPlain(source.motherTraits ?? {}),
    fatherTraits: deepCopyPlain(source.fatherTraits ?? {}),
    speciesId: typeof source.speciesId === 'string' ? source.speciesId : DEFAULT_SPECIES_ID,
    state: typeof source.state === 'string' ? source.state : 'INCUBATING',
    canBeEaten: Boolean(source.canBeEaten ?? true),
    nutrition: Math.max(0, Number.isFinite(source.nutrition) ? source.nutrition : 0.25),
    isProtectedByNestbrush: Boolean(source.isProtectedByNestbrush),
    nestbrushAttachment: source.nestbrushAttachment && typeof source.nestbrushAttachment === 'object'
      ? {
        branchIndex: Math.max(0, Math.floor(source.nestbrushAttachment.branchIndex ?? 0)),
        u: clamp(Number.isFinite(source.nestbrushAttachment.u) ? source.nestbrushAttachment.u : 0.7, 0.1, 0.95),
        v: clamp(Number.isFinite(source.nestbrushAttachment.v) ? source.nestbrushAttachment.v : 0, -8, 8)
      }
      : null
  };
}

function serializeNestbrush(plant) {
  return pickSavedKeys(plant, NESTBRUSH_SAVE_KEYS);
}

function deserializeNestbrush(data, bounds) {
  if (!data || typeof data !== 'object') return null;
  const source = data;
  const minBottomY = Math.max(0, bounds.height - 8);
  return {
    id: Number.isFinite(source.id) ? source.id : 1,
    x: clamp(Number.isFinite(source.x) ? source.x : bounds.width * 0.5, 12, Math.max(12, bounds.width - 12)),
    bottomY: clamp(Number.isFinite(source.bottomY) ? source.bottomY : bounds.height - 1, minBottomY, bounds.height),
    height: clamp(
      Number.isFinite(source.height) ? source.height : bounds.height * 0.1,
      bounds.height * NESTBRUSH_MIN_HEIGHT_RATIO,
      bounds.height * NESTBRUSH_MAX_HEIGHT_RATIO
    ),
    stage: clamp(Math.floor(Number.isFinite(source.stage) ? source.stage : 1), 1, NESTBRUSH_MAX_STAGE),
    growthProgressSec: Math.max(0, Number.isFinite(source.growthProgressSec) ? source.growthProgressSec : 0),
    swayPhase: Number.isFinite(source.swayPhase) ? source.swayPhase : rand(0, Math.PI * 2),
    swayRate: clamp(Number.isFinite(source.swayRate) ? source.swayRate : rand(0.0007, 0.0014), 0.0002, 0.003)
  };
}

function serializeWater(water) {
  return pickSavedKeys(water, WATER_SAVE_KEYS);
}

function serializeBerryReedPlant(plant) {
  const source = pickSavedKeys(plant, BERRY_REED_PLANT_SAVE_KEYS);
  source.branches = Array.isArray(plant?.branches)
    ? plant.branches.map((branch) => pickSavedKeys(branch, BERRY_REED_BRANCH_SAVE_KEYS))
    : [];
  return source;
}

function deserializeBerryReedPlant(data, bounds) {
  const source = data && typeof data === 'object' ? data : {};
  const branchSource = Array.isArray(source.branches) ? source.branches : [];
  const minBottomY = Math.max(0, bounds.height - 14);
  const maxBottomY = Math.max(minBottomY, bounds.height - 1);
  const maxHeight = clamp(
    Number.isFinite(source.maxHeight) ? source.maxHeight : source.height,
    bounds.height * 0.14,
    bounds.height * 0.35
  );
  const spawnHeight = clamp(
    Number.isFinite(source.spawnHeight) ? source.spawnHeight : maxHeight,
    bounds.height * 0.1,
    maxHeight
  );
  const growthElapsedSec = clamp(
    Number.isFinite(source.growthElapsedSec) ? source.growthElapsedSec : 0,
    0,
    BERRY_REED_MAX_GROWTH_ELAPSED_SEC
  );
  return {
    id: Number.isFinite(source.id) ? source.id : 0,
    x: clamp(Number.isFinite(source.x) ? source.x : bounds.width * 0.5, 10, Math.max(10, bounds.width - 10)),
    bottomY: clamp(Number.isFinite(source.bottomY) ? source.bottomY : bounds.height - 4, minBottomY, maxBottomY),
    height: clamp(Number.isFinite(source.height) ? source.height : spawnHeight, bounds.height * 0.1, maxHeight),
    spawnHeight,
    maxHeight,
    swayPhase: Number.isFinite(source.swayPhase) ? source.swayPhase : rand(0, Math.PI * 2),
    swayRate: clamp(Number.isFinite(source.swayRate) ? source.swayRate : rand(0.0008, 0.0016), 0.0002, 0.004),
    branches: branchSource
      .slice(0, 6)
      .map((branch) => ({
        t: clamp(Number.isFinite(branch?.t) ? branch.t : rand(0.2, 0.92), 0.1, 0.95),
        side: branch?.side === -1 ? -1 : 1,
        len: clamp(Number.isFinite(branch?.len) ? branch.len : rand(0.18, 0.4), 0.08, 0.5)
      })),
    nextFruitAtSec: Number.isFinite(source.nextFruitAtSec) ? source.nextFruitAtSec : Infinity,
    growthElapsedSec
  };
}

function serializeBerryReedFruit(fruit) {
  return pickSavedKeys(fruit, BERRY_REED_FRUIT_SAVE_KEYS);
}

function deserializeBerryReedFruit(data, _bounds, plantById) {
  const source = data && typeof data === 'object' ? data : {};
  const plant = plantById.get(source.plantId) ?? null;
  const createdAtSec = Number.isFinite(source.createdAtSec)
    ? source.createdAtSec
    : (Number.isFinite(source.spawnedAtSec) ? source.spawnedAtSec : 0);
  const ttlFromLegacy = Number.isFinite(source.expiresAtSec)
    ? Math.max(0, source.expiresAtSec - createdAtSec)
    : BERRY_REED_FRUIT_TTL_SEC;
  const ttlSec = Number.isFinite(source.ttlSec)
    ? Math.max(0, source.ttlSec)
    : ttlFromLegacy;
  return {
    id: Number.isFinite(source.id) ? source.id : 0,
    plantId: Number.isFinite(source.plantId) ? source.plantId : 0,
    branchIndex: Number.isFinite(source.branchIndex)
      ? clamp(Math.floor(source.branchIndex), 0, Math.max(0, (plant?.branches?.length ?? 1) - 1))
      : 0,
    u: clamp(Number.isFinite(source.u) ? source.u : 0.9, 0, 1),
    v: clamp(Number.isFinite(source.v) ? source.v : 0, -6, 6),
    radius: clamp(Number.isFinite(source.radius) ? source.radius : 2.4, 1.2, 4),
    createdAtSec,
    ttlSec
  };
}

function deserializeWater(data, defaults) {
  const source = data && typeof data === 'object' ? data : {};
  const out = pickSavedKeys(defaults, WATER_SAVE_KEYS);
  for (const key of WATER_SAVE_KEYS) {
    if (source[key] !== undefined) out[key] = deepCopyPlain(source[key]);
  }

  out.hygiene01 = clamp01(Number.isFinite(out.hygiene01) ? out.hygiene01 : WATER_INITIAL_HYGIENE01);
  out.dirt01 = clamp01(Number.isFinite(out.dirt01) ? out.dirt01 : WATER_INITIAL_DIRT01);
  out.filter01 = clamp01(Number.isFinite(out.filter01) ? out.filter01 : 0);
  out.installProgress01 = clamp01(Number.isFinite(out.installProgress01) ? out.installProgress01 : 0);
  out.maintenanceProgress01 = clamp01(Number.isFinite(out.maintenanceProgress01) ? out.maintenanceProgress01 : 0);
  out.maintenanceCooldownSec = Math.max(0, Number.isFinite(out.maintenanceCooldownSec) ? out.maintenanceCooldownSec : 0);
  out.upgradeProgress01 = clamp01(Number.isFinite(out.upgradeProgress01) ? out.upgradeProgress01 : 0);
  out.upgradeTargetTier = Math.max(0, Math.min(3, Math.floor(Number.isFinite(out.upgradeTargetTier) ? out.upgradeTargetTier : 0)));
  out.filterInstalled = Boolean(out.filterInstalled);
  out.filterUnlocked = Boolean(out.filterUnlocked);
  out.filterEnabled = Boolean(out.filterEnabled ?? true);
  out.effectiveFilter01 = clamp01(Number.isFinite(out.effectiveFilter01) ? out.effectiveFilter01 : 0);
  out.filterTier = Math.max(0, Math.min(3, Math.floor(Number.isFinite(out.filterTier) ? out.filterTier : (out.filterInstalled ? 1 : 0))));
  if (out.filterInstalled && out.filterTier < 1) out.filterTier = 1;
  if (out.upgradeTargetTier <= out.filterTier) out.upgradeTargetTier = 0;
  if (out.upgradeProgress01 <= 0) out.upgradeTargetTier = 0;
  return out;
}

function normalizeWorldSaveSource(data) {
  const source = data && typeof data === 'object' ? data : null;
  if (!source) return null;
  if (source.saveVersion === WORLD_SAVE_VERSION && source.worldState && typeof source.worldState === 'object') {
    return source.worldState;
  }
  return source;
}

function inheritTraits(motherTraits, fatherTraits, config = {}) {
  const mother = motherTraits ?? {};
  const father = fatherTraits ?? mother;
  const child = {};
  const keys = Object.keys(mother);
  const mutationPct = Math.max(0, Number(config?.TRAIT_MUTATION_PCT ?? 0));

  for (const key of keys) {
    const mVal = mother[key];
    const fVal = father[key];

    if (typeof mVal === 'number' && Number.isFinite(mVal) && typeof fVal === 'number' && Number.isFinite(fVal)) {
      const mean = (mVal + fVal) / 2;
      const mutation = mean * (Math.random() * 2 - 1) * mutationPct;
      const value = mean + mutation;
      child[key] = Number.isFinite(value) ? value : mean;
    }
  }

  // ---- Clamp critical traits safely ----
  if (child.colorHue !== undefined) {
    child.colorHue = ((child.colorHue % 360) + 360) % 360;
  }

  if (child.sizeFactor !== undefined) {
    child.sizeFactor = Math.max(0.6, Math.min(1.4, child.sizeFactor));
  }

  if (child.growthRate !== undefined) {
    child.growthRate = Math.max(0.5, Math.min(1.8, child.growthRate));
  }

  if (child.speedFactor !== undefined) {
    child.speedFactor = Math.max(0.6, Math.min(1.6, child.speedFactor));
  }

  if (child.lifespanSec !== undefined) {
    child.lifespanSec = Math.max(30, child.lifespanSec);
  }

  return child;
}

function randRange(range, fallbackMin = 0, fallbackMax = 0) {
  const min = Number.isFinite(range?.[0]) ? range[0] : fallbackMin;
  const max = Number.isFinite(range?.[1]) ? range[1] : fallbackMax;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return rand(low, high);
}

function randIntInclusive(range, fallbackMin = 0, fallbackMax = 0) {
  const min = Math.round(Number.isFinite(range?.[0]) ? range[0] : fallbackMin);
  const max = Math.round(Number.isFinite(range?.[1]) ? range[1] : fallbackMax);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(rand(low, high + 1));
}



function getSpeciesConfig(speciesId) {
  return SPECIES_MAP[speciesId] ?? SPECIES_MAP[DEFAULT_SPECIES_ID] ?? null;
}

function getSpeciesBioloadFactor(speciesId) {
  return Math.max(0, getSpeciesConfig(speciesId)?.bioloadFactor ?? 1);
}

function getSpeciesPoopBioloadFactor(speciesId) {
  return Math.max(0, getSpeciesConfig(speciesId)?.poopBioloadFactor ?? 1);
}

function getSpeciesReproductionScale(speciesId) {
  return Math.max(0.05, getSpeciesConfig(speciesId)?.reproductionScale ?? 1);
}
function makeBubble(bounds) {
  return {
    x: rand(0, bounds.width),
    y: bounds.height + rand(0, bounds.height * 0.3),
    radius: rand(1.4, 3.4),
    speed: rand(12, 35),
    swayPhase: rand(0, Math.PI * 2),
    swayAmplitude: rand(2, 10)
  };
}

export class World {
  constructor(width, height, initialFishCount = 4) {
    const normalizedInitialFishCount = Math.max(1, Math.min(6, Math.round(initialFishCount)));

    this.bounds = { width, height, sandHeight: this.#computeSandHeight(height) };
    this.fish = [];
    this.food = [];
    // Forward-compatible containers for new systems.
    this.poop = [];
    // egg structure:
    // {
    //   id,
    //   x,
    //   y,
    //   laidAtSec,
    //   hatchAtSec,
    //   motherId,
    //   fatherId,
    //   motherTraits,
    //   fatherTraits,
    //   state,         // INCUBATING | HATCHED | FAILED
    //   canBeEaten,    // boolean (FUTURE HOOK: some species may eat eggs)
    //   nutrition      // number  (FUTURE HOOK: hunger/wellbeing effects)
    // }
    this.eggs = [];
    this.bubbles = [];
    this.nextFoodId = 1;
    this.nextPoopId = 1;
    this.nextFishId = 1;
    this.nextPlaySessionId = 1;
    this.nextEggId = 1;
    this.simTimeSec = 0;
    this.selectedFishId = null;
    this.nameCounts = new Map();
    this.fishById = new Map();
    this.fishArchiveById = new Map();

    this.initialFishCount = normalizedInitialFishCount;
    this.foodsConsumedCount = 0;
    this.foodAmountConsumedTotal = 0;
    this.birthsCount = 0;
    this.eggsLaidCount = 0;
    this.deathsCount = 0;
    this.peakPopulationCount = 0;
    this.grandparentIds = new Set();
    this.filterUnlockThreshold = this.initialFishCount * 4;
    this.filterUnlocked = false;
    this.filterDepletedThreshold01 = FILTER_DEPLETED_THRESHOLD_01;

    // Simple event queue for UI/telemetry/achievements.
    // Use `world.flushEvents()` from main loop if/when needed.
    this.events = [];
    this.playSessions = [];
    this.matePairNextTryAt = new Map();
    this.scheduledPoopSpawns = [];
    this.groundAlgae = [];
    this.fxParticles = [];
    this.berryReedPlants = [];
    this.fruits = [];
    this.nextBerryReedPlantId = 1;
    this.nextFruitId = 1;
    this.speciesUnlocks = { berryReed: false, azureDart: false, siltSifter: false };
    this.nestbrush = null;
    this.nextNestbrushId = 1;

    // Global environment state (will grow over time).
    this.water = this.#createInitialWaterState();
    this.expiredFoodSinceLastWaterUpdate = 0;
    this.pendingPoopDirt01 = 0;

    this.paused = false;
    this.speedMultiplier = 1;
    this.debugTiming = {
      speedMultiplier: this.speedMultiplier,
      rawDelta: 0,
      simDt: 0,
      motionDt: 0,
      simTimeSec: this.simTimeSec
    };

    this.#generateInitialPopulation(this.initialFishCount);
    this.peakPopulationCount = Math.max(this.peakPopulationCount, this.fish.length);
    this.#seedBubbles();
    this.#seedGroundAlgae();
  }

  emit(type, payload = {}) {
    this.events.push({
      type,
      t: this.simTimeSec,
      payload
    });
  }

  flushEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }


  #computeSandHeight(height) {
    // Placeholder: keep as a function so we can later model a real sand layer.
    // Returning 0 keeps current visuals/physics unchanged.
    return Math.max(0, Math.min(0, height));
  }

  #swimHeight() {
    return Math.max(40, this.bounds.height);
  }
  #spawnMargin() {
    const base = Math.min(this.bounds.width, this.bounds.height) * 0.03;
    return clamp(base, 10, 20);
  }

  #randomHeading() {
    const facing = Math.random() < 0.5 ? -1 : 1;
    const tilt = rand(-MAX_TILT, MAX_TILT);
    return facing < 0 ? Math.PI - tilt : tilt;
  }

  #randomSpawn(size) {
    const margin = this.#spawnMargin();
    const x = rand(margin, Math.max(margin, this.bounds.width - margin));
    const y = rand(margin, Math.max(margin, this.#swimHeight() - margin));

    return { x, y, size };
  }

  #isSpawnClear(position, size) {
    for (const fish of this.fish) {
      const minDist = Math.max(size * 1.5, fish.size * 1.5);
      const dist = Math.hypot(position.x - fish.position.x, position.y - fish.position.y);
      if (dist < minDist) return false;
    }
    return true;
  }

  #registerFish(fish) {
    if (!fish) return;
    this.fishById.set(fish.id, fish);
    this.fishArchiveById.set(fish.id, fish);
  }

  #unregisterFishById(fishId) {
    this.fishById.delete(fishId);
  }

  #rebuildFishById() {
    this.fishById = new Map();
    this.fishArchiveById = new Map();
    for (const fish of this.fish) this.#registerFish(fish);
  }

  getFishById(fishId) {
    return this.fishArchiveById.get(fishId) ?? null;
  }

  getFishInspectorList() {
    return [...this.fishArchiveById.values()];
  }


  #usedNames(excludeFishId = null) {
    const names = new Set();
    for (const fish of this.fish) {
      if (excludeFishId != null && fish.id === excludeFishId) continue;
      const currentName = String(fish.name ?? '').trim();
      if (!currentName) continue;
      names.add(currentName);
    }
    return names;
  }

  #registerName(baseName, usedNames) {
    const current = this.nameCounts.get(baseName) ?? 0;
    const next = Math.max(1, current + 1);
    const uniqueName = next === 1 ? baseName : `${baseName} (${next})`;
    this.nameCounts.set(baseName, next);
    usedNames.add(uniqueName);
    return uniqueName;
  }

  assignDefaultNameForSex(sex) {
    const sourcePool = sex === 'female' ? FEMALE_NAME_POOL : MALE_NAME_POOL;
    const pool = sourcePool.filter((name) => typeof name === 'string' && name.trim().length > 0);
    if (pool.length === 0) return this.makeUniqueName('Fish') ?? 'Fish';

    const usedNames = this.#usedNames();
    const unusedBaseNames = pool.filter((name) => !this.nameCounts.has(name) && !usedNames.has(name));

    const pickFrom = unusedBaseNames.length > 0 ? unusedBaseNames : pool;
    const chosenBase = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    return this.#registerName(chosenBase, usedNames);
  }

  makeUniqueName(desiredName, { excludeFishId = null } = {}) {
    const normalized = String(desiredName ?? '').trim().slice(0, 24);
    if (!normalized) return null;

    const usedNames = this.#usedNames(excludeFishId);
    if (!usedNames.has(normalized)) {
      this.nameCounts.set(normalized, Math.max(1, this.nameCounts.get(normalized) ?? 0));
      usedNames.add(normalized);
      return normalized;
    }

    let suffix = Math.max(2, (this.nameCounts.get(normalized) ?? 1) + 1);
    let candidate = `${normalized} (${suffix})`;
    while (usedNames.has(candidate)) {
      suffix += 1;
      candidate = `${normalized} (${suffix})`;
    }

    this.nameCounts.set(normalized, suffix);
    usedNames.add(candidate);
    return candidate;
  }

  #createFish({ sex, speciesId = DEFAULT_SPECIES_ID, initialAgeSec = 0, hungryStart = false, position = null, traits = null, name = null, bornInAquarium = false, motherId = null, fatherId = null } = {}) {
    const sizeRange = GROWTH_CONFIG.sizeFactorRange;
    const growthRange = GROWTH_CONFIG.growthRateRange;

    const species = getSpeciesConfig(speciesId);
    const normalizedSpeciesId = species?.id ?? DEFAULT_SPECIES_ID;

    const sizeFactor = rand(sizeRange.min, sizeRange.max);
    const adultRadius = GROWTH_CONFIG.adultRadius * sizeFactor;
    const birthRadius = adultRadius * GROWTH_CONFIG.birthScale;

    const lifeMean = AGE_CONFIG.lifespanMeanSec;
    const lifeJitter = AGE_CONFIG.lifespanJitterSec;
    const lifespanSec = rand(lifeMean - lifeJitter, lifeMean + lifeJitter);

    const stageJitter = AGE_CONFIG.stageJitterSec;
    const stageShiftBabySec = rand(-stageJitter, stageJitter);
    const stageShiftJuvenileSec = rand(-stageJitter, stageJitter);

    const explicitPosition = position && Number.isFinite(position.x) && Number.isFinite(position.y);
    let spawn = explicitPosition
      ? { x: position.x, y: position.y, size: birthRadius }
      : this.#randomSpawn(birthRadius);

    if (!explicitPosition) {
      for (let i = 0; i < 20; i += 1) {
        if (this.#isSpawnClear(spawn, birthRadius)) break;
        spawn = this.#randomSpawn(birthRadius);
      }
    }

    spawn.x = clamp(spawn.x, 0, this.bounds.width);
    spawn.y = clamp(spawn.y, 0, this.#swimHeight());

    const normalizedInitialAgeSec = Math.min(Math.max(0, initialAgeSec), INITIAL_MAX_AGE_SEC);

    const fish = new Fish(this.bounds, {
      id: this.nextFishId++,
      speciesId: normalizedSpeciesId,
      spawnTimeSec: this.simTimeSec - normalizedInitialAgeSec,
      sizeFactor,
      growthRate: rand(growthRange.min, growthRange.max),
      lifespanSec,
      stageShiftBabySec,
      stageShiftJuvenileSec,
      position: { x: spawn.x, y: spawn.y },
      headingAngle: this.#randomHeading(),
      speedFactor: rand(0.42, 0.68),
      traits: traits ?? undefined,
      history: {
        motherId: motherId != null ? String(motherId) : null,
        fatherId: fatherId != null ? String(fatherId) : null,
        childrenIds: [],
        bornInAquarium,
        birthSimTimeSec: this.simTimeSec,
        deathSimTimeSec: null,
        mealsEaten: 0,
        mateCount: 0
      }
    });

    if (sex === 'female' || sex === 'male') {
      fish.sex = sex;
    }

    const desiredName = this.makeUniqueName(name);
    fish.name = desiredName ?? this.assignDefaultNameForSex(fish.sex);

    if (hungryStart) {
      const hungryBaseline = 0.5;
      fish.hunger01 = hungryBaseline;
      fish.energy01 = 1 - hungryBaseline;
      fish.hungerState = 'HUNGRY';
    }

    fish.updateLifeCycle(this.simTimeSec);
    this.#registerFish(fish);
    return fish;
  }

  #shuffleArray(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const swapIndex = Math.floor(Math.random() * (i + 1));
      [items[i], items[swapIndex]] = [items[swapIndex], items[i]];
    }
  }

  #generateInitialPopulation(totalFishCount) {
    const clampedCount = Math.max(1, Math.min(6, Math.round(totalFishCount)));
    const femaleCount = Math.ceil(clampedCount / 2);
    const maleCount = Math.floor(clampedCount / 2);
    const fishPool = [];

    // Start-population constraints:
    // - balanced sex distribution (female majority by 1 when odd)
    // - random initial ages sampled in [0, INITIAL_MAX_AGE_SEC]
    // - all fish begin hungry and attempts are made to include a mature female
    for (let i = 0; i < femaleCount; i += 1) {
      fishPool.push(this.#createFish({
        sex: 'female',
        initialAgeSec: rand(0, INITIAL_MAX_AGE_SEC),
        hungryStart: true
      }));
    }

    for (let i = 0; i < maleCount; i += 1) {
      fishPool.push(this.#createFish({
        sex: 'male',
        initialAgeSec: rand(0, INITIAL_MAX_AGE_SEC),
        hungryStart: true
      }));
    }

    const hasAdultFemale = fishPool.some((fish) => fish.sex === 'female' && (fish.lifeStage === 'ADULT' || fish.lifeStage === 'OLD'));
    if (!hasAdultFemale) {
      const promotableFemale = fishPool.find((fish) => fish.sex === 'female');
      if (promotableFemale) {
        const baseBabyEnd = AGE_CONFIG.stageBaseSec.babyEndSec;
        const baseJuvenileEnd = AGE_CONFIG.stageBaseSec.juvenileEndSec;
        const babyEnd = Math.max(30, baseBabyEnd + promotableFemale.stageShiftBabySec);
        const juvenileEnd = Math.max(babyEnd + 60, baseJuvenileEnd + promotableFemale.stageShiftJuvenileSec);
        const adultStartAgeSec = juvenileEnd / Math.max(0.001, promotableFemale.growthRate);

        const promotedInitialAgeSec = adultStartAgeSec < INITIAL_MAX_AGE_SEC
          ? rand(adultStartAgeSec, INITIAL_MAX_AGE_SEC)
          : rand(0, INITIAL_MAX_AGE_SEC);

        promotableFemale.spawnTimeSec = this.simTimeSec - promotedInitialAgeSec;
        promotableFemale.updateLifeCycle(this.simTimeSec);
      }
    }

    this.#shuffleArray(fishPool);
    this.fish = fishPool;
    this.#rebuildFishById();

    if (!this.fishArchiveById.has(this.selectedFishId)) {
      this.selectedFishId = this.fishArchiveById.keys().next().value ?? null;
    }
  }


  toJSON() {
    return {
      saveVersion: WORLD_SAVE_VERSION,
      simTimeSec: Number.isFinite(this.simTimeSec) ? this.simTimeSec : 0,
      speedMultiplier: Number.isFinite(this.speedMultiplier) ? this.speedMultiplier : 1,
      initialFishCount: this.initialFishCount,
      foodsConsumedCount: this.foodsConsumedCount,
      foodAmountConsumedTotal: this.foodAmountConsumedTotal,
      birthsCount: this.birthsCount,
      eggsLaidCount: this.eggsLaidCount,
      deathsCount: this.deathsCount,
      peakPopulationCount: this.peakPopulationCount,
      grandparentIds: [...this.grandparentIds],
      water: serializeWater(this.water),
      fish: this.fish.map((entry) => entry.toJSON()),
      fishArchive: [...this.fishArchiveById.values()].map((entry) => entry.toJSON()),
      eggs: this.eggs.map((entry) => serializeEgg(entry)),
      food: this.food.map((entry) => serializeFood(entry)),
      poop: this.poop.map((entry) => serializePoop(entry)),
      berryReedPlants: this.berryReedPlants.map((entry) => serializeBerryReedPlant(entry)),
      fruits: this.fruits.map((entry) => serializeBerryReedFruit(entry)),
      nestbrush: this.nestbrush ? serializeNestbrush(this.nestbrush) : null
    };
  }

  loadFromJSON(data) {
    const source = normalizeWorldSaveSource(data) ?? {};
    if (source.saveVersion !== WORLD_SAVE_VERSION) return false;

    const swimHeight = this.#swimHeight();
    this.simTimeSec = Math.max(0, Number.isFinite(source.simTimeSec) ? source.simTimeSec : 0);
    this.initialFishCount = Math.max(1, Math.min(6, Math.round(Number.isFinite(source.initialFishCount) ? source.initialFishCount : this.initialFishCount)));
    this.foodsConsumedCount = Math.max(0, Math.floor(Number.isFinite(source.foodsConsumedCount) ? source.foodsConsumedCount : this.foodsConsumedCount));
    this.foodAmountConsumedTotal = Math.max(0, Number.isFinite(source.foodAmountConsumedTotal) ? source.foodAmountConsumedTotal : this.foodAmountConsumedTotal);
    this.birthsCount = Math.max(0, Math.floor(Number.isFinite(source.birthsCount) ? source.birthsCount : 0));
    this.eggsLaidCount = Math.max(0, Math.floor(Number.isFinite(source.eggsLaidCount) ? source.eggsLaidCount : 0));
    this.deathsCount = Math.max(0, Math.floor(Number.isFinite(source.deathsCount) ? source.deathsCount : 0));
    this.peakPopulationCount = Math.max(0, Math.floor(Number.isFinite(source.peakPopulationCount) ? source.peakPopulationCount : 0));
    this.grandparentIds = new Set(Array.isArray(source.grandparentIds) ? source.grandparentIds.map((id) => String(id)) : []);
    // Compatibility note: older saves included `realTimeSec` as a parallel clock.
    // We intentionally ignore it and keep `simTimeSec` as the only canonical sim time.
    this.speedMultiplier = Math.max(MIN_SIM_SPEED_MULTIPLIER, Math.min(this.getAvailableSimSpeedMultiplierCap(), Number.isFinite(source.speedMultiplier) ? source.speedMultiplier : this.speedMultiplier));
    const fishArchiveSource = Array.isArray(source.fishArchive) ? source.fishArchive : source.fish;
    const fishArchive = Array.isArray(fishArchiveSource)
      ? fishArchiveSource.map((entry) => Fish.fromJSON(entry, this.bounds))
      : [];
    this.fishArchiveById = new Map();
    for (const fish of fishArchive) this.fishArchiveById.set(fish.id, fish);

    this.fish = Array.isArray(source.fish)
      ? source.fish.map((entry) => {
        const fish = Fish.fromJSON(entry, this.bounds);
        const archived = this.fishArchiveById.get(fish.id);
        return archived ?? fish;
      })
      : [];

    for (const fish of this.fishArchiveById.values()) {
      fish.position = clampPosition(fish.position, this.bounds, swimHeight);
      fish.updateLifeCycle(this.simTimeSec);
    }

    this.eggs = Array.isArray(source.eggs)
      ? source.eggs.map((entry) => deserializeEgg(entry, this.bounds, swimHeight))
      : [];

    this.food = Array.isArray(source.food)
      ? source.food.map((entry) => deserializeFood(entry, this.bounds, swimHeight))
      : [];

    this.poop = Array.isArray(source.poop)
      ? source.poop.map((entry) => deserializePoop(entry, this.bounds, swimHeight))
      : [];

    this.berryReedPlants = Array.isArray(source.berryReedPlants)
      ? source.berryReedPlants.map((entry) => deserializeBerryReedPlant(entry, this.bounds)).slice(0, BERRY_REED_MAX_COUNT)
      : [];
    const plantById = new Map(this.berryReedPlants.map((entry) => [entry.id, entry]));
    this.fruits = Array.isArray(source.fruits)
      ? source.fruits
        .map((entry) => deserializeBerryReedFruit(entry, this.bounds, plantById))
        .filter((entry) => plantById.has(entry.plantId))
        .slice(0, BERRY_REED_MAX_FRUITS)
      : [];

    this.nestbrush = deserializeNestbrush(source.nestbrush, this.bounds);

    this.water = deserializeWater(source.water, this.#createInitialWaterState());

    this.nextFishId = Math.max(1, ...[...this.fishArchiveById.values()].map((entry) => Math.floor(entry.id || 0) + 1));
    this.nextFoodId = Math.max(1, ...this.food.map((entry) => Math.floor(entry.id || 0) + 1));
    this.nextPoopId = Math.max(1, ...this.poop.map((entry) => Math.floor(entry.id || 0) + 1));
    this.nextEggId = Math.max(1, ...this.eggs.map((entry) => Math.floor(entry.id || 0) + 1));
    this.peakPopulationCount = Math.max(this.peakPopulationCount, this.fish.length);
    this.nextBerryReedPlantId = Math.max(1, ...this.berryReedPlants.map((entry) => Math.floor(entry.id || 0) + 1));
    this.nextFruitId = Math.max(1, ...this.fruits.map((entry) => Math.floor(entry.id || 0) + 1));
    this.nextNestbrushId = Math.max(1, (this.nestbrush?.id ?? 0) + 1);

    if (!this.nestbrush) {
      for (const egg of this.eggs) {
        egg.isProtectedByNestbrush = false;
        egg.nestbrushAttachment = null;
      }
    }

    this.fishById = new Map();
    for (const fish of this.fish) this.fishById.set(fish.id, fish);
    if (!this.fishArchiveById.has(this.selectedFishId)) {
      this.selectedFishId = this.fishArchiveById.keys().next().value ?? null;
    }

    this.nameCounts = new Map();
    for (const fish of this.fish) {
      const currentName = String(fish.name ?? '').trim();
      if (currentName) this.nameCounts.set(currentName, Math.max(1, this.nameCounts.get(currentName) ?? 0));
    }

    this.events = [];
    this.playSessions = [];
    this.matePairNextTryAt = new Map();
    this.scheduledPoopSpawns = [];
    this.expiredFoodSinceLastWaterUpdate = 0;
    this.pendingPoopDirt01 = 0;
    this.filterUnlockThreshold = Math.max(1, this.initialFishCount * 4);
    this.filterUnlocked = this.foodsConsumedCount >= this.filterUnlockThreshold || Boolean(this.water.filterUnlocked || this.filterUnlocked);
    this.water.filterUnlocked = this.isFeatureUnlocked('waterFilter');
    if (this.water.filterInstalled && this.water.filterTier < 1) this.water.filterTier = 1;
    this.#refreshSpeciesUnlocks();

    return true;
  }

  static fromJSON(data, { width, height, initialFishCount = 4 } = {}) {
    const world = new World(width, height, initialFishCount);
    world.loadFromJSON(data);
    return world;
  }

  resize(width, height) {
    this.bounds.width = width;
    this.bounds.height = height;
    this.bounds.sandHeight = this.#computeSandHeight(height);

    for (const fish of this.fish) fish.setBounds(this.bounds);
    for (const food of this.food) {
      food.x = Math.min(Math.max(0, food.x), width);
      food.y = Math.min(Math.max(0, food.y), Math.max(0, this.#swimHeight()));
    }

    for (const poop of this.poop) {
      poop.x = Math.min(Math.max(0, poop.x), width);
      poop.y = Math.min(Math.max(0, poop.y), Math.max(0, this.#swimHeight()));
    }

    for (const bubble of this.bubbles) {
      bubble.x = Math.min(Math.max(0, bubble.x), width);
      bubble.y = Math.min(Math.max(0, bubble.y), height + 40);
    }

    for (const plant of this.berryReedPlants) {
      plant.x = clamp(plant.x, 10, Math.max(10, width - 10));
      plant.bottomY = clamp(plant.bottomY, Math.max(0, height - 14), Math.max(0, height - 1));
      plant.maxHeight = clamp(Number.isFinite(plant.maxHeight) ? plant.maxHeight : plant.height, height * 0.14, height * 0.35);
      plant.spawnHeight = clamp(Number.isFinite(plant.spawnHeight) ? plant.spawnHeight : plant.maxHeight, height * 0.1, plant.maxHeight);
      plant.height = clamp(plant.height, plant.spawnHeight, plant.maxHeight);
      plant.growthElapsedSec = clamp(Number.isFinite(plant.growthElapsedSec) ? plant.growthElapsedSec : 0, 0, BERRY_REED_MAX_GROWTH_ELAPSED_SEC);
    }

    this.#seedGroundAlgae();
  }


  spawnFood(x, y, amount = FOOD_DEFAULT_AMOUNT, ttl = FOOD_DEFAULT_TTL) {
    const clampedX = clamp(x, 0, this.bounds.width);
    const clampedY = clamp(y, 0, this.#swimHeight());

    this.food.push({
      id: this.nextFoodId++,
      x: clampedX,
      y: clampedY,
      amount: Math.max(0.1, amount),
      ttl,
      vy: rand(8, 20)
    });

    this.emit('food:spawn', { x: clampedX, y: clampedY, amount, ttl });
  }


  spawnPoop(x, y, ttlSec = POOP_DEFAULT_TTL_SEC, options = {}) {
    const clampedX = clamp(x, 0, this.bounds.width);
    const clampedY = clamp(y, 0, this.#swimHeight());
    const type = 'pellet';

    const initialVy = POOP_BASE_DRIFT_SPEED;

    const bioloadFactor = Math.max(0, Number.isFinite(options?.bioloadFactor) ? options.bioloadFactor : 1);
    const isVisible = options?.visible !== false;

    if (!isVisible) {
      if (WATER_HYGIENE_DROP_PER_POOP_SPAWN > 0 && this.water) {
        this.water.hygiene01 = clamp(this.water.hygiene01 - WATER_HYGIENE_DROP_PER_POOP_SPAWN * bioloadFactor, 0, 1);
      }
      this.pendingPoopDirt01 = (this.pendingPoopDirt01 ?? 0) + POOP_DIRT_PER_SEC * bioloadFactor;
      return null;
    }

    const poop = {
      id: this.nextPoopId++,
      x: clampedX,
      y: clampedY,
      ttlSec: Math.max(0, Number.isFinite(ttlSec) ? ttlSec : POOP_DEFAULT_TTL_SEC),
      maxTtlSec: Math.max(1, Number.isFinite(ttlSec) ? ttlSec : POOP_DEFAULT_TTL_SEC),
      vx: 0,
      vy: initialVy,
      type,
      canBeEaten: true,
      nutrition: 0.5,
      bioloadFactor
    };
    this.poop.push(poop);
    if (WATER_HYGIENE_DROP_PER_POOP_SPAWN > 0 && this.water) {
      this.water.hygiene01 = clamp(this.water.hygiene01 - WATER_HYGIENE_DROP_PER_POOP_SPAWN * bioloadFactor, 0, 1);
    }
    return poop;
  }

  schedulePoopFromFish(fishId, delaySec = 0) {
    const fish = this.getFishById(fishId);
    if (!fish || fish.lifeState !== 'ALIVE') return false;
    const safeDelaySec = clamp(Number.isFinite(delaySec) ? delaySec : 0, 0, 30);
    this.scheduledPoopSpawns.push({
      fishId,
      spawnAtSec: this.simTimeSec + safeDelaySec
    });
    return true;
  }

  consumePoop(poopId, fishId = null) {
    const index = this.poop.findIndex((entry) => entry.id === poopId && entry.canBeEaten !== false);
    if (index < 0) return 0;

    const [poop] = this.poop.splice(index, 1);
    if (fishId != null) this.emit('poop:consume', { poopId, fishId });
    return Math.max(0.05, Number.isFinite(poop?.nutrition) ? poop.nutrition : 0.5);
  }

  consumeEgg(eggId, fishId = null) {
    const index = this.eggs.findIndex((egg) => egg
      && egg.id === eggId
      && egg.state === 'INCUBATING'
      && egg.canBeEaten !== false
      && egg.isProtectedByNestbrush !== true
      && (egg.speciesId ?? DEFAULT_SPECIES_ID) === LAB_MINNOW_SPECIES_ID);
    if (index < 0) return 0;

    const [egg] = this.eggs.splice(index, 1);
    if (fishId != null) this.emit('egg:consume', { eggId, fishId });
    return Math.max(0.05, Number.isFinite(egg?.nutrition) ? egg.nutrition : 0.25);
  }

  consumeFood(foodId, amountToConsume = 0.5) {
    const food = this.food.find((entry) => entry.id === foodId);
    if (!food) return 0;

    const consumed = Math.min(food.amount, Math.max(0.05, amountToConsume));
    food.amount -= consumed;
    if (food.amount <= 0.001) {
      this.food = this.food.filter((entry) => entry.id !== foodId);
    }

    if (consumed > 0) this.emit('food:consume', { foodId, consumed });

    if (consumed > 0) {
      this.foodsConsumedCount += 1;
      this.foodAmountConsumedTotal += consumed;

      if (!this.filterUnlocked && this.foodsConsumedCount >= this.filterUnlockThreshold) {
        this.filterUnlocked = true;
      }
    }

    return consumed;
  }

  // Future hook: edible target discovery.
  // Kept broad intentionally; per-species logic still lives in Fish decision/consume flow.
  getEdibleTargetsForFish(fish) {
    if ((fish?.speciesId ?? DEFAULT_SPECIES_ID) === AZURE_DART_SPECIES_ID) {
      return this.fruits;
    }
    if ((fish?.speciesId ?? DEFAULT_SPECIES_ID) === SILT_SIFTER_SPECIES_ID) {
      const nowSec = this.simTimeSec ?? 0;
      const canSeekEggs = fish?.hungerState === 'STARVING' && nowSec >= (fish?.eggSnackCooldownUntilSec ?? 0);
      const eggs = canSeekEggs
        ? this.eggs.filter((egg) => egg
          && egg.state === 'INCUBATING'
          && egg.canBeEaten !== false
          && egg.isProtectedByNestbrush !== true
          && (egg.speciesId ?? DEFAULT_SPECIES_ID) === LAB_MINNOW_SPECIES_ID)
        : [];
      return [...this.poop, ...eggs, ...this.food];
    }
    return this.food;
  }

  spawnMatingBubbleBurst(x, y) {
    for (let i = 0; i < 2; i += 1) {
      this.fxParticles.push({
        kind: 'MATING_BUBBLE',
        x: clamp(x + rand(-4, 4), 0, this.bounds.width),
        y: clamp(y + rand(-4, 4), 0, this.#swimHeight()),
        vx: rand(-2.2, 2.2),
        vy: rand(-12, -8),
        radius: rand(1.2, 2.0),
        lifeSec: 0.8,
        ttlSec: 0.8
      });
    }
  }

  selectFish(fishId) {
    const found = this.getFishById(fishId);
    this.selectedFishId = found ? found.id : null;
    return this.selectedFishId;
  }

  toggleFishSelection(fishId) {
    if (fishId == null) {
      this.selectedFishId = null;
      return null;
    }
    if (this.selectedFishId === fishId) {
      this.selectedFishId = null;
      return null;
    }
    return this.selectFish(fishId);
  }

  renameFish(fishId, name) {
    const fish = this.fish.find((entry) => entry.id === fishId);
    if (!fish) return false;

    const uniqueName = this.makeUniqueName(name, { excludeFishId: fishId });
    fish.name = uniqueName ?? this.assignDefaultNameForSex(fish.sex);
    return true;
  }

  discardFish(fishId) {
    const index = this.fish.findIndex((entry) => entry.id === fishId && entry.lifeState !== 'ALIVE');
    if (index < 0) return false;
    const fish = this.fish[index];
    fish.corpseRemoved = true;
    this.fish.splice(index, 1);
    this.#unregisterFishById(fishId);
    return true;
  }

  removeCorpse(fishId) {
    const index = this.fish.findIndex((entry) => entry.id === fishId && entry.lifeState === 'DEAD');
    if (index < 0) return false;

    const fish = this.fish[index];
    fish.corpseRemoved = true;
    this.fish.splice(index, 1);
    this.#unregisterFishById(fishId);
    return true;
  }

  getSelectedFish() {
    return this.fish.find((f) => f.id === this.selectedFishId) ?? null;
  }

  findFishAt(x, y) {
    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      const dist = Math.hypot(x - fish.position.x, y - fish.position.y);
      if (dist <= fish.size * 0.8) return fish;
    }
    return null;
  }

  setFishCount(count) {
    const clamped = Math.max(1, Math.min(50, Math.round(count)));

    while (this.fish.length < clamped) {
      this.fish.push(this.#createFish());
    }
    while (this.fish.length > clamped) {
      const removed = this.fish.pop();
      if (removed) this.#unregisterFishById(removed.id);
    }

    if (!this.fishArchiveById.has(this.selectedFishId)) {
      this.selectedFishId = this.fishArchiveById.keys().next().value ?? null;
    }
  }

  setSpeedMultiplier(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return this.speedMultiplier;
    this.speedMultiplier = Math.max(MIN_SIM_SPEED_MULTIPLIER, Math.min(this.getAvailableSimSpeedMultiplierCap(), parsed));
    return this.speedMultiplier;
  }

  getAvailableSimSpeedMultiplierCap() {
    if (isDevMode()) return getMaxSimSpeedMultiplier();
    if (this.simTimeSec >= SPEED_UNLOCK_3X_AT_SEC) return 3;
    if (this.simTimeSec >= SPEED_UNLOCK_2X_AT_SEC) return 2;
    return 1;
  }

  getSpeedUnlockState() {
    const currentTimeSec = Math.max(0, Math.floor(this.simTimeSec));
    const speedCap = this.getAvailableSimSpeedMultiplierCap();
    const pendingUnlocks = [];

    if (!isDevMode() && currentTimeSec < SPEED_UNLOCK_2X_AT_SEC) {
      pendingUnlocks.push({
        targetMultiplier: 2,
        unlockAtSec: SPEED_UNLOCK_2X_AT_SEC,
        remainingSec: SPEED_UNLOCK_2X_AT_SEC - currentTimeSec
      });
    }

    if (!isDevMode() && currentTimeSec < SPEED_UNLOCK_3X_AT_SEC) {
      pendingUnlocks.push({
        targetMultiplier: 3,
        unlockAtSec: SPEED_UNLOCK_3X_AT_SEC,
        remainingSec: SPEED_UNLOCK_3X_AT_SEC - currentTimeSec
      });
    }

    return { speedCap, pendingUnlocks };
  }

  isFeatureUnlocked(featureId) {
    if (isDevMode()) return true;

    if (featureId === 'waterFilter') {
      return this.foodsConsumedCount >= this.filterUnlockThreshold || Boolean(this.filterUnlocked || this.water?.filterUnlocked);
    }

    if (featureId === 'berryReed') {
      return this.birthsCount >= BERRY_REED_UNLOCK_BIRTHS
        && (this.water?.hygiene01 ?? 0) >= BERRY_REED_UNLOCK_HYGIENE01;
    }

    return false;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  update(rawDelta) {
    if (this.paused) return;

    const simDt = rawDelta * this.speedMultiplier;
    this.#refreshSpeciesUnlocks();
    const motionDt = simDt;
    this.simTimeSec += simDt;
    this.debugTiming = {
      speedMultiplier: this.speedMultiplier,
      rawDelta,
      simDt,
      motionDt,
      simTimeSec: this.simTimeSec
    };

    for (const fish of this.fish) fish.updateLifeCycle?.(this.simTimeSec);
    for (const fish of this.fish) fish.updatePlayState?.(this.simTimeSec);
    this.#updatePlaySessions();
    this.#tryExpandPlaySessions();
    this.#tryStartPlaySessions();
    this.#updateReproduction(simDt);
    for (const fish of this.fish) fish.updateMetabolism(simDt, this);
    for (const fish of this.fish) fish.decideBehavior(this, motionDt);
    for (const fish of this.fish) fish.applySteering(motionDt);
    for (const fish of this.fish) fish.tryConsumeFood(this);

    this.#updateFishLifeState();
    this.#updateScheduledPoopSpawns();
    this.#updateFood(simDt, motionDt);
    this.#updatePoop(simDt, motionDt);
    this.#updateEggs(simDt);
    this.#updateNestbrush(simDt);
    this.#updateBerryReed(simDt);
    this.#updateWaterHygiene(simDt);
    this.#updateFxParticles(motionDt);
    this.#updateBubbles(motionDt);
  }

  #createInitialWaterState() {
    return {
      hygiene01: WATER_INITIAL_HYGIENE01,
      dirt01: WATER_INITIAL_DIRT01,
      filterInstalled: false,
      filter01: 0,
      installProgress01: 0,
      maintenanceProgress01: 0,
      maintenanceCooldownSec: 0,
      upgradeProgress01: 0,
      upgradeTargetTier: 0,
      filterUnlocked: this.filterUnlocked,
      filterEnabled: true,
      effectiveFilter01: 0,
      filterTier: 0
    };
  }

  installWaterFilter() {
    const water = this.water;
    if (!this.isFeatureUnlocked('waterFilter') || water.filterInstalled || water.installProgress01 > 0) return false;
    water.installProgress01 = 0.000001;
    return true;
  }


  #refreshSpeciesUnlocks() {
    if (isDevMode()) {
      this.speciesUnlocks.berryReed = true;
      this.speciesUnlocks.azureDart = true;
      this.speciesUnlocks.siltSifter = true;
      return;
    }

    const berryReedReadyNow = this.birthsCount >= BERRY_REED_UNLOCK_BIRTHS
      && (this.water?.hygiene01 ?? 0) >= BERRY_REED_UNLOCK_HYGIENE01;
    if (berryReedReadyNow) this.speciesUnlocks.berryReed = true;

    const azureReadyNow = (this.berryReedPlants?.length ?? 0) >= 1
      && (this.water?.hygiene01 ?? 0) >= AZURE_DART_UNLOCK_HYGIENE01;
    if (azureReadyNow) this.speciesUnlocks.azureDart = true;

    if (this.birthsCount >= SILT_SIFTER_UNLOCK_BIRTHS) this.speciesUnlocks.siltSifter = true;
  }

  canAddNestbrush() {
    return isDevMode() || this.birthsCount >= NESTBRUSH_UNLOCK_BIRTHS;
  }

  addNestbrush() {
    const fail = (reason) => ({ ok: false, reason });
    if (!this.canAddNestbrush()) return fail('LOCKED');
    if (this.nestbrush) return fail('MAX_COUNT');
    if (!Number.isFinite(this.bounds?.width) || !Number.isFinite(this.bounds?.height)) return fail('WORLD_NOT_READY');

    const hasBerry = Array.isArray(this.berryReedPlants) && this.berryReedPlants.length > 0;
    const berryAvgX = hasBerry
      ? this.berryReedPlants.reduce((sum, plant) => sum + (plant?.x ?? this.bounds.width * 0.5), 0) / this.berryReedPlants.length
      : this.bounds.width * 0.5;
    const preferRight = berryAvgX < this.bounds.width * 0.5;
    const sideAnchor = preferRight ? 0.78 : 0.22;
    const sideJitter = rand(-0.1, 0.1) * this.bounds.width;

    this.nestbrush = {
      id: this.nextNestbrushId++,
      x: clamp(this.bounds.width * sideAnchor + sideJitter, 14, Math.max(14, this.bounds.width - 14)),
      bottomY: this.bounds.height - rand(0.4, 1.6),
      height: rand(this.bounds.height * 0.09, this.bounds.height * 0.13),
      stage: 1,
      growthProgressSec: 0,
      swayPhase: rand(0, Math.PI * 2),
      swayRate: rand(0.0007, 0.0014)
    };

    return { ok: true };
  }

  getNestbrushCapacity(stage = this.nestbrush?.stage ?? 1) {
    const normalizedStage = clamp(Math.floor(stage), 1, NESTBRUSH_MAX_STAGE);
    return NESTBRUSH_CAPACITY_BY_STAGE[normalizedStage - 1] ?? NESTBRUSH_CAPACITY_BY_STAGE[0];
  }

  canAddBerryReedPlant() {
    this.#refreshSpeciesUnlocks();
    return isDevMode() || this.speciesUnlocks.berryReed;
  }

  grantAllUnlockPrerequisites() {
    this.birthsCount = Math.max(this.birthsCount, 999);
    this.foodsConsumedCount = Math.max(this.foodsConsumedCount, this.getFilterTierUnlockFeeds(3));
    if (this.water) {
      this.water.hygiene01 = Math.max(this.water.hygiene01 ?? 0, 0.95);
    }
    this.filterUnlocked = this.foodsConsumedCount >= this.filterUnlockThreshold;
    this.#refreshSpeciesUnlocks();
  }

  addBerryReedPlant() {
    const fail = (reason) => ({ ok: false, reason });

    if (!this.canAddBerryReedPlant()) return fail('LOCKED');
    if (this.berryReedPlants.length >= BERRY_REED_MAX_COUNT) return fail('MAX_COUNT');
    if (!Number.isFinite(this.bounds?.width) || !Number.isFinite(this.bounds?.height) || this.bounds.width < 20 || this.bounds.height < 20) {
      return fail('WORLD_NOT_READY');
    }

    const centerOffset = rand(-this.bounds.width * 0.12, this.bounds.width * 0.12);
    const x = clamp(this.bounds.width * 0.5 + centerOffset, 14, Math.max(14, this.bounds.width - 14));
    const maxHeight = rand(this.bounds.height * 0.2, this.bounds.height * 0.28);
    const spawnHeight = maxHeight * rand(BERRY_REED_MIN_SPAWN_HEIGHT_SCALE, BERRY_REED_MAX_SPAWN_HEIGHT_SCALE);
    const plant = {
      id: this.nextBerryReedPlantId++,
      x,
      bottomY: this.bounds.height - rand(2, 6),
      height: spawnHeight,
      spawnHeight,
      maxHeight,
      swayPhase: rand(0, Math.PI * 2),
      swayRate: rand(0.0009, 0.0017),
      branches: this.#makeBerryReedBranches(),
      growthElapsedSec: 0,
      nextFruitAtSec: this.simTimeSec + this.getBerryReedFruitSpawnIntervalSec(this.water?.hygiene01 ?? 1)
    };

    this.berryReedPlants.push(plant);
    return { ok: true };
  }



  getBerryReedMaxCount() {
    return BERRY_REED_MAX_COUNT;
  }

  getAzureDartCount() {
    return this.fish.filter((fish) => fish.speciesId === AZURE_DART_SPECIES_ID && fish.lifeState === 'ALIVE').length;
  }

  canAddAzureDart() {
    const underCap = this.getAzureDartCount() < AZURE_DART_MAX_PLAYER_COUNT;
    if (!underCap) return false;
    this.#refreshSpeciesUnlocks();
    if (isDevMode()) return true;
    return this.speciesUnlocks.azureDart;
  }

  addAzureDartSchool() {
    if (!this.canAddAzureDart()) return false;

    const femaleCount = this.fish.filter((fish) => fish.speciesId === AZURE_DART_SPECIES_ID && fish.sex === 'female').length;
    const maleCount = this.fish.filter((fish) => fish.speciesId === AZURE_DART_SPECIES_ID && fish.sex === 'male').length;
    const sex = femaleCount <= maleCount ? 'female' : 'male';

    const fish = this.#createFish({ speciesId: AZURE_DART_SPECIES_ID, sex, initialAgeSec: 0 });
    fish.spawnTimeSec = this.simTimeSec;
    fish.ageSecCached = 0;
    this.fish.push(fish);

    return true;
  }


  canAddSiltSifter() {
    const underCap = this.getSiltSifterCount() < SILT_SIFTER_MAX_PLAYER_COUNT;
    if (!underCap) return false;
    this.#refreshSpeciesUnlocks();
    if (isDevMode()) return true;
    return this.speciesUnlocks.siltSifter;
  }

  getSiltSifterCount() {
    return this.fish.filter((fish) => fish.speciesId === SILT_SIFTER_SPECIES_ID && fish.lifeState === 'ALIVE').length;
  }

  addSiltSifterSchool() {
    if (!this.canAddSiltSifter()) return false;

    const femaleCount = this.fish.filter((fish) => fish.speciesId === SILT_SIFTER_SPECIES_ID && fish.sex === 'female' && fish.lifeState === 'ALIVE').length;
    const maleCount = this.fish.filter((fish) => fish.speciesId === SILT_SIFTER_SPECIES_ID && fish.sex === 'male' && fish.lifeState === 'ALIVE').length;
    const sex = femaleCount <= maleCount ? 'female' : 'male';

    const babyEndSec = Math.max(1, AGE_CONFIG.stageBaseSec?.babyEndSec ?? 600);
    const juvenileSeedAgeSec = babyEndSec + rand(10, Math.max(20, babyEndSec * 0.35));

    const fish = this.#createFish({
      speciesId: SILT_SIFTER_SPECIES_ID,
      sex,
      initialAgeSec: juvenileSeedAgeSec
    });
    fish.spawnTimeSec = this.simTimeSec - juvenileSeedAgeSec;
    fish.ageSecCached = juvenileSeedAgeSec;
    fish.updateLifeCycle(this.simTimeSec);
    if (fish.lifeStage === 'BABY') {
      const fishBabyEndSec = Math.max(30, babyEndSec + (fish.stageShiftBabySec ?? 0));
      const guaranteedJuvenileAgeSec = fishBabyEndSec / Math.max(0.001, fish.growthRate ?? 1) + 12;
      fish.spawnTimeSec = this.simTimeSec - guaranteedJuvenileAgeSec;
      fish.ageSecCached = guaranteedJuvenileAgeSec;
      fish.updateLifeCycle(this.simTimeSec);
    }
    this.fish.push(fish);

    return true;
  }

  getFruitPosition(fruit) {
    if (!fruit) return null;
    const plant = this.berryReedPlants.find((entry) => entry.id === fruit.plantId);
    if (!plant || !Array.isArray(plant.branches) || !plant.branches.length) return null;
    const branchIndex = Math.max(0, Math.min(plant.branches.length - 1, Math.floor(fruit.branchIndex ?? 0)));
    const branch = plant.branches[branchIndex];
    const sway = Math.sin(this.simTimeSec * (plant.swayRate ?? 0.0012) + (plant.swayPhase ?? 0));
    const stemX = plant.x + sway * 8;
    const stemY = plant.bottomY - plant.height;
    const branchBaseX = stemX + branch.side * (plant.height * branch.len * 0.45);
    const branchBaseY = plant.bottomY - plant.height * branch.t;
    const branchTipX = branchBaseX + branch.side * (plant.height * branch.len * 0.52);
    const branchTipY = branchBaseY - plant.height * branch.len * 0.28;
    const u = clamp(fruit.u ?? 0.9, 0, 1);
    const v = Number.isFinite(fruit.v) ? fruit.v : 0;
    return {
      x: branchBaseX + (branchTipX - branchBaseX) * u,
      y: branchBaseY + (branchTipY - branchBaseY) * u + v
    };
  }

  consumeFruit(fruitId) {
    const index = this.fruits.findIndex((entry) => entry.id === fruitId);
    if (index < 0) return 0;
    this.fruits.splice(index, 1);
    this.foodsConsumedCount += 1;
    return 1;
  }

  getBerryReedGrowthRateMultiplier(hygiene01) {
    const h = clamp01(hygiene01);
    if (h < 0.4) return 0;
    return clamp01((h - 0.4) / 0.6);
  }

  getBerryReedFruitCapacity(plant) {
    const elapsedSec = clamp(Number.isFinite(plant?.growthElapsedSec) ? plant.growthElapsedSec : 0, 0, BERRY_REED_MAX_GROWTH_ELAPSED_SEC);
    const phase01 = elapsedSec / BERRY_REED_GROWTH_REFERENCE_SEC;
    if (phase01 <= 1) {
      return BERRY_REED_INITIAL_CAPACITY + (BERRY_REED_MID_CAPACITY - BERRY_REED_INITIAL_CAPACITY) * phase01;
    }
    return BERRY_REED_MID_CAPACITY + (BERRY_REED_MAX_CAPACITY - BERRY_REED_MID_CAPACITY) * (phase01 - 1);
  }

  getBerryReedFruitSpawnIntervalSec(hygiene01, plant = null) {
    const h = clamp01(hygiene01);
    if (h < 0.4) return Infinity;
    const t = clamp01((h - 0.4) / 0.6);
    const capacity = Math.max(1, this.getBerryReedFruitCapacity(plant));
    const minInterval = BERRY_REED_FRUIT_INTERVAL_MIN_SEC * (BERRY_REED_INITIAL_CAPACITY / capacity);
    const maxInterval = BERRY_REED_FRUIT_INTERVAL_MAX_SEC * (BERRY_REED_INITIAL_CAPACITY / capacity);
    return maxInterval - (maxInterval - minInterval) * t;
  }


  toggleWaterFilterEnabled() {
    const water = this.water;
    if (!water?.filterInstalled || water.installProgress01 > 0 || water.maintenanceProgress01 > 0 || water.upgradeProgress01 > 0) return water?.filterEnabled ?? false;
    water.filterEnabled = !water.filterEnabled;
    return water.filterEnabled;
  }

  maintainWaterFilter() {
    const water = this.water;
    if (!water?.filterInstalled) return false;
    if (water.installProgress01 > 0 || water.maintenanceProgress01 > 0 || water.maintenanceCooldownSec > 0) return false;
    water.maintenanceProgress01 = 0.000001;
    return true;
  }

  getFilterTierUnlockFeeds(tier) {
    if (tier <= 1) return this.initialFishCount * 4;
    if (tier === 2) return this.initialFishCount * 10;
    if (tier >= 3) return this.initialFishCount * 16;
    return this.initialFishCount * 4;
  }

  upgradeWaterFilter() {
    const water = this.water;
    if (!water?.filterInstalled || !water.filterEnabled) return false;
    if (water.installProgress01 > 0 || water.maintenanceProgress01 > 0) return false;
    if (water.filterTier >= 3) return false;

    const nextTier = Math.max(2, water.filterTier + 1);
    const unlockFeeds = this.getFilterTierUnlockFeeds(nextTier);
    if (!isDevMode() && this.foodsConsumedCount < unlockFeeds) return false;

    water.upgradeTargetTier = nextTier;
    water.upgradeProgress01 = 0.000001;
    water.filterEnabled = false;
    return true;
  }

  #updateWaterHygiene(dtSec) {
    const expiredFoodCount = this.expiredFoodSinceLastWaterUpdate;
    this.expiredFoodSinceLastWaterUpdate = 0;
    this.pendingPoopDirt01 = 0;

    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      if (fish.lifeState !== 'DEAD' || fish.corpseRemoved) continue;

      if (fish.deadAtSec == null) fish.deadAtSec = this.simTimeSec;

      const ageDeadSec = Math.max(0, this.simTimeSec - fish.deadAtSec);
      let targetContribution = 0;

      if (ageDeadSec >= CORPSE_GRACE_SEC) {
        const minutesAfterGrace = Math.floor((ageDeadSec - CORPSE_GRACE_SEC) / CORPSE_DIRT_STEP_SEC);
        targetContribution = clamp(CORPSE_DIRT_INITIAL01 + CORPSE_DIRT_STEP01 * minutesAfterGrace, 0, CORPSE_DIRT_MAX01);
      }

      const alreadyApplied = clamp(fish.corpseDirtApplied01 ?? 0, 0, CORPSE_DIRT_MAX01);
      const delta = targetContribution - alreadyApplied;
      if (delta > 0) {
        this.water.dirt01 = clamp(this.water.dirt01 + delta, 0, 1);
        fish.corpseDirtApplied01 = targetContribution;
      }

      if (fish.corpseDirtApplied01 >= CORPSE_DIRT_MAX01) {
        fish.corpseRemoved = true;
        this.fish.splice(i, 1);
      }
    }

    const fishBioloadUnits = this.fish.reduce((sum, fish) => sum + getSpeciesBioloadFactor(fish.speciesId), 0);
    const bioload = fishBioloadUnits / WATER_REFERENCE_FISH_COUNT;
    const water = this.water;

    water.filterUnlocked = this.isFeatureUnlocked('waterFilter');

    if (water.installProgress01 > 0 && !water.filterInstalled) {
      water.installProgress01 = clamp(water.installProgress01 + dtSec / FILTER_INSTALL_DURATION_SEC, 0, 1);
      if (water.installProgress01 >= 1) {
        water.filterInstalled = true;
        water.filterEnabled = true;
        water.filter01 = 1;
        water.filterTier = Math.max(1, Math.floor(water.filterTier || 0));
        water.installProgress01 = 0;
      }
    }

    if (water.maintenanceCooldownSec > 0) {
      water.maintenanceCooldownSec = Math.max(0, water.maintenanceCooldownSec - dtSec);
    }

    if (water.maintenanceProgress01 > 0) {
      water.maintenanceProgress01 = clamp(water.maintenanceProgress01 + dtSec / FILTER_MAINTENANCE_DURATION_SEC, 0, 1);
      if (water.maintenanceProgress01 >= 1) {
        water.filter01 = FILTER_MAINTENANCE_RESTORE_TO_01;
        water.maintenanceProgress01 = 0;
        water.maintenanceCooldownSec = FILTER_MAINTENANCE_COOLDOWN_SEC;
      }
    }

    if (water.upgradeProgress01 > 0) {
      water.upgradeProgress01 = clamp(water.upgradeProgress01 + dtSec / FILTER_INSTALL_DURATION_SEC, 0, 1);
      water.filterEnabled = false;
      if (water.upgradeProgress01 >= 1) {
        const upgradedTier = Math.max(water.filterTier, water.upgradeTargetTier || (water.filterTier + 1));
        water.filterTier = Math.max(1, Math.min(3, Math.floor(upgradedTier)));
        water.filter01 = 1;
        water.upgradeProgress01 = 0;
        water.upgradeTargetTier = 0;
        water.filterEnabled = true;
      }
    }

    const isMaintaining = water.maintenanceProgress01 > 0;
    const isUpgrading = water.upgradeProgress01 > 0;
    const hasWorkingFilter = water.filterInstalled
      && water.filterEnabled
      && !isMaintaining
      && !isUpgrading
      && water.filter01 > FILTER_DEPLETED_THRESHOLD_01;
    const effectiveFilter01 = hasWorkingFilter ? water.filter01 : 0;
    const filterTier = Math.max(0, Math.min(3, Math.floor(water.filterTier ?? 0)));
    const dirtTierMultiplier = 1 + Math.max(0, filterTier - 1) * FILTER_TIER_DIRT_REMOVAL_STEP;
    const bioloadTierMultiplier = 1 + Math.max(0, filterTier - 1) * FILTER_TIER_BIOLOAD_STEP;
    const wearTierMultiplier = 1 + Math.max(0, filterTier - 1) * FILTER_TIER_WEAR_STEP;
    water.effectiveFilter01 = effectiveFilter01;

    const effectiveBioload = clamp(
      bioload * (1 - effectiveFilter01 * FILTER_BIOLOAD_MITIGATION_FACTOR * bioloadTierMultiplier),
      0,
      Math.max(0, bioload)
    );

    const bioloadDirt = WATER_BIOLOAD_DIRT_PER_SEC * bioload * dtSec;
    const expiredFoodDirt = expiredFoodCount * WATER_DIRT_PER_EXPIRED_FOOD;
    const poopDirt = Math.max(0, this.pendingPoopDirt01 ?? 0);
    this.pendingPoopDirt01 = 0;
    water.dirt01 = clamp(water.dirt01 + bioloadDirt + expiredFoodDirt + poopDirt, 0, 1);

    const removedDirt = FILTER_DIRT_REMOVE_PER_SEC * effectiveFilter01 * dirtTierMultiplier * dtSec;
    water.dirt01 = clamp(water.dirt01 - removedDirt, 0, 1);

    if (water.filterInstalled) {
      const wearRate = FILTER_WEAR_BASE_PER_SEC
        * wearTierMultiplier
        * (1 + FILTER_WEAR_BIOLOAD_FACTOR * bioload)
        * (1 + FILTER_WEAR_DIRT_FACTOR * water.dirt01);
      water.filter01 = clamp(water.filter01 - wearRate * dtSec, 0, 1);
    }

    const dirtMultiplier = 1 + (water.dirt01 ** WATER_DIRT_DECAY_POWER) * WATER_DIRT_DECAY_STRENGTH;
    const baselineDecay = WATER_BASELINE_DECAY_PER_SEC * effectiveBioload * dirtMultiplier * dtSec;
    const hygieneRecovery = WATER_BASELINE_DECAY_PER_SEC * Math.max(0, bioload - effectiveBioload) * dtSec;
    const filterRecovery = filterTier >= 2
      ? HYGIENE_RECOVERY_PER_SEC * effectiveFilter01 * (1 - water.dirt01) * dtSec
      : 0;
    water.hygiene01 = clamp(water.hygiene01 - baselineDecay + hygieneRecovery + filterRecovery, 0, 1);
  }

  #seedGroundAlgae() {
    const count = Math.max(10, Math.floor(this.bounds.width / 76));
    this.groundAlgae = Array.from({ length: count }, () => ({
      x: rand(12, Math.max(12, this.bounds.width - 12)),
      y: this.bounds.height - rand(1, 10),
      height: rand(this.bounds.height * 0.07, this.bounds.height * 0.16),
      width: rand(4, 10),
      swayAmp: rand(1.2, 4.2),
      swayRate: rand(0.0012, 0.0026),
      phase: rand(0, Math.PI * 2),
      radius: rand(28, 55)
    }));
  }

  #updatePlaySessions() {
    this.playSessions = this.playSessions.filter((session) => {
      const runner = this.fish.find((f) => f.id === session.runnerFishId);
      const chasers = session.chaserFishIds
        .map((id) => this.fish.find((f) => f.id === id))
        .filter((fish) => fish && fish.isPlaying?.(this.simTimeSec));

      const runnerAliveInSession = runner && runner.isPlaying?.(this.simTimeSec);
      if (!runnerAliveInSession || chasers.length < 1 || this.simTimeSec >= session.untilSec) {
        if (runnerAliveInSession) runner.stopPlay?.(this.simTimeSec);
        for (const fish of chasers) fish.stopPlay?.(this.simTimeSec);
        return false;
      }

      session.chaserFishIds = chasers.map((fish) => fish.id);
      runner.setPlayRole?.('RUNNER');
      const closestChaser = chasers.reduce((best, current) => {
        if (!best) return current;
        const currDist = Math.hypot(runner.position.x - current.position.x, runner.position.y - current.position.y);
        const bestDist = Math.hypot(runner.position.x - best.position.x, runner.position.y - best.position.y);
        return currDist < bestDist ? current : best;
      }, null);
      runner.setPlayTargetFish?.(closestChaser?.id ?? null);

      for (const chaser of chasers) {
        chaser.setPlayRole?.('CHASER');
        chaser.setPlayTargetFish?.(runner.id);
      }

      session.origin = {
        x: (runner.position.x + (chasers[0]?.position.x ?? runner.position.x)) * 0.5,
        y: (runner.position.y + (chasers[0]?.position.y ?? runner.position.y)) * 0.5
      };

      return true;
    });
  }

  #isNearGroundAlgae(point) {
    return this.groundAlgae.some((algae) => Math.hypot(point.x - algae.x, point.y - algae.y) <= algae.radius);
  }

  #tryExpandPlaySessions() {
    const joinRadius = 82;

    for (const session of this.playSessions) {
      const runner = this.fish.find((f) => f.id === session.runnerFishId);
      if (!runner || !runner.isPlaying?.(this.simTimeSec)) continue;

      const anchor = runner.position;
      for (const candidate of this.fish) {
        if (!candidate.canStartPlay?.(this.simTimeSec)) continue;

        const d = Math.hypot(candidate.position.x - anchor.x, candidate.position.y - anchor.y);
        if (d > joinRadius) continue;
        if (Math.random() > 0.45) continue;

        candidate.startPlay?.({
          sessionId: session.id,
          role: 'CHASER',
          untilSec: session.untilSec,
          targetFishId: runner.id,
          startedNearAlgae: session.startedNearAlgae,
          simTimeSec: this.simTimeSec
        });
        session.chaserFishIds.push(candidate.id);
      }
    }
  }

  #tryStartPlaySessions() {
    if (this.fish.length < 2) return;

    const encounterRadius = 64;

    for (let i = 0; i < this.fish.length; i += 1) {
      const a = this.fish[i];
      if (!a.canStartPlay?.(this.simTimeSec)) continue;

      for (let j = i + 1; j < this.fish.length; j += 1) {
        const b = this.fish[j];
        if (!b.canStartPlay?.(this.simTimeSec)) continue;

        const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        if (dist > encounterRadius) continue;

        const midpoint = {
          x: (a.position.x + b.position.x) * 0.5,
          y: (a.position.y + b.position.y) * 0.5
        };

        const nearAlgae = this.#isNearGroundAlgae(midpoint);
        const probability = (a.playProbability?.(nearAlgae) + b.playProbability?.(nearAlgae)) * 0.5;

        if (Math.random() > probability) {
          const cooldownUntilSec = this.simTimeSec + 10;
          a.delayPlayEligibility?.(cooldownUntilSec);
          b.delayPlayEligibility?.(cooldownUntilSec);
          continue;
        }

        const duration = rand(4, 7);
        const sessionId = this.nextPlaySessionId++;
        const untilSec = this.simTimeSec + duration;

        const runner = Math.random() < 0.5 ? a : b;
        const initialChaser = runner === a ? b : a;

        runner.startPlay?.({
          sessionId,
          role: 'RUNNER',
          untilSec,
          targetFishId: initialChaser.id,
          startedNearAlgae: nearAlgae,
          simTimeSec: this.simTimeSec
        });

        initialChaser.startPlay?.({
          sessionId,
          role: 'CHASER',
          untilSec,
          targetFishId: runner.id,
          startedNearAlgae: nearAlgae,
          simTimeSec: this.simTimeSec
        });

        const chaserIds = [initialChaser.id];
        for (const candidate of this.fish) {
          if (candidate.id === runner.id || candidate.id === initialChaser.id) continue;
          if (!candidate.canStartPlay?.(this.simTimeSec)) continue;

          const d = Math.hypot(candidate.position.x - midpoint.x, candidate.position.y - midpoint.y);
          if (d > encounterRadius * 1.25) continue;
          if (Math.random() >= 0.55) continue;

          candidate.startPlay?.({
            sessionId,
            role: 'CHASER',
            untilSec,
            targetFishId: runner.id,
            startedNearAlgae: nearAlgae,
            simTimeSec: this.simTimeSec
          });
          chaserIds.push(candidate.id);
          if (chaserIds.length >= 5) break;
        }

        this.playSessions.push({
          id: sessionId,
          runnerFishId: runner.id,
          chaserFishIds: chaserIds,
          untilSec,
          startedNearAlgae: nearAlgae,
          origin: midpoint
        });

        return;
      }
    }
  }

  #getPopulationPressure01(speciesId = null) {
    let aliveCount = 0;
    for (const fish of this.fish) {
      if (fish.lifeState !== 'ALIVE') continue;
      if (speciesId && (fish.speciesId ?? DEFAULT_SPECIES_ID) !== speciesId) continue;
      aliveCount += 1;
    }
    if (aliveCount <= REPRO_PRESSURE_START_COUNT) return 0;
    const span = Math.max(1, REPRO_PRESSURE_CRITICAL_COUNT - REPRO_PRESSURE_START_COUNT);
    return clamp01((aliveCount - REPRO_PRESSURE_START_COUNT) / span);
  }

  #getLabAuthorityStressFactor() {
    let azureAliveCount = 0;
    for (const fish of this.fish) {
      if (fish.lifeState !== 'ALIVE') continue;
      if ((fish.speciesId ?? DEFAULT_SPECIES_ID) !== AZURE_DART_SPECIES_ID) continue;
      azureAliveCount += 1;
    }

    const azureDelta = Math.max(0, azureAliveCount - LAB_AUTHORITY_STRESS_START_AZURE_COUNT);
    if (azureDelta <= 0) return 1;

    const power = Math.max(1, LAB_AUTHORITY_STRESS_CURVE_POWER);
    const k = Math.max(1, LAB_AUTHORITY_STRESS_HALF_EFFECT_AZURE_DELTA);
    const deltaPow = azureDelta ** power;
    const ratio = deltaPow / (deltaPow + (k ** power));
    const penalty = LAB_AUTHORITY_STRESS_MAX_PENALTY * ratio;
    return clamp(1 - penalty, 1 - LAB_AUTHORITY_STRESS_MAX_PENALTY, 1);
  }


  #isMateEligible(fish, nowSec) {
    if (!fish || fish.lifeState !== 'ALIVE') return false;
    if (fish.lifeStage !== 'ADULT') return false;
    if (fish.hungerState !== 'FED') return false;
    if ((fish.wellbeing01 ?? 0) < MATE_MIN_WELLBEING) return false;
    if ((this.water?.hygiene01 ?? 0) < MATE_MIN_HYGIENE) return false;
    if (!fish.repro) return false;
    if (fish.repro.state !== 'READY') return false;
    if (nowSec < (fish.repro.cooldownUntilSec ?? 0)) return false;
    return true;
  }

  #tryMatePair(a, b, nowSec) {
    if (a.sex === b.sex) return;
    if ((a.speciesId ?? DEFAULT_SPECIES_ID) !== (b.speciesId ?? DEFAULT_SPECIES_ID)) return;
    if (!this.#isMateEligible(a, nowSec) || !this.#isMateEligible(b, nowSec)) return;

    if ((a.speciesId ?? DEFAULT_SPECIES_ID) === SILT_SIFTER_SPECIES_ID) {
      const recentWindowSec = rand(SILT_SIFTER_RECENT_POOP_MIN_SEC, SILT_SIFTER_RECENT_POOP_MAX_SEC);
      const aRecent = Number.isFinite(a.lastPoopConsumedAtSimSec) && (nowSec - a.lastPoopConsumedAtSimSec) <= recentWindowSec;
      const bRecent = Number.isFinite(b.lastPoopConsumedAtSimSec) && (nowSec - b.lastPoopConsumedAtSimSec) <= recentWindowSec;
      if (!aRecent || !bRecent) return;
    }

    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const nextTryAt = this.matePairNextTryAt.get(key) ?? 0;
    if (nowSec < nextTryAt) return;
    this.matePairNextTryAt.set(key, nowSec + MATE_PAIR_RETRY_MIN_SEC);

    const hygiene = clamp01(this.water?.hygiene01 ?? 1);
    const t = clamp01((hygiene - 0.60) / 0.40);
    const hygieneFactor = 0.5 + 0.5 * t;
    const w = Math.min(a.wellbeing01 ?? 0, b.wellbeing01 ?? 0);
    const u = clamp01((w - 0.80) / 0.20);
    const wellbeingFactor = 0.6 + 0.4 * u;
    const speciesId = a.speciesId ?? DEFAULT_SPECIES_ID;
    const populationPressure01 = this.#getPopulationPressure01(speciesId);
    const densityFactor = 1 - (populationPressure01 * 0.75);
    const authorityStressFactor = speciesId === LAB_MINNOW_SPECIES_ID
      ? this.#getLabAuthorityStressFactor()
      : 1;
    let pMate = MATE_BASE_CHANCE * hygieneFactor * wellbeingFactor * densityFactor * authorityStressFactor;
    if (speciesId === SILT_SIFTER_SPECIES_ID) {
      const aEggBoost = Number.isFinite(a.lastEggConsumedAtSimSec) && (nowSec - a.lastEggConsumedAtSimSec) <= SILT_SIFTER_EGG_MATE_BOOST_WINDOW_SEC;
      const bEggBoost = Number.isFinite(b.lastEggConsumedAtSimSec) && (nowSec - b.lastEggConsumedAtSimSec) <= SILT_SIFTER_EGG_MATE_BOOST_WINDOW_SEC;
      if (aEggBoost || bEggBoost) pMate *= SILT_SIFTER_EGG_MATE_BOOST_MULTIPLIER;
    }
    pMate = clamp01(pMate);

    if (Math.random() >= pMate) return;

    const female = a.sex === 'female' ? a : b;
    const male = a.sex === 'male' ? a : b;

    female.repro.state = 'GRAVID';
    female.repro.fatherId = male.id;
    female.repro.pregnancyStartSec = nowSec;
    const reproScale = getSpeciesReproductionScale(female.speciesId);
    female.repro.dueAtSec = nowSec + randRange(GESTATION_SEC, 300, 360) * reproScale;
    female.repro.layingStartedAtSec = null;
    female.repro.layTargetX = null;
    female.repro.layTargetY = null;

    male.repro.cooldownUntilSec = nowSec + randRange(MATE_FATHER_COOLDOWN_SEC, 120, 240) * reproScale;

    female.history.mateCount += 1;
    male.history.mateCount += 1;

    female.matingAnim = {
      startSec: nowSec,
      durationSec: 1.1,
      partnerId: male.id,
      bubbleBurstDone: false
    };
    male.matingAnim = {
      startSec: nowSec,
      durationSec: 1.1,
      partnerId: female.id,
      bubbleBurstDone: false
    };

    female.cancelHover?.();
    male.cancelHover?.();
  }

  #layEggClutch(female, nowSec) {
    const father = this.getFishById(female.repro.fatherId) ?? null;
    const motherTraits = { ...(female.traits ?? {}) };
    const fatherTraits = father?.traits ? { ...father.traits } : { ...motherTraits };
    const speciesId = female.speciesId ?? DEFAULT_SPECIES_ID;
    const species = getSpeciesConfig(speciesId);
    const clutchSizes = speciesId === AZURE_DART_SPECIES_ID
      ? [3, 4, 5]
      : (speciesId === SILT_SIFTER_SPECIES_ID ? [1, 3] : CLUTCH_SIZE);
    let baseClutchCount = speciesId === AZURE_DART_SPECIES_ID
      ? clutchSizes[Math.floor(rand(0, clutchSizes.length))]
      : Math.max(1, randIntInclusive(clutchSizes, 2, 4));
    if (speciesId === SILT_SIFTER_SPECIES_ID) {
      const roll = Math.random();
      baseClutchCount = roll < 0.45 ? 1 : (roll < 0.9 ? 2 : 3);
    }
    const populationPressure01 = this.#getPopulationPressure01(speciesId);
    const clutchPressureFactor = 1 - (populationPressure01 * 0.45);
    const clutchCount = Math.max(1, Math.round(baseClutchCount * clutchPressureFactor));
    const reproScale = getSpeciesReproductionScale(speciesId);
    const motherCooldownScale = speciesId === SILT_SIFTER_SPECIES_ID ? 1.5 : reproScale;
    const baseLayY = Math.max(0, this.#swimHeight() - 14);
    const wantsNestbrushLay = speciesId === LAB_MINNOW_SPECIES_ID && female.repro?.layUseNestbrush === true;
    const availableNestbrushSlots = this.#getAvailableNestbrushEggSlots();
    const useNestbrushForClutch = wantsNestbrushLay && availableNestbrushSlots >= clutchCount;

    for (let i = 0; i < clutchCount; i += 1) {
      let x = clamp(female.position.x + rand(-6, 6), 0, this.bounds.width);
      let y = clamp(female.position.y + rand(-4, 4), 0, this.#swimHeight());
      if (speciesId === AZURE_DART_SPECIES_ID && this.berryReedPlants.length) {
        const plant = this.berryReedPlants[Math.floor(rand(0, this.berryReedPlants.length))];
        x = clamp(plant.x + rand(-12, 12), 0, this.bounds.width);
        y = clamp(plant.bottomY - rand(1, 8), baseLayY - 6, this.#swimHeight());
      }

      const nestbrushPlacement = useNestbrushForClutch
        ? this.#tryGetNestbrushEggPlacement(speciesId)
        : { protected: false, x: null, y: null, attachment: null };
      const incubationPenalty = nestbrushPlacement.protected ? 1 : NESTBRUSH_INCUBATION_PENALTY_MULTIPLIER;

      this.eggs.push({
        id: this.nextEggId++,
        x: nestbrushPlacement.protected ? nestbrushPlacement.x : x,
        y: nestbrushPlacement.protected ? nestbrushPlacement.y : y,
        laidAtSec: nowSec,
        hatchAtSec: nowSec + randRange(EGG_INCUBATION_SEC, 120, 300) * reproScale * incubationPenalty,
        motherId: female.id,
        fatherId: female.repro.fatherId,
        motherTraits,
        fatherTraits,
        speciesId,
        state: 'INCUBATING',
        canBeEaten: true,
        nutrition: 0.25,
        isProtectedByNestbrush: nestbrushPlacement.protected,
        nestbrushAttachment: nestbrushPlacement.attachment
      });
    }

    this.eggsLaidCount += clutchCount;

    female.repro.state = 'COOLDOWN';
    female.repro.cooldownUntilSec = nowSec + randRange(MOTHER_COOLDOWN_SEC, 600, 1080) * motherCooldownScale;
    female.repro.dueAtSec = null;
    female.repro.fatherId = null;
    female.repro.layTargetX = null;
    female.repro.layTargetY = null;
    female.repro.layUseNestbrush = false;
    female.repro.pregnancyStartSec = null;
    female.repro.layingStartedAtSec = null;
  }

  #getAvailableNestbrushEggSlots() {
    if (!this.nestbrush) return 0;
    const capacity = this.getNestbrushCapacity(this.nestbrush.stage);
    const occupied = this.eggs.filter((egg) => egg?.state === 'INCUBATING' && egg?.isProtectedByNestbrush).length;
    return Math.max(0, capacity - occupied);
  }

  #updateReproduction(dt) {
    if (!REPRO_ENABLED || !Number.isFinite(dt) || dt <= 0) return;
    const nowSec = this.simTimeSec;

    for (let i = 0; i < this.fish.length; i += 1) {
      const a = this.fish[i];
      if (a.lifeState !== 'ALIVE') continue;
      for (let j = i + 1; j < this.fish.length; j += 1) {
        const b = this.fish[j];
        if (b.lifeState !== 'ALIVE') continue;
        const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        if (dist > MATE_ENCOUNTER_RADIUS_PX) continue;
        this.#tryMatePair(a, b, nowSec);
      }
    }

    const layTargetY = Math.max(0, this.#swimHeight() - 14);

    for (const fish of this.fish) {
      if (!fish.repro || fish.lifeState !== 'ALIVE' || fish.sex !== 'female') continue;

      if (fish.repro.state === 'GRAVID' && nowSec >= (fish.repro.dueAtSec ?? Infinity)) {
        fish.repro.state = 'LAYING';
        if (fish.speciesId === LAB_MINNOW_SPECIES_ID) {
          const canUseNestbrush = this.#getAvailableNestbrushEggSlots() > 0;
          fish.repro.layUseNestbrush = canUseNestbrush;
          if (canUseNestbrush) {
            const layPlacement = this.#tryGetNestbrushEggPlacement(fish.speciesId);
            fish.repro.layTargetX = clamp(layPlacement.x ?? this.nestbrush?.x ?? fish.position.x, 0, this.bounds.width);
            fish.repro.layTargetY = clamp(
              layPlacement.y ?? (this.nestbrush?.bottomY ? this.nestbrush.bottomY - this.nestbrush.height * 0.45 : layTargetY),
              0,
              this.#swimHeight()
            );
          } else {
            fish.repro.layTargetX = clamp(fish.position.x + rand(-20, 20), 0, this.bounds.width);
            fish.repro.layTargetY = layTargetY;
          }
        } else if (fish.speciesId === AZURE_DART_SPECIES_ID && this.berryReedPlants.length) {
          const plant = this.berryReedPlants[Math.floor(rand(0, this.berryReedPlants.length))];
          fish.repro.layTargetX = clamp(plant.x + rand(-12, 12), 0, this.bounds.width);
          fish.repro.layTargetY = clamp(plant.bottomY - rand(1, 6), Math.max(0, layTargetY - 6), this.#swimHeight());
        } else {
          fish.repro.layUseNestbrush = false;
          fish.repro.layTargetX = clamp(fish.position.x + rand(-20, 20), 0, this.bounds.width);
          fish.repro.layTargetY = layTargetY;
        }
        fish.repro.layingStartedAtSec = nowSec;
      }

      if (fish.repro.state === 'LAYING') {
        const tx = Number.isFinite(fish.repro.layTargetX) ? fish.repro.layTargetX : fish.position.x;
        const ty = Number.isFinite(fish.repro.layTargetY) ? fish.repro.layTargetY : layTargetY;
        const d = Math.hypot(fish.position.x - tx, fish.position.y - ty);

        if (d <= 10) {
          if (!Number.isFinite(fish.hoverUntilSec)) {
            fish.hoverUntilSec = nowSec + rand(1.8, 2.8);
            fish.hoverAnchor = { x: tx, y: ty };
            fish.hoverOffset = { x: 0, y: 0 };
          } else if (nowSec >= fish.hoverUntilSec) {
            this.#layEggClutch(fish, nowSec);
          }
        } else if (d >= 16) {
          fish.cancelHover?.();
        }
      }

      if (fish.repro.state === 'COOLDOWN' && nowSec >= (fish.repro.cooldownUntilSec ?? 0)) {
        fish.repro.state = 'READY';
      }
    }
  }


  #updateFishLifeState() {
    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      if (fish.lifeState === 'DEAD') {
        if (fish.deadAtSec == null) fish.deadAtSec = this.simTimeSec;
        if (fish.history && fish.history.deathSimTimeSec == null) {
          fish.history.deathSimTimeSec = this.simTimeSec;
          this.deathsCount += 1;
        }
      }
    }
  }


  #updateFood(simDt, motionDt) {
    const bottomY = this.#swimHeight();

    for (let i = this.food.length - 1; i >= 0; i -= 1) {
      const item = this.food[i];
      if (Number.isFinite(item.ttl)) item.ttl -= simDt;

      item.vy += FOOD_FALL_ACCEL * motionDt;
      item.y += item.vy * motionDt;
      if (item.y >= bottomY) {
        item.y = bottomY;
        item.vy *= FOOD_FALL_DAMPING;
      } else {
        item.vy = Math.min(item.vy, FOOD_MAX_FALL_SPEED);
      }

      if (Number.isFinite(item.ttl) && item.ttl <= 0) {
        this.food.splice(i, 1);
        this.expiredFoodSinceLastWaterUpdate += 1;
        if (WATER_HYGIENE_DROP_PER_EXPIRED_FOOD > 0 && this.water) {
          this.water.hygiene01 = clamp(this.water.hygiene01 - WATER_HYGIENE_DROP_PER_EXPIRED_FOOD, 0, 1);
        }
        this.emit('foodExpired', { foodId: item.id });
      }
    }
  }


  #updatePoop(simDt, motionDt) {
    if (!Number.isFinite(simDt) || simDt <= 0) return;

    const bottomY = this.#swimHeight();

    for (let i = this.poop.length - 1; i >= 0; i -= 1) {
      const item = this.poop[i];
      if (Number.isFinite(item.ttlSec)) item.ttlSec -= simDt;

      const type = 'pellet';
      item.type = type;

      item.vx = Number.isFinite(item.vx) ? item.vx : 0;
      item.vy = Math.abs(Number.isFinite(item.vy) ? item.vy : POOP_BASE_DRIFT_SPEED);

      const blend = Math.min(1, simDt * 1.5);
      item.vy += (POOP_BASE_DRIFT_SPEED - item.vy) * blend;
      item.vx *= POOP_DRIFT_DAMPING;

      item.vx *= POOP_DRIFT_DAMPING;
      item.vy *= POOP_DRIFT_DAMPING;
      item.x += item.vx * motionDt;
      item.y += item.vy * motionDt;

      item.x = clamp(item.x, 0, this.bounds.width);

      if (item.y >= bottomY) {
        item.y = bottomY;
        if (type === 'pellet') {
          item.vy = 0;
          item.vx *= 0.92;
        } else {
          item.vy = Math.min(0, item.vy);
        }
      } else if (item.y <= 0) {
        item.y = 0;
        item.vy = Math.max(0, item.vy);
      }

      if (Number.isFinite(item.ttlSec) && item.ttlSec <= 0) {
        this.poop.splice(i, 1);
        this.pendingPoopDirt01 = (this.pendingPoopDirt01 ?? 0) + POOP_DISSOLVE_DIRT_UNITS * Math.max(0, item.bioloadFactor ?? 1);
      }
    }
  }

  #updateScheduledPoopSpawns() {
    if (!this.scheduledPoopSpawns.length) return;

    for (let i = this.scheduledPoopSpawns.length - 1; i >= 0; i -= 1) {
      const entry = this.scheduledPoopSpawns[i];
      if (this.simTimeSec < (entry.spawnAtSec ?? Infinity)) continue;

      const fish = this.getFishById(entry.fishId);
      if (fish && fish.lifeState === 'ALIVE') {
        const factor = getSpeciesPoopBioloadFactor(fish.speciesId);
        const visible = fish.speciesId !== AZURE_DART_SPECIES_ID && (fish.species?.poopEnabled !== false);
        this.spawnPoop(fish.position.x, fish.position.y, POOP_DEFAULT_TTL_SEC, { bioloadFactor: factor, visible });
      }
      this.scheduledPoopSpawns.splice(i, 1);
    }
  }


  #updateFxParticles(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    for (let i = this.fxParticles.length - 1; i >= 0; i -= 1) {
      const p = this.fxParticles[i];
      p.ttlSec -= dt;
      p.x = clamp(p.x + p.vx * dt, 0, this.bounds.width);
      p.y = clamp(p.y + p.vy * dt, 0, this.#swimHeight());
      if (p.ttlSec <= 0) this.fxParticles.splice(i, 1);
    }
  }

  #updateEggs(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    const nowSec = this.simTimeSec;
    const hygiene01 = clamp01(this.water?.hygiene01 ?? 1);

    for (let i = this.eggs.length - 1; i >= 0; i -= 1) {
      const egg = this.eggs[i];
      if (!egg || nowSec < (egg.hatchAtSec ?? Infinity)) continue;

      let hatchChance = 0;
      if (hygiene01 >= MATE_MIN_HYGIENE) {
        const t = clamp01((hygiene01 - 0.60) / 0.40);
        hatchChance = 0.20 + 0.80 * (t * t);
      }

      const speciesId = egg.speciesId ?? this.getFishById(egg.motherId)?.speciesId ?? DEFAULT_SPECIES_ID;
      const populationPressure01 = this.#getPopulationPressure01(speciesId);
      hatchChance *= (1 - (populationPressure01 * 0.5));
      if (speciesId === LAB_MINNOW_SPECIES_ID && !egg.isProtectedByNestbrush) {
        hatchChance *= NESTBRUSH_HATCH_PENALTY_MULTIPLIER;
      }
      if (speciesId === AZURE_DART_SPECIES_ID && this.berryReedPlants.length > 0) {
        hatchChance += 0.08;
      }
      hatchChance = clamp01(hatchChance);

      const success = Math.random() < hatchChance;
      if (success) {
        const spawnX = clamp(Number.isFinite(egg.x) ? egg.x : this.bounds.width * 0.5, 0, this.bounds.width);
        const spawnY = clamp(Number.isFinite(egg.y) ? egg.y : this.#swimHeight() * 0.5, 0, this.#swimHeight());

        const babyTraits = inheritTraits(
          egg.motherTraits,
          egg.fatherTraits,
          REPRO_CONFIG
        );

        const baby = this.#createFish({
          speciesId: egg.speciesId ?? this.getFishById(egg.motherId)?.speciesId ?? DEFAULT_SPECIES_ID,
          initialAgeSec: 0,
          position: { x: spawnX, y: spawnY },
          traits: babyTraits,
          bornInAquarium: true,
          motherId: egg.motherId,
          fatherId: egg.fatherId
        });
        baby.spawnTimeSec = this.simTimeSec;
        baby.ageSecCached = 0;
        this.fish.push(baby);
        this.birthsCount += 1;
        this.peakPopulationCount = Math.max(this.peakPopulationCount, this.fish.length);

        const mother = this.getFishById(egg.motherId);
        if (mother) {
          const babyId = String(baby.id);
          if (!mother.history.childrenIds.includes(babyId)) mother.history.childrenIds.push(babyId);
        }

        const father = this.getFishById(egg.fatherId);
        if (father) {
          const babyId = String(baby.id);
          if (!father.history.childrenIds.includes(babyId)) father.history.childrenIds.push(babyId);
        }

        const ancestorIds = [mother?.history?.motherId, mother?.history?.fatherId, father?.history?.motherId, father?.history?.fatherId];
        for (const ancestorId of ancestorIds) {
          if (ancestorId == null) continue;
          this.grandparentIds.add(String(ancestorId));
        }

        egg.state = 'HATCHED';
      } else {
        egg.state = 'FAILED';
      }

      this.eggs.splice(i, 1);
    }
  }


  getEcosystemReport() {
    const simDurationSec = Math.max(0, this.simTimeSec);
    const longestLived = this.#findLongestLivedFish();

    return {
      simDurationSec,
      eggsLaidCount: Math.max(0, Math.floor(this.eggsLaidCount)),
      birthsCount: Math.max(0, Math.floor(this.birthsCount)),
      deathsCount: Math.max(0, Math.floor(this.deathsCount)),
      peakPopulationCount: Math.max(0, Math.floor(this.peakPopulationCount)),
      longestLivedFishName: longestLived?.name ?? 'Unknown',
      grandparentCount: this.grandparentIds.size,
      foodAmountConsumedTotal: Math.max(0, this.foodAmountConsumedTotal)
    };
  }

  #findLongestLivedFish() {
    let winner = null;
    for (const fish of this.fishArchiveById.values()) {
      const birthSec = Number.isFinite(fish.history?.birthSimTimeSec)
        ? fish.history.birthSimTimeSec
        : Number.isFinite(fish.spawnTimeSec)
          ? fish.spawnTimeSec
          : 0;
      const deathSec = Number.isFinite(fish.history?.deathSimTimeSec)
        ? fish.history.deathSimTimeSec
        : this.simTimeSec;
      const livedSec = Math.max(0, deathSec - birthSec);

      if (!winner || livedSec > winner.livedSec) {
        winner = { name: String(fish.name ?? 'Unknown'), livedSec };
      }
    }
    return winner;
  }

  #makeBerryReedBranches() {
    return Array.from({ length: 4 }, (_, index) => ({
      t: 0.24 + index * 0.18 + rand(-0.04, 0.04),
      side: index % 2 === 0 ? -1 : 1,
      len: rand(0.2, 0.38)
    }));
  }

  #spawnBerryFruit(plant) {
    if (!plant || !Array.isArray(plant.branches) || plant.branches.length === 0) return false;
    const fruitsOnPlant = this.fruits.filter((entry) => entry.plantId === plant.id).length;
    if (fruitsOnPlant >= BERRY_REED_MAX_FRUITS_PER_PLANT) return false;
    if (this.fruits.length >= BERRY_REED_MAX_FRUITS) return false;

    const branchIndex = Math.floor(rand(0, plant.branches.length));
    this.fruits.push({
      id: this.nextFruitId++,
      plantId: plant.id,
      branchIndex,
      u: rand(0.75, 1),
      v: rand(-3, 3),
      radius: rand(1.8, 3),
      createdAtSec: this.simTimeSec,
      ttlSec: BERRY_REED_FRUIT_TTL_SEC
    });

    return true;
  }

  #updateBerryReed(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!this.berryReedPlants.length) {
      this.fruits = [];
      return;
    }

    const hygiene01 = this.water?.hygiene01 ?? 1;
    const growthRate = this.getBerryReedGrowthRateMultiplier(hygiene01);

    for (let i = this.fruits.length - 1; i >= 0; i -= 1) {
      const fruit = this.fruits[i];
      if (!fruit) {
        this.fruits.splice(i, 1);
        continue;
      }
      const elapsedSec = this.simTimeSec - (fruit.createdAtSec ?? this.simTimeSec);
      if (elapsedSec >= (fruit.ttlSec ?? 0)) this.fruits.splice(i, 1);
    }

    for (const plant of this.berryReedPlants) {
      plant.maxHeight = clamp(Number.isFinite(plant.maxHeight) ? plant.maxHeight : plant.height, this.bounds.height * 0.14, this.bounds.height * 0.35);
      plant.spawnHeight = clamp(Number.isFinite(plant.spawnHeight) ? plant.spawnHeight : plant.height, this.bounds.height * 0.1, plant.maxHeight);
      plant.growthElapsedSec = clamp(
        (Number.isFinite(plant.growthElapsedSec) ? plant.growthElapsedSec : 0) + dt * growthRate,
        0,
        BERRY_REED_MAX_GROWTH_ELAPSED_SEC
      );
      const growth01 = clamp01(plant.growthElapsedSec / BERRY_REED_MAX_GROWTH_ELAPSED_SEC);
      plant.height = plant.spawnHeight + (plant.maxHeight - plant.spawnHeight) * growth01;

      if (!Number.isFinite(plant.nextFruitAtSec)) {
        const resumedInterval = this.getBerryReedFruitSpawnIntervalSec(hygiene01, plant);
        if (Number.isFinite(resumedInterval)) {
          plant.nextFruitAtSec = this.simTimeSec + resumedInterval;
        }
      }
      if (this.simTimeSec < (plant.nextFruitAtSec ?? Infinity)) continue;
      const spawned = this.#spawnBerryFruit(plant);
      const baseInterval = this.getBerryReedFruitSpawnIntervalSec(hygiene01, plant);
      if (!Number.isFinite(baseInterval)) {
        plant.nextFruitAtSec = Infinity;
        continue;
      }
      const jitter = rand(-BERRY_REED_FRUIT_INTERVAL_JITTER_SEC, BERRY_REED_FRUIT_INTERVAL_JITTER_SEC);
      const interval = Math.max(3, baseInterval + jitter);
      plant.nextFruitAtSec = this.simTimeSec + interval;
      if (!spawned && this.fruits.length >= BERRY_REED_MAX_FRUITS) break;
    }
  }

  #tryGetNestbrushEggPlacement(speciesId) {
    if (speciesId !== LAB_MINNOW_SPECIES_ID || !this.nestbrush) {
      return { protected: false, x: null, y: null, attachment: null };
    }

    const capacity = this.getNestbrushCapacity(this.nestbrush.stage);
    const occupied = this.eggs.filter((egg) => egg?.state === 'INCUBATING' && egg?.isProtectedByNestbrush).length;
    if (occupied >= capacity) return { protected: false, x: null, y: null, attachment: null };

    const branchCount = 5 + (this.nestbrush.stage - 1) * 2;
    const attachment = {
      branchIndex: Math.floor(rand(0, branchCount)),
      u: rand(0.34, 0.92),
      v: rand(-4, 4)
    };
    const position = this.getNestbrushEggWorldPosition({ nestbrushAttachment: attachment });

    return {
      protected: true,
      x: position?.x ?? this.nestbrush.x,
      y: position?.y ?? (this.nestbrush.bottomY - this.nestbrush.height * 0.55),
      attachment
    };
  }

  getNestbrushEggWorldPosition(egg, timeSec = this.simTimeSec) {
    if (!this.nestbrush || !egg?.nestbrushAttachment) return null;
    const branchPose = this.getNestbrushBranchPose(egg.nestbrushAttachment.branchIndex, timeSec);
    if (!branchPose) return null;

    const u = clamp(egg.nestbrushAttachment.u ?? 0.7, 0.1, 0.95);
    const v = clamp(egg.nestbrushAttachment.v ?? 0, -8, 8);
    const branchX = branchPose.startX + (branchPose.endX - branchPose.startX) * u;
    const branchY = branchPose.startY + (branchPose.endY - branchPose.startY) * u;
    const angle = Math.atan2(branchPose.endY - branchPose.startY, branchPose.endX - branchPose.startX);

    return {
      x: branchX - Math.sin(angle) * v,
      y: branchY + Math.cos(angle) * v
    };
  }

  getNestbrushBranchPose(branchIndex = 0, timeSec = this.simTimeSec) {
    if (!this.nestbrush) return null;
    const stage = clamp(this.nestbrush.stage ?? 1, 1, NESTBRUSH_MAX_STAGE);
    const branchCount = 5 + (stage - 1) * 2;
    const index = Math.max(0, Math.floor(branchIndex) % branchCount);
    const side = index % 2 === 0 ? -1 : 1;
    const tier = Math.floor(index / 2);
    const spreadX = 14 + (stage - 1) * 11;
    const spreadY = this.nestbrush.height * (0.18 + (stage - 1) * 0.05);
    const sway = Math.sin(timeSec * (this.nestbrush.swayRate ?? 0.001) + (this.nestbrush.swayPhase ?? 0)) * 4;
    const localSway = Math.sin(timeSec * ((this.nestbrush.swayRate ?? 0.001) * 2.4) + index * 0.9) * 1.7;

    const centerY = this.nestbrush.bottomY - this.nestbrush.height * 0.38;
    const laneY = (tier - (branchCount - 1) * 0.25) * (spreadY / Math.max(1, branchCount * 0.5));
    const startX = this.nestbrush.x + side * spreadX * 0.18 + sway * 0.45;
    const startY = centerY + laneY;

    const branchLen = spreadX * (0.55 + (tier % 3) * 0.12);
    const endX = startX + side * branchLen + localSway;
    const endY = startY + Math.sin(index * 1.17 + stage * 0.8) * 0.9 - this.nestbrush.height * 0.02;
    return { startX, startY, endX, endY };
  }

  #updateNestbrush(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !this.nestbrush) return;

    const hygiene01 = this.water?.hygiene01 ?? 1;
    if (hygiene01 < NESTBRUSH_GROWTH_MIN_HYGIENE01) return;
    if (this.nestbrush.stage >= NESTBRUSH_MAX_STAGE) {
      this.nestbrush.growthProgressSec = Math.min(this.nestbrush.growthProgressSec ?? 0, NESTBRUSH_STAGE_GROWTH_SEC);
      return;
    }

    this.nestbrush.growthProgressSec = (this.nestbrush.growthProgressSec ?? 0) + dt;
    while (this.nestbrush.growthProgressSec >= NESTBRUSH_STAGE_GROWTH_SEC && this.nestbrush.stage < NESTBRUSH_MAX_STAGE) {
      this.nestbrush.growthProgressSec -= NESTBRUSH_STAGE_GROWTH_SEC;
      this.nestbrush.stage += 1;
    }
  }

  #seedBubbles() {
    const count = CONFIG.world.bubbles.seedCount;
    this.bubbles = Array.from({ length: count }, () => makeBubble(this.bounds));
  }

  #updateBubbles(delta) {
    const { width, height } = this.bounds;

    for (const food of this.food) {
      food.x = Math.min(Math.max(0, food.x), width);
      food.y = Math.min(Math.max(0, food.y), Math.max(0, this.#swimHeight()));
    }

    for (const poop of this.poop) {
      poop.x = Math.min(Math.max(0, poop.x), width);
      poop.y = Math.min(Math.max(0, poop.y), Math.max(0, this.#swimHeight()));
    }

    for (const bubble of this.bubbles) {
      bubble.y -= bubble.speed * delta;
      bubble.swayPhase += delta;
      bubble.x += Math.sin(bubble.swayPhase) * bubble.swayAmplitude * delta;

      if (bubble.y < -10) {
        bubble.y = height + rand(8, 80);
        bubble.x = rand(0, width);
      }
      if (bubble.x < 0) bubble.x += width;
      if (bubble.x > width) bubble.x -= width;
    }
  }
}
