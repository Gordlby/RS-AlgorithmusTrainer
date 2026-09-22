export type ExamGroup =
  | 'vital'
  | 'befund'
  | 'sampler'
  | 'opqrst'
  | 'abcde'
  | 'stuabcde'
  | 'massnahmen'
  | 'info';

export const EXAM_GROUP_LABEL: Record<ExamGroup, string> = {
  vital:      'Vitalwerte',
  befund:     'Befunde',
  sampler:    'SAMPLER',
  opqrst:     'OPQRST',
  abcde:      'ABCDE ohne Unfallhergang',
  stuabcde:   '(C)ABCDE + STU (Trauma)',
  massnahmen: 'Maßnahmen',
  info:       'Informationen',
};

export const EXAM_GROUP_ICON: Record<ExamGroup, string> = {
  vital:      'pat_all',
  befund:     'pat_erscheinungsbild',
  sampler:    'merkhilfe_sampler',
  opqrst:     'merkhilfe_opqrst',
  abcde:      'merkhilfe_abcde',
  stuabcde:   'merkhilfe_stu',
  massnahmen: 'massnahmen',
  info:       'informationen',
};

// Default item labels when a new section of a given group is created
export const EXAM_GROUP_DEFAULTS: Record<ExamGroup, string[]> = {
  vital: [
    'Puls / HF',
    'Blutdruck (RR)',
    'Atemfrequenz (AF)',
    'SpO₂',
    'Blutzucker (BZ)',
    'Temperatur',
    'Bewusstsein (AVPU)',
    'GCS',
  ],
  befund: [],
  sampler: [
    'S – Symptome',
    'A – Allergien',
    'M – Medikamente',
    'P – Patientengeschichte',
    'L – Letzte Mahlzeit',
    'E – Ereignis',
    'R – Risikofaktoren',
  ],
  opqrst: [
    'O – Onset (Beginn / Auslöser)',
    'P – Provocation / Palliation',
    'Q – Quality (Schmerzqualität)',
    'R – Region / Radiation',
    'S – Severity (NRS 0–10)',
    'T – Time (Zeitverlauf)',
  ],
  abcde: [
    'A – Airway (Atemweg)',
    'B – Breathing (Atmung)',
    'C – Circulation (Kreislauf)',
    'D – Disability (Neurologie)',
    'E – Exposure (Umgebung)',
  ],
  stuabcde: [
    '(C) – Kritische Blutung',
    'A – Airway (Atemweg)',
    'B – Breathing (Atmung)',
    'C – Circulation (Kreislauf)',
    'STU – Standard Trauma Untersuchung',
    'D – Disability (Neurologie)',
    'E – Exposure (Umgebung / Anamnese)',
  ],
  massnahmen: [],
  info:       ['Hinweise'],
};

export interface ExamItem {
  id: string;
  label: string;
  value: string;
  iconKey?: string;  // RS icon key (e.g. 'blutstillung', 'o2_algorithmus')
}

export interface ExamSection {
  id: string;
  group: ExamGroup;
  items: ExamItem[];
}

export interface Krankheitsbild {
  id: string;
  name: string;
  kategorie: string;
  scenario: string;
  sections: ExamSection[];
  hinweise?: string;
}

// All RS icon keys that can be attached to individual items
export const RS_ICONS: Array<{ key: string; label: string }> = [
  { key: 'blutstillung',         label: 'Blutstillung' },
  { key: 'psychische_betreuung', label: 'Psychische Betreuung' },
  { key: 'waermeerhalt',         label: 'Wärmeerhalt' },
  { key: 'cpr_bereitschaft',     label: 'CPR-Bereitschaft' },
  { key: 'notarzt',              label: 'Notarzt anfordern' },
  { key: 'wundversorgung',       label: 'Wundversorgung' },
  { key: 'immobilisation_hws',   label: 'Immobilisation der HWS' },
  { key: 'extremitaetenschienung', label: 'Extremitätenschienung' },
  { key: 'vakuummatratze',       label: 'Vakuummatratze' },
  { key: 'bewegungsverbot',      label: 'Bewegungsverbot' },
  { key: 'transportprioritaet',  label: 'Transportpriorität' },
  { key: 'gefahr',               label: 'Gefahr!/Achtung!' },
  { key: 'o2_algorithmus',       label: 'O₂ nach Algorithmus' },
  { key: 'o2_max_flow',          label: 'Max. Flow' },
  { key: 'o2_92_98',             label: 'SpO₂ 92–98%' },
  { key: 'o2_88_92',             label: 'SpO₂ 88–92%' },
  { key: 'o2_keine',             label: 'Keine O₂-Gabe' },
  { key: 'pos_flach',            label: 'Flach' },
  { key: 'pos_30',               label: '30°' },
  { key: 'pos_60',               label: '60°' },
  { key: 'pos_beine_hoch',       label: 'Beine hoch' },
  { key: 'pos_bauchdecke',       label: 'Bauchdeckenentspannt' },
  { key: 'pos_seite',            label: 'Seitenlage' },
  { key: 'pos_situationsgerecht', label: 'Situationsgerecht' },
  { key: 'pos_beine_tief',       label: 'Bein(e) tief' },
];
