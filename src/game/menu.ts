// Each entry is one conveyor arrival. Fruits in an arrival are separate targets.
const fruits = ['strawberry', 'blueberry', 'grape', 'raspberry', 'blueberry'];
const menus = [
  [['waffle'], ['waffle'], fruits, ['waffle']],
  [['tart_shell'], ['tart_shell'], ['tart'], fruits],
  [['donut'], ['waffle'], ['macaron'], fruits],
  [['eclair'], fruits, ['tart_shell']],
  [['pancake'], ['cookie'], fruits, ['waffle']],
  [['macaron'], ['shortcake'], fruits],
  [['parfait'], fruits, ['tart']],
  [fruits, ['cookie'], ['donut']],
  [fruits, ['parfait'], ['eclair']],
  [['waffle'], ['shortcake'], fruits, ['tart_shell'], ['pancake'], ['macaron']]
];

export function trayItems(stageIndex: number, itemIndex: number): readonly string[] {
  const menu = menus[stageIndex] ?? menus[0];
  return menu[itemIndex % menu.length];
}

export const fruitRadii: Readonly<Partial<Record<string, number>>> = {
  strawberry: 0.32, raspberry: 0.27, blueberry: 0.23, grape: 0.28
};
