/**
 * UI side panel controller.
 * Responsibility: tabs, controls binding, and stat presentation.
 */

import { getMaxSimSpeedMultiplier, isDevMode } from '../dev.js';

export class Panel {
  constructor(rootElement, handlers) {
    this.root = rootElement;
    this.handlers = handlers;
    this.nameDraftByFishId = new Map();
    this.currentInspectorSelectedFishId = null;
    this.currentInspectorDetailTab = 'info';
    this.currentInspectorSpeciesTab = 'LAB_MINNOW';
    this.inspectorAzureUnlocked = false;
    this.inspectorSiltUnlocked = false;
    this.lastInspectorSignature = null;
    this.lastObservedSelectedFishId = null;
    this.inspectorRenderThrottleMs = 200;
    this.lastInspectorRenderAtMs = 0;
    this.pendingInspectorPayload = null;
    this.inspectorPointerActive = false;

    this.tabButtons = [...this.root.querySelectorAll('.tab-button')];
    this.tabContents = [...this.root.querySelectorAll('.tab-content')];

    this.simTimeStat = this.root.querySelector('[data-stat="simTime"]');
    this.fishCountStat = this.root.querySelector('[data-stat="fishCount"]');
    this.cleanlinessStat = this.root.querySelector('[data-stat="cleanliness"]');
    this.cleanlinessTrendStat = this.root.querySelector('[data-stat="cleanlinessTrend"]');
    this.eggsSummaryRoot = this.root.querySelector('[data-stat="eggsSummary"]');
    this.statsPanel = this.root.querySelector('[data-content="stats"]');
    this.devWaterStatsRoot = document.createElement('div');
    this.devWaterStatsRoot.hidden = true;
    this.statsPanel?.appendChild(this.devWaterStatsRoot);
    if (!this.cleanlinessTrendStat && this.cleanlinessStat?.closest('.stat-row')) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = '<span>Water quality trend</span><strong data-stat="cleanlinessTrend">Stable</strong>';
      this.cleanlinessStat.closest('.stat-row').insertAdjacentElement('afterend', row);
      this.cleanlinessTrendStat = row.querySelector('[data-stat="cleanlinessTrend"]');
    }

    this.speedSlider = this.root.querySelector('[data-control="simSpeed"]');
    this.toggleButton = this.root.querySelector('[data-control="togglePause"]');
    this.installFilterButton = this.root.querySelector('[data-control="installFilter"]');
    this.maintainFilterButton = this.root.querySelector('[data-control="maintainFilter"]');
    this.restartButton = this.root.querySelector('[data-control="restartSim"]');
    this.restartConfirm = this.root.querySelector('[data-restart-confirm]');
    this.restartConfirmYes = this.root.querySelector('[data-control="restartConfirmYes"]');
    this.restartConfirmNo = this.root.querySelector('[data-control="restartConfirmNo"]');

    this.filterAccordion = this.root.querySelector('[data-filter-accordion]');
    this.filterAccordionToggle = this.root.querySelector('[data-control="toggleFilterAccordion"]');
    this.filterContent = this.root.querySelector('[data-filter-content]');
    this.filterMessage = this.root.querySelector('[data-filter-message]');
    this.filterFeedRow = this.root.querySelector('[data-filter-feed-row]');
    this.filterFeedProgress = this.root.querySelector('[data-filter-feed-progress]');
    this.filterInstallProgressRow = this.root.querySelector('[data-filter-install-progress-row]');
    this.filterInstallProgress = this.root.querySelector('[data-filter-install-progress]');
    this.filterInstallBarTrack = this.root.querySelector('[data-filter-install-bar-track]');
    this.filterInstallBar = this.root.querySelector('[data-filter-install-bar]');
    this.filterStatusRow = this.root.querySelector('[data-filter-status-row]');
    this.filterStatus = this.root.querySelector('[data-filter-status]');
    this.filterHealthRow = this.root.querySelector('[data-filter-health-row]');
    this.filterHealth = this.root.querySelector('[data-filter-health]');
    this.filterTierRow = this.root.querySelector('[data-filter-tier-row]');
    this.filterTier = this.root.querySelector('[data-filter-tier]');
    this.filterTierProgressRow = this.root.querySelector('[data-filter-tier-progress-row]');
    this.filterTierProgress = this.root.querySelector('[data-filter-tier-progress]');
    this.filterToggleRow = this.root.querySelector('[data-filter-toggle-row]');
    this.speciesAccordion = this.root.querySelector('[data-species-accordion]');
    this.speciesAccordionToggle = this.root.querySelector('[data-control="toggleSpeciesAccordion"]');
    this.speciesContent = this.root.querySelector('[data-species-content]');
    this.addNestbrushButton = this.root.querySelector('[data-control="addNestbrush"]');
    this.nestbrushState = this.root.querySelector('[data-nestbrush-state]');
    this.nestbrushReqBirths = this.root.querySelector('[data-nestbrush-req-births]');
    this.addBerryReedButton = this.root.querySelector('[data-control="addBerryReed"]');
    this.berryState = this.root.querySelector('[data-berry-state]');
    this.berryReqBirths = this.root.querySelector('[data-berry-req-births]');
    this.berryReqCleanliness = this.root.querySelector('[data-berry-req-cleanliness]');
    this.addAzureDartButton = this.root.querySelector('[data-control="addAzureDart"]');
    this.azureDartState = this.root.querySelector('[data-azure-state]');
    this.azureDartReqBerry = this.root.querySelector('[data-azure-req-berry]');
    this.azureDartReqCleanliness = this.root.querySelector('[data-azure-req-cleanliness]');
    this.azureDartRow = this.root.querySelector('[data-azure-dart-row]');
    this.addSiltSifterButton = this.root.querySelector('[data-control="addSiltSifter"]');
    this.siltSifterState = this.root.querySelector('[data-silt-sifter-state]');
    this.siltSifterReqBirths = this.root.querySelector('[data-silt-sifter-req-births]');
    this.siltSifterRow = this.root.querySelector('[data-silt-sifter-row]');

