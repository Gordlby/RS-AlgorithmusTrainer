import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AlgoDataService } from '../services/algo-data.service';
import { AuthService } from '../services/auth.service';
import { NetworkService } from '../services/network.service';
import { PwaService } from '../services/pwa.service';
import { LoginComponent } from '../login/login.component';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, LoginComponent],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss'
})
export class NavComponent {
  data    = inject(AlgoDataService);
  auth    = inject(AuthService);
  network = inject(NetworkService);
  pwa     = inject(PwaService);

  showLogin = signal(false);

  readonly tabs = [
    { label: 'Editor',       path: 'editor'    },
    { label: 'Flowchart',    path: 'flowchart' },
    { label: 'Quiz',         path: 'quiz'      },
    { label: 'Karteikarten', path: 'karten'    },
    { label: 'Kürzel',       path: 'kuerzel'   },
  ];

  onSelect(event: Event): void {
    this.data.selectFlowchart((event.target as HTMLSelectElement).value);
  }

  async onNew(): Promise<void> {
    await this.data.createFlowchart();
  }

  async onDelete(): Promise<void> {
    const order = this.data.fcOrder();
    if (order.length <= 1) { alert('Mindestens ein Algorithmus muss bestehen bleiben.'); return; }
    if (!confirm('Diesen Algorithmus wirklich löschen?')) return;
    await this.data.deleteFlowchart(this.data.currentId()!);
  }

  logout(): void { this.auth.logout(); }
}
