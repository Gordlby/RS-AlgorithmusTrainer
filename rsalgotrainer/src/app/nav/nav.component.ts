import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AlgoDataService } from '../services/algo-data.service';
import { AuthService } from '../services/auth.service';
import { NetworkService } from '../services/network.service';
import { PwaService } from '../services/pwa.service';
import { PoolDataService } from '../services/pool-data.service';
import { LoginComponent } from '../login/login.component';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, LoginComponent],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss'
})
export class NavComponent {
  data     = inject(AlgoDataService);
  auth     = inject(AuthService);
  network  = inject(NetworkService);
  pwa      = inject(PwaService);
  poolData = inject(PoolDataService);
  private router = inject(Router);

  showLogin    = signal(false);
  showNewPool  = signal(false);
  newPoolName  = signal('');
  editingPoolId = signal<string | null>(null);
  editingPoolName = signal('');

  readonly displayTitle = computed(() =>
    this.poolData.currentPool()?.name ?? this.data.currentFc()?.title ?? 'Algorithmen-Trainer'
  );

  readonly tabs = [
    { label: 'Editor',           path: 'editor'           },
    { label: 'Flowchart',        path: 'flowchart'        },
    { label: 'Quiz',             path: 'quiz'             },
    { label: 'Karteikarten',     path: 'karten'           },
    { label: 'Kürzel',           path: 'kuerzel'          },
    { label: 'Fragen',           path: 'fragen'           },
    { label: 'Krankheitsbilder', path: 'krankheitsbilder' },
  ];

  onSelect(event: Event): void {
    this.data.selectFlowchart((event.target as HTMLSelectElement).value);
    this.poolData.clearPool();
  }

  async onNew(): Promise<void> { await this.data.createFlowchart(); }

  async onDelete(): Promise<void> {
    const order = this.data.fcOrder();
    if (order.length <= 1) { alert('Mindestens ein Algorithmus muss bestehen bleiben.'); return; }
    if (!confirm('Diesen Algorithmus wirklich löschen?')) return;
    await this.data.deleteFlowchart(this.data.currentId()!);
  }

  selectPool(id: string): void {
    this.poolData.selectPool(id);
    this.router.navigate(['/fragen']);
  }

  async createPool(): Promise<void> {
    const name = this.newPoolName().trim();
    if (!name) return;
    await this.poolData.createPool(name);
    this.newPoolName.set('');
    this.showNewPool.set(false);
  }

  async deletePool(id: string): Promise<void> {
    if (!confirm('Pool wirklich löschen?')) return;
    await this.poolData.deletePool(id);
  }

  startRenamePool(id: string, currentName: string): void {
    this.editingPoolId.set(id);
    this.editingPoolName.set(currentName);
  }

  async saveRenamePool(): Promise<void> {
    const id = this.editingPoolId();
    const name = this.editingPoolName().trim();
    if (!id || !name) { this.editingPoolId.set(null); return; }
    await this.poolData.renamePool(id, name);
    this.editingPoolId.set(null);
  }

  logout(): void { this.auth.logout(); }
}
