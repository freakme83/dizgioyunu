/**
 * Centralized configuration for the aquarium simulation.
 *
 * Goal: keep tuning knobs in one place so new systems (poop, hygiene, age,
 * reproduction) can be added without scattering constants across files.
 */

export const CONFIG = Object.freeze({
  FEMALE_NAME_POOL: [
    'Alice', 'Amelia', 'Aria', 'Ava', 'Bella', 'Chloe', 'Clara', 'Daisy', 'Eleanor', 'Ella',
    'Emily', 'Emma', 'Eva', 'Grace', 'Hannah', 'Harper', 'Hazel', 'Ivy', 'Isla', 'Lily',
    'Lucy', 'Maya', 'Mia', 'Nora', 'Olivia', 'Ruby', 'Scarlett', 'Sofia', 'Sophia', 'Zoe',

    'Camila', 'Isabella', 'Valentina', 'Lucia', 'Gabriela', 'Mariana', 'Daniela', 'Ana', 'Bianca', 'Renata',
    'Elena', 'Chiara', 'Giulia', 'Francesca', 'Ines', 'Amina', 'Layla', 'Yara', 'Leila', 'Zara',

    'Freya', 'Astrid', 'Ingrid', 'Sigrid', 'Anouk', 'Maelle', 'Noemi', 'Klara', 'Petra', 'Anastasia',
    'Mila', 'Nina', 'Katarina', 'Alina', 'Ivana', 'Daria', 'Anya', 'Sakura', 'Yuki', 'Mei',

    'Aisha', 'Fatima', 'Samira', 'Imani', 'Zainab', 'Nadia', 'Soraya', 'Naomi', 'Talia', 'Mira',
    'Amara', 'Esme', 'Elisa', 'Luna', 'Aurora', 'Selena', 'Rhea', 'Tessa', 'Vera', 'Iris',

    'Kira', 'Lena', 'Mara', 'Helena', 'Alba', 'Celine', 'Rosa', 'Mina', 'Jasmine', 'Allegra',
    'Seyma', 'Nese', 'Hatice', 'Gozde', 'Belgin', 'Rahime'
  ],

  MALE_NAME_POOL: [
    'Liam', 'Noah', 'Oliver', 'Elijah', 'James', 'William', 'Benjamin', 'Lucas', 'Henry', 'Alexander',
    'Jack', 'Leo', 'Theodore', 'Sebastian', 'Daniel', 'Matthew', 'Joseph', 'David', 'Samuel', 'Owen',
    'Julian', 'Isaac', 'Ethan', 'Caleb', 'Nathan', 'Aaron', 'Miles', 'Wyatt', 'Hudson', 'Ezra',

    'Mateo', 'Diego', 'Santiago', 'Carlos', 'Andres', 'Miguel', 'Gabriel', 'Rafael', 'Javier', 'Emilio',
    'Marco', 'Luca', 'Giovanni', 'Enzo', 'Alessandro', 'Antonio', 'Stefan', 'Milan', 'Nikola', 'Tomas',

    'Omar', 'Yusuf', 'Hassan', 'Karim', 'Malik', 'Amir', 'Zayd', 'Rami', 'Tariq', 'Samir',
    'Ibrahim', 'Idris', 'Khalil', 'Zane', 'Kenji', 'Haruto', 'Riku', 'Minho', 'Jin', 'Hiro',

    'Bjorn', 'Erik', 'Magnus', 'Soren', 'Lars', 'Aron', 'Kai', 'Noel', 'Dominik', 'Adrian',
    'Roman', 'Felix', 'Victor', 'Jonas', 'Hugo', 'Levi', 'Silas', 'Orion', 'Atlas', 'Rowan',

    'Kofi', 'Kwame', 'Zubair', 'Tenzin', 'Arjun', 'Dev', 'Rohan', 'Sahil', 'Iker', 'Thiago',
    'Onur', 'Kadir', 'Emir', 'Gokhan'
  ],

  reproduction: {
    REPRO_ENABLED: true,

    // Encounter + mating
    MATE_ENCOUNTER_RADIUS_PX: 70,
    MATE_PAIR_RETRY_MIN_SEC: 25,
    MATE_BASE_CHANCE: 0.08,
    MATE_FATHER_COOLDOWN_SEC: [120, 240],

    MATE_MIN_WELLBEING: 0.80,
    MATE_MIN_HYGIENE: 0.60,

    // Gestation + eggs
    GESTATION_SEC: [450, 540],
    EGG_INCUBATION_SEC: [180, 450],
    MOTHER_COOLDOWN_SEC: [600, 1080],
    CLUTCH_SIZE: [2, 4],

    // Genetics
    TRAIT_MUTATION_PCT: 0.05
  },

  world: {
    maxTiltRad: Math.PI / 3,
    food: {
      defaultAmount: 1,
      defaultTtlSec: 120,
      fallAccel: 8,
      fallDamping: 0.15,
      maxFallSpeed: 26
    },
    poop: {
      defaultTtlSec: 120,
      dirtPerSec: 0.00008,
      riseSpeed: 4,
      baseDriftSpeed: 4,
      driftDamping: 0.99,
      jitter: 0.04
    },
    fishLifecycle: {
      deadToSkeletonSec: 120,
      skeletonToRemoveSec: 120
    },
    bubbles: {
      seedCount: 36
    },
    // Placeholder for future global systems.
    water: {
      hygiene01: 1,
      dirt01: 0,
      POLLUTION_TINT_START: 0.90,
      POLLUTION_TINT_MAX_ALPHA: 0.13,
      POLLUTION_TINT_COLOR: '84, 112, 82',
      POLLUTION_MURK_MAX_ALPHA: 0.11,
      POLLUTION_SETTLE_MAX_ALPHA: 0.14,
      POLLUTION_SETTLE_COLOR: '74, 98, 76',
      dirtDecayPower: 1.9,
      dirtDecayStrength: 8.0,
      hygieneDropPerExpiredFood: 0.007,
      hygieneDropPerPoopSpawn: 0.002,
      referenceFishCount: 20,
      baselineDecayPerSec: 0.0002,
      bioloadDirtPerSec: 0.00028,
      dirtPerExpiredFood: 0.010,
      dirtToDecayMultiplier: 3,
      filterDirtRemovePerSec: 0.0006,
      wearBasePerSec: 0.00005,
      wearBioloadFactor: 1.0,
      wearDirtFactor: 2.5,
      bioloadMitigationFactor: 0.6,
      filterTierDirtRemovalStep: 0.25,
      filterTierBioloadStep: 0.15,
      filterTierWearStep: 0.08,
      hygieneRecoveryPerSec: 0.00006,
      filterDepletedThreshold01: 0.1,
      installDurationSec: 12,
      maintenanceDurationSec: 12,
      maintenanceCooldownSec: 25,
      maintenanceRestoreTo01: 1.0
    }
  },

  fish: {
    tau: Math.PI * 2,
    maxTiltRad: Math.PI / 3,
    targetReachedRadius: 18,
    faceSwitchCos: 0.2,
    maxTurnRate: 1.45,
    desiredTurnRate: 2.1,
    speedMultiplier: 1.5,
    foodReachRadius: 14,
    deadSinkSpeed: 30,

    metabolism: {
      costPerPixel: 0.00002
    },
    hunger: {
      hungryThreshold: 0.35,
      starvingThreshold: 0.72,
      foodVisionRadius: {
        // Tuned for 1200x700 tank: hungry fish should notice pellets from mid-range,
        // starving fish should notice from across most of the tank.
        HUNGRY: 320,
        STARVING: 650
      },
      foodSpeedBoost: {
        HUNGRY: 1.3,
        STARVING: 1.6
      },
      // Extra steering weight when actively seeking food (so wall avoidance doesn't
      // make hungry fish look "meh" about pellets).
      seekForceMultiplier: 2.4
    },

    hover: {
      minSec: 0.6,
      maxSec: 2.0,
      cooldownMinSec: 6.0,
      cooldownMaxSec: 14.0,
      chancePerCheck: 0.25,
      wallMarginPx: 20,
      driftAmpPx: 2.5,
      driftRate: 1.2,
      speedFactor: 0.08
    },

    // Life cycle & growth (age-driven growth + small per-fish randomness).
    age: {
      // Target average lifespan for the default fish type (realtime seconds).
      lifespanMeanSec: 180 * 60,
      // +/- jitter around the mean lifespan.
      lifespanJitterSec: 30 * 60,

      // Stage boundaries (base values) in realtime seconds from birth.
      // Each fish gets a small per-fish jitter so they don't all sync.
      stageBaseSec: {
        babyEndSec: 20 * 60,
        juvenileEndSec: 50 * 60
      },
      stageJitterSec: 6 * 60,

      // Old stage starts at this fraction of lifespan.
      oldStartRatio: 0.9,

      // Cap for randomized initial spawn age at game start (20 minutes).
      INITIAL_MAX_AGE_SEC: 1200
    },

    growth: {
      // Overall adult visual radius baseline (before per-fish sizeFactor).
      adultRadius: 22,
      // How small babies should be at birth (relative to adult size).
      birthScale: 0.28,

      // Per-fish variation so individuals don't look identical.
      sizeFactorRange: { min: 0.9, max: 1.1 },
      growthRateRange: { min: 0.9, max: 1.1 }
    },

    // Simple age-based morph targets for proportions (renderer uses these).
    // Values are relative multipliers around the "adult" baseline.
    morph: {
      BABY:     { bodyLength: 0.85, bodyHeight: 1.12, tailLength: 0.72, eye: 1.18, saturation: 0.85, lightness: 1.03 },
      JUVENILE: { bodyLength: 0.95, bodyHeight: 1.03, tailLength: 0.88, eye: 1.06, saturation: 0.93, lightness: 1.01 },
      ADULT:    { bodyLength: 1.00, bodyHeight: 1.00, tailLength: 1.00, eye: 1.00, saturation: 1.00, lightness: 1.00 },
      OLD:      { bodyLength: 1.03, bodyHeight: 0.92, tailLength: 0.95, eye: 0.98, saturation: 0.88, lightness: 0.96 }
    },

    // Stage-specific baseline speed multipliers (hunger still applies on top).
    stageSpeed: {
      BABY: 0.82,
      JUVENILE: 1.04,
      ADULT: 1.0,
      OLD: 0.88
    },

    waterWellbeing: {
      stressStartHygiene01: 0.7,
      stressCurvePower: 1.35,
      stressPerSec: 0.0012,
      ageSensitivityMin: 1,
      ageSensitivityEdgeBoost: 0.6
    },

  }
});

