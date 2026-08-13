export interface MnemonicItem {
  id: string;
  letter: string;
  label: string;
}

export interface Mnemonic {
  id: string;
  acronym: string;
  title: string;
  items: MnemonicItem[];
}
