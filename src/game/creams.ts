/* クリームの色定義とトッピング定義 */
export interface CreamColor {
  light: string;
  main: string;
  dark: string;
}

export interface CreamDef {
  id: string;
  name: string;
  style: 'swirl' | 'soft' | 'cloud';
  price: number;
  rainbow?: boolean;
  c: CreamColor;
}

export const CREAMS: CreamDef[] = [
  { id: 'vanilla', name: 'バニラ', style: 'swirl', price: 0, c: { light: '#fffdf6', main: '#fdf2dc', dark: '#e6d2ac' } },
  { id: 'strawberry', name: 'いちご', style: 'soft', price: 150, c: { light: '#ffe8ef', main: '#ffb9ce', dark: '#ee8ca9' } },
  { id: 'chocolate', name: 'ショコラ', style: 'swirl', price: 200, c: { light: '#cfa383', main: '#9a6a4c', dark: '#6f452f' } },
  { id: 'matcha', name: 'まっちゃ', style: 'soft', price: 250, c: { light: '#e9f5d4', main: '#b9dc8e', dark: '#8fbb6b' } },
  { id: 'blueberry', name: 'ブルーベリー', style: 'cloud', price: 300, c: { light: '#eee7ff', main: '#bda9f2', dark: '#8f79cf' } },
  { id: 'lemon', name: 'レモン', style: 'cloud', price: 300, c: { light: '#fffcdc', main: '#ffe884', dark: '#e9c94f' } },
  { id: 'mint', name: 'ミント', style: 'soft', price: 350, c: { light: '#e5fdf5', main: '#a8e6cf', dark: '#79c9ad' } },
  { id: 'caramel', name: 'キャラメル', style: 'swirl', price: 400, c: { light: '#ffe7c1', main: '#f5b971', dark: '#b87a36' } },
  { id: 'sakura', name: 'さくら', style: 'cloud', price: 450, c: { light: '#fff1f6', main: '#ffc2d6', dark: '#f39ab8' } },
  { id: 'rainbow', name: 'にじいろ', style: 'cloud', price: 600, rainbow: true, c: { light: '#ffffff', main: '#ffd6e8', dark: '#e5b8ff' } }
];

export interface ToppingDef {
  id: string;
  name: string;
  color: string;
  geo: string;
}

export const TOPPINGS: ToppingDef[] = [
  { id: 'sprinkle', name: 'スプリンクル', color: '#ffe066', geo: 'sprinkle' },
  { id: 'chip', name: 'チョコチップ', color: '#4a2b1c', geo: 'chip' },
  { id: 'star', name: 'スター', color: '#ffd166', geo: 'star' },
  { id: 'heart', name: 'ハート', color: '#ef6f97', geo: 'heart' },
  { id: 'berry', name: 'ラズベリー', color: '#d63d63', geo: 'berry' },
  { id: 'nut', name: 'アーモンド', color: '#e0b47c', geo: 'nut' },
  { id: 'mint', name: 'ミント', color: '#67bf86', geo: 'leaf' },
  { id: 'pearl', name: 'パール', color: '#dff3fb', geo: 'pearl' },
  { id: 'gold', name: '金箔', color: '#f2c14e', geo: 'gold' },
  { id: 'cherry', name: 'さくらんぼ', color: '#d8304f', geo: 'cherry' }
];

export const TOPPING_PRICE: Record<string, number> = {
  sprinkle: 0,
  chip: 120,
  star: 200,
  heart: 250,
  berry: 300,
  nut: 320,
  mint: 360,
  pearl: 400,
  gold: 600,
  cherry: 450
};

export function creamById(id: string): CreamDef {
  return CREAMS.find((c) => c.id === id) ?? CREAMS[0]!;
}

export function toppingById(id: string): ToppingDef {
  return TOPPINGS.find((t) => t.id === id) ?? TOPPINGS[0]!;
}
