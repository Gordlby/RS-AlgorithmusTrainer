export type QuestionType = 'single' | 'multiple' | 'dragdrop' | 'match';

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
  x: number;   // left edge, 0–100 % of image width
  y: number;   // top edge, 0–100 % of image height
  w: number;   // width, % of image width
  h: number;   // height, % of image height
  correctItemId: string | null;
}

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  image: string | null;
  choices: Choice[];
  dragItems: DragItem[];
  dropZones: DropZone[];
  matchPairs: MatchPair[];
}
