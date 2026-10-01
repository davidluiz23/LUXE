// One ledger supplies camera, light, DOM navigation and interaction gates.
export const chapters = [
  { id: 'heritage', label: 'The origin', camera: { p: [0, 3.15, 11.8], t: [0, 2.9, 0], fov: 35 }, tablet: {p: [.5, 3.4, 14], t: [.7, 2.8, 0], fov: 38}, mobile: { p: [2.1, 3.7, 13.5], t: [2.1, 1.7, 0], fov: 43 }, light: { key: 2.8, fill: .95, rim: 2.1, x: -3.5, z: 5, fog: .017 } },
  { id: 'form', label: 'The form', camera: { p: [6.9, 3.85, 6.6], t: [3.2, 3.05, 0], fov: 38 }, tablet: {p: [7, 3.8, 9], t: [3.65, 3, 0], fov: 40}, mobile: { p: [5.6, 4.8, 8.8], t: [2.1, 2.2, 0], fov: 43 }, light: { key: 2.8, fill: .58, rim: 3.1, x: -3.8, z: 2.8, fog: .015 } },
  { id: 'expression', label: 'The expression', camera: { p: [-10.5, 3.2, 7.8], t: [-8.2, 2.85, -3.8], fov: 37 }, tablet: {p: [-10.6, 3.4, 11], t: [-8.9, 2.85, -4], fov: 42}, mobile: { p: [-11.8, 3.7, 5.8], t: [-11.8, 1.3, -4.2], fov: 48 }, light: { key: 3.2, fill: .85, rim: 1.8, x: -8, z: 4, fog: .013 } },
  { id: 'collection', label: 'The collection', camera: { p: [-3.2, 6.8, 16], t: [-3.1, 5.3, -2.8], fov: 43 }, tablet: {p: [-2, 6.4, 22], t: [-2.8, 5.5, -2], fov: 43}, mobile: { p: [-1.8, 5.1, 18], t: [-1.8, 1.2, -2], fov: 46 }, light: { key: 2.5, fill: .55, rim: 2, x: -3.5, z: 5, fog: .024 } },
];
export const references = [
  { id: 'ijele', title: 'Ijele', image: 'assets/products/ijele.jpg', alt: 'Black Ijele tee with warm lettering and intricate expressive artwork', match: /\bijele\b/ },
  { id: 'durbar', title: 'Durbar', image: 'assets/products/durbar.jpg', alt: 'Black tee with gold Durbar lettering and a mounted figure print', match: /\bdurbar\b/ },
  { id: 'dun-dun', title: 'Dùn Dùn', image: 'assets/products/dun-dun.jpg', alt: 'Black Dùn Dùn tee with yellow lettering and a print of three drummers', match: /\bdun[\s-]+dun\b/ },
];
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
