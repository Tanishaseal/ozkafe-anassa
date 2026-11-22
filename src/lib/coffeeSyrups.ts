export const syrupPrice = 19;
export const coffeeSyrups = [
  { id: 'ad-1', name: 'Caramel' },
  { id: 'ad-2', name: 'Hazelnut' },
  { id: 'ad-3', name: 'Vanilla' },
];
export function allowsCoffeeSyrups(id: string): boolean {
  return /^hc-([1-9]|1[0-4])$/.test(id);
}