    this.installFilterButton = this.root.querySelector('[data-control="installFilter"]');
    this.maintainFilterButton = this.root.querySelector('[data-control="maintainFilter"]');
    this.restartButton = this.root.querySelector('[data-control="restartSim"]');
    this.restartConfirm = this.root.querySelector('[data-restart-confirm]');
    this.restartConfirmYes = this.root.querySelector('[data-control="restartConfirmYes"]');
    this.restartConfirmNo = this.root.querySelector('[data-control="restartConfirmNo"]');
    this.toggleFilterPowerButton = this.root.querySelector('[data-control="toggleFilterPower"]');
    this.upgradeFilterButton = this.root.querySelector('[data-control="upgradeFilter"]');

    this.speedValue = this.root.querySelector('[data-value="simSpeed"]');
    this.simSpeedGroup = this.root.querySelector('[data-sim-speed-group]');
    this.simSpeedCondition = this.root.querySelector('[data-sim-speed-condition]');
    this.fishInspector = this.root.querySelector('[data-fish-inspector]');

    this.devSection = document.createElement('section');
    this.devSection.className = 'dev-panel';
    this.devSection.hidden = true;
    this.devSection.innerHTML = `
      <p class="dev-panel__label">DEV MODE ON</p>
      <div class="button-row"><button type="button" data-control="grantUnlockPrereqs">Grant all unlock prerequisites</button></div>
    `;
    const controlsPanel = this.root.querySelector('[data-content="controls"]');
    controlsPanel?.appendChild(this.devSection);
    this.grantUnlockPrereqsButton = this.devSection.querySelector('[data-control="grantUnlockPrereqs"]');

    this.deckToggle = document.getElementById('deckToggle');

