import { CONFIG } from '../config.js';

const TAU = CONFIG.fish.tau;
const MAX_TILT = CONFIG.fish.maxTiltRad;
const TARGET_REACHED_RADIUS = CONFIG.fish.targetReachedRadius;
const FACE_SWITCH_COS = CONFIG.fish.faceSwitchCos;
const MAX_TURN_RATE = CONFIG.fish.maxTurnRate;
const DESIRED_TURN_RATE = CONFIG.fish.desiredTurnRate;
const SPEED_MULTIPLIER = CONFIG.fish.speedMultiplier;
const FOOD_REACH_RADIUS = CONFIG.fish.foodReachRadius;
const DEAD_SINK_SPEED = CONFIG.fish.deadSinkSpeed;
const METABOLISM_COST_PER_PIXEL = CONFIG.fish.metabolism.costPerPixel;
const HUNGRY_THRESHOLD = CONFIG.fish.hunger.hungryThreshold;
const STARVING_THRESHOLD = CONFIG.fish.hunger.starvingThreshold;
const FOOD_VISION_RADIUS = CONFIG.fish.hunger.foodVisionRadius;
const FOOD_SPEED_BOOST = CONFIG.fish.hunger.foodSpeedBoost;
const SEEK_FORCE_MULTIPLIER = CONFIG.fish.hunger.seekForceMultiplier ?? 2.0;
const PLAY_SPEED_BOOST = 1.45;
const PLAY_RUNNER_SPEED_BOOST = 1.18;

const AGE_CONFIG = CONFIG.fish.age;
const GROWTH_CONFIG = CONFIG.fish.growth;
const MORPH = CONFIG.fish.morph;
const STAGE_SPEED = CONFIG.fish.stageSpeed;
const WATER_WELLBEING = CONFIG.fish.waterWellbeing ?? {};
const WATER_STRESS_START_HYGIENE01 = Math.max(0.05, Math.min(1, WATER_WELLBEING.stressStartHygiene01 ?? 0.7));
const WATER_STRESS_CURVE_POWER = Math.max(1, WATER_WELLBEING.stressCurvePower ?? 1.35);
const WATER_STRESS_PER_SEC = Math.max(0, WATER_WELLBEING.stressPerSec ?? 0.006);
const WATER_AGE_SENSITIVITY_MIN = Math.max(0, WATER_WELLBEING.ageSensitivityMin ?? 1);
const WATER_AGE_SENSITIVITY_EDGE_BOOST = Math.max(0, WATER_WELLBEING.ageSensitivityEdgeBoost ?? 0.6);
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const HOVER_CONFIG = CONFIG.fish.hover ?? {};
const HOVER_MIN_SEC = Math.max(0, HOVER_CONFIG.minSec ?? 0.6);
const HOVER_MAX_SEC = Math.max(HOVER_MIN_SEC, HOVER_CONFIG.maxSec ?? 2.0);
const HOVER_COOLDOWN_MIN_SEC = Math.max(0, HOVER_CONFIG.cooldownMinSec ?? 30.0);
const HOVER_COOLDOWN_MAX_SEC = Math.max(HOVER_COOLDOWN_MIN_SEC, HOVER_CONFIG.cooldownMaxSec ?? 60.0);
const HOVER_CHANCE_PER_CHECK = clamp(HOVER_CONFIG.chancePerCheck ?? 0.85, 0, 1);
const HOVER_WALL_MARGIN_PX = Math.max(0, HOVER_CONFIG.wallMarginPx ?? 20);
const HOVER_OFFSET_MIN_PX = Math.max(0, HOVER_CONFIG.offsetMinPx ?? 8);
const HOVER_OFFSET_MAX_PX = Math.max(HOVER_OFFSET_MIN_PX, HOVER_CONFIG.offsetMaxPx ?? 18);
const HOVER_TURN_RATE_MULTIPLIER = clamp(HOVER_CONFIG.turnRateMultiplier ?? 0.2, 0.01, 1);
const HOVER_SPEED_FACTOR = clamp(HOVER_CONFIG.speedFactor ?? 0.15, 0.01, 1);

const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const deepCopyPlain = (value) => {
  if (Array.isArray(value)) return value.map((entry) => deepCopyPlain(entry));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = deepCopyPlain(entry);
    return out;
  }
  return value;
};

export const FISH_SAVE_KEYS = [
  'id',
  'name',
  'spawnTimeSec',
  'stageShiftBabySec',
  'stageShiftJuvenileSec',
  'traits',
  'position',
  'facing',
  'headingAngle',
  'desiredAngle',
  'currentSpeed',
  'cruisePhase',
  'cruiseRate',
  'target',
  'sex',
  'energy01',
  'hunger01',
  'wellbeing01',
  'waterPenalty01',
  'hungerState',
  'lifeState',
  'deathReason',
  'deadAtSec',
  'skeletonAtSec',
  'corpseRemoved',
  'corpseDirtApplied01',
  'behavior',
  'eatAnimTimer',
  'eatAnimDuration',
  'playState',
  'repro',
  'matingAnim',
  'digestBites',
  'history'
];
// Smooth-ish ease for growth transitions.
const easeInOut = (t) => t * t * (3 - 2 * t);

function normalizeAngle(angle) {
  let out = angle;
  while (out <= -Math.PI) out += TAU;
  while (out > Math.PI) out -= TAU;
  return out;
}

function shortestAngleDelta(from, to) {
  return normalizeAngle(to - from);
}

