/* DIBSEN view atlases -- one grid of keyed views per island, sampled at even
   angular steps from a turntable render. Metadata only; the image itself is
   fetched separately so the hero stays light and file:// simply falls back
   to the single flat plate in plates.js. */
window.DIBSEN_VIEWS = {
  "dome": {
    "url": "assets/views/dome.webp",
    "views": 13,
    "step": 15.0,
    "w": 640,
    "h": 447,
    "cols": 4,
    "rows": 4,
    "aspect": 1.4333,
    "solid": [
      0.9734,
      0.9672,
      0.9469,
      0.9172,
      0.8625,
      0.7797,
      0.6516,
      0.5047,
      0.5297,
      0.6344,
      0.7453,
      0.8516,
      0.9281
    ]
  },
  "blade": {
    "url": "assets/views/blade.webp",
    "views": 13,
    "step": 15.0,
    "w": 591,
    "h": 535,
    "cols": 4,
    "rows": 4,
    "aspect": 1.1047,
    "solid": [
      0.5763,
      0.6061,
      0.6133,
      0.5988,
      0.5776,
      0.5454,
      0.4995,
      0.4398,
      0.3741,
      0.3048,
      0.2994,
      0.3751,
      0.4577
    ]
  },
  "tower": {
    "url": "assets/views/tower.webp",
    "views": 13,
    "step": 15.0,
    "w": 512,
    "h": 748,
    "cols": 4,
    "rows": 4,
    "aspect": 0.6848,
    "solid": [
      0.9512,
      0.959,
      0.9375,
      0.9023,
      0.8066,
      0.6895,
      0.6074,
      0.5664,
      0.6172,
      0.7363,
      0.8652,
      0.9434,
      0.9746
    ]
  }
};
