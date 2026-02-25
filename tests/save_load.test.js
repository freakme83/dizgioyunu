import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { CONFIG, SPECIES } from '../src/config.js';

function withStubbedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function makeWorldForTest({ width = 800, height = 500, initialFishCount = 4, randomValue = 0.42 } = {}) {
  return withStubbedRandom(randomValue, () => new World(width, height, initialFishCount));
}

function roundTrip(world) {
  const payload = {
    saveVersion: 1,
    savedAtEpochMs: Date.now(),
    worldState: world.toJSON()
  };

  return withStubbedRandom(0.33, () => World.fromJSON(payload, {
    width: world.bounds.width,
    height: world.bounds.height,
    initialFishCount: world.initialFishCount
  }));
}

function forceFishAliveAdultFed(fish) {
  fish.lifeState = 'ALIVE';
  fish.lifeStage = 'ADULT';
  fish.hungerState = 'FED';
  fish.wellbeing01 = 1;
  fish.energy01 = 1;
  fish.hunger01 = 0;
}

test('basic world round-trip preserves core entities and indexes', () => {
  const world = makeWorldForTest();
  world.simTimeSec = 321.5;
  world.spawnFood(120, 100, 0.8, 99);
  world.spawnFood(130, 110, 0.7, 88);
  world.eggs.push({
    id: world.nextEggId++,
    x: 200,
    y: 210,
    laidAtSec: 10,
    hatchAtSec: 999,
    motherId: world.fish[0].id,
    fatherId: world.fish[1]?.id ?? null,
    motherTraits: { ...world.fish[0].traits },
    fatherTraits: { ...(world.fish[1]?.traits ?? world.fish[0].traits) },
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const world2 = roundTrip(world);

  assert.equal(world2.simTimeSec, world.simTimeSec);
  assert.equal(world2.fish.length, world.fish.length);
  assert.equal(world2.eggs.length, world.eggs.length);
  assert.equal(world2.food.length, world.food.length);

  const fishIds = world2.fish.map((fish) => fish.id);
  assert.equal(new Set(fishIds).size, fishIds.length, 'fish IDs should remain unique');
  for (const fishId of fishIds) {
    assert.ok(world2.getFishById(fishId), `fishById missing fish ${fishId}`);
  }
});

test('GRAVID state persists and progresses after load', () => {
  const world = makeWorldForTest();
  const female = world.fish.find((f) => f.sex === 'female') ?? world.fish[0];
  const male = world.fish.find((f) => f.id !== female.id) ?? world.fish[1];

  forceFishAliveAdultFed(female);
  forceFishAliveAdultFed(male);
  male.sex = 'male';
  female.sex = 'female';
  world.water.hygiene01 = 1;

  female.repro.state = 'GRAVID';
  female.repro.fatherId = male.id;
  female.repro.pregnancyStartSec = 100;
  female.repro.dueAtSec = 430;
  world.simTimeSec = 120;

  const world2 = roundTrip(world);
  const loadedFemale = world2.getFishById(female.id);

  assert.ok(loadedFemale);
  assert.equal(loadedFemale.repro.state, 'GRAVID');
  assert.equal(loadedFemale.repro.fatherId, male.id);
  assert.equal(loadedFemale.repro.pregnancyStartSec, 100);
  assert.equal(loadedFemale.repro.dueAtSec, 430);

  world2.simTimeSec = 431;
  world2.update(0.01);

  const progressedFemale = world2.getFishById(female.id);
  assert.ok(
    progressedFemale.repro.state === 'LAYING' || world2.eggs.length > 0,
    `expected LAYING or eggs after due date, got state=${progressedFemale.repro.state}`
  );
});

test('LAYING state and lay target persist', () => {
  const world = makeWorldForTest();
  const female = world.fish.find((f) => f.sex === 'female') ?? world.fish[0];

  forceFishAliveAdultFed(female);
  female.sex = 'female';
  female.repro.state = 'LAYING';
  female.repro.layTargetX = 222;
  female.repro.layTargetY = 333;

  const world2 = roundTrip(world);
  const loadedFemale = world2.getFishById(female.id);

  assert.ok(loadedFemale);
  assert.equal(loadedFemale.repro.state, 'LAYING');
  assert.equal(loadedFemale.repro.layTargetX, 222);
  assert.equal(loadedFemale.repro.layTargetY, 333);
});

test('egg incubation data persists and hatches after due time', () => {
  const world = makeWorldForTest();
  const mother = world.fish[0];
  const father = world.fish[1] ?? mother;

  world.simTimeSec = 20;
  world.water.hygiene01 = 1;
  world.eggs.push({
    id: world.nextEggId++,
    x: 250,
    y: 260,
    laidAtSec: 20,
    hatchAtSec: 30,
    motherId: mother.id,
    fatherId: father.id,
    motherTraits: { ...mother.traits },
    fatherTraits: { ...father.traits },
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const world2 = roundTrip(world);
  assert.equal(world2.eggs.length, 1);
  assert.equal(world2.eggs[0].hatchAtSec, 30);

  const fishCountBefore = world2.fish.length;
  world2.simTimeSec = 31;
  withStubbedRandom(0, () => world2.update(0.01));

  assert.equal(world2.eggs.length, 0, 'egg should be consumed by hatch resolution');
  assert.equal(world2.fish.length, fishCountBefore + 1, 'hatch should spawn one baby fish');

  const baby = world2.fish[world2.fish.length - 1];
  assert.equal(baby.ageSecCached, 0);
  assert.equal(baby.history.bornInAquarium, true);
});


test('berry reed gives azure eggs a small hatch buffer', () => {
  const world = makeWorldForTest({ initialFishCount: 40 });
  world.simTimeSec = 40;
  world.water.hygiene01 = 1;

  for (const fish of world.fish) {
    forceFishAliveAdultFed(fish);
    fish.speciesId = 'AZURE_DART';
  }

  const mother = world.fish[0];
  const father = world.fish[1] ?? mother;

  world.birthsCount = 4;
  assert.equal(world.addBerryReedPlant().ok, true);

  world.eggs.push({
    id: world.nextEggId++,
    x: 250,
    y: 260,
    laidAtSec: 20,
    hatchAtSec: 30,
    motherId: mother.id,
    fatherId: father.id,
    motherTraits: { ...mother.traits },
    fatherTraits: { ...father.traits },
    speciesId: 'AZURE_DART',
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const fishCountBefore = world.fish.length;
  withStubbedRandom(0.55, () => world.update(0.01));

  assert.equal(world.eggs.length, 0);
  assert.equal(world.fish.length, fishCountBefore + 1, 'berry support should let this egg hatch at this roll');
});

test('dead fish state and reason persist', () => {
  const world = makeWorldForTest();
  const fish = world.fish[0];

  fish.lifeState = 'DEAD';
  fish.deathReason = 'OLD_AGE';
  fish.history.deathSimTimeSec = 123.4;

  const world2 = roundTrip(world);
  const loadedFish = world2.getFishById(fish.id);

  assert.ok(loadedFish);
  assert.equal(loadedFish.lifeState, 'DEAD');
  assert.equal(loadedFish.deathReason, 'OLD_AGE');
  assert.equal(loadedFish.history.deathSimTimeSec, 123.4);
});

test('legacy saves without berry reed fields load defaults safely', () => {
  const world = makeWorldForTest();
  const snap = world.toJSON();
  delete snap.birthsCount;
  delete snap.berryReedPlants;
  delete snap.fruits;

  const loaded = World.fromJSON(snap, {
    width: world.bounds.width,
    height: world.bounds.height,
    initialFishCount: world.initialFishCount
  });

  assert.equal(loaded.birthsCount, 0);
  assert.deepEqual(loaded.berryReedPlants, []);
  assert.deepEqual(loaded.fruits, []);
});

test('births count and berry reed entities persist through save/load', () => {
  const world = makeWorldForTest();
  world.birthsCount = 5;
  world.water.hygiene01 = 0.92;
  assert.equal(world.addBerryReedPlant().ok, true);
  const plant = world.berryReedPlants[0];
  world.fruits.push({
    id: world.nextFruitId++,
    plantId: plant.id,
    branchIndex: 0,
    u: 0.88,
    v: 1.5,
    radius: 2.2,
    createdAtSec: 10,
    ttlSec: 70
  });

  const json = world.toJSON();
  assert.equal(json.birthsCount, 5);
  assert.equal(json.berryReedPlants.length, 1);

  const loaded = roundTrip(world);
  assert.equal(loaded.birthsCount, 5);
  assert.equal(loaded.berryReedPlants.length, 1);
  assert.equal(loaded.fruits.length, 1);
  assert.equal(loaded.berryReedPlants[0].id, plant.id);
  assert.equal(loaded.fruits[0].u, 0.88);
  assert.equal(loaded.fruits[0].v, 1.5);
});


test('berry reed starts small and grows only when hygiene threshold is met', () => {
  const world = makeWorldForTest();
  world.birthsCount = 5;
  world.water.hygiene01 = 1;
  assert.equal(world.addBerryReedPlant().ok, true);
  const plant = world.berryReedPlants[0];

  assert.ok(plant.height < plant.maxHeight);
  assert.equal(Number(world.getBerryReedFruitCapacity(plant).toFixed(2)), 4);

  const initialGrowthSec = plant.growthElapsedSec;
  world.water.hygiene01 = 0.35;
  world.update(600);
  assert.equal(plant.growthElapsedSec, initialGrowthSec);

  world.water.hygiene01 = 1;
  const referenceSec = CONFIG.fish.age.stageBaseSec.juvenileEndSec;
  world.update(referenceSec);
  assert.ok(world.getBerryReedFruitCapacity(plant) >= 5.9 && world.getBerryReedFruitCapacity(plant) <= 6.1);
  assert.ok(plant.height > plant.spawnHeight);

  plant.growthElapsedSec = referenceSec * 2;
  world.water.hygiene01 = 1;
  world.update(1);
  const capacityAtCap = world.getBerryReedFruitCapacity(plant);
  const heightAtCap = plant.height;
  assert.ok(capacityAtCap >= 11.9 && capacityAtCap <= 12.01);

  world.update(referenceSec * 2);
  assert.ok(world.getBerryReedFruitCapacity(plant) >= 11.9 && world.getBerryReedFruitCapacity(plant) <= 12.01);
  assert.equal(plant.height, heightAtCap);
});


test('name uniqueness and next-id counters remain valid after load', () => {
  const world = makeWorldForTest();
  world.fish[0].name = 'Alice';
  world.fish[1].name = 'Alice (2)';

  const maxFishIdBefore = Math.max(...world.fish.map((fish) => fish.id));
  const world2 = roundTrip(world);

  const uniqueAlice = world2.makeUniqueName('Alice');
  assert.equal(uniqueAlice, 'Alice (3)');

  world2.setFishCount(world2.fish.length + 1);
  const maxFishIdAfter = Math.max(...world2.fish.map((fish) => fish.id));
  assert.ok(maxFishIdAfter > maxFishIdBefore);
  assert.equal(new Set(world2.fish.map((fish) => fish.id)).size, world2.fish.length);
});

test('corrupted save input is safe and clamps positions', () => {
  const world = makeWorldForTest();

  assert.doesNotThrow(() => {
    world.loadFromJSON({
      saveVersion: 1,
      simTimeSec: 10,
      fish: null,
      eggs: null,
      food: null,
      water: {}
    });
  });

  assert.equal(world.fish.length, 0);
  assert.equal(world.eggs.length, 0);
  assert.equal(world.food.length, 0);

  const world2 = makeWorldForTest({ width: 400, height: 300 });
  const snap = world2.toJSON();
  snap.fish[0].position = { x: -1000, y: 9999 };
  snap.food.push({ id: 999, x: -5, y: 9999, amount: 1, ttl: 1, vy: 1 });
  snap.eggs.push({
    id: 888,
    x: 9999,
    y: -999,
    laidAtSec: 0,
    hatchAtSec: 100,
    motherId: null,
    fatherId: null,
    motherTraits: {},
    fatherTraits: {},
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const loaded = World.fromJSON(snap, {
    width: 400,
    height: 300,
    initialFishCount: 4
  });

  const fish = loaded.fish[0];
  assert.ok(fish.position.x >= 0 && fish.position.x <= loaded.bounds.width);
  assert.ok(fish.position.y >= 0 && fish.position.y <= loaded.bounds.height);

  const food = loaded.food.find((f) => f.id === 999);
  assert.ok(food.x >= 0 && food.x <= loaded.bounds.width);
  assert.ok(food.y >= 0 && food.y <= loaded.bounds.height);

  const egg = loaded.eggs.find((e) => e.id === 888);
  assert.ok(egg.x >= 0 && egg.x <= loaded.bounds.width);
  assert.ok(egg.y >= 0 && egg.y <= loaded.bounds.height);
});



test('world update advances canonical sim clock for motion and lifecycle', () => {
  const world = makeWorldForTest();
  world.setSpeedMultiplier(1);

  world.spawnFood(100, 100, 1, 1);

  const startSimTime = world.simTimeSec;
  world.update(1);

  assert.equal(world.simTimeSec, startSimTime + 1);
  assert.equal(world.food.length, 0, 'food ttl should advance by canonical sim dt');
  assert.equal(world.debugTiming.simDt, 1);
  assert.equal(world.debugTiming.motionDt, 1);
});


test('speed multiplier scales canonical sim clock and persists through save-load', () => {
  const world = makeWorldForTest();
  world.simTimeSec = 30 * 60;
  world.setSpeedMultiplier(2);

  const simStart = world.simTimeSec;

  world.update(1);

  assert.equal(world.simTimeSec, simStart + 2);
  assert.equal(world.debugTiming.simDt, 2);
  assert.equal(world.debugTiming.motionDt, 2);

  const loaded = roundTrip(world);
  assert.equal(loaded.speedMultiplier, 2);

  const loadedSimStart = loaded.simTimeSec;
  loaded.update(1);

  assert.equal(loaded.simTimeSec, loadedSimStart + 2);
  assert.equal(loaded.debugTiming.simDt, 2);
  assert.equal(loaded.debugTiming.motionDt, 2);
});


test('simulation speed cap unlocks from 1x to 2x at 30m and 3x at 120m', () => {
  const world = makeWorldForTest();

  world.setSpeedMultiplier(3);
  assert.equal(world.speedMultiplier, 1);
  assert.equal(world.getAvailableSimSpeedMultiplierCap(), 1);

  world.simTimeSec = 30 * 60;
  world.setSpeedMultiplier(3);
  assert.equal(world.speedMultiplier, 2);
  assert.equal(world.getAvailableSimSpeedMultiplierCap(), 2);

  world.simTimeSec = 120 * 60;
  world.setSpeedMultiplier(3);
  assert.equal(world.speedMultiplier, 3);
  assert.equal(world.getAvailableSimSpeedMultiplierCap(), 3);
});

test('laying clutch uses updated egg range of 2 to 4', () => {
  const worldMin = makeWorldForTest();
  const femaleMin = worldMin.fish.find((f) => f.sex === 'female') ?? worldMin.fish[0];
  forceFishAliveAdultFed(femaleMin);
  femaleMin.sex = 'female';
  femaleMin.repro.state = 'LAYING';
  femaleMin.repro.layTargetX = femaleMin.position.x;
  femaleMin.repro.layTargetY = femaleMin.position.y;

  withStubbedRandom(0, () => worldMin.update(0.01));
  assert.equal(worldMin.eggs.length, 2, 'minimum clutch should produce 2 eggs');

  const worldMax = makeWorldForTest();
  const femaleMax = worldMax.fish.find((f) => f.sex === 'female') ?? worldMax.fish[0];
  forceFishAliveAdultFed(femaleMax);
  femaleMax.sex = 'female';
  femaleMax.repro.state = 'LAYING';
  femaleMax.repro.layTargetX = femaleMax.position.x;
  femaleMax.repro.layTargetY = femaleMax.position.y;

  withStubbedRandom(0.999999, () => worldMax.update(0.01));
  assert.equal(worldMax.eggs.length, 4, 'maximum clutch should produce 4 eggs');
});


test('fish produces poop every 2 meals and poop expires', () => {
  const world = makeWorldForTest();
  const fish = world.fish[0];
  forceFishAliveAdultFed(fish);

  world.spawnFood(fish.position.x, fish.position.y, 1, 120);
  fish.behavior = { mode: 'seekFood', targetFoodId: world.food[0].id, speedBoost: 1 };
  fish.tryConsumeFood(world);
  assert.equal(fish.digestBites, 1);
  assert.equal(world.poop.length, 0);

  world.spawnFood(fish.position.x, fish.position.y, 1, 120);
  fish.behavior = { mode: 'seekFood', targetFoodId: world.food[0].id, speedBoost: 1 };
  fish.tryConsumeFood(world);
  assert.ok(fish.digestBites <= 1);
  assert.equal(world.poop.length, 0);

  world.update(11);
  assert.equal(world.poop.length, 1);
  assert.ok(['pellet', 'neutral', 'floaty'].includes(world.poop[0].type));

  world.poop[0].ttlSec = 0.01;
  world.update(0.02);
  assert.equal(world.poop.length, 0);
});

test('poop survives save/load as optional field', () => {
  const world = makeWorldForTest();
  world.spawnPoop(50, 60, 12);

  const world2 = roundTrip(world);
  assert.equal(world2.poop.length, 1);
  assert.equal(world2.poop[0].x, 50);
  assert.equal(world2.poop[0].y, 60);
  assert.equal(typeof world2.poop[0].type, 'string');

  const legacy = world.toJSON();
  delete legacy.poop;
  const world3 = World.fromJSON(legacy, {
    width: world.bounds.width,
    height: world.bounds.height,
    initialFishCount: world.initialFishCount
  });
  assert.equal(world3.poop.length, 0);
});

test('poop always sinks as pellet-like type', () => {
  const worldA = makeWorldForTest();
  withStubbedRandom(0.2, () => worldA.spawnPoop(20, 20));
  assert.equal(worldA.poop[0].type, 'pellet');

  const worldB = makeWorldForTest();
  withStubbedRandom(0.95, () => worldB.spawnPoop(20, 20));
  assert.equal(worldB.poop[0].type, 'pellet');

  worldB.poop[0].y = 10;
  worldB.poop[0].vy = -2;
  worldB.update(0.2);
  assert.ok(worldB.poop[0].vy >= 0, 'poop velocity should be downward/non-negative after update');
});

test('water filter tier and feed counters persist through save-load', () => {
  const world = makeWorldForTest({ initialFishCount: 5 });
  world.foodsConsumedCount = 37;
  world.water.filterInstalled = true;
  world.water.filterEnabled = true;
  world.water.filter01 = 0.9;
  world.water.filterTier = 2;

  const loaded = roundTrip(world);

  assert.equal(loaded.initialFishCount, 5);
  assert.equal(loaded.foodsConsumedCount, 37);
  assert.equal(loaded.water.filterTier, 2);
  assert.equal(loaded.getFilterTierUnlockFeeds(2), 50);
  assert.equal(loaded.getFilterTierUnlockFeeds(3), 80);
});

test('upgradeWaterFilter uses install-duration progress and tier scaling improves cleanup', () => {
  const world = makeWorldForTest({ initialFishCount: 4 });
  world.water.filterInstalled = true;
  world.water.filterEnabled = true;
  world.water.filter01 = 0.42;
  world.water.filterTier = 1;
  world.water.dirt01 = 0.4;
  world.water.hygiene01 = 0.5;
  world.foodsConsumedCount = world.initialFishCount * 10;

  const upgraded = world.upgradeWaterFilter();
  assert.equal(upgraded, true);
  assert.equal(world.water.filterTier, 1);
  assert.equal(world.water.filterEnabled, false);
  assert.ok(world.water.upgradeProgress01 > 0);

  world.update(12);
  assert.equal(world.water.filterTier, 2);
  assert.equal(world.water.filterEnabled, true);
  assert.ok(world.water.filter01 >= 0.99);

  const tier1World = makeWorldForTest({ initialFishCount: 4 });
  tier1World.water.filterInstalled = true;
  tier1World.water.filterEnabled = true;
  tier1World.water.filter01 = 1;
  tier1World.water.filterTier = 1;
  tier1World.water.dirt01 = 0.3;
  tier1World.water.hygiene01 = 0.6;

  const tier2World = makeWorldForTest({ initialFishCount: 4 });
  tier2World.water.filterInstalled = true;
  tier2World.water.filterEnabled = true;
  tier2World.water.filter01 = 1;
  tier2World.water.filterTier = 2;
  tier2World.water.dirt01 = 0.3;
  tier2World.water.hygiene01 = 0.6;

  tier1World.update(60);
  tier2World.update(60);

  assert.ok(tier2World.water.dirt01 < tier1World.water.dirt01, 'tier 2 should remove more dirt over time');
  assert.ok(tier2World.water.hygiene01 > tier1World.water.hygiene01, 'tier 2 should recover hygiene faster');
});

function withMockedDevMode(enabled, fn) {
  const originalWindow = globalThis.window;
  const storage = new Map([['aquatab_dev_mode', enabled ? '1' : '0']]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  try {
    return fn();
  } finally {
    globalThis.window = originalWindow;
  }
}



test('nestbrush unlock, single-instance cap, and growth gating work', () => {
  const world = makeWorldForTest();

  world.birthsCount = 2;
  assert.equal(world.canAddNestbrush(), false);
  assert.equal(world.addNestbrush().ok, false);

  world.birthsCount = 3;
  assert.equal(world.canAddNestbrush(), true);
  assert.equal(world.addNestbrush().ok, true);
  assert.equal(world.addNestbrush().reason, 'MAX_COUNT');

  assert.equal(world.nestbrush.stage, 1);
  const initialProgress = world.nestbrush.growthProgressSec;
  world.water.hygiene01 = 0.84;
  world.update(500);
  assert.equal(world.nestbrush.stage, 1);
  assert.equal(world.nestbrush.growthProgressSec, initialProgress);

  world.water.hygiene01 = 0.95;
  world.update(720);
  assert.equal(world.nestbrush.stage, 2);
  world.update(720);
  assert.equal(world.nestbrush.stage, 3);
  assert.equal(world.getNestbrushCapacity(), 12);
});

test('lab minnow eggs use per-egg nestbrush protection and capacity', () => {
  const world = makeWorldForTest();
  world.simTimeSec = 20;
  world.birthsCount = 3;
  world.water.hygiene01 = 1;
  world.addNestbrush();

  const female = world.fish[0];
  const male = world.fish[1] ?? female;
  female.speciesId = 'LAB_MINNOW';
  male.speciesId = 'LAB_MINNOW';
  female.sex = 'female';
  forceFishAliveAdultFed(female);

  female.repro.state = 'LAYING';
  female.repro.fatherId = male.id;
  female.repro.layTargetX = female.position.x;
  female.repro.layTargetY = female.position.y;
  withStubbedRandom(0, () => world.update(0.2));

  assert.equal(world.eggs.length, 2);
  assert.equal(world.eggs.every((egg) => egg.isProtectedByNestbrush), true);
  assert.equal(world.eggs.every((egg) => egg.nestbrushAttachment != null), true);

  world.nestbrush.stage = 1;
  world.eggs.push({ ...world.eggs[0], id: world.nextEggId++ });
  world.eggs.push({ ...world.eggs[1], id: world.nextEggId++ });

  female.repro.state = 'LAYING';
  female.repro.fatherId = male.id;
  female.repro.layTargetX = female.position.x;
  female.repro.layTargetY = female.position.y;
  withStubbedRandom(0, () => world.update(0.2));

  const latestEggs = world.eggs.slice(-2);
  assert.equal(latestEggs.every((egg) => egg.isProtectedByNestbrush === false), true);

  const unprotectedEgg = latestEggs[0];
  const protectedEgg = world.eggs[0];
  const protectedIncubation = protectedEgg.hatchAtSec - protectedEgg.laidAtSec;
  const unprotectedIncubation = unprotectedEgg.hatchAtSec - unprotectedEgg.laidAtSec;
  assert.ok(unprotectedIncubation > protectedIncubation);

  const json = world.toJSON();
  const loaded = World.fromJSON({ saveVersion: 1, worldState: json }, {
    width: world.bounds.width,
    height: world.bounds.height,
    initialFishCount: world.initialFishCount
  });
  assert.ok(loaded.nestbrush);
  assert.equal(loaded.eggs.some((egg) => egg.isProtectedByNestbrush), true);
});

test('dev mode bypasses feature unlock gates and grants extended speed range', () => {
  withMockedDevMode(true, () => {
    const world = makeWorldForTest();
    world.birthsCount = 0;
    world.water.hygiene01 = 0.2;
    world.foodsConsumedCount = 0;
    world.filterUnlocked = false;

    assert.equal(world.canAddNestbrush(), true);
    assert.equal(world.canAddBerryReedPlant(), true);
    assert.equal(world.installWaterFilter(), true);

    world.setSpeedMultiplier(16);
    assert.equal(world.speedMultiplier, 16);
  });
});

test('grantAllUnlockPrerequisites bumps key unlock counters safely', () => {
  withMockedDevMode(true, () => {
    const world = makeWorldForTest();
    world.birthsCount = 1;
    world.foodsConsumedCount = 0;
    world.water.hygiene01 = 0.5;

    world.grantAllUnlockPrerequisites();

    assert.ok(world.birthsCount >= 4);
    assert.ok(world.water.hygiene01 >= 0.95);
    assert.ok(world.foodsConsumedCount >= world.getFilterTierUnlockFeeds(3));
  });
});

test('legacy fish saves without speciesId default to LAB_MINNOW', () => {
  const world = makeWorldForTest();
  const snap = world.toJSON();
  delete snap.fish[0].speciesId;

  const loaded = World.fromJSON({ saveVersion: 1, worldState: snap }, {
    width: world.bounds.width,
    height: world.bounds.height,
    initialFishCount: world.initialFishCount
  });

  assert.equal(loaded.fish[0].speciesId, 'LAB_MINNOW');
});

test('speciesId persists and azure dart survives save/load', () => {
  const world = makeWorldForTest();
  world.birthsCount = 10;
  world.water.hygiene01 = 1;
  world.addBerryReedPlant();
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.addAzureDartSchool(), true);

  const loaded = roundTrip(world);
  const azure = loaded.fish.filter((f) => f.speciesId === 'AZURE_DART');
  assert.ok(azure.length >= 4);
  assert.equal(loaded.fish.some((f) => f.speciesId === 'LAB_MINNOW'), true);
});

test('cross-species reproduction does not occur', () => {
  const world = makeWorldForTest();
  const female = world.fish[0];
  const male = world.fish[1];
  female.speciesId = 'LAB_MINNOW';
  male.speciesId = 'AZURE_DART';
  female.sex = 'female';
  male.sex = 'male';
  female.position = { x: 120, y: 120 };
  male.position = { x: 121, y: 121 };
  forceFishAliveAdultFed(female);
  forceFishAliveAdultFed(male);
  world.water.hygiene01 = 1;

  withStubbedRandom(0, () => {
    for (let i = 0; i < 8; i += 1) world.update(1);
  });

  assert.notEqual(female.repro.state, 'GRAVID');
  assert.equal(world.eggs.length, 0);
});

test('azure dart add button spawns one fish per click and caps at four total', () => {
  const world = makeWorldForTest();
  world.birthsCount = 10;
  world.water.hygiene01 = 1;
  world.addBerryReedPlant();

  assert.equal(world.getAzureDartCount(), 0);
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.getAzureDartCount(), 1);
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.getAzureDartCount(), 2);
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.getAzureDartCount(), 3);
  assert.equal(world.addAzureDartSchool(), true);
  assert.equal(world.getAzureDartCount(), 4);
  assert.equal(world.canAddAzureDart(), false);
  assert.equal(world.addAzureDartSchool(), false);
});


test('dev mode bypass unlocks azure dart prerequisites', () => {
  withMockedDevMode(true, () => {
    const world = makeWorldForTest();
    world.water.hygiene01 = 0.2;
    world.berryReedPlants = [];

    assert.equal(world.canAddAzureDart(), true);
  });
});


test('azure dart spawn uses blue-dominant color trait range', () => {
  const world = makeWorldForTest();
  world.birthsCount = 10;
  world.water.hygiene01 = 1;
  world.addBerryReedPlant();
  assert.equal(world.addAzureDartSchool(), true);
  const azure = world.fish.find((f) => f.speciesId === 'AZURE_DART');
  assert.ok(azure);
  assert.ok(azure.traits.colorHue >= 190 && azure.traits.colorHue <= 232);
  assert.equal(typeof azure.traits.colorPatternSeed, 'number');
});


test('berry reed unlock stays available after threshold dip', () => {
  const world = makeWorldForTest();
  world.birthsCount = 5;
  world.water.hygiene01 = 0.85;
  assert.equal(world.canAddBerryReedPlant(), true);

  world.water.hygiene01 = 0.2;
  assert.equal(world.canAddBerryReedPlant(), true);
});

test('azure dart unlock stays available after threshold dip while under cap', () => {
  const world = makeWorldForTest();
  world.birthsCount = 5;
  world.water.hygiene01 = 0.9;
  world.addBerryReedPlant();
  assert.equal(world.canAddAzureDart(), true);

  world.water.hygiene01 = 0.2;
  assert.equal(world.canAddAzureDart(), true);
});


test('species tab clear-selection path is safe via toggleFishSelection(null)', () => {
  const world = makeWorldForTest();
  const fishId = world.fish[1]?.id ?? world.fish[0].id;
  world.selectFish(fishId);
  assert.equal(world.selectedFishId, fishId);
  world.toggleFishSelection(null);
  assert.equal(world.selectedFishId, null);
});


test('silt sifter species and poop-timestamp persist through save/load', () => {
  const world = makeWorldForTest();
  const fish = world.fish[0];
  fish.speciesId = 'SILT_SIFTER';
  fish.species = SPECIES.SILT_SIFTER;
  fish.lastPoopConsumedAtSimSec = 123.45;

  const loaded = roundTrip(world);
  const loadedFish = loaded.getFishById(fish.id);

  assert.equal(loadedFish.speciesId, 'SILT_SIFTER');
  assert.equal(loadedFish.lastPoopConsumedAtSimSec, 123.45);
});

test('silt sifter does not schedule poop after two meals', () => {
  const world = makeWorldForTest();
  const fish = world.fish[0];
  fish.speciesId = 'SILT_SIFTER';
  fish.species = SPECIES.SILT_SIFTER;
  forceFishAliveAdultFed(fish);

  world.spawnFood(fish.position.x, fish.position.y, 1, 120);
  fish.behavior = { mode: 'seekFood', targetFoodId: world.food[0].id, speedBoost: 1 };
  fish.hungerState = 'STARVING';
  fish.tryConsumeFood(world);

  world.spawnFood(fish.position.x, fish.position.y, 1, 120);
  fish.behavior = { mode: 'seekFood', targetFoodId: world.food[0].id, speedBoost: 1 };
  fish.hungerState = 'STARVING';
  fish.tryConsumeFood(world);

  assert.ok(fish.digestBites <= 1);
  assert.equal(world.scheduledPoopSpawns.length, 0);
});

test('silt sifter consuming poop prevents dissolve pollution', () => {
  const world = makeWorldForTest();
  const fish = world.fish[0];
  fish.speciesId = 'SILT_SIFTER';
  fish.species = SPECIES.SILT_SIFTER;
  forceFishAliveAdultFed(fish);
  fish.hungerState = 'HUNGRY';

  const poop = world.spawnPoop(fish.position.x, fish.position.y, 120, { bioloadFactor: 1, visible: true });
  fish.behavior = { mode: 'seekFood', targetFoodId: poop.id, speedBoost: 1 };
  fish.tryConsumeFood(world);
  world.update(130);

  assert.equal(world.poop.length, 0);
  assert.equal(world.pendingPoopDirt01, 0);
});

test('silt sifter unlock gate requires 10 births unless dev mode', () => {
  const world = makeWorldForTest();
  world.birthsCount = 9;
  assert.equal(world.canAddSiltSifter(), false);

  world.birthsCount = 10;
  assert.equal(world.canAddSiltSifter(), true);
});


test('silt sifter add button spawns one juvenile per click and caps at four total', () => {
  const world = makeWorldForTest();
  world.birthsCount = 10;

  const before = world.getSiltSifterCount();
  assert.equal(before, 0);

  assert.equal(world.addSiltSifterSchool(), true);
  assert.equal(world.getSiltSifterCount(), 1);

  const s1 = world.fish.filter((f) => f.speciesId === 'SILT_SIFTER')[0];
  assert.ok(s1);
  assert.equal(s1.lifeStage, 'JUVENILE');

  assert.equal(world.addSiltSifterSchool(), true);
  assert.equal(world.addSiltSifterSchool(), true);
  assert.equal(world.addSiltSifterSchool(), true);
  assert.equal(world.getSiltSifterCount(), 4);

  assert.equal(world.canAddSiltSifter(), false);
  assert.equal(world.addSiltSifterSchool(), false, 'should not add beyond max 4');
  assert.equal(world.getSiltSifterCount(), 4);
});
