import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { DeferredAirCover, type DeferredAirCoverController, type DeferredAirCoverLoader, type DeferredAirCoverModule } from '../src/presentation/DeferredAirCover';

const wrappers: DeferredAirCover[] = [];
const arrival = ['first-wave-approaching'];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.dispose()); vi.restoreAllMocks(); });

function deferred() {
  let resolve!: (module: DeferredAirCoverModule) => void, reject!: (error: unknown) => void;
  const promise = new Promise<DeferredAirCoverModule>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject, loader: vi.fn(() => promise) };
}

/** Injected module exercises only the asynchronous boundary, with no real aircraft parsing. */
function lightweightModule() {
  const instances: Array<{ node: Group; facts: readonly string[][]; times: number[]; disposed: number }> = [];
  class Controller implements DeferredAirCoverController {
    readonly node = new Group();
    readonly facts: string[][] = [];
    readonly times: number[] = [];
    disposed = 0;
    constructor(parent: Group) { parent.add(this.node); instances.push(this); }
    setFacts(facts: readonly string[]): void { this.facts.push([...facts]); }
    update(time: number): void { this.times.push(time); }
    dispose(): void { this.disposed++; this.node.removeFromParent(); }
  }
  return { module: { EpilogueAirCover: Controller }, instances };
}

