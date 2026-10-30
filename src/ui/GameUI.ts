import type { RunMode, ScenarioId, UiActions, UiState } from '../contracts';
import { CHAPTER_STAGES } from '../content/chapter-flow';
import './style.css';

const SCENARIOS: Array<{ id: ScenarioId; index: string; title: string; description: string }> = [
  { id: 'northgate', index: 'V2', title: '北闸', description: '掩护工人撤离，交接最后一处阵位。' },
  { id: 'prologue', index: 'V1', title: '同一扇门', description: '从儿童与年轻周延的视点，穿过序章。' },
  { id: 'handover', index: 'V3', title: '下一班', description: '兑现护送承诺，换班，再接伤员回去。' },
];
if (import.meta.env.DEV) SCENARIOS.push(...CHAPTER_STAGES.map(stage => ({
  id: stage.scenario, index: stage.id, title: stage.title, description: '章节独立检查',
})));

const clamp = (value: number, max = 1) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
const integer = (value: number) => Math.max(0, Math.ceil(Number.isFinite(value) ? value : 0)).toString();
const elapsed = (value: number) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
};

/** View-only interface. All game changes go through the supplied action callbacks. */
export class GameUI {
  private readonly root: HTMLDivElement;
  private readonly nodes = new Map<string, HTMLElement>();
  private readonly events = new AbortController();
  private previousMode: RunMode | null = null;
  private state: UiState | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, private readonly actions: UiActions) {
    this.root = document.createElement('div');
    this.root.className = 'game-interface';
    this.root.innerHTML = `
      <div class="hurt-vignette" data-ui="hurt" aria-hidden="true"></div>
      <section class="game-hud" data-ui="hud" aria-label="战斗状态" hidden>
        <div class="objective-cluster">
          <p class="phase-label" data-ui="phase"></p>
          <p class="current-objective" data-ui="objective"></p>
          <p class="objective-detail" data-ui="detail"></p>
          <p class="evacuation-count" data-ui="evacuation"><span class="status-diamond" aria-hidden="true"></span><span data-ui="workers"></span></p>
        </div>
        <div class="hud-session"><span data-ui="time">00:00</span><span><kbd>Esc</kbd> 暂停</span></div>
        <div class="crosshair" data-ui="crosshair" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div>
        <div class="hit-marker" data-ui="hit" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="interaction-prompt" data-ui="interaction" hidden><kbd>E</kbd><span data-ui="interaction-text"></span></div>
        <div class="radio-subtitle" data-ui="subtitle" role="status" aria-live="polite" aria-atomic="true" hidden><span class="subtitle-speaker" data-ui="speaker"></span><p data-ui="subtitle-text"></p></div>
        <div class="survival-cluster" data-ui="health-cluster"><div class="health-label"><span class="health-cross" aria-hidden="true">＋</span><strong data-ui="health">100</strong><span>生命</span></div><div class="health-track" aria-hidden="true"><div data-ui="health-fill"></div></div></div>
        <div class="ammunition-cluster"><p class="reload-label" data-ui="reload-label" hidden>装填中</p><div class="reload-track" data-ui="reload-track" hidden><div data-ui="reload-fill"></div></div><div class="ammunition-values"><strong data-ui="ammo">30</strong><span class="ammo-separator">/</span><span data-ui="reserve">120</span></div><span class="ammo-label" data-ui="ammo-label">弹药</span></div>
        <p class="sound-state" data-ui="sound-state" hidden>声音已静音</p>
      </section>

      <section class="game-overlay menu-overlay" data-ui="menu" role="dialog" aria-modal="true" aria-labelledby="game-title" hidden>
        <div class="menu-content">
          <p class="build-label"><span aria-hidden="true"></span>开发候选</p>
          <h1 id="game-title">重返木卫三</h1>
          <p class="menu-intent">把眼前的人，交给下一班。</p>
          <div class="chapter-entry">
            <p class="eyebrow">连续战役</p>
            <button class="primary-button" type="button" data-action="chapter-continue" data-ui="chapter-continue" hidden></button>
            <button type="button" data-action="chapter-start" data-ui="chapter-start">从序章开始</button>
            <p class="chapter-description">检修门 → 主厅 → 夜班 → 港务接应 → 北闸 → 转接门 → 侧翼</p>
          </div>
          <details class="validation-reference"><summary>独立验证场景</summary>
          <div class="scenario-list" aria-label="选择验证场景">
            ${SCENARIOS.map(({ id, index, title, description }) => `
              <button class="scenario-button" type="button" data-scenario="${id}" data-ui="scenario-${id}" disabled>
                <span class="scenario-index">${index}</span>
                <span class="scenario-copy"><strong>${title}</strong><span>${description}</span></span>
                <span class="scenario-availability" data-ui="availability-${id}">待接入</span>
              </button>`).join('')}
          </div>
          </details>
          <details class="control-reference" open>
            <summary>操作</summary>
            <div class="controls-grid">
              <span><kbd>WASD</kbd> 移动</span><span><kbd>鼠标</kbd> 观察</span><span><kbd>左键</kbd> 射击</span>
              <span><kbd>Shift</kbd> 冲刺</span><span><kbd>右键</kbd> 瞄准</span><span><kbd>R</kbd> 换弹</span>
              <span><kbd>C</kbd> 蹲伏</span><span><kbd>Space</kbd> 跳跃</span><span><kbd>E</kbd> 交互</span>
            </div>
            <p class="alternate-controls"><kbd>方向键</kbd> 也可转动视角 · <kbd>F</kbd> 也可开火</p>
          </details>
        </div>
        <p class="candidate-note">占位资产 · 功能验证</p>
      </section>

      <section class="game-overlay" data-ui="paused" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
        <div class="dialog-panel pause-panel">
          <p class="eyebrow" data-ui="pause-scenario"></p><h2 id="pause-title">暂停</h2>
          <p class="checkpoint-label" data-ui="pause-checkpoint"></p>
          <button type="button" class="primary-button" data-action="resume">继续行动</button>
          <div class="button-pair"><button type="button" data-action="retry">重试检查点</button><button type="button" data-action="restart">重开本场</button></div>
          <details class="settings-panel">
            <summary>操作与声音</summary>
            <label class="slider-setting" for="ganymede-sensitivity"><span>鼠标灵敏度</span><output data-ui="sensitivity-value">1.00</output><input id="ganymede-sensitivity" data-ui="sensitivity-input" data-setting="sensitivity" type="range" min="0.25" max="2.5" value="1" step="0.05" /></label>
            <label class="slider-setting" for="ganymede-volume"><span>音量</span><output data-ui="volume-value">70%</output><input id="ganymede-volume" data-setting="volume" type="range" min="0" max="100" value="70" step="1" data-ui="volume-input" /></label>
            <label class="checkbox-setting"><input type="checkbox" data-setting="motion" data-ui="motion-input" /><span>减少镜头晃动</span></label>
          </details>
          <button type="button" class="quiet-button" data-action="menu">返回场景选择</button>
        </div>
      </section>

      <section class="game-overlay" data-ui="failed" role="dialog" aria-modal="true" aria-labelledby="failure-title" hidden>
        <div class="dialog-panel result-panel failure-panel">
          <p class="eyebrow">行动中断</p><h2 id="failure-title">你倒下了</h2>
          <p class="result-description">从最近的检查点重新接手。</p>
          <p class="checkpoint-label" data-ui="failure-checkpoint"></p>
          <button type="button" class="primary-button" data-action="retry">重试检查点</button>
          <div class="button-pair"><button type="button" data-action="restart">重开本场</button><button type="button" data-action="menu">场景选择</button></div>
        </div>
      </section>

      <section class="game-overlay" data-ui="complete" role="dialog" aria-modal="true" aria-labelledby="complete-title" hidden>
        <div class="dialog-panel result-panel">
          <p class="eyebrow" data-ui="complete-scenario"></p><h2 id="complete-title" data-ui="complete-title">本场行动完成</h2>
          <p class="result-description" data-ui="complete-detail"></p>
          <div class="result-facts"><p data-ui="complete-workers"></p><p><span>行动用时</span><strong data-ui="complete-time"></strong></p></div>
          <button type="button" class="primary-button" data-action="next-stage" data-ui="next-stage" hidden></button>
          <button type="button" data-action="menu">返回主菜单</button>
          <button type="button" data-action="restart">重开本场</button>
          <p class="result-footnote">当前为开发验证段落，完整战役仍在制作。</p>
        </div>
      </section>

      <div class="game-error" data-ui="error" role="alert" hidden></div>
      <pre class="game-diagnostics" data-ui="diagnostics" aria-label="开发诊断" hidden></pre>
    `;
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-ui]')) {
      this.nodes.set(node.dataset.ui!, node);
    }
    this.container.replaceChildren(this.root);
    this.root.addEventListener('click', this.onClick, { signal: this.events.signal });
    this.root.addEventListener('input', this.onInput, { signal: this.events.signal });
    this.root.addEventListener('keydown', this.onKeyDown, { signal: this.events.signal });
  }

  render(state: UiState): void {
    if (this.disposed) return;
    this.state = state;
    const playing = state.mode === 'playing';
    this.root.dataset.mode = state.mode;
    this.root.dataset.control = state.control;
    this.root.classList.toggle('low-motion', state.lowMotion);
    this.show('hud', playing);
    for (const mode of ['menu', 'paused', 'failed', 'complete'] as const) this.show(mode, state.mode === mode);

    this.text('phase', state.phaseName);
    this.text('objective', state.objective);
    this.text('detail', state.detail);
    this.show('detail', Boolean(state.detail));
    this.text('workers', `已到达 ${integer(state.workersSafe)} / ${integer(state.workerTotal)}`);
    this.show('evacuation', state.workerTotal > 0);
    this.text('time', elapsed(state.elapsed));
    this.text('health', integer(clamp(state.health, 100)));
    this.style('health-fill', 'transform', `scaleX(${clamp(state.health / 100)})`);
    this.node('health-cluster').classList.toggle('is-critical', state.health <= 30);
    this.text('ammo', integer(state.ammo));
    this.text('reserve', integer(state.reserve));
    this.node('ammo').classList.toggle('is-empty', state.ammo <= 0);
    this.text('ammo-label', state.ammo <= 0 && state.reserve > 0 ? 'R 换弹' : '弹药');
    this.show('reload-label', state.reload > 0);
    this.show('reload-track', state.reload > 0);
    this.style('reload-fill', 'transform', `scaleX(${clamp(state.reload)})`);
    this.node('crosshair').classList.toggle('is-aiming', state.ads);
    this.style('hit', 'opacity', String(playing ? clamp(state.hitFlash) : 0));
    this.style('hurt', 'opacity', String(playing ? clamp(state.hurtFlash) : 0));
    this.show('interaction', playing && Boolean(state.interaction));
    this.text('interaction-text', state.interaction);
    this.show('subtitle', playing && Boolean(state.subtitle));
    this.text('subtitle-text', state.subtitle);
    this.text('speaker', state.speaker);
    this.show('speaker', Boolean(state.speaker));
    this.show('sound-state', state.muted);

    for (const { id } of SCENARIOS) {
      const available = state.availableScenarios.includes(id);
      (this.node(`scenario-${id}`) as HTMLButtonElement).disabled = !available;
      this.text(`availability-${id}`, available ? '进入 →' : '待接入');
    }
    this.show('chapter-continue', Boolean(state.continueLabel));
    this.text('chapter-continue', state.continueLabel ?? '');
    this.text('chapter-start', state.continueLabel ? '从序章重新开始' : '从序章开始');
    this.node('chapter-start').classList.toggle('primary-button', !state.continueLabel);
    this.show('next-stage', Boolean(state.nextLabel));
    this.text('next-stage', state.nextLabel ?? '');
    this.text('pause-scenario', state.scenarioName);
    this.text('pause-checkpoint', state.checkpoint ? `检查点 · ${state.checkpoint}` : '检查点 · 场景入口');
    this.text('failure-checkpoint', state.checkpoint ? `检查点 · ${state.checkpoint}` : '检查点 · 场景入口');
    this.text('complete-scenario', state.scenarioName);
    const resultTitles: Partial<Record<ScenarioId, string>> = { childhood: '隔断合拢', mainhall: '主厅失守', nightshift: '准备出发', workers: '人员已交接', frontgate: '北闸暂稳', transfer: '转接门已通', flank: '把事情交给同伴' };
    this.text('complete-title', state.chapter ? resultTitles[state.scenario] ?? '本段完成' : '本场行动完成');
    this.text('complete-detail', state.detail || state.objective);
    this.text('complete-workers', state.workerTotal > 0 ? `人员到达 ${integer(state.workersSafe)} / ${integer(state.workerTotal)}` : '本段结束');
    this.text('complete-time', elapsed(state.elapsed));
    (this.node('motion-input') as HTMLInputElement).checked = state.lowMotion;
    (this.node('sensitivity-input') as HTMLInputElement).value = String(state.sensitivity);
    this.text('sensitivity-value', state.sensitivity.toFixed(2));
    (this.node('volume-input') as HTMLInputElement).value = String(Math.round(state.volume * 100));
    this.text('volume-value', state.muted ? '静音' : `${Math.round(state.volume * 100)}%`);
    this.show('error', Boolean(state.error));
    this.text('error', state.error || '');
    this.show('diagnostics', playing && Boolean(state.diagnostics));
    this.text('diagnostics', state.diagnostics || '');

    if (state.mode !== this.previousMode) {
      this.previousMode = state.mode;
      if (!playing) {
        const panel = this.node(state.mode);
        [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
          .find(button => button.getClientRects().length > 0)?.focus({ preventScroll: true });
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.root.remove();
    this.nodes.clear();
    this.state = null;
  }

  private node(key: string): HTMLElement {
    const node = this.nodes.get(key);
    if (!node) throw new Error(`Missing UI node: ${key}`);
    return node;
  }

  private text(key: string, value: string): void {
    const node = this.node(key);
    if (node.textContent !== value) node.textContent = value;
  }

  private show(key: string, visible: boolean): void {
    const node = this.node(key);
    if (node.hidden === visible) node.hidden = !visible;
  }

  private style(key: string, property: string, value: string): void {
    const node = this.node(key);
    if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
  }

  private onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled || !this.root.contains(button)) return;
    const scenario = button.dataset.scenario as ScenarioId | undefined;
    if (scenario && this.state?.availableScenarios.includes(scenario)) {
      this.actions.start(scenario);
      return;
    }
    switch (button.dataset.action) {
      case 'chapter-start': this.actions.startChapter(); break;
      case 'chapter-continue': this.actions.continueChapter(); break;
      case 'next-stage': this.actions.nextStage(); break;
      case 'resume': this.actions.resume(); break;
      case 'retry': this.actions.retry(); break;
      case 'restart': this.actions.restart(); break;
      case 'menu': this.actions.menu(); break;
    }
  };

  private onInput = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    switch (input.dataset.setting) {
      case 'sensitivity':
        this.text('sensitivity-value', Number(input.value).toFixed(2));
        this.actions.setSensitivity(Number(input.value));
        break;
      case 'volume':
        this.text('volume-value', Number(input.value) === 0 ? '静音' : `${input.value}%`);
        this.actions.setVolume(Number(input.value) / 100);
        break;
      case 'motion': this.actions.setLowMotion(input.checked); break;
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !this.state || this.state.mode === 'playing') return;
    const panel = this.node(this.state.mode);
    const candidates = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary')]
      .filter(node => node.getClientRects().length > 0);
    if (!candidates.length) return;
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };
}
