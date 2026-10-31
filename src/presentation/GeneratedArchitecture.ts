import type { Group, Vector3 } from 'three';
import type { ScenarioId } from '../contracts';
import type { ModelLibrary } from '../assets/ModelLibrary';
import { architectureSource } from '../assets/architecture-catalog';
import { ArchitectureTransactions } from './ArchitectureTransactions';
import { allArchitectureAssets, bindArchitecture } from './architecture-bindings';
import { registerModelDisposer } from './model-tools';

export interface ArchitectureStatus {
  readonly id: string;
  readonly state: 'pending' | 'loading' | 'ready' | 'error' | 'cancelled';
  readonly error?: string;
  readonly placements?: number;
  readonly drawBatches?: number;
}
export interface GeneratedArchitectureOptions {
  readonly parent: Group;
  readonly scenario: ScenarioId;
  readonly baseURL: string;
  readonly onStatus?: (status: ArchitectureStatus) => void;
}
/** Shared-library adapter. Call after PortKit.flush; dispose before generic tree traversal. */
export class GeneratedArchitecture {
  readonly ready: Promise<readonly ArchitectureStatus[]>;
  private readonly lifetime = new AbortController();
  private readonly transactions: ArchitectureTransactions;
  private readonly statuses = new Map<string, ArchitectureStatus>();
  private readonly unregister: () => void;
  private disposed = false;
  constructor(library: Pick<ModelLibrary, 'acquire'>, private readonly options: GeneratedArchitectureOptions) {
    const baseURL = new URL(options.baseURL).href;
    const groups = bindArchitecture(options.parent, options.scenario);
    this.transactions = new ArchitectureTransactions(options.parent, {
      assets: allArchitectureAssets(),
      acquire: id => library.acquire(architectureSource(id, baseURL), { signal: this.lifetime.signal }),
    });
    this.unregister = registerModelDisposer(options.parent, () => this.dispose());
    // The source cache deduplicates each level across groups; bounded group workers
    // keep unrelated texture decodes from starting all at once during transitions.
    for (const group of groups) this.statuses.set(group.id, { id: group.id, state: 'pending' });
    let cursor = 0;
    this.ready = Promise.all(Array.from({ length: Math.min(2, groups.length) }, async () => {
      while (!this.disposed && cursor < groups.length) {
        const group = groups[cursor++];
        if (group.error) { this.report({ id: group.id, state: 'error', error: group.error }); continue; }
        this.report({ id: group.id, state: 'loading' });
        try {
          const result = await this.transactions.replace(group).ready;
          this.report({ ...result, state: this.disposed || result.state === 'disposed' ? 'cancelled' : result.state });
        } catch (error) {
          this.report({ id: group.id, state: this.disposed ? 'cancelled' : 'error', error: error instanceof Error ? error.message : String(error) });
        }
      }
    })).then(() => this.getStatus());
  }
  private report(status: ArchitectureStatus): void {
    this.statuses.set(status.id, status);
    try { this.options.onStatus?.({ ...status }); } catch { /* UI observers do not own leases. */ }
  }
  getStatus(): readonly ArchitectureStatus[] { return [...this.statuses.values()].map(status => ({ ...status })); }
  coverage(): ReturnType<ArchitectureTransactions['coverage']> { return this.transactions.coverage(); }
  update(cameraPosition?: Vector3): void { if (cameraPosition && !this.disposed) this.transactions.update(cameraPosition); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.unregister(); this.lifetime.abort();
    this.transactions.dispose();
    for (const status of this.statuses.values()) if (status.state === 'pending' || status.state === 'loading') this.report({ ...status, state: 'cancelled' });
  }
}
