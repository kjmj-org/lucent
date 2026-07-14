'use strict';

// Amazon image presets. Dimensions are the app's best-effort defaults and are
// EDITABLE by the user. Amazon changes its requirements over time — always
// confirm the current sizes shown in Seller Central before publishing.
//
// `format` is a recommendation used by "Auto": 'jpeg' for photographic /
// on-white listing images, 'png' for graphics that may need transparency or
// crisp text/icons. `allowTransparency` controls whether Auto keeps an alpha
// channel or flattens onto white.

const DEFAULT_PRESETS = [
  {
    id: 'auto',
    name: 'Auto detected',
    auto: true,
    width: 0,
    height: 0,
    format: 'auto',
    allowTransparency: true,
    note: "Keeps each image's own size and aspect ratio."
  },
  {
    id: 'main-listing',
    name: 'Main listing image',
    width: 2000,
    height: 2000,
    format: 'jpeg',
    allowTransparency: false,
    note: 'Square, pure-white background. 1600px+ enables hover-zoom; 2000px recommended.'
  },
  {
    id: 'secondary-listing',
    name: 'Secondary listing image',
    width: 2000,
    height: 2000,
    format: 'jpeg',
    allowTransparency: false,
    note: 'Lifestyle / infographic gallery image. Square keeps it consistent with the main image.'
  },
  {
    id: 'square-generic',
    name: 'Square image',
    width: 2000,
    height: 2000,
    format: 'auto',
    allowTransparency: true,
    note: 'Generic high-resolution square.'
  },
  {
    id: 'aplus-standard',
    name: 'Standard A+ image',
    width: 970,
    height: 600,
    format: 'jpeg',
    allowTransparency: false,
    note: 'Common A+ content module image.'
  },
  {
    id: 'aplus-wide-banner',
    name: 'Wide A+ banner',
    width: 970,
    height: 300,
    format: 'jpeg',
    allowTransparency: false,
    note: 'Full-width A+ header / banner.'
  },
  {
    id: 'comparison-chart',
    name: 'Comparison chart',
    width: 1464,
    height: 600,
    format: 'png',
    allowTransparency: false,
    note: 'Comparison-chart module. PNG keeps table text and lines crisp.'
  },
  {
    id: 'four-image-module',
    name: 'Four-image module',
    width: 300,
    height: 300,
    format: 'png',
    allowTransparency: true,
    note: 'Small four-image / four-image-and-text module thumbnail.'
  },
  {
    id: 'brand-story',
    name: 'Brand Story image',
    width: 463,
    height: 1000,
    format: 'jpeg',
    allowTransparency: false,
    note: 'Brand Story carousel background image.'
  },
  {
    id: 'custom',
    name: 'Custom dimensions',
    width: 2000,
    height: 2000,
    format: 'auto',
    allowTransparency: true,
    note: 'Set any dimensions you need.'
  }
];

module.exports = { DEFAULT_PRESETS };
