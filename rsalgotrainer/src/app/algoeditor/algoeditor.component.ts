import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AlgoDataService } from '../services/algo-data.service';
import { AuthService } from '../services/auth.service';
import { API_URL } from '../services/api-url.token';
import { PALETTE, NodeType } from '../models/flowchart';

export const TYPE_LABELS: { value: NodeType; label: string }[] = [
  { value: 'start',    label: 'Start' },
  { value: 'process',  label: 'Prozess / Schritt' },
  { value: 'decision', label: 'Entscheidung (Ja/Nein)' },
  { value: 'link',     label: 'Verweis auf anderen Algorithmus' },
  { value: 'end',      label: 'Ende' },
];

interface MyRequest {
  id: string; key: string; value: string; old_value: string | null;
  status: string; created_at: string;
}

@Component({
  selector: 'app-algoeditor',
  imports: [],
  templateUrl: './algoeditor.component.html',
  styleUrl: './algoeditor.component.scss'
})
export class AlgoeditorComponent implements OnInit, OnDestroy {
  data    = inject(AlgoDataService);
  auth    = inject(AuthService);
  private http    = inject(HttpClient);
  private baseUrl = inject(API_URL);

  readonly palette = PALETTE;
  readonly typeLabels = TYPE_LABELS;

  /** FC-IDs, für die dieser User einen offenen Antrag hat */
  pendingFcIds        = signal<Set<string>>(new Set());
  /** Node-IDs, die im ausstehenden Antrag geändert wurden */
  pendingNodeIds      = signal<Set<string>>(new Set());
  pendingTitleChanged = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  @ViewChild('stepsContainer') stepsContainer?: ElementRef<HTMLElement>;
  private draggingId: string | null = null;

