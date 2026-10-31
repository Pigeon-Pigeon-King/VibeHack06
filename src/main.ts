import { ACESFilmicToneMapping, BoxGeometry, CanvasTexture, Color, ConeGeometry, FogExp2, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, RingGeometry, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { CharacterModel, EnvironmentModel, RunMode, ScenarioId, UiState, Vec3 } from './contracts';
import { buildEnvironment } from './presentation/environment';
import { createImportedCharacter } from './presentation/ImportedCharacter';
import { GeneratedSceneAssets } from './presentation/GeneratedSceneAssets';
import type { MissionAudioState } from './audio/contracts';
import { dialogueCues, dialogueSkipAvailable } from './audio/dialogue-events';
import { ImportedWeaponView } from './presentation/ImportedWeaponView';
import { createIndirectLighting } from './presentation/IndirectLighting';
import { ModelLibrary } from './assets/ModelLibrary';
import { ak47Source } from './assets/weapon-catalog';
import type { ModelLoadProgress } from './assets/model-contracts';
import { Feedback } from './presentation/Feedback';
import { Sound } from './presentation/Sound';
import { Input } from './player/Input';
import { initializePhysics, FIXED_DT } from './runtime/Physics';
import { Simulation, distance, type Snapshot } from './mission/Simulation';
import { GameUI } from './ui/GameUI';
import { ObjectiveIndicator } from './ui/ObjectiveIndicator';
import { TouchControls } from './ui/TouchControls';
import { bindPageLifecycle } from './runtime/PageLifecycle';
import { objectiveFocusOpacity, smoothObjectiveOpacity } from './ui/objective-focus';
import { HeldItemMotion, type HeldItem } from './presentation/HeldItemMotion';
import { openingView } from './presentation/OpeningView';
import { OPENING_TIMELINE, openingCrowdHitTime } from './content/opening-timeline';
import { CrowdView } from './presentation/CrowdView';
import { LAYOUT } from './content/layout';
import { carryFacts, CHAPTER_STAGES, nextStage, stageFor, type ChapterProgress } from './content/chapter-flow';
import { SAVE_KEY_PREFIX, SaveStore, type SavedGame, type SaveSlot } from './persistence/SaveStore';
import { escortPatients } from './mission/Escort';
import { ESCORT } from './content/escort-layout';
import { RELIEF } from './content/relief-layout';
import { DepartureMonitor } from './presentation/DepartureMonitor';
import { CareView } from './presentation/CareView';

function label(text: string, color = '#e4e6dd'): Sprite {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.font = '500 32px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = 'rgba(10,22,29,0.78)'; context.fillRect(25, 12, 462, 72);
  context.fillStyle = color; context.fillText(text, 256, 48);
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sprite.scale.set(2.8, 0.525, 1); return sprite;
}
function disposeLabel(sprite: Sprite): void { sprite.material.map?.dispose(); sprite.material.dispose(); }
function carriedSupply(): Group {
  const root = new Group();
  const body = new Mesh(new BoxGeometry(0.62, 0.34, 0.42), new MeshStandardMaterial({ color: 0x668b86, roughness: 0.82 }));
  root.add(body);
  for (const x of [-0.19, 0.19]) {
    const strap = new Mesh(new BoxGeometry(0.045, 0.35, 0.43), new MeshStandardMaterial({ color: 0xc6b077, roughness: 0.9 }));
    strap.position.x = x; root.add(strap);
  }
  for (const side of [-1, 1]) {
    const glove = new Mesh(new BoxGeometry(0.13, 0.12, 0.20), new MeshStandardMaterial({ color: 0x26353b, roughness: 0.9 }));
    glove.position.set(side * 0.34, -0.02, 0.035); root.add(glove);
    const sleeve = new Mesh(new BoxGeometry(0.15, 0.15, 0.35), new MeshStandardMaterial({ color: 0x56696c, roughness: 0.9 }));
    sleeve.position.set(side * 0.40, -0.08, 0.24); sleeve.rotation.y = -side * 0.28; root.add(sleeve);
  }
  root.position.set(0, -0.44, -0.72); return root;
}

class Game {
  private readonly aiDiagnostics = import.meta.env.DEV && new URLSearchParams(location.search).has('ai-debug');
  private presentationEpoch = 0;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.045, 1000);
  private readonly renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly indirectLighting: ReturnType<typeof createIndirectLighting>;
  private readonly sound = new Sound();
  private readonly feedback = new Feedback();
  private readonly modelLibrary = new ModelLibrary();
  private equipment: { state: 'loading' | 'ready' | 'error'; message?: string; progress?: ModelLoadProgress } = { state: 'loading' };
  private readonly weapon = new ImportedWeaponView(this.modelLibrary, ak47Source(document.baseURI), state => { this.equipment = state; });
  private readonly supply = carriedSupply();
  private readonly heldItems = new HeldItemMotion();
  private readonly care = new CareView();
  private readonly crowd = new CrowdView();
  private monitor?: DepartureMonitor;
  private readonly ui: GameUI;
  private readonly objectiveIndicator: ObjectiveIndicator;
  private readonly input: Input;
  private readonly touchControls: TouchControls;
  private readonly characters = new Map<string, { model: CharacterModel; label?: Sprite; name: string; role: string }>();
  private readonly marker = new Group();
  private readonly markerLabel = label('目标', '#f4d49e');
  private readonly markerMaterials: Array<{ material: MeshBasicMaterial | SpriteMaterial; opacity: number }> = [];
  private markerOpacity = 1;
  private environment!: EnvironmentModel;
  private generatedScenery?: GeneratedSceneAssets;
  private readonly sceneAssetErrors = new Set<string>();
  private readonly characterAssetErrors = new Set<string>();
  private pendingJetApproach = false;
  private sim!: Simulation;
  private mode: RunMode = 'menu';
  private lowMotion = false;
  private touchPreference?: boolean;
  private historySuspended = false;
  private disposed = false;
  private error = '';
  private pointerError = '';
  private accumulator = 0;
  private previousTime = performance.now();
  private frame = 0;
  private fps = 60;
  private ads = 0;
  private lastFootstep = 0;
  private raf = 0;
  private abort = new AbortController();
  private store?: SaveStore;
  private savedCampaign?: SavedGame;
  private chapter?: ChapterProgress;
  private saveNotice = '';
  private writeErrors = { checkpoint: '', settings: '' };
  private qaImported = false;

  constructor() {
    const view = document.querySelector<HTMLElement>('#game-view')!;
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.weapon.setViewportAspect(this.camera.aspect);
    this.indirectLighting = createIndirectLighting(this.renderer);
    this.scene.environment = this.indirectLighting.texture;
    this.scene.environmentIntensity = 0.55;
    view.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '游戏画面');
    this.renderer.domElement.tabIndex = -1;
    this.scene.background = new Color(0x677e8d); this.scene.fog = new FogExp2(0x677e8d, 0.008);
    this.camera.rotation.order = 'YXZ'; this.camera.add(this.weapon.root, this.supply); this.scene.add(this.camera, this.feedback.root, this.marker, this.care.root, this.crowd.root);
    const ring = new Mesh(new RingGeometry(0.5, 0.58, 32), new MeshBasicMaterial({ color: 0xe7c782, side: 2, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    const arrow = new Mesh(new ConeGeometry(0.16, 0.35, 4), new MeshBasicMaterial({ color: 0xe7c782, transparent: true, depthWrite: false }));
    arrow.rotation.z = Math.PI; arrow.position.y = 2.7; this.markerLabel.position.y = 3.2;
    this.marker.add(ring, arrow, this.markerLabel);
    this.markerMaterials.push({ material: ring.material, opacity: 0.8 }, { material: arrow.material, opacity: 1 }, { material: this.markerLabel.material, opacity: 1 });
    this.input = new Input(this.renderer.domElement, () => this.pause(), message => { this.pointerError = message; });
    try {
      this.store = new SaveStore(window.localStorage);
      const restored = this.store.getSettings();
      this.input.sensitivity = restored.settings.sensitivity; this.sound.setVolume(restored.settings.volume); this.lowMotion = restored.settings.lowMotion;
      this.touchPreference = restored.settings.touchControls;
      if (this.touchPreference !== undefined) this.input.setTouchEnabled(this.touchPreference);
      this.saveNotice = restored.warning ?? '';
      this.refreshCampaign();
    } catch { this.saveNotice = '当前环境不能访问本机存档；本次行动仍可重试检查点。'; }
    this.ui = new GameUI(document.querySelector('#game-ui')!, {
      start: id => this.start(id), startChapter: () => this.startChapter(), continueChapter: () => this.continueChapter(), nextStage: () => this.advanceChapter(),
      resume: () => this.resume(), retry: () => this.retry(), restart: () => this.restart(),
      menu: () => this.menu(), setSensitivity: value => { this.input.sensitivity = value; this.persistSettings(); },
      importCheckpoint: import.meta.env.DEV ? file => { void this.importCheckpoint(file); } : undefined,
      setVolume: value => { this.sound.setVolume(value); this.persistSettings(); }, setLowMotion: value => { this.lowMotion = value; this.persistSettings(); },
      setTouchControls: value => { this.touchPreference = value; this.input.setTouchEnabled(value); this.pointerError = ''; this.persistSettings(); },
      retryEquipment: () => this.weapon.retry(),
    });
    this.touchControls = new TouchControls(document.querySelector('#game-ui')!, {
      move: (forward, right) => this.input.setTouchMove(forward, right),
      look: (yaw, pitch) => this.input.addTouchLook(yaw, pitch),
      action: (action, down) => this.input.setTouchAction(action, down),
      active: action => this.input.isTouchActionDown(action), pause: () => this.pause(),
    });
    this.objectiveIndicator = new ObjectiveIndicator(document.querySelector('#game-ui')!);
    this.load('nightshift');
    window.addEventListener('resize', () => {
      this.input.clearTouch();
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight);
      this.weapon.setViewportAspect(this.camera.aspect);
    }, { signal: this.abort.signal });
    bindPageLifecycle(window, {
      suspend: () => {
        this.pause(); this.input.clear(); this.sound.pause();
        this.historySuspended = true; cancelAnimationFrame(this.raf);
      },
      restore: () => {
        if (this.disposed) return;
        this.historySuspended = false; this.accumulator = 0; this.previousTime = performance.now();
        this.raf = requestAnimationFrame(this.animate);
      },
      dispose: () => this.dispose(),
    }, this.abort.signal);
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.error = '图形上下文已失效，请刷新页面重新进入。'; this.pause(); }, { signal: this.abort.signal });
    this.animate();
  }

  private get heldItem(): HeldItem {
    const { mission: m, scenario } = this.sim;
    if (m.control === 'combat') return 'weapon';
    return scenario === 'nightshift' && m.facts.includes('supplies-collected') && !m.facts.includes('supplies-delivered')
      || scenario === 'medical' && m.phase === 1 ? 'supply' : 'none';
  }

  private load(id: ScenarioId, saved?: Snapshot, priorFacts: readonly string[] = []): void {
    this.presentationEpoch++;
    this.pendingJetApproach = false;
    this.generatedScenery?.dispose(); this.generatedScenery = undefined; this.sceneAssetErrors.clear();
    this.characterAssetErrors.clear();
    this.sim?.dispose();
    if (this.monitor) { this.scene.remove(this.monitor.screen); this.monitor.dispose(); this.monitor = undefined; }
    if (this.environment) { this.scene.remove(this.environment.root); this.environment.dispose(); }
    for (const { model, label: tag } of this.characters.values()) { this.scene.remove(model.root); model.dispose(); if (tag) { this.scene.remove(tag); disposeLabel(tag); } }
    this.characters.clear(); this.crowd.clear(); this.feedback.clear(); this.sound.stopTransient();
    this.environment = buildEnvironment(id); this.scene.add(this.environment.root);
    const sceneEpoch = this.presentationEpoch;
    this.generatedScenery = new GeneratedSceneAssets(this.modelLibrary, {
      parent: this.environment.root, scenario: id, baseURL: document.baseURI,
      onStatus: status => {
        if (this.disposed || sceneEpoch !== this.presentationEpoch) return;
        if (status.state === 'error') this.sceneAssetErrors.add(status.id);
        else this.sceneAssetErrors.delete(status.id);
      },
    });
    // S12 opens onto the distant arrival corridor; the combat-area haze hid
    // the incoming escorts at a few hundred metres. Restore it in other scenes.
    this.scene.fog = new FogExp2(0x677e8d, id === 'epilogue' ? 0.004 : 0.008);
    this.sim = new Simulation(id, this.environment.solids, saved, priorFacts);
    this.sound.setScene(this.presentationEpoch, this.missionAudioState());
    if (!saved) this.speakCurrentLine();
    this.heldItems.reset(this.heldItem);
    if (id === 'escort') { this.monitor = new DepartureMonitor(); this.scene.add(this.monitor.screen); }
    this.input.yaw = this.sim.player.yaw; this.input.pitch = this.sim.player.pitch;
    this.input.clear(); this.accumulator = 0; this.ads = 0; this.lastFootstep = 0;
  }
  private start(id: ScenarioId): void {
    this.qaImported = false;
    this.chapter = undefined;
    const restored = this.store?.load(id);
    if (restored?.warning) this.saveNotice = restored.warning;
    this.load(id, restored?.save?.snapshot.mission.complete ? undefined : restored?.save?.snapshot);
    this.persistCheckpoint(); this.begin();
  }
  private startChapter(): void {
    this.qaImported = false;
    this.chapter = { chapter: 'campaign', stage: 'S01', elapsedBefore: 0 };
    this.load('childhood'); this.persistCheckpoint(); this.begin();
  }
  private continueChapter(): void {
    this.qaImported = false;
    this.refreshCampaign();
    if (!this.savedCampaign?.chapter) return;
    this.chapter = structuredClone(this.savedCampaign.chapter);
    this.load(this.savedCampaign.snapshot.mission.scenario, this.savedCampaign.snapshot); this.begin();
  }
  private advanceChapter(): void {
    const next = nextStage(this.sim.scenario);
    if (!this.chapter || !this.sim.mission.complete || !next) return;
    const facts = carryFacts(next.id, this.sim.mission.facts);
    this.chapter = { chapter: 'campaign', stage: next.id, elapsedBefore: this.chapter.elapsedBefore + this.sim.mission.elapsed };
    this.load(next.scenario, undefined, facts); this.persistCheckpoint(); this.begin();
  }
  private restart(): void {
    const facts = this.chapter ? carryFacts(this.chapter.stage, this.sim.mission.facts) : [];
    this.load(this.sim.scenario, undefined, facts); this.persistCheckpoint(); this.begin();
  }
  private begin(): void {
    this.error = ''; this.pointerError = '';
    if (this.sim.mission.complete) { this.mode = 'complete'; this.input.enabled = false; this.input.clear(); this.input.unlock(); this.sound.pause(); return; }
    this.mode = 'playing'; this.input.enabled = true; this.renderer.domElement.focus(); this.input.lock();
    void this.sound.unlock().catch(() => { this.error = '音频未能启动；字幕和视觉反馈仍可用。'; });
  }
  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused'; this.input.enabled = false; this.input.clear(); this.input.unlock(); this.accumulator = 0; this.sound.pause();
  }
  private resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing'; this.input.enabled = true; this.input.clear(); this.renderer.domElement.focus(); this.input.lock();
    void this.sound.unlock().catch(() => { this.error = '音频未能恢复；字幕和视觉反馈仍可用。'; });
  }
  private retry(): void { const saved = this.sim.checkpoint; this.load(this.sim.scenario, saved); this.mode = 'paused'; this.resume(); }
  private menu(): void { this.pause(); this.mode = 'menu'; this.input.enabled = false; this.input.clear(); this.input.unlock(); this.sound.stopTransient(); this.sound.pause(); this.refreshCampaign(); }
  private refreshCampaign(): void {
    const result = this.store?.load('campaign');
    this.savedCampaign = result?.save;
    if (result?.warning) this.saveNotice = result.warning;
  }
  private persistSettings(): void {
    const result = this.store?.saveSettings({ sensitivity: this.input.sensitivity, volume: this.sound.volume, lowMotion: this.lowMotion,
      ...(this.touchPreference !== undefined ? { touchControls: this.touchPreference } : {}) });
    if (result) this.writeErrors.settings = result.ok ? '' : result.error ?? '设置保存失败。';
  }
  private persistCheckpoint(snapshot = this.sim.checkpoint): void {
    if (import.meta.env.DEV && this.qaImported) return;
    const result = this.store?.save(this.chapter ? 'campaign' : this.sim.scenario, snapshot, this.chapter);
    if (!result) return;
    this.writeErrors.checkpoint = result.ok ? '' : result.error ?? '检查点保存失败。';
    if (result.ok && this.chapter) this.savedCampaign = { snapshot: structuredClone(snapshot), chapter: structuredClone(this.chapter), savedAt: Date.now() };
  }

  private async importCheckpoint(file: File): Promise<void> {
    if (!import.meta.env.DEV) return;
    try {
      if (file.size > 1_000_000) throw new Error('检查点文件超过大小限制。');
      const raw = await file.text(), envelope: unknown = JSON.parse(raw);
      if (!envelope || typeof envelope !== 'object' || !('slot' in envelope) || typeof envelope.slot !== 'string') throw new Error('检查点信封缺少槽位。');
      // Use the ordinary strict parser, with isolated memory storage. QA imports
      // must never overwrite the player's campaign or independent-scene slots.
      const slot = envelope.slot as SaveSlot;
      const loaded = new SaveStore({
        getItem: key => key === `${SAVE_KEY_PREFIX}${slot}` ? raw : null,
        setItem: () => {}, removeItem: () => {},
      }).load(slot);
      if (!loaded.save) throw new Error(loaded.warning ?? '检查点无效。');
      this.qaImported = true; this.chapter = loaded.save.chapter;
      this.load(loaded.save.snapshot.mission.scenario, loaded.save.snapshot); this.begin();
    } catch (error) { this.error = error instanceof Error ? error.message : '检查点无法读取。'; }
  }

  private missionAudioState(): MissionAudioState {
    const m = this.sim.mission;
    return { scenario: this.sim.scenario, phase: m.phase, control: m.control, facts: m.facts, elapsed: m.elapsed };
  }
  private speakCurrentLine(): void {
    const m = this.sim.mission;
    // Only genuinely new scenes enqueue their initial line; restored scenes do not.
    this.sound.say({ epoch: this.presentationEpoch, revision: m.subtitleUntil, scenario: this.sim.scenario,
      speaker: m.speaker, text: m.subtitle, elapsed: m.elapsed, expiresAt: m.subtitleUntil });
  }
  private finishPresentation(): void {
    this.mode = this.sim.mission.failed ? 'failed' : 'complete';
    this.input.enabled = false; this.input.clear(); this.input.unlock(); this.sound.pause();
  }
  private canSkipPresentation(): boolean {
    return this.sim.mission.complete || dialogueSkipAvailable(this.sim);
  }
  private simulate(): void {
    const oldPhase = this.sim.mission.phase;
    const hadFirstWave = this.sim.has('first-wave-approaching');
    const bombarded = this.sim.has('history-bombardment'), collapsed = this.sim.has('history-collapse');
    const intent = this.input.read(FIXED_DT);
    // Mission completion is already saved. Drain only its presentation here;
    // Simulation.step would otherwise leave the previous step's events intact.
    if (this.sim.mission.complete) {
      if (intent.skip) this.sound.stopTransient();
      this.sound.advanceDialogue(FIXED_DT);
      if (!this.sound.hasPendingDialogue()) this.finishPresentation();
      return;
    }
    const requestedSkip = intent.skip && this.sim.mission.control === 'staged';
    const allowedBeforeStep = intent.skip && this.canSkipPresentation();
    if (allowedBeforeStep) this.sound.stopTransient();
    this.sim.step(intent);
    this.sound.updateMission(this.missionAudioState());
    const m = this.sim.mission;
    // Arrival can satisfy a skip prerequisite during this very simulation step.
    const skipped = allowedBeforeStep || requestedSkip && (m.phase !== oldPhase || m.complete);
    if (skipped && !allowedBeforeStep) this.sound.stopTransient();
    for (const cue of dialogueCues(this.sim.events, m, this.presentationEpoch, skipped)) this.sound.say(cue);
    this.sound.advanceDialogue(FIXED_DT);
    if (!hadFirstWave && this.sim.has('first-wave-approaching')) this.pendingJetApproach = true;
    const liveHall = this.sim.scenario === 'mainhall' && oldPhase === 4 && this.sim.mission.phase === 4 && this.sim.has('history-timeline-v2');
    if (liveHall && !bombarded && this.sim.has('history-bombardment')) this.sound.blast();
    if (liveHall && !collapsed && this.sim.has('history-collapse')) this.sound.collapse();
    // Viewpoint changes have explicit body state; the next input frame starts there.
    if (oldPhase !== this.sim.mission.phase || this.sim.mission.control === 'staged') {
      this.input.pitch = this.sim.player.pitch; this.input.yaw = this.sim.player.yaw;
    }
    for (const e of this.sim.events) {
      if (e.type === 'shot') {
        const listener = this.sim.player;
        const relative = e.position ? ((e.position[0] - listener.position[0]) * Math.cos(listener.yaw)
          - (e.position[2] - listener.position[2]) * Math.sin(listener.yaw)) / 20 : 0;
        this.sound.shot(e.enemy, relative);
      } else if (e.type === 'impact' && e.position) this.feedback.impact(e.position, e.enemy);
      else if (e.type === 'hit') this.sound.hit(e.killed);
      else if (e.type === 'hurt') this.sound.hurt();
      else if (e.type === 'reload') this.sound.reload();
      else if (e.type === 'objective' && intent.interact) this.sound.objective();
      else if (e.type === 'checkpoint') this.persistCheckpoint();
    }
    const step = Math.floor(this.sim.player.walk / Math.PI);
    if (step !== this.lastFootstep) {
      this.lastFootstep = step;
      if (this.sim.physics.bodies.get('player')?.grounded) this.sound.footstep();
    }
    if (this.sim.mission.failed || this.sim.mission.complete) {
      if (this.sim.mission.complete) this.persistCheckpoint(this.sim.snapshot());
      if (this.sim.mission.failed) this.sound.stopTransient();
      if (this.sim.mission.failed || !this.sound.hasPendingDialogue()) this.finishPresentation();
    }
  }

  private present(dt: number): void {
    const sim = this.sim, p = sim.player, m = sim.mission, objective = sim.objective;
    const active = this.mode === 'playing';
    const sceneFrame = { scenario: sim.scenario, phase: m.phase, phaseTime: m.phaseTime, lowMotion: this.lowMotion };
    const history = openingView(sceneFrame, m.facts);
    this.camera.position.set(...sim.playerEye);
    this.camera.position.y += history.eyeLift + history.shake;
    if (!this.lowMotion && active && m.control !== 'staged') this.camera.position.y += Math.sin(p.walk * 2) * 0.018;
    this.camera.rotation.set(p.pitch + (this.lowMotion ? 0 : p.recoil * 0.012), p.yaw, history.shake * 0.6, 'YXZ');
    const motionDt = active ? dt : 0;
    this.ads += ((p.ads ? 1 : 0) - this.ads) * Math.min(1, motionDt * 14);
    this.camera.fov = 75 - this.ads * 21; this.camera.updateProjectionMatrix();
    this.weapon.setPose(p.recoil, p.reload > 0 ? 1 - p.reload / 2.1 : 0, this.ads, this.lowMotion ? 0 : p.walk);
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const near = this.camera.position.clone().addScaledVector(forward, 0.9);
    const pose = this.heldItems.update(this.heldItem, motionDt, this.lowMotion, p.cooldown > 0,
      Boolean(sim.physics.trace(sim.playerEye, [near.x, near.y, near.z], 'player', true)));
    this.weapon.root.visible = pose.weapon > 0;
    this.weapon.root.position.y -= (1 - pose.weapon) * 0.62 + pose.wall * 0.15;
    this.weapon.root.position.z += (1 - pose.weapon) * 0.18;
    this.weapon.root.rotation.x -= (1 - pose.weapon) * 0.55;
    this.supply.visible = pose.supply > 0;
    this.supply.position.set(0, -0.44 - (1 - pose.supply) * 0.62, -0.72 + (1 - pose.supply) * 0.20);
    this.supply.rotation.x = (1 - pose.supply) * 0.16;
    this.environment.setFacts?.(m.facts);
    this.environment.update(m.elapsed, this.camera.position, sceneFrame);
    if (active && this.pendingJetApproach && this.environment.root.userData.airCoverStatus === 'ready') {
      const aircraft = this.environment.root.getObjectByName('epilogue-air-cover-1');
      if (aircraft?.visible) {
        const relative = aircraft.getWorldPosition(new Vector3()).sub(this.camera.position).normalize();
        const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.sound.jetApproach(relative.dot(right)); this.pendingJetApproach = false;
      }
    }
    const seated = sim.scenario === 'relief' && m.phase === 7;
    const transferring = sim.scenario === 'escort' && m.phase === 11;
    const transferProgress = transferring ? Math.min(1, m.phaseTime / 8) : 0;
    const oldBed = transferring ? sim.actors.find(a => a.id === 'cart-0') : undefined;
    const newBed = transferring ? sim.actors.find(a => a.id === 'cart-2') : undefined;
    const transferPatient: Vec3 | undefined = oldBed && newBed ? oldBed.position.map((v, i) => v + (newBed.position[i] - v) * transferProgress) as Vec3 : undefined;
    const transferYaw = transferPatient ? Math.atan2(-(transferPatient[0] - p.position[0]), -(transferPatient[2] - p.position[2])) : p.yaw;
    const rescueCarry = sim.scenario === 'rescue' && (m.phase === 3 || m.phase === 4);
    this.care.update(p.position, rescueCarry ? -Math.PI / 2 : seated ? RELIEF.seatYaw : transferYaw,
      seated ? 'seat' : transferring || rescueCarry ? 'transfer' : 'none',
      rescueCarry ? m.phase === 3 ? m.phaseTime / 6 : 1 : seated ? m.phaseTime / 13 : transferProgress, sim.has('zhou-brace-adjusted'));
    this.sound.setVentilation(sim.scenario === 'nightshift' && m.facts.includes('fan-restarted'));
    const seen = new Set<string>();
    for (const actor of sim.actors) {
      seen.add(actor.id);
      let item = this.characters.get(actor.id);
      if (item && item.role !== actor.role) {
        this.scene.remove(item.model.root); item.model.dispose();
        if (item.label) { this.scene.remove(item.label); disposeLabel(item.label); }
        this.characters.delete(actor.id); item = undefined;
      }
      if (!item) {
        const epoch = this.presentationEpoch;
        const crowdActor = (sim.scenario === 'childhood' || sim.scenario === 'mainhall')
          && actor.role === 'civilian' && /^(late-civilian-|evac-crowd-|civilian-)/.test(actor.id);
        const model = crowdActor ? this.crowd.create() : createImportedCharacter(this.modelLibrary,
          { id: actor.id, name: actor.name, role: actor.id.startsWith('hall-invader-') ? 'enemy' : actor.role }, document.baseURI, status => {
            if (epoch !== this.presentationEpoch) return;
            if (status.state === 'error') this.characterAssetErrors.add(actor.id);
            else this.characterAssetErrors.delete(actor.id);
          });
        const anonymous = /^(hall-invader-|hall-defender-|late-civilian-|evac-crowd-|civilian-)/.test(actor.id);
        const tag = actor.role !== 'enemy' && !anonymous ? label(actor.name, actor.role === 'worker' ? '#efc78b' : '#c5e3dc') : undefined;
        item = { model, label: tag, name: actor.name, role: actor.role }; this.characters.set(actor.id, item); this.scene.add(model.root); if (tag) this.scene.add(tag);
      }
      if (item.label && item.name !== actor.name) {
        this.scene.remove(item.label); disposeLabel(item.label);
        item.label = label(actor.name, actor.role === 'worker' ? '#efc78b' : '#c5e3dc'); item.name = actor.name;
        this.scene.add(item.label);
      }
      item.model.root.position.set(...actor.position); item.model.root.rotation.y = actor.yaw;
      if (actor.id === 'medic' && transferPatient && oldBed) {
        const footX = transferPatient[0] - Math.sin(oldBed.yaw) * 0.8;
        const footZ = transferPatient[2] - Math.cos(oldBed.yaw) * 0.8;
        // NPC models face +Z; the first-person hands above face -Z.
        item.model.root.rotation.y = Math.atan2(footX - actor.position[0], footZ - actor.position[2]);
      }
      const hallInvader = sim.scenario === 'mainhall' && (actor.id === 'shao' || actor.id.startsWith('hall-invader-'));
      item.model.root.visible = !(sim.scenario === 'escort' && actor.role === 'enemy' && actor.safe) && (!hallInvader || history.invaders);
      let patientOffset: Vec3 | undefined;
      if (transferring && actor.id === 'cart-0') {
        const replacement = sim.actors.find(a => a.id === 'cart-2')!;
        const dx = replacement.position[0] - actor.position[0], dz = replacement.position[2] - actor.position[2];
        patientOffset = [(dx * Math.cos(actor.yaw) - dz * Math.sin(actor.yaw)) * transferProgress,
          Math.sin(transferProgress * Math.PI) * 0.13, (dx * Math.sin(actor.yaw) + dz * Math.cos(actor.yaw)) * transferProgress];
      }
      const stagedWalker = active && m.control === 'staged' && (sim.scenario === 'childhood' || sim.scenario === 'mainhall')
        && (['father', 'evacuator', 'daughter', 'young-lu', 'zhao', 'shao'].includes(actor.id)
          || /^(hall-invader-|hall-defender-|late-civilian-|evac-crowd-)/.test(actor.id));
      const crowdHitTime = actor.id.startsWith('late-civilian-') ? openingCrowdHitTime(Number(actor.id.slice(14))) : undefined;
      item.model.setPose({ walk: actor.goals.length || actor.combat?.moving || stagedWalker ? actor.walk : 0, aiming: actor.aiming, down: actor.down,
        fallProgress: actor.down && crowdHitTime !== undefined && sim.scenario === 'mainhall'
          ? !sim.has('history-timeline-v2') || history.time < crowdHitTime ? 1 : (history.time - crowdHitTime) / 0.4 : undefined,
        armed: actor.role === 'enemy' || actor.role === 'ally' && sim.scenario !== 'transfer'
          && !(sim.scenario === 'flank' && (m.control !== 'combat' || actor.id === 'meng'))
          && !(sim.scenario === 'escort' && m.control !== 'combat')
          && !(sim.scenario === 'relief' && actor.id === 'zheng' && m.phase >= 6)
          && !(sim.scenario === 'rescue' && (m.control !== 'combat' || actor.id === 'meng' && m.phase >= 1))
          && sim.scenario !== 'medical' && sim.scenario !== 'epilogue'
          && !(sim.scenario === 'mainhall' && actor.id === 'zhao' && sim.has('history-collapse'))
          || actor.role === 'opponent' && (sim.scenario === 'mainhall' ? history.invaders : m.phase > 4 || m.phaseTime >= 18)
          || actor.id === 'father' && m.facts.includes('father-rifle-collected') && !actor.down,
        crouched: actor.combat?.crouched,
        kneeling: actor.id === 'zhao' && history.restrained
          || actor.id === 'father' && sim.scenario === 'childhood' && m.phase === 3 && m.phaseTime >= OPENING_TIMELINE.childhood.rifle - 1 && m.phaseTime < OPENING_TIMELINE.childhood.departure
          || actor.id === 'zheng' && seated && !actor.goals.length && m.phaseTime < 14,
        reaching: actor.id === 'zhao' ? history.reaching : 0,
        restrained: actor.id === 'zhao' && history.restrained,
        care: actor.id === 'zheng' && seated && !actor.goals.length && m.phaseTime < 14,
        gesture: sim.scenario === 'transfer' && actor.id === 'zhou' && m.phase === 4 && m.speaker === '周延' ? 0.35 + Math.sin(m.phaseTime * 2.2) * 0.12 : 0,
        lookAway: sim.scenario === 'transfer' && actor.id === 'zhou' && m.phase === 4 && m.phaseTime >= 42 && m.phaseTime < 49 ? -0.3 : 0,
        occupied: actor.id !== 'supply-cart' && actor.id !== 'zhou-cart' && (sim.scenario !== 'escort' || actor.id !== 'cart-0' && actor.id !== 'cart-2'
          || actor.id === 'cart-0' && !sim.has('escort-patient-transferred') || actor.id === 'cart-2' && sim.has('escort-patient-transferred')),
        damaged: sim.scenario === 'escort' && actor.id === 'cart-0' && sim.has('escort-wheel-jammed'), patientOffset,
        cargo: actor.id === 'supply-cart', orderly: sim.scenario !== 'medical' && !(sim.scenario === 'rescue' && m.phase <= 7),
        carrying: (actor.id === 'father' && sim.scenario === 'prologue' && m.phase === 1)
          || (actor.id === 'zheng' && sim.scenario === 'handover' && m.phase === 4)
          || (actor.id === 'zheng' && rescueCarry)
          || (actor.id === 'medic' && transferring) });
      if (item.label) {
        item.label.position.set(actor.position[0], actor.position[1] + 2.1, actor.position[2]);
        const size = Math.min(1, this.camera.position.distanceTo(item.label.position) / 10);
        item.label.scale.set(2.8 * size, 0.525 * size, 1);
        item.label.visible = item.model.root.visible && !actor.down && distance(actor.position, p.position) < 24
          && !(sim.scenario === 'mainhall' && actor.id === 'shao' && !sim.has('shao-identified-by-zhou'));
      }
    }
    this.marker.visible = active && m.control !== 'staged';
    this.marker.position.set(...objective.point);
    this.markerOpacity = smoothObjectiveOpacity(this.markerOpacity, objectiveFocusOpacity(this.camera, objective.point), dt, this.lowMotion);
    for (const marker of this.markerMaterials) marker.material.opacity = marker.opacity * this.markerOpacity;
    this.feedback.update(active ? dt : 0, sim.ballistics.projectiles);
    const diagnostics = import.meta.env.DEV ? (this.qaImported ? '检查点恢复 · 局部视觉验收\n' : '') + `阶段 ${m.phase} · ${p.name} · 坐标 ${p.position.map(v => v.toFixed(1)).join(', ')} · ${Math.round(this.fps)} FPS\n` +
      `Draw ${this.renderer.info.render.calls} · Tri ${this.renderer.info.render.triangles.toLocaleString()} · 弹丸 ${sim.ballistics.projectiles.length} · 发射 ${sim.ballistics.fired} · 命中 ${sim.hits} · 敌 ${sim.aliveEnemies.length}` +
      (sim.scenario === 'epilogue' ? ` · 护航 ${this.environment.root.userData.airCoverStatus}` : '') +
      `\n事实 ${m.facts.length} · ${m.facts.slice(-6).join('/') || '无'}`
      + (this.aiDiagnostics ? '\n' + sim.actors.filter(a => !a.down && a.combat).slice().sort((a, b) => Number(b.role === 'ally') - Number(a.role === 'ally')).slice(0, 4)
        .map(a => `${a.id} ${a.combat!.phase} ${a.position[0].toFixed(1)},${a.position[2].toFixed(1)} ${a.combat!.cover?.solid ?? '无掩体'}`).join('\n') : '') : undefined;
    const evacuees = sim.scenario === 'transfer' ? sim.actors.filter(a => a.role === 'cart')
      : sim.scenario === 'epilogue' ? sim.actors.filter(a => a.id.startsWith('worker-') || a.id === 'supply-cart')
      : sim.scenario === 'flank' ? sim.actors.filter(a => a.role === 'worker' || a.role === 'cart' || a.id.startsWith('walker-'))
      : sim.scenario === 'escort' ? [...escortPatients(sim), ...sim.actors.filter(a => a.id.startsWith('walker-'))] : sim.workers;
    const dialogue = this.sound.getDialoguePresentation({ text: m.subtitle, speaker: m.speaker, elapsed: m.elapsed, expiresAt: m.subtitleUntil });
    const state: UiState = {
      mode: this.mode, control: m.control, scenario: sim.scenario, scenarioName: LAYOUT[sim.scenario].name,
      availableScenarios: ['northgate', 'prologue', 'handover', ...(import.meta.env.DEV ? CHAPTER_STAGES.map(stage => stage.scenario) : [])], phaseName: objective.phase,
      objective: objective.text, detail: this.mode === 'complete' ? m.subtitle : `${objective.detail} 目标 ${Math.round(distance(p.position, objective.point))} m`,
      health: p.health, ammo: p.ammo, reserve: p.reserve, reload: p.reload > 0 ? 1 - p.reload / 2.1 : 0,
      storyInjury: sim.scenario === 'rescue' && sim.has('rescue-zhou-wounded'),
      workersSafe: evacuees.filter(a => a.safe).length, workerTotal: evacuees.length, elapsed: m.elapsed + (this.chapter?.elapsedBefore ?? 0), interaction: objective.interaction,
      presentationEpoch: this.presentationEpoch, subtitleTime: this.sound.getDialogueTime(), subtitleRevision: dialogue?.until ?? this.sound.getDialogueTime(),
      subtitle: dialogue?.text ?? '', speaker: dialogue?.speaker ?? '', checkpoint: m.checkpointLabel,
      hits: sim.hits, kills: sim.kills, ads: p.ads, hitFlash: sim.hitFlash, killFlash: sim.killFlash, hurtFlash: sim.hurtFlash,
      blackout: history.blackout,
      lowMotion: this.lowMotion, touchControls: this.input.touchEnabled, muted: this.sound.volume === 0, sensitivity: this.input.sensitivity, volume: this.sound.volume,
      equipmentStatus: this.equipment.state === 'loading' ? '装备载入中' : undefined,
      equipmentError: this.equipment.state === 'error',
      chapter: Boolean(this.chapter),
      continueLabel: this.savedCampaign ? `继续 · ${stageFor(this.savedCampaign.snapshot.mission.scenario)?.title ?? '第一关'}` : undefined,
      nextLabel: this.chapter && nextStage(sim.scenario) ? `继续 · ${nextStage(sim.scenario)!.title}` : undefined,
      error: [this.error, this.mode === 'playing' ? this.pointerError : '', this.saveNotice, this.writeErrors.checkpoint, this.writeErrors.settings,
        this.equipment.state === 'error' ? `装备载入失败。${this.mode === 'playing' ? '可在暂停菜单重试。' : ''}` : '',
        this.sceneAssetErrors.size ? '部分场景素材未能载入，已保留临时模型。' : '',
        this.characterAssetErrors.size ? '部分人物素材未能载入，已保留临时模型。' : '',
        this.sound.getStatus().errors.length ? '部分声音素材未能载入；字幕和任务仍可继续。' : ''].filter(Boolean).join(' '), diagnostics,
    };
    this.ui.render(state);
    const skipAvailable = this.canSkipPresentation();
    this.touchControls.render({ enabled: this.input.touchEnabled, mode: this.mode, control: m.control,
      interaction: objective.interaction, epoch: this.presentationEpoch, skipAvailable,
      coverAvailable: sim.scenario === 'rescue' && (m.phase === 0 || m.phase === 2)
        && !sim.has('rescue-zheng-approaching') && !sim.has(`rescue-cover-call-${m.phase}`),
    });
    this.objectiveIndicator.update(this.camera, objective.point, p.position, this.mode, m.control);
    if (this.monitor && distance(p.position, ESCORT.monitor) < 30) this.monitor.render(this.renderer, m.phaseTime, m.phase === 4, sim.has('shaoyuan-departure-confirmed'));
    this.renderer.render(this.scene, this.camera);
  }

  private animate = (): void => {
    if (this.disposed || this.historySuspended) return;
    const now = performance.now(), dt = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now;
    this.fps = this.fps * 0.95 + 1 / Math.max(0.001, dt) * 0.05;
    if (this.mode === 'playing') {
      this.accumulator += dt;
      while (this.accumulator >= FIXED_DT && this.mode === 'playing') { this.simulate(); this.accumulator -= FIXED_DT; }
    }
    this.present(dt); this.frame++; this.raf = requestAnimationFrame(this.animate);
  };
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.objectiveIndicator.dispose();
    cancelAnimationFrame(this.raf); this.abort.abort(); this.touchControls.dispose(); this.input.dispose(); this.sound.dispose(); this.ui.dispose();
    this.generatedScenery?.dispose();
    this.sim.dispose(); this.environment.dispose(); this.feedback.dispose(); this.weapon.dispose(); this.care.dispose(); this.monitor?.dispose();
    this.supply.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshStandardMaterial).dispose(); } });
    for (const { model, label: tag } of this.characters.values()) { model.dispose(); if (tag) disposeLabel(tag); }
    this.modelLibrary.dispose();
    this.crowd.dispose();
    disposeLabel(this.markerLabel);
    this.marker.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshBasicMaterial).dispose(); } });
    this.scene.environment = null; this.indirectLighting.dispose();
    this.renderer.dispose();
  }
}

initializePhysics().then(() => new Game()).catch(error => {
  const ui = document.querySelector<HTMLElement>('#game-ui')!;
  ui.replaceChildren(); const message = document.createElement('p');
  message.textContent = `游戏启动失败：${error instanceof Error ? error.message : String(error)}`;
  message.style.cssText = 'padding:32px;color:#fff;background:#17232e;font:18px system-ui'; ui.append(message);
  console.error(error);
});