    this.#bindTabs();
    this.#bindControls();
    this.#bindDeckToggle();
    this.#bindFishInspectorDelegates();
  }

  #bindTabs() {
    this.tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.selectTab(button.dataset.tab);
      });
    });
  }

  selectTab(tabName) {
    for (const b of this.tabButtons) {
      const active = b.dataset.tab === tabName;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    }

    for (const content of this.tabContents) {
      content.classList.toggle('active', content.dataset.content === tabName);
    }
  }

  #bindControls() {
    this.speedSlider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      this.speedValue.textContent = `${value.toFixed(1)}x`;
      this.handlers.onSpeedChange(value);
    });

    this.toggleButton.addEventListener('click', () => {
      const isPaused = this.handlers.onPauseToggle();
      this.toggleButton.textContent = isPaused ? 'Resume' : 'Pause';
    });

    this.restartButton?.addEventListener('click', () => {
      if (this.restartConfirm) this.restartConfirm.hidden = false;
    });

    this.restartConfirmYes?.addEventListener('click', () => {
      if (this.restartConfirm) this.restartConfirm.hidden = true;
      this.handlers.onRestartConfirm?.();
    });

    this.restartConfirmNo?.addEventListener('click', () => {
      if (this.restartConfirm) this.restartConfirm.hidden = true;
    });

    this.filterAccordionToggle?.addEventListener('click', () => {
      const nextOpen = this.filterAccordion?.dataset.open !== 'true';
      if (this.filterAccordion) this.filterAccordion.dataset.open = String(nextOpen);
      this.filterAccordionToggle?.setAttribute('aria-expanded', String(nextOpen));
      if (this.filterContent) this.filterContent.hidden = !nextOpen;
    });

    this.installFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterInstall?.();
    });

    this.maintainFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterMaintain?.();
    });

    this.toggleFilterPowerButton?.addEventListener('click', () => {
      this.handlers.onFilterTogglePower?.();
    });

    this.upgradeFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterUpgrade?.();
    });

    this.speciesAccordionToggle?.addEventListener('click', () => {
      const nextOpen = this.speciesAccordion?.dataset.open !== 'true';
      if (this.speciesAccordion) this.speciesAccordion.dataset.open = String(nextOpen);
      this.speciesAccordionToggle?.setAttribute('aria-expanded', String(nextOpen));
      if (this.speciesContent) this.speciesContent.hidden = !nextOpen;
    });

    this.addNestbrushButton?.addEventListener('pointerup', (event) => {
      event.preventDefault();
      const result = this.handlers.onAddNestbrush?.();
      return result;
    });

    this.addBerryReedButton?.addEventListener('pointerup', (event) => {
      event.preventDefault();
      const result = this.handlers.onAddBerryReed?.();
      return result;
    });

    this.addAzureDartButton?.addEventListener('click', () => {
      this.handlers.onAddAzureDart?.();
    });

    this.addSiltSifterButton?.addEventListener('click', () => {
      this.handlers.onAddSiltSifter?.();
    });

    this.grantUnlockPrereqsButton?.addEventListener('click', () => {
      this.handlers.onGrantUnlockPrereqs?.();
    });
  }

  #bindDeckToggle() {
    if (!this.deckToggle) return;
    this.deckToggle.addEventListener('click', () => {
      const isOpen = this.root.dataset.open === 'true';
      this.root.dataset.open = isOpen ? 'false' : 'true';
      this.deckToggle.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  #bindFishInspectorDelegates() {
    if (!this.fishInspector) return;

    const releaseInspectorPointer = () => {
      if (!this.inspectorPointerActive) return;
      this.inspectorPointerActive = false;
      if (this.pendingInspectorPayload) {
        const payload = this.pendingInspectorPayload;
        this.pendingInspectorPayload = null;
        this.#renderFishInspector(payload);
      }
    };

    this.fishInspector.addEventListener('pointerdown', () => {
      this.inspectorPointerActive = true;
    });
    this.fishInspector.addEventListener('pointerup', releaseInspectorPointer);
    this.fishInspector.addEventListener('pointercancel', releaseInspectorPointer);
    window.addEventListener('pointerup', releaseInspectorPointer);

    this.fishInspector.addEventListener('pointerdown', (event) => {
      const rowButton = event.target.closest('[data-fish-id]');
      if (!rowButton) return;
      event.preventDefault();
      this.handlers.onFishSelect?.(Number(rowButton.dataset.fishId));
    });

    this.fishInspector.addEventListener('input', (event) => {
      const input = event.target.closest('[data-fish-name-input]');
      if (!input || this.currentInspectorSelectedFishId == null) return;
      this.nameDraftByFishId.set(this.currentInspectorSelectedFishId, input.value);
    });

    this.fishInspector.addEventListener('keydown', (event) => {
      const input = event.target.closest('[data-fish-name-input]');
      if (!input) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });

    this.fishInspector.addEventListener('blur', (event) => {
      const input = event.target.closest('[data-fish-name-input]');
      if (!input || this.currentInspectorSelectedFishId == null) return;
      this.handlers.onFishRename?.(this.currentInspectorSelectedFishId, input.value);
      this.nameDraftByFishId.delete(this.currentInspectorSelectedFishId);
    }, true);

    this.fishInspector.addEventListener('click', (event) => {
      const speciesTabButton = event.target.closest('[data-inspector-species-tab]');
      if (speciesTabButton) {
        const tab = speciesTabButton.dataset.inspectorSpeciesTab;
        const nextSpecies = tab === 'AZURE_DART' ? 'AZURE_DART' : (tab === 'SILT_SIFTER' ? 'SILT_SIFTER' : 'LAB_MINNOW');
        this.currentInspectorSpeciesTab = nextSpecies;
        this.currentInspectorSelectedFishId = null;
        this.handlers.onFishSelect?.(null);
        this.lastInspectorSignature = null;
        this.lastObservedSelectedFishId = null;
        return;
      }

      const detailTabButton = event.target.closest('[data-fish-detail-tab]');
      if (detailTabButton) {
        this.currentInspectorDetailTab = detailTabButton.dataset.fishDetailTab === 'history' ? 'history' : 'info';
        this.lastInspectorSignature = null;
    this.lastObservedSelectedFishId = null;
        return;
      }

      const linkFishButton = event.target.closest('[data-history-fish-id]');
      if (linkFishButton) {
        const targetFishId = Number(linkFishButton.dataset.historyFishId);
        if (Number.isFinite(targetFishId)) this.handlers.onFishFocus?.(targetFishId);
        return;
      }

      const discardButton = event.target.closest('[data-fish-discard]');
      if (!discardButton || this.currentInspectorSelectedFishId == null) return;
      this.handlers.onFishDiscard?.(this.currentInspectorSelectedFishId);
    });
  }



  refreshSpeedControl(speedCap = getMaxSimSpeedMultiplier()) {
    if (!this.speedSlider) return;
    const normalizedCap = Math.max(1, Math.min(getMaxSimSpeedMultiplier(), Number(speedCap) || 1));
    this.speedSlider.max = String(normalizedCap);
    const current = Number(this.speedSlider.value);
    const clamped = Math.max(0.5, Math.min(normalizedCap, Number.isFinite(current) ? current : 1));
    this.speedSlider.value = String(clamped);
    this.speedSlider.disabled = normalizedCap <= 1;
    this.simSpeedGroup?.classList.toggle('is-dim', normalizedCap <= 1);
    if (this.speedValue) this.speedValue.textContent = `${clamped.toFixed(1)}x`;
  }

  updateDevSection() {
    const devMode = isDevMode();
    if (this.devSection) this.devSection.hidden = !devMode;
    if (this.devWaterStatsRoot) {
      this.devWaterStatsRoot.hidden = !devMode;
      if (!devMode) this.devWaterStatsRoot.innerHTML = '';
    }
  }

  sync({ speedMultiplier, paused, speedCap = getMaxSimSpeedMultiplier() }) {
    this.refreshSpeedControl(speedCap);
    const clampedSpeed = Math.max(0.5, Math.min(speedCap, Number(speedMultiplier) || 1));
    this.speedSlider.value = String(clampedSpeed);
    this.speedValue.textContent = `${clampedSpeed.toFixed(1)}x`;
    this.toggleButton.textContent = paused ? 'Resume' : 'Pause';
    this.updateDevSection();
    if (this.restartConfirm) this.restartConfirm.hidden = true;
  }



  #setSpeciesButtonReady(button, canAdd) {
    if (!button) return;
    button.classList.toggle('species-btn--ready', Boolean(canAdd));
  }

  updateStats({
    simTimeSec,
    fishCount,
    cleanliness01,
    cleanlinessTrend,
    filterUnlocked,
    foodsConsumedCount,
    filterUnlockThreshold,
    filterInstalled,
    filterEnabled,
    filter01,
    filterTier,
    filterNextTierUnlockFeeds,
    foodsNeededForNextTier,
    installProgress01,
    upgradeProgress01,
    maintenanceProgress01,
    maintenanceCooldownSec,
    filterDepletedThreshold01,
    birthsCount,
    nestbrushUnlockBirths,
    canAddNestbrush,
    nestbrushAdded,
    berryReedUnlockBirths,
    berryReedUnlockCleanlinessPct,
    canAddBerryReed,
    berryReedPlantCount,
    canAddAzureDart,
    azureDartCount,
    canAddSiltSifter,
    siltSifterCount,
    siltSifterUnlockBirths,
    simSpeedCap,
    simSpeedPendingUnlocks,
    eggsBySpecies = [],
    waterDebug = null
  }) {
    this.updateDevSection();
    this.refreshSpeedControl(simSpeedCap ?? getMaxSimSpeedMultiplier());

    if (this.simTimeStat) {
      const totalSec = Math.max(0, Math.floor(simTimeSec ?? 0));
      const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      this.simTimeStat.textContent = `${hh}:${mm}:${ss}`;
    }

    const pendingUnlocks = Array.isArray(simSpeedPendingUnlocks) ? simSpeedPendingUnlocks : [];
    if (this.simSpeedCondition) {
      if (pendingUnlocks.length === 0) {
        this.simSpeedCondition.hidden = true;
        this.simSpeedCondition.textContent = '';
      } else {
        const nextUnlock = pendingUnlocks[0];
        const unlockMinute = Math.ceil((nextUnlock.unlockAtSec ?? 0) / 60);
        this.simSpeedCondition.hidden = false;
        this.simSpeedCondition.textContent = `${nextUnlock.targetMultiplier}x unlocks at minute ${unlockMinute}.`;
      }
    }

    this.fishCountStat.textContent = String(fishCount);

    if (this.cleanlinessStat) {
      const cleanlinessPct = Math.round((cleanliness01 ?? 1) * 100);
      this.cleanlinessStat.textContent = `${cleanlinessPct}%`;
    }

    if (this.cleanlinessTrendStat) {
      const trendLabel = ['Stable', 'Dropping', 'Dropping fast'].includes(cleanlinessTrend) ? cleanlinessTrend : 'Stable';
      this.cleanlinessTrendStat.textContent = trendLabel;
      this.cleanlinessTrendStat.style.color = {
        Stable: '#cfeeff',
        Dropping: '#f0a13a',
        'Dropping fast': '#ea5f5f'
      }[trendLabel];
    }

    if (this.eggsSummaryRoot) {
      const eggRows = Array.isArray(eggsBySpecies)
        ? eggsBySpecies
          .filter((entry) => Number.isFinite(entry?.count) && entry.count > 0)
          .map((entry) => {
            const species = this.#escapeHtml(entry.speciesLabel || 'Unknown');
            const count = Math.floor(entry.count);
            return `<div class="stat-row stat-row--eggs"><span>${count} eggs in the tank (${species})</span></div>`;
          })
        : [];
      this.eggsSummaryRoot.innerHTML = eggRows.join('');
    }

    if (this.devWaterStatsRoot) {
      const debug = waterDebug && typeof waterDebug === 'object' ? waterDebug : {};
      if (isDevMode()) {
        const hygiene01 = Number.isFinite(debug.hygiene01) ? debug.hygiene01 : 0;
        const dirt01 = Number.isFinite(debug.dirt01) ? debug.dirt01 : 0;
        const filter01Value = Number.isFinite(debug.filter01) ? debug.filter01 : 0;
        const effectiveFilter01 = Number.isFinite(debug.effectiveFilter01) ? debug.effectiveFilter01 : 0;
        const filterEnabled = Boolean(debug.filterEnabled);
        this.devWaterStatsRoot.hidden = false;
        this.devWaterStatsRoot.innerHTML = `
          <div class="stat-row"><span>DEV · hygiene01</span><strong>${hygiene01.toFixed(4)}</strong></div>
          <div class="stat-row"><span>DEV · dirt01</span><strong>${dirt01.toFixed(4)}</strong></div>
          <div class="stat-row"><span>DEV · filter01</span><strong>${filter01Value.toFixed(4)}</strong></div>
          <div class="stat-row"><span>DEV · effectiveFilter01</span><strong>${effectiveFilter01.toFixed(4)}</strong></div>
          <div class="stat-row"><span>DEV · filterEnabled</span><strong>${filterEnabled ? 'true' : 'false'}</strong></div>
        `;
      } else {
        this.devWaterStatsRoot.hidden = true;
        this.devWaterStatsRoot.innerHTML = '';
      }
    }

    const consumed = Math.max(0, Math.floor(foodsConsumedCount ?? 0));
    const target = Math.max(0, Math.floor(filterUnlockThreshold ?? 0));
    const isInstalling = (installProgress01 ?? 0) > 0;
    const isUpgrading = (upgradeProgress01 ?? 0) > 0;
    const isMaintaining = (maintenanceProgress01 ?? 0) > 0;

    if (this.filterAccordion) {
      this.filterAccordion.classList.toggle('is-dim', !filterUnlocked);
    }

    if (this.filterFeedRow) this.filterFeedRow.hidden = Boolean(filterInstalled);
    if (this.filterFeedProgress) {
      this.filterFeedProgress.textContent = `${consumed} / ${target}`;
    }

    if (this.filterMessage) {
      if (!filterUnlocked) {
        this.filterMessage.textContent = `To install the filter: feed your fish ${target} times.`;
      } else if (isInstalling) {
        this.filterMessage.textContent = `Installing... ${Math.round((installProgress01 ?? 0) * 100)}%`;
      } else if (isUpgrading) {
        this.filterMessage.textContent = `Changing filter... ${Math.round((upgradeProgress01 ?? 0) * 100)}%`;
      } else if (!filterInstalled) {
        this.filterMessage.textContent = 'Filter available. Install to start cleaning water.';
      } else {
        this.filterMessage.textContent = 'Filter installed and ready.';
      }
    }

    const activeFilterProgress01 = isInstalling ? (installProgress01 ?? 0) : (isUpgrading ? (upgradeProgress01 ?? 0) : 0);
    const showFilterProgress = isInstalling || isUpgrading;
    if (this.filterInstallProgressRow) this.filterInstallProgressRow.hidden = !showFilterProgress;
    if (this.filterInstallBarTrack) this.filterInstallBarTrack.hidden = !showFilterProgress;
    if (this.filterInstallProgress) this.filterInstallProgress.textContent = `${Math.round(activeFilterProgress01 * 100)}%`;
    if (this.filterInstallBar) this.filterInstallBar.style.width = `${Math.round(activeFilterProgress01 * 100)}%`;

    if (this.installFilterButton) {
      const canInstall = filterUnlocked && !filterInstalled && !isInstalling && !isUpgrading;
      this.installFilterButton.hidden = !canInstall;
      this.installFilterButton.disabled = !canInstall;
    }

    const health01 = Math.max(0, Math.min(1, filter01 ?? 0));
    const depletedThreshold01 = Math.max(0, Math.min(1, filterDepletedThreshold01 ?? 0.1));
    const warningThreshold01 = Math.min(1, depletedThreshold01 + 0.2);

    if (this.filterStatusRow) this.filterStatusRow.hidden = !filterInstalled;
    if (this.filterStatus) {
      let statusLabel = 'OFF';
      let statusColor = '#cfd9e3';
      if (filterEnabled) {
        if (health01 <= depletedThreshold01) {
          statusLabel = 'DEPLETED';
          statusColor = '#ef6b6b';
        } else if (health01 <= warningThreshold01) {
          statusLabel = 'MAINTENANCE DUE';
          statusColor = '#f1a04f';
        } else {
          statusLabel = isUpgrading ? 'OFF' : 'ON';
          statusColor = '#84e89a';
        }
      }
      this.filterStatus.textContent = statusLabel;
      this.filterStatus.style.color = statusColor;
    }

    if (this.filterHealthRow) this.filterHealthRow.hidden = !filterInstalled;
    if (this.filterHealth) {
      this.filterHealth.textContent = `${Math.round(health01 * 100)}%`;
      this.filterHealth.style.color = health01 <= depletedThreshold01
        ? '#ef6b6b'
        : (health01 <= warningThreshold01 ? '#f1a04f' : '');
    }

    if (this.filterToggleRow) this.filterToggleRow.hidden = !filterInstalled;
    if (this.toggleFilterPowerButton) {
      this.toggleFilterPowerButton.hidden = !filterInstalled;
      this.toggleFilterPowerButton.textContent = filterEnabled ? 'Turn OFF' : 'Turn ON';
    }

    const tier = Math.max(0, Math.min(3, Math.floor(filterTier ?? 0)));
    const nextUnlock = Math.max(0, Math.floor(filterNextTierUnlockFeeds ?? 0));
    const neededFeeds = Math.max(0, Math.floor(foodsNeededForNextTier ?? 0));
    const showUpgrade = filterInstalled && tier < 3;
    const canUpgrade = showUpgrade && (isDevMode() || neededFeeds <= 0) && !isInstalling && !isUpgrading && !isMaintaining && filterEnabled;

    if (this.filterTierRow) this.filterTierRow.hidden = !filterInstalled;
    if (this.filterTier) this.filterTier.textContent = `Tier ${Math.max(1, tier)}/3`;

    if (this.filterTierProgressRow) this.filterTierProgressRow.hidden = !filterInstalled || tier >= 3;
    if (this.filterTierProgress) {
      if (!filterInstalled || tier >= 3) {
        this.filterTierProgress.textContent = '';
      } else if (canUpgrade) {
        this.filterTierProgress.textContent = 'Upgrade available';
      } else {
        this.filterTierProgress.textContent = `${neededFeeds} feeds left (${consumed}/${nextUnlock})`;
      }
    }

    if (this.upgradeFilterButton) {
      this.upgradeFilterButton.hidden = !showUpgrade;
      this.upgradeFilterButton.disabled = !canUpgrade;
    }

    if (this.maintainFilterButton) {
      const canMaintain = filterInstalled && !isInstalling && !isUpgrading && !isMaintaining && (maintenanceCooldownSec ?? 0) <= 0;
      this.maintainFilterButton.hidden = !filterInstalled;
      this.maintainFilterButton.disabled = !canMaintain;
    }

    const nestbrushRequiredBirths = Math.max(1, Math.floor(nestbrushUnlockBirths ?? 3));
    const nestbrushBirthProgress = Math.max(0, Math.floor(birthsCount ?? 0));
    const nestbrushAlreadyAdded = Boolean(nestbrushAdded);

    if (this.nestbrushReqBirths) {
      this.nestbrushReqBirths.textContent = `Requires: ${nestbrushRequiredBirths} births (${Math.min(nestbrushBirthProgress, nestbrushRequiredBirths)}/${nestbrushRequiredBirths})`;
    }

    if (this.addNestbrushButton) {
      if (nestbrushAlreadyAdded) {
        this.addNestbrushButton.disabled = true;
        this.addNestbrushButton.textContent = 'Added ✓';
      } else {
        this.addNestbrushButton.disabled = !canAddNestbrush;
        this.addNestbrushButton.textContent = 'Nestbrush';
      }
      this.#setSpeciesButtonReady(this.addNestbrushButton, canAddNestbrush && !nestbrushAlreadyAdded);
    }

    if (this.nestbrushState) {
      this.nestbrushState.textContent = nestbrushAlreadyAdded ? 'Added' : (canAddNestbrush ? 'Ready' : 'Locked');
      this.nestbrushState.style.color = nestbrushAlreadyAdded
        ? '#84e89a'
        : (canAddNestbrush ? '#cfeeff' : '');
    }

    const roundedCleanlinessPct = Math.round((cleanliness01 ?? 1) * 100);
    const requiredBirths = Math.max(1, Math.floor(berryReedUnlockBirths ?? 4));
    const birthProgress = Math.max(0, Math.floor(birthsCount ?? 0));
    const requiredCleanlinessPct = Math.max(1, Math.min(100, Math.floor(berryReedUnlockCleanlinessPct ?? 80)));
    const alreadyAdded = (berryReedPlantCount ?? 0) >= 1;

    if (this.speciesAccordion) this.speciesAccordion.classList.toggle('is-dim', !canAddNestbrush && !nestbrushAlreadyAdded && !canAddBerryReed && !alreadyAdded);

    if (this.berryReqBirths) {
      this.berryReqBirths.textContent = `Requires: ${requiredBirths} births (${Math.min(birthProgress, requiredBirths)}/${requiredBirths})`;
    }

    if (this.berryReqCleanliness) {
      this.berryReqCleanliness.textContent = roundedCleanlinessPct >= requiredCleanlinessPct
        ? `Requires: Cleanliness ${requiredCleanlinessPct}%+ ✓`
        : `Requires: Cleanliness ${requiredCleanlinessPct}%+ (currently ${roundedCleanlinessPct}%)`;
    }

    if (this.addBerryReedButton) {
      if (alreadyAdded) {
        this.addBerryReedButton.disabled = true;
        this.addBerryReedButton.textContent = 'Added ✓';
      } else {
        this.addBerryReedButton.disabled = !canAddBerryReed;
        this.addBerryReedButton.textContent = 'Berry Reed';
      }
      this.#setSpeciesButtonReady(this.addBerryReedButton, canAddBerryReed && !alreadyAdded);
    }

    if (this.berryState) {
      this.berryState.textContent = alreadyAdded ? 'Added' : (canAddBerryReed ? 'Ready' : 'Locked');
      this.berryState.style.color = alreadyAdded
        ? '#84e89a'
        : (canAddBerryReed ? '#cfeeff' : '');
    }


    const azureUnlocked = Boolean(canAddAzureDart);
    const hasBerry = (berryReedPlantCount ?? 0) >= 1;
    const devBypass = isDevMode();
    if (this.azureDartReqBerry) {
      this.azureDartReqBerry.textContent = (hasBerry || devBypass) ? 'Requires: Berry Reed added ✓' : 'Requires: Berry Reed added';
    }
    if (this.azureDartReqCleanliness) {
      this.azureDartReqCleanliness.textContent = (roundedCleanlinessPct >= 80 || devBypass)
        ? 'Requires: Cleanliness 80%+ ✓'
        : `Requires: Cleanliness 80%+ (currently ${roundedCleanlinessPct}%)`;
    }
    if (this.azureDartState) {
      this.azureDartState.textContent = azureDartCount >= 4 ? 'Added' : (azureUnlocked ? 'Ready' : 'Locked');
      this.azureDartState.style.color = azureDartCount >= 4
        ? '#84e89a'
        : (azureUnlocked ? '#cfeeff' : '');
    }
    if (this.azureDartRow) this.azureDartRow.classList.toggle('is-locked', !azureUnlocked);
    if (this.addAzureDartButton) {
      this.addAzureDartButton.disabled = !azureUnlocked;
      this.#setSpeciesButtonReady(this.addAzureDartButton, azureUnlocked);
    }

    const siltRequiredBirths = Math.max(1, Math.floor(siltSifterUnlockBirths ?? 10));
    const siltBirthProgress = Math.max(0, Math.floor(birthsCount ?? 0));
    const siltUnlocked = Boolean(canAddSiltSifter);
    this.inspectorAzureUnlocked = this.inspectorAzureUnlocked || azureUnlocked || (azureDartCount ?? 0) > 0;
    this.inspectorSiltUnlocked = this.inspectorSiltUnlocked || siltUnlocked || (siltSifterCount ?? 0) > 0;
    if (this.siltSifterReqBirths) {
      this.siltSifterReqBirths.textContent = `Requires: ${siltRequiredBirths} births (${Math.min(siltBirthProgress, siltRequiredBirths)}/${siltRequiredBirths})${isDevMode() ? ' ✓' : ''}`;
    }
    if (this.siltSifterState) {
      this.siltSifterState.textContent = (siltSifterCount ?? 0) >= 4 ? 'Added' : (siltUnlocked ? 'Ready' : 'Locked');
      this.siltSifterState.style.color = (siltSifterCount ?? 0) >= 4
        ? '#84e89a'
        : (siltUnlocked ? '#cfeeff' : '');
    }
    if (this.siltSifterRow) this.siltSifterRow.classList.toggle('is-locked', !siltUnlocked);
    if (this.addSiltSifterButton) {
      const atCap = (siltSifterCount ?? 0) >= 4;
      this.addSiltSifterButton.disabled = !siltUnlocked || atCap;
      this.#setSpeciesButtonReady(this.addSiltSifterButton, siltUnlocked && !atCap);
    }
  }

  updateFishInspector(fishList, selectedFishId, simTimeSec) {
    if (!this.fishInspector) return;

    const payload = { fishList, selectedFishId, simTimeSec };
    if (this.inspectorPointerActive) {
      this.pendingInspectorPayload = payload;
      return;
    }

    const nowMs = performance.now();
    if (nowMs - this.lastInspectorRenderAtMs < this.inspectorRenderThrottleMs) {
      this.pendingInspectorPayload = payload;
      return;
    }

    this.#renderFishInspector(payload);
  }

  #renderFishInspector({ fishList, selectedFishId, simTimeSec }) {
    this.lastInspectorRenderAtMs = performance.now();

    const activeInput = this.fishInspector.querySelector('[data-fish-name-input]:focus');
    if (activeInput) return;

    const previousList = this.fishInspector.querySelector('.fish-list');
    const previousScrollTop = previousList?.scrollTop ?? 0;

    const sorted = [...fishList].sort((a, b) => {
      const aDead = a.lifeState !== 'ALIVE' ? 1 : 0;
      const bDead = b.lifeState !== 'ALIVE' ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;
      return a.id - b.id;
    });

    const selectedFishAnySpecies = sorted.find((fish) => fish.id === selectedFishId) ?? null;
    const selectedChanged = selectedFishId !== this.lastObservedSelectedFishId;
    if (selectedChanged && (
      selectedFishAnySpecies?.speciesId === 'AZURE_DART'
      || selectedFishAnySpecies?.speciesId === 'SILT_SIFTER'
      || selectedFishAnySpecies?.speciesId === 'LAB_MINNOW'
    )) {
      this.currentInspectorSpeciesTab = selectedFishAnySpecies.speciesId;
    }
    this.lastObservedSelectedFishId = selectedFishId ?? null;

    const hasAzureFishInSession = sorted.some((fish) => (fish.speciesId ?? 'LAB_MINNOW') === 'AZURE_DART');
    const hasSiltFishInSession = sorted.some((fish) => (fish.speciesId ?? 'LAB_MINNOW') === 'SILT_SIFTER');
    if (hasAzureFishInSession) this.inspectorAzureUnlocked = true;
    if (hasSiltFishInSession) this.inspectorSiltUnlocked = true;

    const visibleSpeciesTabs = ['LAB_MINNOW'];
    if (this.inspectorAzureUnlocked) visibleSpeciesTabs.push('AZURE_DART');
    if (this.inspectorSiltUnlocked) visibleSpeciesTabs.push('SILT_SIFTER');
    if (!visibleSpeciesTabs.includes(this.currentInspectorSpeciesTab)) {
      this.currentInspectorSpeciesTab = 'LAB_MINNOW';
    }

    const filtered = sorted.filter((fish) => (fish.speciesId ?? 'LAB_MINNOW') === this.currentInspectorSpeciesTab);
    const selectedFish = filtered.find((fish) => fish.id === selectedFishId) ?? null;
    const selectedLiveAgeSec = selectedFish ? Math.floor(selectedFish.ageSeconds(simTimeSec)) : -1;
    const selectedHungerPct = selectedFish ? Math.round((selectedFish.hunger01 ?? 0) * 100) : -1;
    const selectedWellbeingPct = selectedFish ? Math.round((selectedFish.wellbeing01 ?? 0) * 100) : -1;
    const selectedGrowthPct = selectedFish ? Math.round((selectedFish.growth01 ?? 0) * 100) : -1;
    const selectedHistorySnapshot = selectedFish
      ? `${selectedFish.history?.mealsEaten ?? 0}|${selectedFish.history?.mateCount ?? 0}|${selectedFish.history?.childrenIds?.length ?? 0}|${selectedFish.history?.deathSimTimeSec ?? ''}|${selectedFish.repro?.state ?? ''}|${selectedFish.deathReason ?? ''}`
      : 'none';

    const signature = filtered
      .map((fish) => `${fish.id}|${fish.name ?? ''}|${fish.lifeState}|${fish.hungerState}|${fish.lifeStage ?? ''}|${fish.repro?.state ?? ''}`)
      .join(';')
      + `::selected=${selectedFishId ?? 'none'}`
      + `::age=${selectedLiveAgeSec}`
      + `::hunger=${selectedHungerPct}`
      + `::wellbeing=${selectedWellbeingPct}`
      + `::growth=${selectedGrowthPct}`
      + `::history=${selectedHistorySnapshot}`
      + `::detailTab=${this.currentInspectorDetailTab}`
      + `::speciesTab=${this.currentInspectorSpeciesTab}`;

    if (signature === this.lastInspectorSignature) return;
    this.lastInspectorSignature = signature;

    const listHtml = filtered
      .map((fish) => {
        const selectedClass = fish.id === selectedFishId ? ' selected' : '';
        const deadClass = fish.lifeState !== 'ALIVE' ? ' fishRow--dead' : '';
        const stageLabel = typeof fish.lifeStageLabel === 'function' ? fish.lifeStageLabel() : (fish.lifeStage ?? '');
        const state = `${stageLabel} · ${fish.hungerState}`;
        const isPregnant = fish.sex === 'female' && (fish.repro?.state === 'GRAVID' || fish.repro?.state === 'LAYING');
        const liveName = fish.name?.trim() || '';
        const draftName = this.nameDraftByFishId.get(fish.id) ?? liveName;
        const rawLabel = draftName || 'Unnamed';
        const label = this.#escapeHtml(rawLabel);
        const pregnantClass = isPregnant ? ' fish-row__name--pregnant' : '';
        return `<button type="button" class="fish-row${selectedClass}${deadClass}" data-fish-id="${fish.id}"><span class="fish-row__name${pregnantClass}">${label}</span> · ${fish.sex} · ${state}</button>`;
      })
      .join('');

    this.currentInspectorSelectedFishId = selectedFish?.id ?? null;

    const detailHtml = selectedFish
      ? this.#fishDetailsMarkup(selectedFish, simTimeSec)
      : '<p class="fish-empty">Select a fish.</p>';

    const labActive = this.currentInspectorSpeciesTab === 'LAB_MINNOW';
    const azureActive = this.currentInspectorSpeciesTab === 'AZURE_DART';
    const siltActive = this.currentInspectorSpeciesTab === 'SILT_SIFTER';
    const speciesTabsHtml = `
      <div class="inspector-species-tabs" role="tablist" aria-label="Fish species">
        <button type="button" class="inspector-species-tab${labActive ? ' active' : ''}" data-inspector-species-tab="LAB_MINNOW" role="tab" aria-selected="${labActive}">Lab Minnow</button>
        ${this.inspectorAzureUnlocked
    ? `<button type="button" class="inspector-species-tab${azureActive ? ' active' : ''}" data-inspector-species-tab="AZURE_DART" role="tab" aria-selected="${azureActive}">Azure Dart</button>`
    : ''}
        ${this.inspectorSiltUnlocked
    ? `<button type="button" class="inspector-species-tab${siltActive ? ' active' : ''}" data-inspector-species-tab="SILT_SIFTER" role="tab" aria-selected="${siltActive}">Silt Sifter</button>`
    : ''}
      </div>
    `;

    this.fishInspector.innerHTML = `
      ${speciesTabsHtml}
      <div class="fish-list">${listHtml || '<p class="fish-empty">No fish in this species tab.</p>'}</div>
      <div class="fish-detail">${detailHtml}</div>
    `;

    const nextList = this.fishInspector.querySelector('.fish-list');
    if (nextList) nextList.scrollTop = previousScrollTop;
  }

  #escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  #escapeAttribute(value) {
    return this.#escapeHtml(value).replaceAll('"', '&quot;');
  }

  #fishDetailsMarkup(fish, simTimeSec) {
    const corpseDirtApplied01 = Number.isFinite(fish.corpseDirtApplied01) ? fish.corpseDirtApplied01 : 0;
    const canDiscard = fish.lifeState === 'DEAD' && !fish.corpseRemoved && corpseDirtApplied01 <= 0;
    const liveName = fish.name?.trim() || '';
    const draftName = this.nameDraftByFishId.get(fish.id) ?? liveName;
    const aquariumClockSec = fish.lifeState === 'DEAD' && Number.isFinite(fish.deadAtSec)
      ? fish.deadAtSec
      : simTimeSec;
    const aquariumTime = this.#formatMMSS(fish.ageSeconds(aquariumClockSec));

    const isPregnant = fish.sex === 'female' && (fish.repro?.state === 'GRAVID' || fish.repro?.state === 'LAYING');
    const pregnantMarkup = isPregnant
      ? '<div class="status-line status--pregnant">pregnant</div>'
      : '';

    const speciesLabel = fish.speciesId === 'AZURE_DART'
      ? 'Azure Dart'
      : (fish.speciesId === 'SILT_SIFTER' ? 'Silt Sifter' : 'Lab Minnow');
    const infoRows = `
      <label class="control-group fish-name-group"><span>Name</span><input type="text" maxlength="24" value="${this.#escapeAttribute(draftName)}" data-fish-name-input placeholder="Fish name" /></label>
      <div class="stat-row"><span>Fish ID</span><strong>${fish.id}</strong></div>
      <div class="stat-row"><span>Species</span><strong>${speciesLabel}</strong></div>
      <div class="stat-row"><span>Sex</span><strong>${fish.sex}</strong></div>
      <div class="stat-row"><span>Life Stage</span><strong>${typeof fish.lifeStageLabel === 'function' ? fish.lifeStageLabel() : (fish.lifeStage ?? '')}</strong></div>
      <div class="stat-row"><span>Hunger</span><strong>${fish.hungerState}</strong></div>
      <div class="stat-row"><span>Wellbeing</span><strong>${Math.round(fish.wellbeing01 * 100)}%</strong></div>
      <div class="stat-row"><span>Aquarium Time</span><strong>${aquariumTime}</strong></div>
      ${pregnantMarkup}
    `;

    const history = fish.history ?? {};
    const motherValue = this.#historyFishReference(history.motherId);
    const fatherValue = this.#historyFishReference(history.fatherId);
    const lifetimeValue = this.#formatMMSS(typeof fish.getLifeTimeSec === 'function' ? fish.getLifeTimeSec(simTimeSec) : 0);
    const [childrenSummary] = this.#historyFishReferenceList(history.childrenIds);

    const historyRows = `
      <div class="stat-row"><span>Mother</span><strong>${motherValue}</strong></div>
      <div class="stat-row"><span>Father</span><strong>${fatherValue}</strong></div>
      <div class="stat-row"><span>Born in aquarium</span><strong>${history.bornInAquarium ? 'Yes' : 'No'}</strong></div>
      <div class="stat-row"><span>Life duration</span><strong>${lifetimeValue}</strong></div>
      <div class="stat-row"><span>Died</span><strong>${this.#deathReasonLabel(fish)}</strong></div>
      <div class="stat-row"><span>Meals eaten</span><strong>${Math.max(0, Math.floor(history.mealsEaten ?? 0))}</strong></div>
      <div class="stat-row"><span>Times mated</span><strong>${Math.max(0, Math.floor(history.mateCount ?? 0))}</strong></div>
      <div class="stat-row"><span>Children</span><strong>${childrenSummary}</strong></div>
    `;

    const tabInfoActive = this.currentInspectorDetailTab !== 'history';
    const tabHistoryActive = this.currentInspectorDetailTab === 'history';

    return `
      <div class="fish-detail-tabs" role="tablist" aria-label="Fish detail sections">
        <button type="button" class="fish-detail-tab${tabInfoActive ? ' active' : ''}" data-fish-detail-tab="info" role="tab" aria-selected="${tabInfoActive}">Info</button>
        <button type="button" class="fish-detail-tab${tabHistoryActive ? ' active' : ''}" data-fish-detail-tab="history" role="tab" aria-selected="${tabHistoryActive}">History</button>
      </div>
      <div class="fish-detail-pane${tabInfoActive ? ' active' : ''}" data-fish-detail-pane="info">${infoRows}</div>
      <div class="fish-detail-pane${tabHistoryActive ? ' active' : ''}" data-fish-detail-pane="history">${historyRows}</div>
      ${canDiscard ? '<div class="button-row"><button type="button" data-fish-discard>Remove from tank</button></div>' : ''}
    `;
  }

  resolveFishLabelById(id) {
    if (id == null) return '—';
    const directFish = this.handlers.onGetFishById?.(id);
    const numericFish = directFish ?? this.handlers.onGetFishById?.(Number(id));
    const fish = numericFish ?? null;
    const resolvedName = fish?.name?.trim();
    return resolvedName || String(id);
  }



  #historyFishReference(id) {
    if (id == null) return '—';
    const label = this.resolveFishLabelById(id);
    const fishId = Number(id);
    if (!Number.isFinite(fishId)) return this.#escapeHtml(label);
    return `<button type="button" class="history-fish-link" data-history-fish-id="${fishId}">${this.#escapeHtml(label)}</button>`;
  }

  #historyFishReferenceList(ids) {
    const normalized = Array.isArray(ids) ? ids : [];
    if (normalized.length === 0) return ['—', '<div class="history-child-item">—</div>'];

    const summary = normalized.map((id) => this.#historyFishReference(id)).join(', ');
    const listMarkup = normalized
      .map((id) => `<div class="history-child-item">${this.#historyFishReference(id)}</div>`)
      .join('');
    return [summary, listMarkup];
  }

  #deathReasonLabel(fish) {
    if (!fish || fish.lifeState !== 'DEAD') return '—';
    if (fish.deathReason === 'OLD_AGE') return 'Old age';
    if (fish.deathReason === 'STARVATION') return 'Starvation';
    return '—';
  }

  #formatMMSS(seconds) {
    const total = Math.max(0, Math.floor(seconds ?? 0));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}
