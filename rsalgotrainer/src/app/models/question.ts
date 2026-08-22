export type QuestionType = 'single' | 'multiple' | 'dragdrop';

export interface Choice {
  id: string;
  text: string;
  correct: boolean;
}

export interface DragItem {
  id: string;
  label: string;
}

export interface DropZone {
  id: string;
  x: number;   // 0–100 % of image width
  y: number;   // 0–100 % of image height
  correctItemId: string | null;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  image: string | null;
  choices: Choice[];
  dragItems: DragItem[];
  dropZones: DropZone[];
}