function moveTowardsAngle(current, target, maxStep) {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(delta) * maxStep);
}

function resolveFacingByCos(angle, previousFacing) {
  const cosValue = Math.cos(angle);
  if (cosValue > FACE_SWITCH_COS) return 1;
  if (cosValue < -FACE_SWITCH_COS) return -1;
  return previousFacing;
}

function clampAngleForFacing(angle, facing) {
  const base = facing === -1 ? Math.PI : 0;
  const relative = normalizeAngle(angle - base);
  return normalizeAngle(base + clamp(relative, -MAX_TILT, MAX_TILT));
}

export class Fish {
  constructor(bounds, options = {}) {
    this.bounds = bounds;

    this.id = options.id ?? 0;
    this.name = '';
    this.spawnTimeSec = options.spawnTimeSec ?? 0;

    // --- Life-cycle randoms (set once at birth) ---
    const sizeRange = GROWTH_CONFIG.sizeFactorRange;
    const growthRange = GROWTH_CONFIG.growthRateRange;

    const baseTraits = {
      colorHue: options.colorHue ?? rand(8, 42),
      sizeFactor: options.sizeFactor ?? rand(sizeRange.min, sizeRange.max),
      growthRate: options.growthRate ?? rand(growthRange.min, growthRange.max),
      lifespanSec: null,
      speedFactor: options.speedFactor ?? rand(0.42, 0.68)
    };

    const lifeMean = AGE_CONFIG.lifespanMeanSec;
    const lifeJitter = AGE_CONFIG.lifespanJitterSec;
    baseTraits.lifespanSec = options.lifespanSec ?? rand(lifeMean - lifeJitter, lifeMean + lifeJitter);
    this.traits = {
      ...baseTraits,
      ...(options.traits ?? {})
    };
    // Backward compatibility for existing usage paths while traits are adopted.
    Object.assign(this, this.traits);

    this.adultRadius = GROWTH_CONFIG.adultRadius * this.traits.sizeFactor;

    const stageJitter = AGE_CONFIG.stageJitterSec;
    this.stageShiftBabySec = options.stageShiftBabySec ?? rand(-stageJitter, stageJitter);
    this.stageShiftJuvenileSec = options.stageShiftJuvenileSec ?? rand(-stageJitter, stageJitter);

    // Current visual radius (updated each tick by updateLifeCycle()).
    // Start small at birth.
    this.size = this.adultRadius * GROWTH_CONFIG.birthScale;
    this.lifeStage = 'BABY';
    this.growth01 = 0;
    this.ageSecCached = 0;
    this.position = options.position
      ? { x: options.position.x, y: options.position.y }
      : { x: bounds.width * 0.5, y: bounds.height * 0.5 };

    this.facing = Math.random() < 0.5 ? -1 : 1;
    const initialHeading = options.headingAngle ?? (this.facing === -1 ? Math.PI : 0);
    this.facing = resolveFacingByCos(initialHeading, this.facing);

    this.headingAngle = clampAngleForFacing(initialHeading, this.facing);
    this.desiredAngle = this.headingAngle;

    this.currentSpeed = this.#baseSpeed() * rand(0.9, 1.06);
    this.cruisePhase = rand(0, TAU);
    this.cruiseRate = rand(0.35, 0.7);

    this.target = this.#pickTarget();
    this.lastDistanceMoved = 0;

    this.sex = Math.random() < 0.5 ? 'female' : 'male';
    this.energy01 = 1;
    this.hunger01 = 0;
    this.wellbeing01 = 1;
    this.waterPenalty01 = 0;
    this.hungerState = 'FED';
    this.lifeState = 'ALIVE';
    this.deathReason = null;
    this.deadAtSec = null;
    this.skeletonAtSec = null;
    this.corpseRemoved = false;
    this.corpseDirtApplied01 = 0;
    this.behavior = { mode: 'wander', targetFoodId: null, speedBoost: 1 };
    this.eatAnimTimer = 0;
    this.eatAnimDuration = 0.22;

    this.playState = {
      sessionId: null,
      activeUntilSec: 0,
      targetFishId: null,
      role: 'NONE',
      startedNearAlgae: false,
      cooldownUntilSec: 0
    };

    this.repro = {
      state: 'READY',
      dueAtSec: null,
      cooldownUntilSec: 0,
      fatherId: null,
      layTargetX: null,
      layTargetY: null,
      pregnancyStartSec: null,
      layingStartedAtSec: null
    };

    this.matingAnim = null;
    this.digestBites = Math.max(0, Math.floor(options.digestBites ?? 0));

    this.hoverUntilSec = 0;
    this.nextHoverEligibleAtSimSec = rand(HOVER_COOLDOWN_MIN_SEC, HOVER_COOLDOWN_MAX_SEC);
    this.hoverAnchor = null;
    this.hoverOffset = null;

    this.history = {
      motherId: options.history?.motherId ?? null,
      fatherId: options.history?.fatherId ?? null,
      childrenIds: Array.isArray(options.history?.childrenIds) ? [...options.history.childrenIds] : [],
      bornInAquarium: Boolean(options.history?.bornInAquarium ?? false),
      birthSimTimeSec: Number.isFinite(options.history?.birthSimTimeSec) ? options.history.birthSimTimeSec : 0,
      deathSimTimeSec: Number.isFinite(options.history?.deathSimTimeSec) ? options.history.deathSimTimeSec : null,
      mealsEaten: Math.max(0, Math.floor(options.history?.mealsEaten ?? 0)),
      mateCount: Math.max(0, Math.floor(options.history?.mateCount ?? 0))
    };

    // Cached reference for pursuit updates (set during decideBehavior).
    this._worldRef = null;
  }

