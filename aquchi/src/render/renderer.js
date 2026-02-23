/**
 * Canvas renderer.
 * Responsibility: draw-only layers for tank, water ambiance, and fish visuals.
 */

import { CONFIG } from '../config.js';

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.world = world;

    this.dpr = window.devicePixelRatio || 1;
    this.tankRect = { x: 0, y: 0, width: 0, height: 0 };
    this.camera = { scale: 1, offsetX: 0, offsetY: 0, viewWidth: 0, viewHeight: 0 };
    this.quality = 'high';
    this.debugBounds = false;

    this.waterParticles = this.#createParticles(70);
    this.plants = [];

    this.backgroundCanvas = document.createElement('canvas');
    this.vignetteCanvas = document.createElement('canvas');
    this.#buildPlants();
  }

  setQuality(quality) {
    this.quality = quality;
  }

  setDebugBounds(enabled) {
    this.debugBounds = Boolean(enabled);
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);

    const baseMargin = Math.max(12, Math.min(width, height) * 0.035);
    const isMobilePortrait = (window.matchMedia?.('(pointer: coarse)')?.matches ?? false)
      && window.innerHeight > window.innerWidth;
    const margin = isMobilePortrait ? Math.max(8, Math.min(12, baseMargin)) : baseMargin;
    this.tankRect = {
      x: margin,
      y: margin,
      width: Math.max(100, width - margin * 2),
      height: Math.max(100, height - margin * 2)
    };

    this.#updateCamera();

    this.#buildStaticLayers();

    for (const p of this.waterParticles) {
      p.x = Math.min(width, Math.max(0, p.x));
      p.y = Math.min(height, Math.max(0, p.y));
    }
  }

  toWorldPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const { offsetX, offsetY, viewWidth, viewHeight, scale } = this.camera;
    if (localX < offsetX || localX > offsetX + viewWidth || localY < offsetY || localY > offsetY + viewHeight) return null;

    return {
      x: (localX - offsetX) / scale,
      y: (localY - offsetY) / scale
    };
  }

  toScreenPoint(worldX, worldY) {
    const { offsetX, offsetY, scale } = this.camera;
    if (!Number.isFinite(scale) || scale <= 0) return null;
    return {
      x: offsetX + worldX * scale,
      y: offsetY + worldY * scale
    };
  }

  #updateCamera() {
    const worldWidth = Math.max(1, this.world.bounds.width);
    const worldHeight = Math.max(1, this.world.bounds.height);
    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;

    let availableHeight = this.tankRect.height;
    if (isCoarsePointer) {
      const dock = document.getElementById('deckToggle');
      const canvasRect = this.canvas.getBoundingClientRect();
      const dockRect = dock?.getBoundingClientRect?.();
      if (dockRect) {
        const overlapPx = Math.max(0, canvasRect.bottom - dockRect.top);
        availableHeight = Math.max(100, this.tankRect.height - overlapPx);
      }
    }

    const scale = Math.min(this.tankRect.width / worldWidth, availableHeight / worldHeight);
    const viewWidth = worldWidth * scale;
    const viewHeight = worldHeight * scale;
    const offsetX = this.tankRect.x + (this.tankRect.width - viewWidth) * 0.5;
    const offsetY = this.tankRect.y + (availableHeight - viewHeight) * 0.5;
    this.camera = { scale, offsetX, offsetY, viewWidth, viewHeight };
  }

  isFilterModuleHit(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const moduleRect = this.#filterModuleRectPx();
    if (!moduleRect) return false;

    return localX >= moduleRect.x
      && localX <= moduleRect.x + moduleRect.width
      && localY >= moduleRect.y
      && localY <= moduleRect.y + moduleRect.height;
  }


  render(time, delta) {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.#drawTankDropShadow(ctx);

    ctx.save();
    this.#clipTankWater(ctx);
    this.#drawCachedBackground(ctx);
    this.#drawPollutionTint(ctx);
    this.#drawWaterPlants(ctx, time);
    this.#drawBerryReed(ctx, time);
    this.#drawGroundAlgae(ctx, time);
    this.#drawPlayEffects(ctx, time);
    this.#drawWaterParticles(ctx, delta);
    this.#drawBubbles(ctx);
    this.#drawFilterModule(ctx, time);
    this.#drawFood(ctx);
    this.#drawPoop(ctx);
    this.#drawEggs(ctx);
    this.#drawFxParticles(ctx);
    this.#drawFishSchool(ctx, time);
    this.#drawCachedVignette(ctx);
    ctx.restore();

    this.#drawTankFrame(ctx);
    if (this.debugBounds) this.#drawDebugBounds(ctx);
  }

  #createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: rand(0, this.canvas.width || 900),
      y: rand(0, this.canvas.height || 640),
      r: rand(0.4, 1.3),
      alpha: rand(0.03, 0.09),
      speed: rand(3, 9)
    }));
  }

  #buildStaticLayers() {
    const w = Math.max(1, Math.floor(this.camera.viewWidth));
    const h = Math.max(1, Math.floor(this.camera.viewHeight));

    this.backgroundCanvas.width = w;
    this.backgroundCanvas.height = h;
    const bctx = this.backgroundCanvas.getContext('2d');
    const bg = bctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0f3550');
    bg.addColorStop(0.5, '#0a2a42');
    bg.addColorStop(1, '#061a2c');
    bctx.fillStyle = bg;
    bctx.fillRect(0, 0, w, h);

    this.vignetteCanvas.width = w;
    this.vignetteCanvas.height = h;
    const vctx = this.vignetteCanvas.getContext('2d');
    const v = vctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.24, w * 0.5, h * 0.48, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.11)');
    vctx.clearRect(0, 0, w, h);
    vctx.fillStyle = v;
    vctx.fillRect(0, 0, w, h);
  }

  #buildPlants() {
    const count = Math.max(8, Math.floor(this.world.bounds.width / 100));
    this.plants = Array.from({ length: count }, () => {
      const x = rand(16, Math.max(18, this.world.bounds.width - 16));
      const bottomY = this.world.bounds.height - rand(3, 12);
      const height = rand(this.world.bounds.height * 0.16, this.world.bounds.height * 0.34);
      const width = rand(7, 15);
      const hue = rand(125, 150);
      const sat = rand(20, 34);
      const light = rand(17, 28);
      return {
        x,
        bottomY,
        height,
        width,
        swayAmp: rand(2.2, 7.2),
        swayRate: rand(0.0008, 0.0018),
        phase: rand(0, TAU),
        color: `hsla(${hue}deg ${sat}% ${light}% / ${rand(0.18, 0.32)})`
      };
    });
  }

  #drawWaterPlants(ctx, time) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    ctx.save();
    ctx.lineCap = 'round';

    for (const plant of this.plants) {
      const baseX = offsetX + plant.x * worldScale;
      const baseY = offsetY + plant.bottomY * worldScale;
      const h = plant.height * worldScale;
      const w = plant.width * worldScale;

      ctx.strokeStyle = plant.color;
      ctx.lineWidth = Math.max(1, w * 0.22);

      const sway = Math.sin(time * plant.swayRate + plant.phase) * plant.swayAmp * worldScale;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(baseX - w * 0.5 + sway * 0.25, baseY - h * 0.33, baseX + w * 0.5 + sway, baseY - h * 0.66, baseX + sway, baseY - h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(baseX - w * 0.28, baseY);
      ctx.bezierCurveTo(baseX - w * 0.8 + sway * 0.2, baseY - h * 0.34, baseX - w * 0.12 + sway * 0.6, baseY - h * 0.7, baseX + sway * 0.56, baseY - h * 0.93);
      ctx.stroke();
    }

    ctx.restore();
  }

  #drawBerryReed(ctx, time) {
    const { scale: worldScale } = this.camera;
    const plants = this.world.berryReedPlants ?? [];
    const fruits = this.world.fruits ?? [];
    if (!plants.length) return;

    ctx.save();
    ctx.lineCap = 'round';

    for (const plant of plants) {
      const plantPose = this.#getBerryReedPlantPose(plant, time, worldScale);
      const { baseX, baseY, h, swayPx } = plantPose;

      ctx.strokeStyle = 'hsla(26deg 30% 36% / 0.9)';
      ctx.lineWidth = Math.max(1.4, 2 * worldScale);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(baseX - 4 * worldScale + swayPx * 0.2, baseY - h * 0.34, baseX + 3 * worldScale + swayPx, baseY - h * 0.72, baseX + swayPx, baseY - h);
      ctx.stroke();

      for (const [branchIndex, branch] of (plant.branches ?? []).entries()) {
        const branchPose = this.#getBerryReedBranchPose(plant, branch, branchIndex, time, worldScale);
        const { startX, startY, controlX, controlY, endX, endY } = branchPose;

        ctx.lineWidth = Math.max(1.1, 1.5 * worldScale);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.stroke();
      }
    }

    for (const fruit of fruits) {
      const fruitPose = this.#getBerryReedFruitPose(fruit, time, worldScale);
      if (!fruitPose) continue;
      const { x, y, branchX, branchY } = fruitPose;
      const r = Math.max(1, (fruit.radius ?? 2.2) * worldScale);

      ctx.strokeStyle = 'hsla(28deg 24% 34% / 0.72)';
      ctx.lineWidth = Math.max(0.8, 1.05 * worldScale);
      ctx.beginPath();
      ctx.moveTo(branchX, branchY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = 'hsla(338deg 54% 64% / 0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  #getBerryReedPlantPose(plant, time, worldScale) {
    const { offsetX, offsetY } = this.camera;
    const baseX = offsetX + (plant?.x ?? 0) * worldScale;
    const baseY = offsetY + (plant?.bottomY ?? 0) * worldScale;
    const h = (plant?.height ?? 0) * worldScale;
    const swayRate = plant?.swayRate ?? 0.0012;
    const swayPhase = plant?.swayPhase ?? 0;
    const swayPx = Math.sin(time * swayRate + swayPhase) * (2.4 * worldScale);
    return { baseX, baseY, h, swayPx };
  }

  #getBerryReedBranchPose(plant, branch, branchIndex, time, worldScale) {
    const { baseX, baseY, h, swayPx } = this.#getBerryReedPlantPose(plant, time, worldScale);
    const t = Math.max(0.1, Math.min(0.95, branch?.t ?? 0.5));
    const dir = branch?.side === -1 ? -1 : 1;
    const len = Math.max(0.08, Math.min(0.5, branch?.len ?? 0.26));
    const localRate = (plant?.swayRate ?? 0.0012) * 1.7;
    const localPhase = (plant?.swayPhase ?? 0) + branchIndex * 1.3;
    const localSway = Math.sin(time * localRate + localPhase) * (0.9 * worldScale) * len;
    const startX = baseX + swayPx * t;
    const startY = baseY - h * t;
    const endX = startX + dir * h * len * 0.32 + localSway;
    const endY = startY - h * len * 0.08;
    const controlX = startX + dir * 4 * worldScale + localSway * 0.6;
    const controlY = startY - h * 0.03;
    const angle = Math.atan2(endY - startY, endX - startX);
    return {
      startX,
      startY,
      controlX,
      controlY,
      endX,
      endY,
      angle
    };
  }

  #getBerryReedFruitPose(fruit, time, worldScale) {
    const plants = this.world.berryReedPlants ?? [];
    const plant = plants.find((entry) => entry.id === fruit?.plantId);
    if (!plant) return null;
    const branchIndex = Math.max(0, Math.floor(fruit?.branchIndex ?? 0));
    const branch = plant.branches?.[branchIndex];
    if (!branch) return null;

    const branchPose = this.#getBerryReedBranchPose(plant, branch, branchIndex, time, worldScale);
    const u = Math.max(0, Math.min(1, fruit?.u ?? 0.9));
    const v = Number.isFinite(fruit?.v) ? fruit.v : 0;
    const branchX = branchPose.startX + (branchPose.endX - branchPose.startX) * u;
    const branchY = branchPose.startY + (branchPose.endY - branchPose.startY) * u;
    const perpX = -Math.sin(branchPose.angle);
    const perpY = Math.cos(branchPose.angle);
    return {
      x: branchX + perpX * v,
      y: branchY + perpY * v,
      branchX,
      branchY
    };
  }


  #drawGroundAlgae(ctx, time) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    ctx.save();
    ctx.lineCap = 'round';

    for (const algae of this.world.groundAlgae ?? []) {
      const baseX = offsetX + algae.x * worldScale;
      const baseY = offsetY + algae.y * worldScale;
      const h = algae.height * worldScale;
      const w = algae.width * worldScale;
      const sway = Math.sin(time * algae.swayRate + algae.phase) * algae.swayAmp * worldScale;

      ctx.strokeStyle = 'hsla(115deg 58% 62% / 0.52)';
      ctx.lineWidth = Math.max(0.9, w * 0.21);

      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX - w * 0.3 + sway * 0.3, baseY - h * 0.52, baseX + sway, baseY - h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(baseX - w * 0.2, baseY);
      ctx.quadraticCurveTo(baseX - w * 0.55 + sway * 0.2, baseY - h * 0.48, baseX + sway * 0.72, baseY - h * 0.86);
      ctx.stroke();
    }

    ctx.restore();
  }

  #drawPlayEffects(ctx, time) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const session of this.world.playSessions ?? []) {
      if (!session.startedNearAlgae) continue;
      const x = offsetX + session.origin.x * worldScale;
      const y = offsetY + session.origin.y * worldScale;
      const life = Math.max(0, session.untilSec - this.world.simTimeSec);
      const pulse = (Math.sin(time * 0.007 + session.id) + 1) * 0.5;
      const r1 = (16 + pulse * 8) * worldScale;
      const r2 = (28 + pulse * 12) * worldScale;
      const alpha = Math.min(0.34, 0.14 + life * 0.02);

      ctx.beginPath();
      ctx.strokeStyle = `rgba(164, 255, 169, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.arc(x, y, r1, 0, TAU);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = `rgba(150, 240, 158, ${alpha * 0.7})`;
      ctx.lineWidth = 0.9;
      ctx.arc(x, y, r2, 0, TAU);
      ctx.stroke();
    }
  }

  #drawTankDropShadow(ctx) {
    const { offsetX: x, offsetY: y, viewWidth: width, viewHeight: height } = this.camera;
    const g = ctx.createRadialGradient(x + width * 0.5, y + height + 8, width * 0.2, x + width * 0.5, y + height + 8, width * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 8, y + height - 8, width + 16, Math.max(18, height * 0.18));
  }

  #clipTankWater(ctx) {
    const { offsetX: x, offsetY: y, viewWidth: width, viewHeight: height } = this.camera;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }

  #drawCachedBackground(ctx) {
    const { offsetX, offsetY } = this.camera;
    ctx.drawImage(this.backgroundCanvas, offsetX, offsetY);
  }


  #drawPollutionTint(ctx) {
    const { offsetX: x, offsetY: y, viewWidth: width, viewHeight: height } = this.camera;
    const dirt01 = Math.max(0, Math.min(1, this.world.water?.dirt01 ?? 0));
    if (dirt01 <= 0.001) return;

    const ease = (value) => value * value * (3 - 2 * value);
    const start = Math.max(0, Math.min(1, CONFIG.world.water.POLLUTION_TINT_START ?? 0.9));
    const span = Math.max(0.0001, 1 - start);

    let t = Math.max(0, Math.min(1, (dirt01 - start) / span));
    t = ease(t);

    const maxAlpha = Math.max(0, Math.min(1, CONFIG.world.water.POLLUTION_TINT_MAX_ALPHA ?? 0.18));
    const alpha = t * maxAlpha;
    const murkMaxAlpha = Math.max(0, Math.min(1, CONFIG.world.water.POLLUTION_MURK_MAX_ALPHA ?? 0.18));
    const murkAlpha = ease(dirt01) * murkMaxAlpha;

    const settleColor = CONFIG.world.water.POLLUTION_SETTLE_COLOR ?? '74, 98, 76';
    const settleMaxAlpha = Math.max(0, Math.min(1, CONFIG.world.water.POLLUTION_SETTLE_MAX_ALPHA ?? 0.26));
    const settleCurve = ease(Math.max(0, Math.min(1, (dirt01 - 0.35) / 0.65)));
    const settleAlphaBottom = settleCurve * settleMaxAlpha;

    if (alpha <= 0.001 && murkAlpha <= 0.001 && settleAlphaBottom <= 0.001) return;

    if (murkAlpha > 0.001) {
      ctx.fillStyle = `rgba(22, 34, 30, ${murkAlpha})`;
      ctx.fillRect(x, y, width, height);
    }

    const tintColor = CONFIG.world.water.POLLUTION_TINT_COLOR ?? '86, 108, 78';
    if (alpha > 0.001) {
      ctx.fillStyle = `rgba(${tintColor}, ${alpha})`;
      ctx.fillRect(x, y, width, height);
    }

    if (settleAlphaBottom > 0.001) {
      const settleTopAlpha = settleAlphaBottom * 0.08;
      const settleGradient = ctx.createLinearGradient(0, y, 0, y + height);
      settleGradient.addColorStop(0, `rgba(${settleColor}, 0)`);
      settleGradient.addColorStop(0.45, `rgba(${settleColor}, ${settleTopAlpha})`);
      settleGradient.addColorStop(0.78, `rgba(${settleColor}, ${settleAlphaBottom * 0.58})`);
      settleGradient.addColorStop(1, `rgba(${settleColor}, ${settleAlphaBottom})`);
      ctx.fillStyle = settleGradient;
      ctx.fillRect(x, y, width, height);
    }
  }

  #drawWaterParticles(ctx, delta) {
    if (this.quality === 'low') return;

    const { offsetX: x, offsetY: y, viewWidth: width, viewHeight: height } = this.camera;
    for (const p of this.waterParticles) {
      p.y -= p.speed * delta;
      if (p.y < y - 4 || p.x < x || p.x > x + width) {
        p.y = y + height + rand(1, 30);
        p.x = x + rand(0, width);
      }

      ctx.beginPath();
      ctx.fillStyle = `rgba(185,229,255,${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
  }

  #drawBubbles(ctx) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const b of this.world.bubbles) {
      const bx = offsetX + b.x * worldScale;
      const by = offsetY + b.y * worldScale;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(196,236,255,0.38)';
      ctx.fillStyle = 'rgba(175,220,248,0.1)';
      ctx.lineWidth = 1;
      ctx.arc(bx, by, b.radius * worldScale, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }


  #filterModuleRectPx() {
    const water = this.world.water;
    if (!water?.filterInstalled) return null;

    const { scale: worldScale, offsetX, offsetY, viewWidth, viewHeight } = this.camera;
    const tier = Math.max(1, Math.min(3, Math.floor(water.filterTier ?? 1)));
    const width = Math.max(16, 28 * worldScale);
    const tierHeightScale = 1 + (tier - 1) * 0.1;
    const height = Math.max(26, 52 * worldScale * tierHeightScale);

    return {
      x: offsetX + viewWidth - width - 10,
      y: offsetY + viewHeight - height - 10,
      width,
      height
    };
  }

  #drawFilterModule(ctx, time) {
    const water = this.world.water;
    const rect = this.#filterModuleRectPx();
    if (!water?.filterInstalled || !rect) return;

    const { x, y, width: moduleW, height: moduleH } = rect;

    ctx.save();
    ctx.fillStyle = 'rgba(25, 34, 43, 0.92)';
    ctx.strokeStyle = 'rgba(180, 220, 240, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, moduleW, moduleH, 5);
    ctx.fill();
    ctx.stroke();

    const tier = Math.max(1, Math.min(3, Math.floor(water.filterTier ?? 1)));
    const health = Math.max(0, Math.min(1, water.filter01 ?? 0));
    const depletedThreshold01 = Math.max(0, Math.min(1, this.world.filterDepletedThreshold01 ?? 0.1));
    const warningThreshold01 = Math.min(1, depletedThreshold01 + 0.2);
    const isBlinkOn = Math.floor(time / 500) % 2 === 0;

    let ledColor = 'rgba(170, 180, 188, 0.45)';
    if (water.filterEnabled) {
      if (health <= depletedThreshold01) {
        ledColor = 'rgba(255, 82, 82, 0.96)';
      } else if (health <= warningThreshold01) {
        ledColor = 'rgba(246, 163, 74, 0.96)';
      } else if (isBlinkOn) {
        ledColor = 'rgba(96, 255, 140, 0.95)';
      } else {
        ledColor = 'rgba(52, 120, 72, 0.45)';
      }
    }

    const ledCount = Math.max(1, Math.min(3, tier));
    for (let i = 0; i < ledCount; i += 1) {
      const ratio = ledCount === 1 ? 0.5 : i / (ledCount - 1);
      ctx.fillStyle = ledColor;
      ctx.beginPath();
      ctx.arc(x + moduleW * (0.3 + ratio * 0.4), y + 8, 2.4, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(145, 205, 236, 0.32)';
    ctx.beginPath();
    ctx.moveTo(x + moduleW * 0.28, y + moduleH * 0.28);
    ctx.lineTo(x + moduleW * 0.28, y + moduleH * 0.84);
    ctx.moveTo(x + moduleW * 0.72, y + moduleH * 0.28);
    ctx.lineTo(x + moduleW * 0.72, y + moduleH * 0.84);
    ctx.stroke();

    if ((water.effectiveFilter01 ?? 0) > 0) {
      const bubbleCount = this.quality === 'high' ? 4 : 2;
      for (let i = 0; i < bubbleCount; i += 1) {
        const bubbleY = y + moduleH * 0.88 - ((time * 0.05 + i * 8) % (moduleH * 0.75));
        const bubbleX = x - 4 - Math.sin(time * 0.004 + i * 1.3) * 2;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(188, 234, 255, 0.33)';
        ctx.arc(bubbleX, bubbleY, 1.4 + (i % 2) * 0.4, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  #drawFood(ctx) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const item of this.world.food) {
      const x = offsetX + item.x * worldScale;
      const y = offsetY + item.y * worldScale;
      const radius = (1.4 + item.amount * 1.1) * worldScale;

      ctx.beginPath();
      ctx.fillStyle = 'rgba(146, 228, 148, 0.95)';
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = 'rgba(221, 255, 226, 0.52)';
      ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.45, 0, TAU);
      ctx.fill();
    }
  }


  #drawPoop(ctx) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const item of this.world.poop ?? []) {
      const x = offsetX + item.x * worldScale;
      const y = offsetY + item.y * worldScale;
      const maxTtl = Math.max(1, Number.isFinite(item.maxTtlSec) ? item.maxTtlSec : 120);
      const ttlSec = Math.max(0, Number.isFinite(item.ttlSec) ? item.ttlSec : maxTtl);
      const life01 = Math.max(0, Math.min(1, ttlSec / maxTtl));
      const alpha = 0.22 + life01 * 0.53;

      ctx.beginPath();
      ctx.fillStyle = `rgba(116, 73, 44, ${alpha})`;
      ctx.ellipse(x, y, 3.4 * worldScale, 2.1 * worldScale, 0.2, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = `rgba(154, 109, 72, ${alpha * 0.5})`;
      ctx.ellipse(x - 0.8 * worldScale, y - 0.5 * worldScale, 1.3 * worldScale, 0.9 * worldScale, 0.2, 0, TAU);
      ctx.fill();
    }
  }


  #drawEggs(ctx) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const egg of this.world.eggs ?? []) {
      const x = offsetX + egg.x * worldScale;
      const y = offsetY + egg.y * worldScale;
      const r = 2.2 * worldScale;

      ctx.beginPath();
      ctx.fillStyle = 'rgba(245, 243, 233, 0.95)';
      ctx.ellipse(x, y, r, r * 0.82, 0, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.28, 0, TAU);
      ctx.fill();
    }
  }

  #drawFxParticles(ctx) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const p of this.world.fxParticles ?? []) {
      if (p.kind !== 'MATING_BUBBLE') continue;
      const life01 = Math.max(0, Math.min(1, p.ttlSec / Math.max(0.001, p.lifeSec ?? 0.8)));
      const alpha = 0.65 * life01;
      const x = offsetX + p.x * worldScale;
      const y = offsetY + p.y * worldScale;

      ctx.beginPath();
      ctx.fillStyle = `rgba(221, 246, 255, ${alpha})`;
      ctx.arc(x, y, p.radius * worldScale, 0, TAU);
      ctx.fill();
    }
  }

  #drawFishSchool(ctx, time) {
    const { scale: worldScale, offsetX, offsetY } = this.camera;

    for (const fish of this.world.fish) {
      const pos = {
        x: offsetX + fish.position.x * worldScale,
        y: offsetY + fish.position.y * worldScale
      };
      this.#drawFish(ctx, fish, pos, time, worldScale);
    }
  }

  #drawFish(ctx, fish, position, time, worldScale) {
    const orientation = fish.heading();
    const rp = typeof fish.getRenderParams === 'function'
      ? fish.getRenderParams()
      : { radius: fish.size, bodyLength: fish.size * 1.32, bodyHeight: fish.size * 0.73, tailWagAmp: fish.size * 0.13, eyeScale: 1, saturationMult: 1, lightnessMult: 1 };

    const pregnancySwell = fish.pregnancySwell01?.(this.world.simTimeSec) ?? 0;
    const bodyLength = rp.bodyLength * (1 + pregnancySwell * 0.35) * worldScale;
    const bodyHeight = rp.bodyHeight * (1 + pregnancySwell) * worldScale;
    const isDead = fish.lifeState === 'DEAD';
    const isSkeleton = fish.lifeState === 'SKELETON';
    const isHovering = Boolean(fish.isHovering?.(this.world.simTimeSec));
    const tailWagScale = isHovering ? 0.18 : 1;
    const tailWag = isDead || isSkeleton ? 0 : Math.sin(time * 0.004 + position.x * 0.008) * rp.tailWagAmp * tailWagScale * worldScale;
    const tint = Math.sin((fish.colorHue + rp.radius) * 0.14) * 3;

    const baseLight = 54 + Math.sin(rp.radius * 0.33) * 4;
    const light = baseLight * (rp.lightnessMult ?? 1);

    const sat = Math.max(18, Math.min(76, 52 * (rp.saturationMult ?? 1)));
    const isAzureDart = fish.speciesId === 'AZURE_DART';

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(orientation.tilt);
    ctx.scale(orientation.facing, 1);

    const bodyPath = new Path2D();
    bodyPath.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, TAU);

    if (isSkeleton) {
      ctx.fillStyle = 'hsl(36deg 8% 72%)';
      ctx.fill(bodyPath);
    } else if (isDead) {
      ctx.fillStyle = 'hsl(0deg 0% 56%)';
      ctx.fill(bodyPath);
    } else if (isAzureDart) {
      const baseHue = Math.max(190, Math.min(232, fish.colorHue ?? 212));
      const pattern = Math.max(0, Math.min(1, fish.traits?.colorPatternSeed ?? 0.5));
      const grad = ctx.createLinearGradient(-bodyLength * 0.5, 0, bodyLength * 0.5, 0);
      grad.addColorStop(0, `hsl(${baseHue - 8}deg ${68 + pattern * 10}% ${66 - pattern * 5}%)`);
      grad.addColorStop(0.55, `hsl(${baseHue + 2}deg ${80 + pattern * 8}% ${47 - pattern * 5}%)`);
      grad.addColorStop(1, `hsl(${baseHue + 12}deg ${82 + pattern * 8}% ${22 + pattern * 6}%)`);
      ctx.fillStyle = grad;
      ctx.fill(bodyPath);
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = 'rgba(245, 251, 255, 0.95)';
      ctx.lineWidth = Math.max(1, bodyHeight * 0.2);
      ctx.beginPath();
      ctx.moveTo(-bodyLength * 0.35, 0);
      ctx.lineTo(bodyLength * 0.42, 0);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = `hsl(${fish.colorHue + tint}deg ${sat}% ${light}%)`;
      ctx.fill(bodyPath);
    }

    const matingAnim = fish.matingAnim;
    if (matingAnim && fish.lifeState === 'ALIVE') {
      const progress = Math.max(0, Math.min(1, (this.world.simTimeSec - matingAnim.startSec) / Math.max(0.001, matingAnim.durationSec ?? 1.1)));
      const glowAlpha = 0.18 * Math.sin(progress * Math.PI);
      if (glowAlpha > 0.001) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(214, 241, 255, ${glowAlpha})`;
        ctx.ellipse(0, 0, bodyLength * 0.62, bodyHeight * 0.62, 0, 0, TAU);
        ctx.fill();
      }
    }

    if (fish.id === this.world.selectedFishId) {
      ctx.strokeStyle = 'rgba(152, 230, 255, 0.8)';
      ctx.lineWidth = 1.1;
      ctx.stroke(bodyPath);
    }

    if (this.quality === 'high' && !isSkeleton) {
      this.#drawFishTexture(ctx, bodyLength, bodyHeight, fish);
    }

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(205, 230, 245, 0.13)';
    ctx.stroke(bodyPath);

    ctx.fillStyle = isSkeleton ? 'hsl(35deg 9% 54%)' : (isDead ? 'hsl(0deg 0% 42%)' : (isAzureDart ? 'hsl(206deg 84% 68%)' : `hsl(${fish.colorHue + tint - 8}deg ${Math.max(12, sat - 12)}% ${light - 12}%)`));
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.52, 0);
    if (isAzureDart) {
      ctx.lineTo(-bodyLength * 0.86, bodyHeight * 0.22 + tailWag * 0.8);
      ctx.lineTo(-bodyLength * 0.98, 0);
      ctx.lineTo(-bodyLength * 0.86, -bodyHeight * 0.22 - tailWag * 0.8);
    } else {
      ctx.lineTo(-bodyLength * 0.84, bodyHeight * 0.35 + tailWag);
      ctx.lineTo(-bodyLength * 0.84, -bodyHeight * 0.35 - tailWag);
    }
    ctx.closePath();
    ctx.fill();

    if (!isSkeleton) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(bodyLength * 0.22, -bodyHeight * 0.12, rp.radius * 0.07 * (rp.eyeScale ?? 1) * worldScale, 0, TAU);
      ctx.fill();

      ctx.fillStyle = isDead ? '#47515a' : '#0c1f2f';
      ctx.beginPath();
      ctx.arc(bodyLength * 0.24, -bodyHeight * 0.12, rp.radius * 0.034 * (rp.eyeScale ?? 1) * worldScale, 0, TAU);
      ctx.fill();
    }

    const mouthOpen = isSkeleton ? 0 : (fish.mouthOpen01?.() ?? 0);
    const mouthSize = (rp.radius * 0.05 + mouthOpen * rp.radius * 0.055) * worldScale;
    const mouthX = bodyLength * 0.49;

    ctx.fillStyle = 'rgba(18, 28, 34, 0.8)';
    if (mouthOpen > 0.02) {
      ctx.beginPath();
      ctx.moveTo(mouthX, 0);
      ctx.lineTo(mouthX + mouthSize * 1.2, mouthSize * 0.9);
      ctx.lineTo(mouthX + mouthSize * 1.2, -mouthSize * 0.9);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(mouthX - 0.6, -0.35, 1.2, 0.7);
    }

    ctx.restore();
  }

  #drawFishTexture(ctx, bodyLength, bodyHeight, fish) {
    const seed = Math.sin(fish.size * 1.7 + fish.colorHue * 0.1) * 0.5 + 0.5;
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;

    for (let i = 0; i < 3; i += 1) {
      const t = i / 2;
      const y = (t - 0.5) * bodyHeight * 0.75;
      const wave = Math.sin(seed * 8 + i * 1.4) * bodyLength * 0.025;
      ctx.beginPath();
      ctx.moveTo(-bodyLength * 0.24, y);
      ctx.quadraticCurveTo(0, y + wave, bodyLength * 0.25, y * 0.72);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  #drawCachedVignette(ctx) {
    const { offsetX, offsetY } = this.camera;
    ctx.drawImage(this.vignetteCanvas, offsetX, offsetY);
  }


  #drawDebugBounds(ctx) {
    const { offsetX: x, offsetY: y, viewWidth: width, viewHeight: height, scale } = this.camera;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    const sampleFish = this.world.fish[0];
    if (sampleFish && typeof sampleFish.debugMovementBounds === 'function') {
      const bounds = sampleFish.debugMovementBounds();
      ctx.strokeStyle = 'rgba(123, 255, 182, 0.9)';
      ctx.strokeRect(
        x + bounds.x * scale + 0.5,
        y + bounds.y * scale + 0.5,
        Math.max(0, bounds.width * scale - 1),
        Math.max(0, bounds.height * scale - 1)
      );
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  #drawTankFrame(ctx) {
    const { offsetX: x, offsetY: y, viewWidth: width, viewHeight: height } = this.camera;

    ctx.strokeStyle = 'rgba(224, 241, 255, 0.31)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.strokeStyle = 'rgba(255,255,255,0.11)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
  }
}