export const SPECIES = Object.freeze({
  LAB_MINNOW: Object.freeze({
    id: 'LAB_MINNOW',
    displayName: 'Lab Minnow',
    diet: ['pellet'],
    adultSizeScale: 1,
    speedScale: 1,
    lifespanScale: 1,
    reproductionScale: 1,
    clutchSizes: [2, 4],
    schooling: Object.freeze({
      enabled: false,
      biasMin: 0,
      biasMax: 0,
      soloWindowSec: [0, 0],
      soloCooldownSec: [0, 0],
      cohesion: 0,
      separation: 0,
      alignment: 0,
      neighborRadius: 0,
      separationRadius: 0,
      maxInfluence: 0
    }),
    turnRateScale: 1,
    desiredTurnRateScale: 1,
    bioloadFactor: 1,
    poopBioloadFactor: 1,
    renderStyle: 'LAB_MINNOW'
  }),
  AZURE_DART: Object.freeze({
    id: 'AZURE_DART',
    displayName: 'Azure Dart',
    diet: ['fruit'],
    adultSizeScale: 0.54,
    speedScale: 2,
    lifespanScale: 0.5,
    reproductionScale: 0.5,
    clutchSizes: [3, 4, 5],
    schooling: Object.freeze({
      enabled: true,
      biasMin: 0.62,
      biasMax: 0.96,
      soloWindowSec: [1.5, 4],
      soloCooldownSec: [10, 20],
      cohesion: 1.2,
      separation: 0.95,
      alignment: 0.95,
      neighborRadius: 150,
      separationRadius: 24,
      maxInfluence: 3.8
    }),
    turnRateScale: 1.8,
    desiredTurnRateScale: 1.7,
    bioloadFactor: 0.35,
    poopBioloadFactor: 0.25,
    renderStyle: 'AZURE_DART'
  }),
  SILT_SIFTER: Object.freeze({
    id: 'SILT_SIFTER',
    displayName: 'Silt Sifter',
    diet: ['poop', 'pellet_when_starving'],
    adultSizeScale: 0.86,
    speedScale: 0.84,
    lifespanScale: 1.3,
    reproductionScale: 1.3,
    clutchSizes: [1, 3],
    clutchWeights: [0.45, 0.45, 0.1],
    schooling: Object.freeze({
      enabled: false,
      biasMin: 0,
      biasMax: 0,
      soloWindowSec: [0, 0],
      soloCooldownSec: [0, 0],
      cohesion: 0,
      separation: 0,
      alignment: 0,
      neighborRadius: 0,
      separationRadius: 0,
      maxInfluence: 0
    }),
    turnRateScale: 1.05,
    desiredTurnRateScale: 0.94,
    bioloadFactor: 0.92,
    poopBioloadFactor: 0,
    poopEnabled: false,
    bottomDweller: Object.freeze({
      preferredBandStart01: 0.75,
      preferredBandEnd01: 1,
      steerBiasStrength: 1.9,
      scanStepXMinPx: 35,
      scanStepXMaxPx: 125,
      scanJitterYMaxPx: 18,
      probeChancePerRetarget: 0.24,
      probeDepthMinPx: 3,
      probeDepthMaxPx: 14
    }),
    renderStyle: 'SILT_SIFTER'
  })
});

export const DEFAULT_SPECIES_ID = 'LAB_MINNOW';