  toJSON() {
    const out = {};
    for (const key of FISH_SAVE_KEYS) out[key] = deepCopyPlain(this[key]);
    return out;
  }

  static fromJSON(data, bounds) {
    const source = data && typeof data === 'object' ? data : {};
    const traits = source.traits && typeof source.traits === 'object' ? deepCopyPlain(source.traits) : {};
    const history = source.history && typeof source.history === 'object' ? deepCopyPlain(source.history) : {};
    const fish = new Fish(bounds, {
      id: Number.isFinite(source.id) ? source.id : 0,
      spawnTimeSec: Number.isFinite(source.spawnTimeSec) ? source.spawnTimeSec : 0,
      stageShiftBabySec: Number.isFinite(source.stageShiftBabySec) ? source.stageShiftBabySec : undefined,
      stageShiftJuvenileSec: Number.isFinite(source.stageShiftJuvenileSec) ? source.stageShiftJuvenileSec : undefined,
      position: source.position && Number.isFinite(source.position.x) && Number.isFinite(source.position.y)
        ? { x: source.position.x, y: source.position.y }
        : undefined,
      headingAngle: Number.isFinite(source.headingAngle) ? source.headingAngle : undefined,
      traits,
      history
    });

    for (const key of FISH_SAVE_KEYS) {
      if (source[key] === undefined) continue;
      fish[key] = deepCopyPlain(source[key]);
    }

    fish.name = typeof fish.name === 'string' ? fish.name : '';
    fish.sex = fish.sex === 'female' || fish.sex === 'male' ? fish.sex : 'female';
    fish.energy01 = clamp01(Number.isFinite(fish.energy01) ? fish.energy01 : 1);
    fish.hunger01 = clamp01(Number.isFinite(fish.hunger01) ? fish.hunger01 : 0);
    fish.wellbeing01 = clamp01(Number.isFinite(fish.wellbeing01) ? fish.wellbeing01 : 1);
    fish.waterPenalty01 = clamp01(Number.isFinite(fish.waterPenalty01) ? fish.waterPenalty01 : 0);
    fish.digestBites = Math.max(0, Math.floor(fish.digestBites ?? 0));

    if (!fish.position || !Number.isFinite(fish.position.x) || !Number.isFinite(fish.position.y)) {
      fish.position = { x: bounds.width * 0.5, y: bounds.height * 0.5 };
    }
    fish.setBounds(bounds);
    fish.updateLifeCycle(Math.max(0, Number.isFinite(source.spawnTimeSec) ? source.spawnTimeSec : 0));

    return fish;
  }

  setBounds(bounds) {
    this.bounds = bounds;
    const movement = this.#movementBounds();
    this.position.x = clamp(this.position.x, movement.minX, movement.maxX);
    this.position.y = clamp(this.position.y, movement.minY, movement.maxY);
    if (!this.#isTargetInBounds(this.target)) this.target = this.#pickTarget();
  }

  heading() {
    const stableFacing = resolveFacingByCos(this.headingAngle, this.facing);
    this.facing = stableFacing;

    const base = stableFacing === -1 ? Math.PI : 0;
    const localTilt = clamp(normalizeAngle(this.headingAngle - base), -MAX_TILT, MAX_TILT);

    return { tilt: localTilt, facing: stableFacing };
  }

  updateMetabolism(dt, world) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    this.eatAnimTimer = Math.max(0, this.eatAnimTimer - dt);

    if (this.lifeState !== 'ALIVE') {
      this.energy01 = 0;
      this.hunger01 = 1;
      this.wellbeing01 = 0;
      this.hungerState = 'DEAD';
      this.matingAnim = null;
      return;
    }

    const energyDelta = this.lastDistanceMoved * METABOLISM_COST_PER_PIXEL;
    this.energy01 = clamp(this.energy01 - energyDelta, 0, 1);
    this.hunger01 = 1 - this.energy01;
    const baseWellbeingFromHunger = clamp(1 - this.hunger01 ** 1.3, 0, 1);

    const waterHygiene01 = clamp01(world?.water?.hygiene01 ?? 1);
    const waterStress = this.#waterStressFromHygiene(waterHygiene01);
    if (waterStress > 0) {
      const ageSensitivity = this.#waterAgeSensitivity();
      const waterPenaltyDelta = WATER_STRESS_PER_SEC * waterStress * ageSensitivity * dt;
      this.waterPenalty01 = clamp(this.waterPenalty01 + waterPenaltyDelta, 0, 1);
    }

    this.wellbeing01 = clamp(baseWellbeingFromHunger - this.waterPenalty01, 0, 1);

    if (this.hunger01 >= STARVING_THRESHOLD) this.hungerState = 'STARVING';
    else if (this.hunger01 >= HUNGRY_THRESHOLD) this.hungerState = 'HUNGRY';
    else this.hungerState = 'FED';

    if (this.energy01 <= 0 && this.lifeState === 'ALIVE') {
      this.lifeState = 'DEAD';
      this.deathReason = 'STARVATION';
      this.hungerState = 'DEAD';
      this.currentSpeed = 0;
      this.behavior = { mode: 'deadSink', targetFoodId: null, speedBoost: 1 };
    }
  }