function wrap(loader: DeferredAirCoverLoader, parent = new Group()) {
  const wrapper = new DeferredAirCover(parent, loader); wrappers.push(wrapper); return { wrapper, parent };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('deferred S12 module loading', () => {
  it('does not request aircraft for constructor, time updates or unrelated facts', () => {
    const load = deferred(), { wrapper, parent } = wrap(load.loader);
    wrapper.update(0); wrapper.update(300);
    wrapper.setFacts(['reception-door-open', 'fleet-reception-acknowledged']);
    expect(load.loader).not.toHaveBeenCalled();
    expect(parent.children).toHaveLength(0);
    expect(parent.userData.airCoverStatus).toBe('idle');
  });

  it('requests once on the arrival fact and applies copies of the latest facts and time', async () => {
    const load = deferred(), fake = lightweightModule(), { wrapper, parent } = wrap(load.loader);
    wrapper.update(10); wrapper.setFacts(arrival);
    expect(parent.userData.airCoverStatus).toBe('loading');
    for (let i = 0; i < 20; i++) wrapper.setFacts(arrival);
    const latest = [...arrival, 'reception-door-open'];
    wrapper.setFacts(latest); latest.push('not-observed-by-wrapper');
    wrapper.update(12); wrapper.update(15);
    load.resolve(fake.module); await settle();
    expect(load.loader).toHaveBeenCalledTimes(1);
    expect(fake.instances).toHaveLength(1);
    expect(fake.instances[0].facts).toEqual([[...arrival, 'reception-door-open']]);
    expect(fake.instances[0].times).toEqual([15]);
    expect(parent.userData.airCoverStatus).toBe('ready');
    expect(arrival).toEqual(['first-wave-approaching']);
  });

  it('does not invent an activation time before the host supplies one', async () => {
    const fake = lightweightModule(), { wrapper } = wrap(async () => fake.module);
    wrapper.setFacts(arrival); wrapper.update(NaN); wrapper.update(-1);
    await settle();
    expect(fake.instances[0].times).toEqual([]);
    wrapper.update(0);
    expect(fake.instances[0].times).toEqual([0]);
  });

  it('keeps a paused timestamp across asynchronous loading instead of catching up wall time', async () => {
    const load = deferred(), fake = lightweightModule(), { wrapper } = wrap(load.loader);
    wrapper.setFacts(arrival); wrapper.update(100);
    for (let i = 0; i < 100; i++) wrapper.update(100);
    load.resolve(fake.module); await settle();
    expect(fake.instances[0].times).toEqual([100]);
    wrapper.update(100); wrapper.update(100.1);
    expect(fake.instances[0].times).toEqual([100, 100, 100.1]);
  });

  it('uses a removed arrival fact if the state changes before import completes', async () => {
    const load = deferred(), fake = lightweightModule(), { wrapper } = wrap(load.loader);
    wrapper.setFacts(arrival); wrapper.update(8); wrapper.setFacts([]);
    load.resolve(fake.module); await settle();
    expect(fake.instances[0].facts).toEqual([[]]);
    expect(fake.instances[0].times).toEqual([8]);
    wrapper.setFacts(arrival);
    expect(load.loader).toHaveBeenCalledTimes(1);
    expect(fake.instances[0].facts.at(-1)).toEqual(arrival);
  });

  it('does not construct or attach a late module after its scene was disposed', async () => {
    const load = deferred(), fake = lightweightModule(), { wrapper, parent } = wrap(load.loader);
    wrapper.setFacts(arrival); wrapper.update(20); wrapper.dispose();
    load.resolve(fake.module); await settle();
    expect(fake.instances).toHaveLength(0); expect(parent.children).toHaveLength(0);
    expect(parent.userData.airCoverStatus).toBe('disposed');
    wrapper.setFacts(arrival); wrapper.update(30);
    expect(load.loader).toHaveBeenCalledTimes(1);
  });

  it('also guards the already-resolved Promise continuation window', async () => {
    const fake = lightweightModule(), { wrapper, parent } = wrap(() => Promise.resolve(fake.module));
    wrapper.setFacts(arrival); wrapper.dispose(); await settle();
    expect(fake.instances).toHaveLength(0); expect(parent.children).toHaveLength(0);
  });

  it('captures an import rejection once and retries only through a new scene wrapper', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {}), fake = lightweightModule();
    const loader = vi.fn<DeferredAirCoverLoader>().mockRejectedValueOnce(new Error('module unavailable')).mockResolvedValue(fake.module);
    const first = wrap(loader);
    first.wrapper.setFacts(arrival); await settle();
    expect(first.parent.userData.airCoverStatus).toBe('error');
    for (let i = 0; i < 10; i++) { first.wrapper.setFacts([]); first.wrapper.setFacts(arrival); first.wrapper.update(i); }
    expect(loader).toHaveBeenCalledTimes(1); expect(warning).toHaveBeenCalledTimes(1);
    expect(first.parent.children).toHaveLength(0);
    const next = wrap(loader); next.wrapper.setFacts(arrival); await settle();
    expect(loader).toHaveBeenCalledTimes(2); expect(next.parent.userData.airCoverStatus).toBe('ready');
    expect(fake.instances).toHaveLength(1);
  });

  it('captures synchronous loader errors and initialization errors without retaining a partial controller', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sync = wrap(() => { throw new Error('synchronous loader failure'); });
    expect(() => sync.wrapper.setFacts(arrival)).not.toThrow(); await settle();
    expect(sync.parent.userData.airCoverStatus).toBe('error');
    let releases = 0;
    const bad = wrap(async () => ({ EpilogueAirCover: class {
      readonly node = new Group();
      constructor(parent: Group) { parent.add(this.node); }
      setFacts(): void { throw new Error('bad controller initialization'); }
      update(): void {}
      dispose(): void { releases++; this.node.removeFromParent(); }
    } }));
    bad.wrapper.setFacts(arrival); await settle();
    expect(bad.parent.userData.airCoverStatus).toBe('error');
    expect(bad.parent.children).toHaveLength(0); expect(releases).toBe(1);
    expect(warning).toHaveBeenCalledTimes(2);
  });

  it('does not report a stale failure into an already disposed scene', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {}), load = deferred();
    const { wrapper, parent } = wrap(load.loader);
    wrapper.setFacts(arrival); wrapper.dispose(); load.reject(new Error('late network failure')); await settle();
    expect(parent.userData.airCoverStatus).toBe('disposed'); expect(warning).not.toHaveBeenCalled();
  });

  it('shares a loaded module while retaining separate scene-owned instances', async () => {
    const fake = lightweightModule(), shared = Promise.resolve(fake.module), loader = vi.fn(() => shared);
    const one = wrap(loader), two = wrap(loader);
    one.wrapper.setFacts(arrival); two.wrapper.setFacts(arrival); one.wrapper.update(30); two.wrapper.update(80);
    await settle();
    expect(fake.instances).toHaveLength(2);
    expect(one.parent.children[0]).not.toBe(two.parent.children[0]);
    expect(fake.instances[0].times).toEqual([30]); expect(fake.instances[1].times).toEqual([80]);
    one.wrapper.dispose(); one.wrapper.dispose();
    expect(one.parent.children).toHaveLength(0); expect(two.parent.children).toHaveLength(1);
    expect(fake.instances[0].disposed).toBe(1); expect(fake.instances[1].disposed).toBe(0);
    two.wrapper.update(81); expect(fake.instances[1].times).toEqual([80, 81]);
  });
});
