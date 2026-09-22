import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KrankheitsbildDataService } from '../services/krankheitsbild-data.service';
import { AuthService } from '../services/auth.service';
import {
  Krankheitsbild, ExamGroup, ExamSection,
  EXAM_GROUP_LABEL, EXAM_GROUP_ICON, RS_ICONS
} from '../models/krankheitsbild';

type Mode = 'liste' | 'quiz' | 'bearbeiten';

const ALL_GROUPS: ExamGroup[] = [
  'vital', 'befund', 'sampler', 'opqrst', 'abcde', 'stuabcde', 'massnahmen', 'info'
];

@Component({
  selector: 'app-krankheitsbilder',
  imports: [FormsModule],
  templateUrl: './krankheitsbilder.component.html',
  styleUrl: './krankheitsbilder.component.scss'
})
export class KrankheitsbilderComponent {
  data = inject(KrankheitsbildDataService);
  auth = inject(AuthService);

  // ── Navigation ────────────────────────────────────────────────────────────

  mode        = signal<Mode>('liste');
  currentId   = signal<string | null>(null);
  filterKat   = signal<string | null>(null);

  readonly current = computed<Krankheitsbild | null>(() => {
    const id = this.currentId();
    return id ? (this.data.getById(id) ?? null) : null;
  });

  readonly filteredListe = computed(() => {
    const kat = this.filterKat();
    return kat ? this.data.liste().filter(kb => kb.kategorie === kat) : this.data.liste();
  });

  // ── Quiz state ────────────────────────────────────────────────────────────

  revealed          = signal<Set<string>>(new Set());
  openSections      = signal<Set<string>>(new Set());
  diagnosisInput    = signal('');
  diagnosisSubmitted = signal(false);

  readonly revealedCount = computed(() => this.revealed().size);
  readonly totalItems    = computed(() =>
    this.current()?.sections.reduce((n, s) => n + s.items.length, 0) ?? 0
  );
  readonly allRevealed   = computed(() => this.revealedCount() === this.totalItems());
  readonly guessCorrect  = computed<boolean | null>(() => {
    if (!this.diagnosisSubmitted()) return null;
    const kb = this.current();
    if (!kb) return null;
    return this.diagnosisInput().trim().toLowerCase() === kb.name.toLowerCase();
  });

  // ── Edit state ────────────────────────────────────────────────────────────

  readonly groupOptions = ALL_GROUPS;
  readonly groupLabel   = EXAM_GROUP_LABEL;
  readonly rsIcons      = RS_ICONS;
  showIconPicker        = signal<string | null>(null); // itemId for which picker is open

  // ── Liste methods ─────────────────────────────────────────────────────────

  startQuiz(id: string): void {
    this.currentId.set(id);
    this.revealed.set(new Set());
    this.diagnosisInput.set('');
    this.diagnosisSubmitted.set(false);
    // Open first section by default
    const kb = this.data.getById(id);
    if (kb?.sections.length) {
      this.openSections.set(new Set([kb.sections[0].id]));
    } else {
      this.openSections.set(new Set());
    }
    this.mode.set('quiz');
  }

  editKb(id: string): void {
    this.currentId.set(id);
    this.mode.set('bearbeiten');
  }

  addNew(): void {
    const kb = this.data.add();
    this.currentId.set(kb.id);
    this.mode.set('bearbeiten');
  }

  async removeKb(): Promise<void> {
    const kb = this.current();
    if (!kb || !confirm(`"${kb.name}" wirklich löschen?`)) return;
    this.data.remove(kb.id);
    await this.data.save();
    this.mode.set('liste');
    this.currentId.set(null);
  }

  back(): void {
    this.mode.set('liste');
    this.currentId.set(null);
  }

  // ── Quiz methods ──────────────────────────────────────────────────────────

  reveal(itemId: string): void {
    this.revealed.update(s => new Set([...s, itemId]));
  }

  revealAll(): void {
    const kb = this.current();
    if (!kb) return;
    const all = kb.sections.flatMap(s => s.items.map(it => it.id));
    this.revealed.set(new Set(all));
  }

  isRevealed(itemId: string): boolean {
    return this.revealed().has(itemId);
  }

  toggleSection(sectionId: string): void {
    this.openSections.update(s => {
      const next = new Set(s);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  isSectionOpen(sectionId: string): boolean {
    return this.openSections().has(sectionId);
  }

  sectionRevealedCount(section: ExamSection): number {
    return section.items.filter(it => this.revealed().has(it.id)).length;
  }

  submitDiagnosis(): void {
    if (!this.diagnosisInput().trim()) return;
    this.diagnosisSubmitted.set(true);
  }

  resetQuiz(): void {
    this.revealed.set(new Set());
    this.diagnosisInput.set('');
    this.diagnosisSubmitted.set(false);
    const kb = this.current();
    if (kb?.sections.length) {
      this.openSections.set(new Set([kb.sections[0].id]));
    }
  }

  iconPath(key: string): string {
    return `assets/icons/rs/${key}.png`;
  }

  sectionIcon(group: ExamGroup): string {
    return this.iconPath(EXAM_GROUP_ICON[group]);
  }

  // ── Edit methods ──────────────────────────────────────────────────────────

  onNameChange(e: Event): void {
    const kb = this.current();
    if (kb) this.data.update(kb.id, { name: (e.target as HTMLInputElement).value });
  }

  onKatChange(e: Event): void {
    const kb = this.current();
    if (kb) this.data.update(kb.id, { kategorie: (e.target as HTMLInputElement).value });
  }

  onScenarioChange(e: Event): void {
    const kb = this.current();
    if (kb) this.data.update(kb.id, { scenario: (e.target as HTMLTextAreaElement).value });
  }

  onHinweiseChange(e: Event): void {
    const kb = this.current();
    if (kb) this.data.update(kb.id, { hinweise: (e.target as HTMLTextAreaElement).value });
  }

  addSection(group: ExamGroup): void {
    const kb = this.current();
    if (kb) this.data.addSection(kb.id, group);
  }

  removeSection(sectionId: string): void {
    const kb = this.current();
    if (kb) this.data.removeSection(kb.id, sectionId);
  }

  addItem(sectionId: string): void {
    const kb = this.current();
    if (kb) this.data.addItem(kb.id, sectionId);
  }

  onItemLabelChange(sectionId: string, itemId: string, e: Event): void {
    const kb = this.current();
    if (kb) this.data.updateItem(kb.id, sectionId, itemId, { label: (e.target as HTMLInputElement).value });
  }

  onItemValueChange(sectionId: string, itemId: string, e: Event): void {
    const kb = this.current();
    if (kb) this.data.updateItem(kb.id, sectionId, itemId, { value: (e.target as HTMLInputElement).value });
  }

  setItemIcon(sectionId: string, itemId: string, iconKey: string): void {
    const kb = this.current();
    if (kb) {
      const currentItem = kb.sections.find(s => s.id === sectionId)?.items.find(it => it.id === itemId);
      const newKey = currentItem?.iconKey === iconKey ? undefined : iconKey;
      this.data.updateItem(kb.id, sectionId, itemId, { iconKey: newKey });
    }
    this.showIconPicker.set(null);
  }

  removeItem(sectionId: string, itemId: string): void {
    const kb = this.current();
    if (kb) this.data.removeItem(kb.id, sectionId, itemId);
  }

  async saveAll(): Promise<void> {
    await this.data.save();
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