  #waterStressFromHygiene(hygiene01) {
    if (hygiene01 >= WATER_STRESS_START_HYGIENE01) return 0;
    const rawStress = (WATER_STRESS_START_HYGIENE01 - hygiene01) / WATER_STRESS_START_HYGIENE01;
    return clamp01(rawStress ** WATER_STRESS_CURVE_POWER);
  }

  #waterAgeSensitivity() {
    const ageRatio = clamp01(this.ageSecCached / Math.max(1, this.lifespanSec));
    const distanceFromMidlife = Math.abs(ageRatio - 0.5) * 2;
    const uCurve = distanceFromMidlife ** 2;
    return WATER_AGE_SENSITIVITY_MIN + WATER_AGE_SENSITIVITY_EDGE_BOOST * uCurve;
  }

  updatePlayState(simTimeSec) {
    if (!this.isPlaying(simTimeSec)) return;
    if (simTimeSec < this.playState.activeUntilSec) return;
    this.stopPlay(simTimeSec);
  }

  isPlaying(simTimeSec) {
    return this.lifeState === 'ALIVE' && this.playState.sessionId != null && simTimeSec < this.playState.activeUntilSec;
  }

  canStartPlay(simTimeSec) {
    if (this.lifeState !== 'ALIVE') return false;
    if (this.lifeStage === 'OLD') return false;
    if (this.isPlaying(simTimeSec)) return false;
    if (simTimeSec < this.playState.cooldownUntilSec) return false;
    if (this.hungerState !== 'FED') return false;
    return this.wellbeing01 >= 0.8;
  }

  startPlay({ sessionId, untilSec, role = 'CHASER', targetFishId, startedNearAlgae = false, simTimeSec = 0 }) {
    this.playState.sessionId = sessionId;
    this.playState.activeUntilSec = untilSec;
    this.playState.role = role;
    this.playState.targetFishId = targetFishId ?? null;
    this.playState.startedNearAlgae = Boolean(startedNearAlgae);
    this.wellbeing01 = clamp(this.wellbeing01 + 0.03, 0, 1);
    this.playState.cooldownUntilSec = Math.max(this.playState.cooldownUntilSec, simTimeSec + rand(5, 10));
  }

  setPlayRole(role) {
    this.playState.role = role;
  }

  setPlayTargetFish(targetFishId) {
    this.playState.targetFishId = targetFishId ?? null;
  }

  delayPlayEligibility(untilSec) {
    this.playState.cooldownUntilSec = Math.max(this.playState.cooldownUntilSec, untilSec);
  }

  stopPlay(simTimeSec = 0) {
    this.playState.sessionId = null;
    this.playState.activeUntilSec = 0;
    this.playState.role = 'NONE';
    this.playState.targetFishId = null;
    this.playState.startedNearAlgae = false;
    this.playState.cooldownUntilSec = Math.max(this.playState.cooldownUntilSec, simTimeSec + rand(5, 10));
  }

  playProbability(nearAlgae = false) {
    if (this.lifeStage === 'OLD') return 0;

    if (this.lifeStage === 'BABY') return nearAlgae ? 0.8 : 0.5;
    if (this.lifeStage === 'JUVENILE') return nearAlgae ? 0.5 : 0.4;
    if (this.lifeStage === 'ADULT') return 0.2;
    return 0;
  }

  // Keep `dt` param for future time-based behaviors (cooldowns, sensing cadence, etc.).
  decideBehavior(world, dt = 0) {
    // Cache for pursuit targeting (food moves while sinking).
    this._worldRef = world ?? null;

    if (this.lifeState !== 'ALIVE') {
      this.behavior = { mode: 'deadSink', targetFoodId: null, speedBoost: 1 };
      this.#updateHoverAfterBehavior(world?.simTimeSec ?? 0);
      return;
    }

    if (this.repro?.state === 'LAYING' && Number.isFinite(this.repro.layTargetX) && Number.isFinite(this.repro.layTargetY)) {
      this.behavior = {
        mode: 'seekLayTarget',
        targetFoodId: null,
        speedBoost: 1
      };
      this.target = { x: this.repro.layTargetX, y: this.repro.layTargetY };
      this.#updateHoverAfterBehavior(world?.simTimeSec ?? 0);
      return;
    }

    if (this.isPlaying(world?.simTimeSec ?? 0)) {
      const isRunner = this.playState.role === 'RUNNER';
      this.behavior = {
        mode: isRunner ? 'playEvade' : 'playChase',
        targetFoodId: null,
        speedBoost: isRunner ? PLAY_RUNNER_SPEED_BOOST : PLAY_SPEED_BOOST,
        targetFishId: this.playState.targetFishId
      };
      this.#updateHoverAfterBehavior(world?.simTimeSec ?? 0);
      return;
    }

    if (this.hungerState === 'FED') {
      this.behavior = { mode: 'wander', targetFoodId: null, speedBoost: 1 };
      this.#updateHoverAfterBehavior(world?.simTimeSec ?? 0);
      return;
    }

    const visibleFood = this.#findNearestFood(world?.food ?? []);
    if (!visibleFood) {
      this.behavior = { mode: 'wander', targetFoodId: null, speedBoost: 1 };
      this.#updateHoverAfterBehavior(world?.simTimeSec ?? 0);
      return;
    }

    this.behavior = {
      mode: 'seekFood',
      targetFoodId: visibleFood.id,
      speedBoost: FOOD_SPEED_BOOST[this.hungerState] ?? 1
    };
    this.target = { x: visibleFood.x, y: visibleFood.y };
    this.#updateHoverAfterBehavior(world?.simTimeSec ?? 0);
  }

  applySteering(dt) {
    if (this.behavior.mode === 'deadSink') {
      this.#applyDeadSink(dt);
      this.lastDistanceMoved = 0;
      return;
    }

    // Pursuit: keep the target synced to the pellet's *current* position.
    if (this.behavior.mode === 'seekFood' && this.behavior.targetFoodId && this._worldRef?.food) {
      const food = this._worldRef.food.find((f) => f.id === this.behavior.targetFoodId);
      if (food) this.target = { x: food.x, y: food.y };
    }

    if (this.behavior.mode === 'playChase' && this.behavior.targetFishId && this._worldRef?.fish) {
      const targetFish = this._worldRef.fish.find((f) => f.id === this.behavior.targetFishId && f.lifeState === 'ALIVE');
      if (targetFish) {
        const lookAhead = targetFish.currentSpeed * Math.min(0.35, dt * 4);
        this.target = {
          x: targetFish.position.x + Math.cos(targetFish.headingAngle) * lookAhead,
          y: targetFish.position.y + Math.sin(targetFish.headingAngle) * lookAhead
        };
      }
    }

    if (this.behavior.mode === 'playEvade' && this.behavior.targetFishId && this._worldRef?.fish) {
      const hunter = this._worldRef.fish.find((f) => f.id === this.behavior.targetFishId && f.lifeState === 'ALIVE');
      if (hunter) {
        const awayX = this.position.x - hunter.position.x;
        const awayY = this.position.y - hunter.position.y;
        const mag = Math.hypot(awayX, awayY) || 1;
        const escapeDistance = 82;
        this.target = {
          x: this.position.x + (awayX / mag) * escapeDistance,
          y: this.position.y + (awayY / mag) * escapeDistance
        };
      }
    }

    const nowSec = this._worldRef?.simTimeSec ?? 0;
    if (this.#shouldCancelHoverForUrgentGoal(nowSec)) this.cancelHover();

    const isHovering = this.#isHoverActive(nowSec);
    if (isHovering) {
      this.target = this.#hoverDesiredPos(nowSec);
    } else if (this.behavior.mode === 'wander' && this.#shouldRetarget()) {
      this.target = this.#pickTarget();
    }

    const seek = this.#seekVector();
    if (this.behavior.mode === 'seekFood') {
      // Make hungry fish look decisive.
      seek.x *= SEEK_FORCE_MULTIPLIER;
      seek.y *= SEEK_FORCE_MULTIPLIER;
    }
    const avoidance = this.#wallAvoidanceVector();
    let desiredX = seek.x + avoidance.x;
    let desiredY = seek.y + avoidance.y;

    if (this.matingAnim && this.lifeState === 'ALIVE') {
      const progress = clamp01((nowSec - this.matingAnim.startSec) / Math.max(0.001, this.matingAnim.durationSec ?? 1.1));
      if (progress >= 1) {
        this.matingAnim = null;
      } else {
        const partner = this._worldRef?.fish?.find((f) => f.id === this.matingAnim.partnerId && f.lifeState === 'ALIVE');
        if (!partner) {
          this.matingAnim = null;
        } else {
          const dx = partner.position.x - this.position.x;
          const dy = partner.position.y - this.position.y;
          const mag = Math.hypot(dx, dy);
          if (mag > 0.0001) {
            const toPartner = { x: dx / mag, y: dy / mag };
            const tangent = { x: -toPartner.y, y: toPartner.x };
            const ampPx = 5 * Math.sin(progress * Math.PI);
            let extraX = tangent.x * (ampPx * 0.8);
            let extraY = tangent.y * (ampPx * 0.8);
            const extraMag = Math.hypot(extraX, extraY);
            const maxExtra = Math.max(0.0001, this.#baseSpeed() * 0.15);
            if (extraMag > maxExtra) {
              const scale = maxExtra / extraMag;
              extraX *= scale;
              extraY *= scale;
            }
            desiredX += extraX;
            desiredY += extraY;
          }

          if (!this.matingAnim.bubbleBurstDone && progress >= 0.35) {
            this._worldRef?.spawnMatingBubbleBurst?.(this.position.x, this.position.y);
            this.matingAnim.bubbleBurstDone = true;
          }
        }
      }
    }

    const rawDesiredAngle = Math.atan2(desiredY, desiredX);
    this.facing = resolveFacingByCos(rawDesiredAngle, this.facing);

    const constrainedDesired = clampAngleForFacing(rawDesiredAngle, this.facing);
    const turnRateScale = isHovering ? HOVER_TURN_RATE_MULTIPLIER : 1;
    this.desiredAngle = moveTowardsAngle(this.desiredAngle, constrainedDesired, DESIRED_TURN_RATE * dt * turnRateScale);
    this.headingAngle = moveTowardsAngle(this.headingAngle, this.desiredAngle, MAX_TURN_RATE * dt * turnRateScale);

    this.cruisePhase = normalizeAngle(this.cruisePhase + dt * this.cruiseRate);
    const cruiseFactor = 1 + Math.sin(this.cruisePhase) * 0.18;
    const speedBoost = (this.behavior.mode === 'seekFood' || this.behavior.mode === 'playChase' || this.behavior.mode === 'playEvade' || this.behavior.mode === 'seekLayTarget') ? this.behavior.speedBoost : 1;
    const normalDesiredSpeed = this.#baseSpeed() * cruiseFactor * speedBoost;
    const desiredSpeed = isHovering ? normalDesiredSpeed * HOVER_SPEED_FACTOR : normalDesiredSpeed;
    const speedResponse = isHovering ? Math.min(1, dt * 5.2) : Math.min(1, dt * 0.8);
    this.currentSpeed += (desiredSpeed - this.currentSpeed) * speedResponse;

    if (isHovering) {
      // Keep hover visually close to "asılı" by hard-capping per-tick speed.
      const hoverSpeedCap = this.#baseSpeed() * HOVER_SPEED_FACTOR;
      this.currentSpeed = Math.min(this.currentSpeed, hoverSpeedCap);
    }

    const prevX = this.position.x;
    const prevY = this.position.y;
    this.position.x += Math.cos(this.headingAngle) * this.currentSpeed * dt;
    this.position.y += Math.sin(this.headingAngle) * this.currentSpeed * dt;

    this.#resolveCollisions();
    this.lastDistanceMoved = Math.hypot(this.position.x - prevX, this.position.y - prevY);
  }

  eat(foodAmount) {
    if (this.lifeState !== 'ALIVE') return;

    const recovered = clamp(foodAmount * 0.3, 0, 1);
    this.energy01 = clamp(this.energy01 + recovered, 0, 1);
    this.hunger01 = 1 - this.energy01;
  }

  tryConsumeFood(world) {
    if (this.behavior.mode !== 'seekFood' || !this.behavior.targetFoodId) return;
    const targetFood = world?.food?.find((entry) => entry.id === this.behavior.targetFoodId);
    if (!targetFood) return;

    const head = this.headPoint();
    const distHead = Math.hypot(targetFood.x - head.x, targetFood.y - head.y);
    const distBody = Math.hypot(targetFood.x - this.position.x, targetFood.y - this.position.y);
    const nearBottom = targetFood.y >= this.bounds.height - 8;
    const reachRadius = nearBottom ? FOOD_REACH_RADIUS * 1.7 : FOOD_REACH_RADIUS;
    if (Math.min(distHead, distBody) > reachRadius) return;

    // Single bite: pellet disappears in one bite.
    // Satiety remains partial (eat() scales recovery), so fish may continue seeking.
    const consumed = world.consumeFood(targetFood.id, targetFood.amount);
    if (consumed <= 0) return;
    this.eatAnimTimer = this.eatAnimDuration;
    this.eat(consumed);
    this.history.mealsEaten += 1;
    this.digestBites += 1;
    if (this.lifeState !== 'ALIVE') return;

    if (this.digestBites >= 2) {
      this.digestBites = 0;
      world.schedulePoopFromFish?.(this.id, rand(5, 10));
    }
  }



  updateLifeCycle(simTimeSec) {
    // Keep cached values for renderer/UI without requiring extra parameters elsewhere.
    const ageSec = Math.max(0, simTimeSec - this.spawnTimeSec);
    this.ageSecCached = ageSec;

    // Stage thresholds with per-fish shifts (avoid sync).
    const baseBabyEnd = AGE_CONFIG.stageBaseSec.babyEndSec;
    const baseJuvenileEnd = AGE_CONFIG.stageBaseSec.juvenileEndSec;

    let babyEnd = Math.max(30, baseBabyEnd + this.stageShiftBabySec);
    let juvenileEnd = Math.max(babyEnd + 60, baseJuvenileEnd + this.stageShiftJuvenileSec);

    // Effective age controls growth pace.
    const effectiveAge = ageSec * this.growthRate;

    // Stage selection (age-based, not hunger-based).
    const oldStart = this.lifespanSec * AGE_CONFIG.oldStartRatio;

    let stage = 'ADULT';
    if (effectiveAge < babyEnd) stage = 'BABY';
    else if (effectiveAge < juvenileEnd) stage = 'JUVENILE';
    else if (ageSec >= oldStart) stage = 'OLD';

    this.lifeStage = stage;

    // Smooth growth from birthScale -> 1.0 until "adult" threshold.
    const adultAgeSec = juvenileEnd;
    const t = clamp01(effectiveAge / adultAgeSec);
    this.growth01 = t;

    const eased = easeInOut(t);
    const scale = lerp(GROWTH_CONFIG.birthScale, 1, eased);
    this.size = this.adultRadius * scale;

    // Natural death by lifespan (simple baseline; later we can switch to probabilistic old-age death).
    if (this.lifeState === 'ALIVE' && ageSec >= this.lifespanSec) {
      this.lifeState = 'DEAD';
      this.deathReason = 'OLD_AGE';
      this.hungerState = 'DEAD';
      this.currentSpeed = 0;
      this.behavior = { mode: 'deadSink', targetFoodId: null, speedBoost: 1 };
    }
  }

  lifeStageLabel() {
    switch (this.lifeStage) {
      case 'BABY': return 'Baby';
      case 'JUVENILE': return 'Juvenile';
      case 'ADULT': return 'Adult';
      case 'OLD': return 'Old';
      default: return String(this.lifeStage ?? '');
    }
  }

  getRenderParams() {
    const morph = MORPH[this.lifeStage] ?? MORPH.ADULT;
    // Condition affects "plumpness" and saturation a bit (middle-road model).
    const condition01 = clamp01(1 - this.hunger01 * 0.9);

    const bodyLength = this.size * 1.32 * morph.bodyLength;
    const bodyHeight = this.size * 0.73 * morph.bodyHeight * lerp(0.92, 1.06, condition01);
    const tailWagAmp = this.size * 0.13 * morph.tailLength;

    return {
      radius: this.size,
      bodyLength,
      bodyHeight,
      tailWagAmp,
      eyeScale: morph.eye * lerp(0.95, 1.05, condition01),
      saturationMult: morph.saturation * lerp(0.92, 1.06, condition01),
      lightnessMult: morph.lightness,
      condition01
    };
  }


  pregnancySwell01(simTimeSec) {
    if (this.repro?.state !== 'GRAVID' && this.repro?.state !== 'LAYING') return 0;
    const start = this.repro?.pregnancyStartSec;
    const due = this.repro?.dueAtSec;
    if (!Number.isFinite(start) || !Number.isFinite(due) || due <= start) return 0;
    const p = clamp01((simTimeSec - start) / (due - start));
    return 0.10 * Math.sin(p * Math.PI);
  }

  ageSeconds(simTimeSec) {
    return Math.max(0, simTimeSec - this.spawnTimeSec);
  }

  getLifeTimeSec(nowSec) {
    const birth = Number.isFinite(this.history?.birthSimTimeSec) ? this.history.birthSimTimeSec : 0;
    const death = this.history?.deathSimTimeSec;
    if (Number.isFinite(death)) return Math.max(0, death - birth);
    return Math.max(0, nowSec - birth);
  }

  mouthOpen01() {
    if (this.eatAnimTimer <= 0) return 0;
    const progress = 1 - this.eatAnimTimer / this.eatAnimDuration;
    return Math.sin(progress * Math.PI);
  }

  isHovering(nowSec) {
    return this.#isHoverActive(nowSec);
  }

  headPoint() {
    const bodyLength = this.size * 1.32;
    const headOffset = bodyLength * 0.22;
    return {
      x: this.position.x + Math.cos(this.headingAngle) * headOffset,
      y: this.position.y + Math.sin(this.headingAngle) * headOffset
    };
  }

  debugMovementBounds() {
    const movement = this.#movementBounds();
    return {
      x: movement.minX,
      y: movement.minY,
      width: movement.maxX - movement.minX,
      height: movement.maxY - movement.minY
    };
  }

  #baseSpeed() {
    const stageMul = STAGE_SPEED[this.lifeStage] ?? 1;
    return (20 + this.size * 0.9 * this.speedFactor) * SPEED_MULTIPLIER * stageMul;
  }

  #findNearestFood(foodList) {
    const visionRadius = FOOD_VISION_RADIUS[this.hungerState] ?? 0;
    if (visionRadius <= 0) return null;

    let best = null;
    let bestDist = Infinity;

    for (const food of foodList) {
      const dist = Math.hypot(food.x - this.position.x, food.y - this.position.y);
      if (dist > visionRadius || dist >= bestDist) continue;
      best = food;
      bestDist = dist;
    }

    return best;
  }

  #applyDeadSink(dt) {
    const movement = this.#movementBounds();
    this.currentSpeed = 0;
    this.desiredAngle = Math.PI / 2;
    this.headingAngle = this.desiredAngle;

    this.position.y = Math.min(movement.maxY, this.position.y + DEAD_SINK_SPEED * dt);
    this.position.x = clamp(this.position.x, movement.minX, movement.maxX);
  }

  #movementBounds() {
    const margin = this.size * 0.62;
    const bottomOffset = Math.max(2, this.size * 0.18);
    const maxY = Math.max(margin, this.bounds.height - bottomOffset);

    return {
      minX: margin,
      maxX: Math.max(margin, this.bounds.width - margin),
      minY: margin,
      maxY
    };
  }

  #hoverSafeBounds() {
    const movement = this.#movementBounds();
    const minX = movement.minX + HOVER_WALL_MARGIN_PX;
    const maxX = movement.maxX - HOVER_WALL_MARGIN_PX;
    const minY = movement.minY + HOVER_WALL_MARGIN_PX;
    const maxY = movement.maxY - HOVER_WALL_MARGIN_PX;

    return {
      minX: minX <= maxX ? minX : movement.minX,
      maxX: minX <= maxX ? maxX : movement.maxX,
      minY: minY <= maxY ? minY : movement.minY,
      maxY: minY <= maxY ? maxY : movement.maxY
    };
  }

  #isAwayFromHoverWalls() {
    const safe = this.#hoverSafeBounds();
    return this.position.x >= safe.minX
      && this.position.x <= safe.maxX
      && this.position.y >= safe.minY
      && this.position.y <= safe.maxY;
  }

  #isHoverEligible() {
    if (this.lifeState !== 'ALIVE') return false;
    if ((this.eatAnimTimer ?? 0) > 0) return false;
    if (this.behavior?.mode !== 'wander') return false;
    if (this.behavior?.targetFoodId) return false;
    if (this.hungerState === 'HUNGRY' || this.hungerState === 'STARVING') return false;
    if (this.isPlaying(this._worldRef?.simTimeSec ?? 0)) return false;
    if (this.repro?.state === 'LAYING' || this.repro?.state === 'GRAVID') return false;
    if (this.matingAnim) return false;
    if (!this.#isAwayFromHoverWalls()) return false;
    return true;
  }

  #isHoverActive(nowSec) {
    if (!Number.isFinite(nowSec)) return false;
    if (!this.hoverAnchor) return false;
    if (nowSec >= this.hoverUntilSec) {
      this.cancelHover();
      return false;
    }
    return true;
  }

  #shouldCancelHoverForUrgentGoal(nowSec) {
    if (!this.#isHoverActive(nowSec)) return false;
    if (this.lifeState !== 'ALIVE') return true;
    if ((this.eatAnimTimer ?? 0) > 0) return true;
    if (this.behavior?.mode === 'seekFood' || this.behavior?.targetFoodId) return true;
    if (this.behavior?.mode === 'playChase' || this.behavior?.mode === 'playEvade') return true;
    if (this.isPlaying(nowSec)) return true;
    if (this.repro?.state === 'LAYING' || this.repro?.state === 'GRAVID') return true;
    if (this.matingAnim) return true;
    return false;
  }

  #hoverDesiredPos() {
    const anchor = this.hoverAnchor ?? this.position;
    const offset = this.hoverOffset ?? { x: 0, y: 0 };
    const safe = this.#hoverSafeBounds();
    return {
      x: clamp(anchor.x + offset.x, safe.minX, safe.maxX),
      y: clamp(anchor.y + offset.y, safe.minY, safe.maxY)
    };
  }

  #pickHoverOffset() {
    const angle = rand(0, TAU);
    const radius = rand(HOVER_OFFSET_MIN_PX, HOVER_OFFSET_MAX_PX);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  #updateHoverSchedule(nowSec) {
    if (!Number.isFinite(nowSec) || nowSec < this.nextHoverEligibleAtSimSec) return;

    if (!this.#isHoverEligible()) return;
    if (Math.random() >= HOVER_CHANCE_PER_CHECK) {
      this.nextHoverEligibleAtSimSec = nowSec + rand(3, 8);
      return;
    }

    this.hoverUntilSec = nowSec + rand(HOVER_MIN_SEC, HOVER_MAX_SEC);
    this.hoverAnchor = { x: this.position.x, y: this.position.y };
    this.hoverOffset = this.#pickHoverOffset();
  }

  #updateHoverAfterBehavior(nowSec) {
    if (this.#shouldCancelHoverForUrgentGoal(nowSec)) this.cancelHover();
    this.#updateHoverSchedule(nowSec);
  }

  cancelHover() {
    if (Number.isFinite(this._worldRef?.simTimeSec)) {
      this.nextHoverEligibleAtSimSec = this._worldRef.simTimeSec + rand(HOVER_COOLDOWN_MIN_SEC, HOVER_COOLDOWN_MAX_SEC);
    }
    this.hoverUntilSec = 0;
    this.hoverAnchor = null;
    this.hoverOffset = null;
  }

  #pickTarget() {
    const inset = clamp(Math.min(this.bounds.width, this.bounds.height) * 0.04, 8, 18);
    const swimHeight = Math.max(inset, this.bounds.height - inset);

    return {
      x: rand(inset, Math.max(inset, this.bounds.width - inset)),
      y: rand(inset, Math.max(inset, swimHeight))
    };
  }

  #isTargetInBounds(target) {
    if (!target) return false;
    return target.x >= 0 && target.x <= this.bounds.width && target.y >= 0 && target.y <= this.bounds.height;
  }

  #shouldRetarget() {
    const dist = Math.hypot(this.target.x - this.position.x, this.target.y - this.position.y);
    if (dist <= TARGET_REACHED_RADIUS) return true;
    return Math.random() < 0.0025;
  }

  #seekVector() {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const mag = Math.hypot(dx, dy) || 1;
    return { x: dx / mag, y: dy / mag };
  }

  #wallAvoidanceVector() {
    const movement = this.#movementBounds();
    const influence = clamp(Math.min(this.bounds.width, this.bounds.height) * 0.22, 45, 110);
    const strength = 2.2;

    let ax = 0;
    let ay = 0;

    const dLeft = this.position.x - movement.minX;
    const dRight = movement.maxX - this.position.x;
    const dTop = this.position.y - movement.minY;
    const dBottom = movement.maxY - this.position.y;

    if (dLeft < influence) ax += ((influence - dLeft) / influence) ** 2 * strength;
    if (dRight < influence) ax -= ((influence - dRight) / influence) ** 2 * strength;
    if (dTop < influence) ay += ((influence - dTop) / influence) ** 2 * strength;
    if (dBottom < influence) ay -= ((influence - dBottom) / influence) ** 2 * strength;

    return { x: ax, y: ay };
  }

  #resolveCollisions() {
    const movement = this.#movementBounds();

    let hitX = false;
    let hitY = false;

    if (this.position.x <= movement.minX) {
      this.position.x = movement.minX;
      hitX = true;
    } else if (this.position.x >= movement.maxX) {
      this.position.x = movement.maxX;
      hitX = true;
    }

    if (this.position.y <= movement.minY) {
      this.position.y = movement.minY;
      hitY = true;
    } else if (this.position.y >= movement.maxY) {
      this.position.y = movement.maxY;
      hitY = true;
    }

    if (hitX) this.headingAngle = Math.PI - this.headingAngle;
    if (hitY) this.headingAngle = -this.headingAngle;

    if (hitX || hitY) {
      this.facing = resolveFacingByCos(this.headingAngle, this.facing);
      this.headingAngle = clampAngleForFacing(this.headingAngle, this.facing);
      this.desiredAngle = this.headingAngle;
      this.target = this.#pickTarget();
      this.currentSpeed = Math.max(this.currentSpeed, this.#baseSpeed() * 0.95);
    }
  }
}