  private get headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  async ngOnInit(): Promise<void> {
    if (this.auth.isLoggedIn() && !this.auth.isAdmin()) {
      await this.loadMyRequests();
      this.pollTimer = setInterval(() => this.loadMyRequests(), 30_000);
    }
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async loadMyRequests(): Promise<void> {
    try {
      const rows = await firstValueFrom(
        this.http.get<MyRequest[]>(`${this.baseUrl}/change-requests/mine`, { headers: this.headers })
      );
      const newPending = new Set<string>();
      const prevPending = this.pendingFcIds();

      for (const row of rows) {
        const fcId = row.key.startsWith('v2-fc:') ? row.key.slice('v2-fc:'.length) : null;
        if (!fcId) continue;

        if (row.status === 'pending') {
          newPending.add(fcId);
          try {
            const newFc = JSON.parse(row.value);
            this.data.flowcharts.update(fcs => ({ ...fcs, [fcId]: newFc }));

            // Diff to find which nodes changed
            const changedIds = new Set<string>();
            if (row.old_value) {
              const oldFc = JSON.parse(row.old_value as string);
              if (oldFc.title !== newFc.title) this.pendingTitleChanged.set(true);
              const oldMap = new Map<string, any>(oldFc.nodes?.map((n: any) => [n.id, n]) ?? []);
              for (const n of newFc.nodes ?? []) {
                const o = oldMap.get(n.id);
                if (!o || o.text !== n.text || o.key !== n.key) changedIds.add(n.id);
              }
            } else {
              // No old value — mark all nodes
              (newFc.nodes ?? []).forEach((n: any) => changedIds.add(n.id));
            }
            this.pendingNodeIds.set(changedIds);
          } catch {}
        } else if (row.status === 'rejected' && prevPending.has(fcId)) {
          // Revert to approved KV value
          const kvStr = await firstValueFrom(
            this.http.get<{ value: string }>(`${this.baseUrl}/store/${row.key}`)
          ).catch(() => null);
          if (kvStr) {
            try {
              const fc = JSON.parse(kvStr.value);
              this.data.flowcharts.update(fcs => ({ ...fcs, [fcId]: fc }));
            } catch {}
          }
          this.pendingNodeIds.set(new Set());
          this.pendingTitleChanged.set(false);
        }
      }

      this.pendingFcIds.set(newPending);
      this.data.hasPendingRequest.set(newPending.size > 0);
    } catch {}
  }

  isPendingFc(): boolean {
    const id = this.data.currentId();
    return id ? this.pendingFcIds().has(id) : false;
  }

  get fcId(): string | null { return this.data.currentId(); }

  // ─── Title ───────────────────────────────────────────────────────────────
  onTitleChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.fcId) this.data.updateTitle(this.fcId, val);
  }

  // ─── Nodes ───────────────────────────────────────────────────────────────
  onAddNode(): void {
    if (this.fcId) this.data.addNode(this.fcId);
  }

  onDeleteNode(nodeId: string): void {
    if (this.fcId) this.data.deleteNode(this.fcId, nodeId);
  }

  onTypeChange(nodeId: string, event: Event): void {
    const type = (event.target as HTMLSelectElement).value as NodeType;
    if (this.fcId) this.data.changeNodeType(this.fcId, nodeId, type);
  }

  onKeyChange(nodeId: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.fcId) this.data.patchNode(this.fcId, nodeId, { key: val });
  }

  onTextChange(nodeId: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.fcId) this.data.patchNode(this.fcId, nodeId, { text: val });
  }

  onColorChange(nodeId: string, color: string): void {
    if (this.fcId) this.data.patchNode(this.fcId, nodeId, { color });
  }

  onLinkedFcChange(nodeId: string, event: Event): void {
    const val = (event.target as HTMLSelectElement).value || null;
    if (this.fcId) this.data.patchNode(this.fcId, nodeId, { linkedFlowchartId: val });
  }

  // ─── Facts ───────────────────────────────────────────────────────────────
  onAddFact(nodeId: string): void {
    if (this.fcId) this.data.addFact(this.fcId, nodeId);
  }

  onFactChange(nodeId: string, index: number, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.fcId) this.data.updateFact(this.fcId, nodeId, index, val);
  }

  onDeleteFact(nodeId: string, index: number): void {
    if (this.fcId) this.data.deleteFact(this.fcId, nodeId, index);
  }

  // ─── Branches ────────────────────────────────────────────────────────────
  onAddBranch(nodeId: string): void {
    if (this.fcId) this.data.addBranch(this.fcId, nodeId);
  }

  onBranchLabelChange(nodeId: string, branchId: string, event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    if (this.fcId) this.data.patchBranch(this.fcId, nodeId, branchId, { label: val });
  }

  onBranchTargetChange(nodeId: string, branchId: string, event: Event): void {
    const val = (event.target as HTMLSelectElement).value || null;
    if (this.fcId) this.data.patchBranch(this.fcId, nodeId, branchId, { targetId: val });
  }

  onDeleteBranch(nodeId: string, branchId: string): void {
    if (this.fcId) this.data.deleteBranch(this.fcId, nodeId, branchId);
  }

  // ─── Drag & Drop (native HTML5) ──────────────────────────────────────────
  onDragStart(nodeId: string): void {
    this.draggingId = nodeId;
  }

  onDragOver(event: DragEvent, afterNodeId: string): void {
    event.preventDefault();
    if (!this.draggingId || this.draggingId === afterNodeId) return;
    const container = this.stepsContainer?.nativeElement;
    if (!container) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-node-id]'));
    const afterEl = cards.find(el => el.dataset['nodeId'] === afterNodeId);
    const draggingEl = cards.find(el => el.dataset['nodeId'] === this.draggingId);
    if (!afterEl || !draggingEl) return;

    const afterRect = afterEl.getBoundingClientRect();
    if (event.clientY < afterRect.top + afterRect.height / 2) {
      container.insertBefore(draggingEl, afterEl);
    } else {
      container.insertBefore(draggingEl, afterEl.nextSibling);
    }
  }

  onDragEnd(): void {
    const container = this.stepsContainer?.nativeElement;
    if (!container || !this.fcId) return;
    const orderedIds = Array.from(container.querySelectorAll<HTMLElement>('[data-node-id]'))
      .map(el => el.dataset['nodeId']!)
      .filter(Boolean);
    this.data.reorderNodes(this.fcId, orderedIds);
    this.draggingId = null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  trackById(_: number, item: { id: string }): string { return item.id; }

  otherFlowcharts(): { id: string; title: string }[] {
    return this.data.orderedFlowcharts()
      .filter(fc => fc.id !== this.fcId)
      .map(fc => ({ id: fc.id, title: fc.title }));
  }

  nodeTargetOptions(nodeId: string): { id: string; label: string }[] {
    const fc = this.data.currentFc();
    if (!fc) return [];
    return fc.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({ id: n.id, label: this.data.nodeLabel(fc, n.id) }));
  }
}
