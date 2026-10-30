import { ACESFilmicToneMapping, BoxGeometry, CanvasTexture, Color, ConeGeometry, FogExp2, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, RingGeometry, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { CharacterModel, EnvironmentModel, RunMode, ScenarioId, UiState } from './contracts';
import { buildEnvironment } from './presentation/environment';
import { createCharacter, createWeaponView } from './presentation/characters';
import { Feedback } from './presentation/Feedback';
import { Sound } from './presentation/Sound';
import { Input } from './player/Input';
import { initializePhysics, FIXED_DT } from './runtime/Physics';
import { Simulation, distance, type Snapshot } from './mission/Simulation';
import { GameUI } from './ui/GameUI';
import { LAYOUT } from './content/layout';
import { NIGHT_CARRY_FACTS, nextStage, stageFor, type ChapterProgress } from './content/chapter-flow';
import { SaveStore, type SavedGame } from './persistence/SaveStore';

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
  root.position.set(0, -0.44, -0.72); return root;
}

class Game {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.045, 1000);
  private readonly renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly sound = new Sound();
  private readonly feedback = new Feedback();
  private readonly weapon = createWeaponView();
  private readonly supply = carriedSupply();
  private readonly ui: GameUI;
  private readonly input: Input;
  private readonly characters = new Map<string, { model: CharacterModel; label?: Sprite }>();
  private readonly marker = new Group();
  private readonly markerLabel = label('目标', '#f4d49e');
  private environment!: EnvironmentModel;
  private sim!: Simulation;
  private mode: RunMode = 'menu';
  private lowMotion = false;
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

  constructor() {
    const view = document.querySelector<HTMLElement>('#game-view')!;
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    view.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '游戏画面');
    this.renderer.domElement.tabIndex = -1;
    this.scene.background = new Color(0x677e8d); this.scene.fog = new FogExp2(0x677e8d, 0.008);
    this.camera.rotation.order = 'YXZ'; this.camera.add(this.weapon.root, this.supply); this.scene.add(this.camera, this.feedback.root, this.marker);
    const ring = new Mesh(new RingGeometry(0.5, 0.58, 32), new MeshBasicMaterial({ color: 0xe7c782, side: 2, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    const arrow = new Mesh(new ConeGeometry(0.16, 0.35, 4), new MeshBasicMaterial({ color: 0xe7c782 }));
    arrow.rotation.z = Math.PI; arrow.position.y = 2.7; this.markerLabel.position.y = 3.2;
    this.marker.add(ring, arrow, this.markerLabel);
    this.input = new Input(this.renderer.domElement, () => this.pause(), message => { this.pointerError = message; });
    try {
      this.store = new SaveStore(window.localStorage);
      const restored = this.store.getSettings();
      this.input.sensitivity = restored.settings.sensitivity; this.sound.setVolume(restored.settings.volume); this.lowMotion = restored.settings.lowMotion;
      this.saveNotice = restored.warning ?? '';
      this.refreshCampaign();
    } catch { this.saveNotice = '当前环境不能访问本机存档；本次行动仍可重试检查点。'; }
    this.ui = new GameUI(document.querySelector('#game-ui')!, {
      start: id => this.start(id), startChapter: () => this.startChapter(), continueChapter: () => this.continueChapter(), nextStage: () => this.advanceChapter(),
      resume: () => this.resume(), retry: () => this.retry(), restart: () => this.restart(),
      menu: () => this.menu(), setSensitivity: value => { this.input.sensitivity = value; this.persistSettings(); },
      setVolume: value => { this.sound.setVolume(value); this.persistSettings(); }, setLowMotion: value => { this.lowMotion = value; this.persistSettings(); },
    });
    this.load('nightshift');
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight);
    }, { signal: this.abort.signal });
    window.addEventListener('pagehide', () => this.dispose(), { once: true, signal: this.abort.signal });
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.error = '图形上下文已失效，请刷新页面重新进入。'; this.pause(); }, { signal: this.abort.signal });
    this.animate();
  }

  private load(id: ScenarioId, saved?: Snapshot, priorFacts: readonly string[] = []): void {
    this.sim?.dispose();
    if (this.environment) { this.scene.remove(this.environment.root); this.environment.dispose(); }
    for (const { model, label: tag } of this.characters.values()) { this.scene.remove(model.root); model.dispose(); if (tag) { this.scene.remove(tag); disposeLabel(tag); } }
    this.characters.clear(); this.feedback.clear(); this.sound.stopTransient();
    this.environment = buildEnvironment(id); this.scene.add(this.environment.root);
    this.sim = new Simulation(id, this.environment.solids, saved, priorFacts);
    this.input.yaw = this.sim.player.yaw; this.input.pitch = this.sim.player.pitch;
    this.input.clear(); this.accumulator = 0; this.ads = 0; this.lastFootstep = 0;
  }
  private start(id: ScenarioId): void {
    this.chapter = undefined;
    const restored = this.store?.load(id);
    if (restored?.warning) this.saveNotice = restored.warning;
    this.load(id, restored?.save?.snapshot.mission.complete ? undefined : restored?.save?.snapshot);
    this.persistCheckpoint(); this.begin();
  }
  private startChapter(): void {
    this.chapter = { chapter: 'L1', stage: 'S03', elapsedBefore: 0 };
    this.load('nightshift'); this.persistCheckpoint(); this.begin();
  }
  private continueChapter(): void {
    this.refreshCampaign();
    if (!this.savedCampaign?.chapter) return;
    this.chapter = structuredClone(this.savedCampaign.chapter);
    this.load(this.savedCampaign.snapshot.mission.scenario, this.savedCampaign.snapshot); this.begin();
  }
  private advanceChapter(): void {
    const next = nextStage(this.sim.scenario);
    if (!this.chapter || !this.sim.mission.complete || !next) return;
    const facts = this.sim.mission.facts.filter(fact => (NIGHT_CARRY_FACTS as readonly string[]).includes(fact));
    this.chapter = { chapter: 'L1', stage: next.id, elapsedBefore: this.chapter.elapsedBefore + this.sim.mission.elapsed };
    this.load(next.scenario, undefined, facts); this.persistCheckpoint(); this.begin();
  }
  private restart(): void {
    const facts = this.chapter?.stage === 'S04' ? this.sim.mission.facts.filter(fact => (NIGHT_CARRY_FACTS as readonly string[]).includes(fact)) : [];
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
    this.mode = 'playing'; this.input.enabled = true; this.input.clear(); this.renderer.domElement.focus(); this.input.lock(); void this.sound.unlock();
  }
  private retry(): void { const saved = this.sim.checkpoint; this.load(this.sim.scenario, saved); this.mode = 'paused'; this.resume(); }
  private menu(): void { this.pause(); this.mode = 'menu'; this.input.enabled = false; this.input.clear(); this.input.unlock(); this.sound.pause(); this.refreshCampaign(); }
  private refreshCampaign(): void {
    const result = this.store?.load('campaign');
    this.savedCampaign = result?.save;
    if (result?.warning) this.saveNotice = result.warning;
  }
  private persistSettings(): void {
    const result = this.store?.saveSettings({ sensitivity: this.input.sensitivity, volume: this.sound.volume, lowMotion: this.lowMotion });
    if (result) this.writeErrors.settings = result.ok ? '' : result.error ?? '设置保存失败。';
  }
  private persistCheckpoint(snapshot = this.sim.checkpoint): void {
    const result = this.store?.save(this.chapter ? 'campaign' : this.sim.scenario, snapshot, this.chapter);
    if (!result) return;
    this.writeErrors.checkpoint = result.ok ? '' : result.error ?? '检查点保存失败。';
    if (result.ok && this.chapter) this.savedCampaign = { snapshot: structuredClone(snapshot), chapter: structuredClone(this.chapter), savedAt: Date.now() };
  }

  private simulate(): void {
    const oldPhase = this.sim.mission.phase;
    this.sim.step(this.input.read(FIXED_DT));
    // Viewpoint changes have explicit body state; the next input frame starts there.
    if (oldPhase !== this.sim.mission.phase) this.input.pitch = this.sim.player.pitch;
    for (const e of this.sim.events) {
      if (e.type === 'shot') {
        const relative = e.position ? (e.position[0] - this.sim.player.position[0]) / 20 : 0;
        this.sound.shot(e.enemy, relative);
      } else if (e.type === 'impact' && e.position) this.feedback.impact(e.position, e.enemy);
      else if (e.type === 'hit') this.sound.hit();
      else if (e.type === 'hurt') this.sound.hurt();
      else if (e.type === 'reload') this.sound.reload();
      else if (e.type === 'objective') this.sound.objective();
      else if (e.type === 'checkpoint') this.persistCheckpoint();
    }
    const step = Math.floor(this.sim.player.walk / Math.PI);
    if (step !== this.lastFootstep) { this.lastFootstep = step; this.sound.footstep(); }
    if (this.sim.mission.failed || this.sim.mission.complete) {
      if (this.sim.mission.complete) this.persistCheckpoint(this.sim.snapshot());
      this.mode = this.sim.mission.failed ? 'failed' : 'complete'; this.input.enabled = false; this.input.clear(); this.input.unlock(); this.sound.pause();
    }
  }

  private present(dt: number): void {
    const sim = this.sim, p = sim.player, m = sim.mission, objective = sim.objective;
    const active = this.mode === 'playing';
    this.camera.position.set(...sim.playerEye);
    if (!this.lowMotion && active && m.control !== 'staged') this.camera.position.y += Math.sin(p.walk * 2) * 0.018;
    this.camera.rotation.set(p.pitch + (this.lowMotion ? 0 : p.recoil * 0.012), p.yaw, 0, 'YXZ');
    this.ads += ((p.ads ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    this.camera.fov = 75 - this.ads * 21; this.camera.updateProjectionMatrix();
    this.weapon.root.visible = m.control === 'combat';
    this.supply.visible = sim.scenario === 'nightshift' && m.facts.includes('supplies-collected') && !m.facts.includes('supplies-delivered');
    this.weapon.setPose(p.recoil, p.reload > 0 ? 1 - p.reload / 2.1 : 0, this.ads, this.lowMotion ? 0 : p.walk);
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const near = this.camera.position.clone().addScaledVector(forward, 0.9);
    if (sim.physics.trace(sim.playerEye, [near.x, near.y, near.z], 'player', true)) this.weapon.root.position.y -= 0.15;
    this.environment.update(m.elapsed, this.camera.position);
    this.environment.setFacts?.(m.facts);
    this.sound.setVentilation(sim.scenario === 'nightshift' && m.facts.includes('fan-restarted'));
    const seen = new Set<string>();
    for (const actor of sim.actors) {
      seen.add(actor.id);
      let item = this.characters.get(actor.id);
      if (!item) {
        const model = createCharacter(actor.role);
        const tag = actor.role !== 'enemy' ? label(actor.name, actor.role === 'worker' ? '#efc78b' : '#c5e3dc') : undefined;
        item = { model, label: tag }; this.characters.set(actor.id, item); this.scene.add(model.root); if (tag) this.scene.add(tag);
      }
      item.model.root.position.set(...actor.position); item.model.root.rotation.y = actor.yaw;
      item.model.setPose({ walk: actor.goals.length ? actor.walk : 0, aiming: actor.aiming, down: actor.down,
        carrying: (actor.id === 'father' && sim.scenario === 'prologue' && m.phase === 1) || (actor.id === 'zheng' && sim.scenario === 'handover' && m.phase === 4) });
      if (item.label) {
        item.label.position.set(actor.position[0], actor.position[1] + 2.1, actor.position[2]);
        const size = Math.min(1, this.camera.position.distanceTo(item.label.position) / 10);
        item.label.scale.set(2.8 * size, 0.525 * size, 1);
        item.label.visible = !actor.down && distance(actor.position, p.position) < 24;
      }
    }
    this.marker.visible = active && m.control !== 'staged';
    this.marker.position.set(...objective.point);
    this.feedback.update(active ? dt : 0, sim.ballistics.projectiles);
    const diagnostics = import.meta.env.DEV ? `阶段 ${m.phase} · ${p.name} · 坐标 ${p.position.map(v => v.toFixed(1)).join(', ')} · ${Math.round(this.fps)} FPS\n` +
      `Draw ${this.renderer.info.render.calls} · Tri ${this.renderer.info.render.triangles.toLocaleString()} · 弹丸 ${sim.ballistics.projectiles.length} · 发射 ${sim.ballistics.fired} · 命中 ${sim.hits} · 敌 ${sim.aliveEnemies.length} · 事实 ${m.facts.join('/') || '无'}` : undefined;
    const state: UiState = {
      mode: this.mode, control: m.control, scenario: sim.scenario, scenarioName: LAYOUT[sim.scenario].name,
      availableScenarios: ['northgate', 'prologue', 'handover'], phaseName: objective.phase,
      objective: objective.text, detail: this.mode === 'complete' ? m.subtitle : `${objective.detail} 目标 ${Math.round(distance(p.position, objective.point))} m`,
      health: p.health, ammo: p.ammo, reserve: p.reserve, reload: p.reload > 0 ? 1 - p.reload / 2.1 : 0,
      workersSafe: sim.safeCount, workerTotal: sim.workers.length, elapsed: m.elapsed + (this.chapter?.elapsedBefore ?? 0), interaction: objective.interaction,
      subtitle: m.elapsed < m.subtitleUntil ? m.subtitle : '', speaker: m.speaker, checkpoint: m.checkpointLabel,
      hits: sim.hits, kills: sim.kills, ads: p.ads, hitFlash: sim.hitFlash, hurtFlash: sim.hurtFlash,
      lowMotion: this.lowMotion, muted: this.sound.volume === 0, sensitivity: this.input.sensitivity, volume: this.sound.volume,
      chapter: Boolean(this.chapter),
      continueLabel: this.savedCampaign ? `继续 · ${stageFor(this.savedCampaign.snapshot.mission.scenario)?.title ?? '第一关'}` : undefined,
      nextLabel: this.chapter && nextStage(sim.scenario) ? `继续 · ${nextStage(sim.scenario)!.title}` : undefined,
      error: [this.error, this.mode === 'playing' ? this.pointerError : '', this.saveNotice, this.writeErrors.checkpoint, this.writeErrors.settings].filter(Boolean).join(' '), diagnostics,
    };
    this.ui.render(state);
    this.renderer.render(this.scene, this.camera);
  }

  private animate = (): void => {
    const now = performance.now(), dt = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now;
    this.fps = this.fps * 0.95 + 1 / Math.max(0.001, dt) * 0.05;
    if (this.mode === 'playing') {
      this.accumulator += dt;
      while (this.accumulator >= FIXED_DT && this.mode === 'playing') { this.simulate(); this.accumulator -= FIXED_DT; }
    }
    this.present(dt); this.frame++; this.raf = requestAnimationFrame(this.animate);
  };
  dispose(): void {
    cancelAnimationFrame(this.raf); this.abort.abort(); this.input.dispose(); this.sound.dispose(); this.ui.dispose();
    this.sim.dispose(); this.environment.dispose(); this.feedback.dispose(); this.weapon.dispose();
    this.supply.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshStandardMaterial).dispose(); } });
    for (const { model, label: tag } of this.characters.values()) { model.dispose(); if (tag) disposeLabel(tag); }
    disposeLabel(this.markerLabel);
    this.marker.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); (object.material as MeshBasicMaterial).dispose(); } });
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
