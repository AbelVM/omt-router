/**
 * Pre-defined route pairs for CPU vs GPU benchmarking.
 *
 * Organized into 4 environment categories × 5 length categories.
 * Coordinates are [lng, lat] (GeoJSON order).
 *
 * Environment categories — reflect road-network edge density per tile:
 *   city-center       very dense grid (historic cores, Manhattan, Paris 1st–4th)
 *   city-consolidated dense but irregular (inner suburbs, Brooklyn, Paris 11th–18th)
 *   suburban          moderate density (Versailles, Long Island towns)
 *   countryside       sparse (Beauce, rural Connecticut)
 *
 * Length categories — approximate beeline distance:
 *   extra-short   50 – 300 m
 *   short        300 m – 1.5 km
 *   medium       1.5 – 6 km
 *   long         6 – 20 km
 *   extra-long   > 20 km
 *
 * `forceRadius` (optional): override the auto-computed tile-fetch radius.
 * Use the same geographic route pair with forceRadius: 1 and forceRadius: 2
 * to sample the same (beeline, category) point at two different E levels.
 */

export const ROUTES = [
  // ── CITY CENTER — Paris historic core (Île de la Cité / Marais) ───────────
  // Anchor: Notre-Dame [2.3500, 48.8520]
  {
    id: 'cc-par-xs-1', name: 'Paris Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [2.3500, 48.8520], end: [2.3514, 48.8527],     // ≈ 130 m
  },
  {
    id: 'cc-par-xs-2', name: 'Paris Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [2.3536, 48.8567], end: [2.3551, 48.8574],     // ≈ 120 m
  },
  {
    id: 'cc-par-s-1', name: 'Paris Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [2.3500, 48.8520], end: [2.3568, 48.8556],     // ≈ 640 m
  },
  {
    id: 'cc-par-s-2', name: 'Paris Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [2.3536, 48.8567], end: [2.3620, 48.8620],     // ≈ 900 m
  },
  {
    id: 'cc-par-m-1', name: 'Paris Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [2.3500, 48.8520], end: [2.3720, 48.8630],     // ≈ 2.3 km
  },
  {
    id: 'cc-par-m-2', name: 'Paris Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [2.3500, 48.8520], end: [2.3280, 48.8400],     // ≈ 2.4 km
  },
  {
    id: 'cc-par-l-1', name: 'Paris Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [2.3500, 48.8520], end: [2.4300, 48.8820],     // ≈ 6.7 km
  },
  {
    id: 'cc-par-l-2', name: 'Paris Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [2.3500, 48.8520], end: [2.2700, 48.8180],     // ≈ 7.0 km
  },
  {
    id: 'cc-par-xl-1', name: 'Paris Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [2.3500, 48.8520], end: [2.5100, 48.9200],     // ≈ 13.9 km
  },

  // ── CITY CENTER — Manhattan Midtown ───────────────────────────────────────
  // Anchor: Penn Station area [-73.9857, 40.7484]
  {
    id: 'cc-nyc-xs-1', name: 'Manhattan XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-73.9857, 40.7484], end: [-73.9843, 40.7490], // ≈ 120 m
  },
  {
    id: 'cc-nyc-xs-2', name: 'Manhattan XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-73.9900, 40.7540], end: [-73.9885, 40.7547], // ≈ 120 m
  },
  {
    id: 'cc-nyc-s-1', name: 'Manhattan S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [-73.9857, 40.7484], end: [-73.9787, 40.7525], // ≈ 720 m
  },
  {
    id: 'cc-nyc-s-2', name: 'Manhattan S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [-73.9857, 40.7484], end: [-73.9940, 40.7430], // ≈ 850 m
  },
  {
    id: 'cc-nyc-m-1', name: 'Manhattan M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [-73.9857, 40.7484], end: [-73.9617, 40.7610], // ≈ 2.4 km
  },
  {
    id: 'cc-nyc-m-2', name: 'Manhattan M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [-73.9857, 40.7484], end: [-74.0100, 40.7300], // ≈ 2.8 km
  },
  {
    id: 'cc-nyc-l-1', name: 'Manhattan L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [-73.9857, 40.7484], end: [-73.9218, 40.7820], // ≈ 6.5 km
  },
  {
    id: 'cc-nyc-l-2', name: 'Manhattan L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [-73.9857, 40.7484], end: [-74.0100, 40.6900], // ≈ 6.7 km
  },
  {
    id: 'cc-nyc-xl-1', name: 'Manhattan XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [-73.9857, 40.7484], end: [-73.8800, 40.8400], // ≈ 14.3 km
  },

  // ── CITY CONSOLIDATED — Paris 11th arrondissement / Bastille ─────────────
  // Anchor: Bastille [2.3690, 48.8533]
  {
    id: 'cu-par-xs-1', name: 'Paris 11e XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [2.3690, 48.8533], end: [2.3704, 48.8539],     // ≈ 110 m
  },
  {
    id: 'cu-par-s-1', name: 'Paris 11e S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [2.3690, 48.8533], end: [2.3763, 48.8571],     // ≈ 670 m
  },
  {
    id: 'cu-par-s-2', name: 'Paris 11e S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [2.3690, 48.8533], end: [2.3607, 48.8489],     // ≈ 660 m
  },
  {
    id: 'cu-par-m-1', name: 'Paris 11e M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [2.3690, 48.8533], end: [2.3920, 48.8660],     // ≈ 2.5 km
  },
  {
    id: 'cu-par-m-2', name: 'Paris 11e M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [2.3690, 48.8533], end: [2.3450, 48.8400],     // ≈ 2.4 km
  },
  {
    id: 'cu-par-l-1', name: 'Paris 11e L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [2.3690, 48.8533], end: [2.4450, 48.8850],     // ≈ 8.0 km
  },
  {
    id: 'cu-par-l-2', name: 'Paris 11e L-2',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [2.3690, 48.8533], end: [2.2930, 48.8200],     // ≈ 7.4 km
  },
  {
    id: 'cu-par-xl-1', name: 'Paris 11e XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [2.3690, 48.8533], end: [2.5500, 48.9400],     // ≈ 20 km
  },

  // ── CITY CONSOLIDATED — Brooklyn, NYC ────────────────────────────────────
  // Anchor: Park Slope [-73.9808, 40.6701]
  {
    id: 'cu-bkl-xs-1', name: 'Brooklyn XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [-73.9808, 40.6701], end: [-73.9794, 40.6707], // ≈ 115 m
  },
  {
    id: 'cu-bkl-s-1', name: 'Brooklyn S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-73.9808, 40.6701], end: [-73.9735, 40.6739], // ≈ 710 m
  },
  {
    id: 'cu-bkl-m-1', name: 'Brooklyn M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-73.9808, 40.6701], end: [-73.9560, 40.6833], // ≈ 2.5 km
  },
  {
    id: 'cu-bkl-l-1', name: 'Brooklyn L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [-73.9808, 40.6701], end: [-73.9100, 40.7080], // ≈ 7.5 km
  },
  {
    id: 'cu-bkl-xl-1', name: 'Brooklyn XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [-73.9808, 40.6701], end: [-73.7600, 40.7900], // ≈ 22 km
  },

  // ── SUBURBAN — Versailles, Île-de-France ─────────────────────────────────
  // Anchor: Versailles Palace area [2.1304, 48.8014]
  {
    id: 'sub-ver-xs-1', name: 'Versailles XS-1',
    category: 'suburban', lengthCategory: 'extra-short',
    start: [2.1304, 48.8014], end: [2.1318, 48.8020],     // ≈ 110 m
  },
  {
    id: 'sub-ver-s-1', name: 'Versailles S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [2.1304, 48.8014], end: [2.1375, 48.8051],     // ≈ 630 m
  },
  {
    id: 'sub-ver-s-2', name: 'Versailles S-2',
    category: 'suburban', lengthCategory: 'short',
    start: [2.1304, 48.8014], end: [2.1233, 48.7977],     // ≈ 620 m
  },
  {
    id: 'sub-ver-m-1', name: 'Versailles M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [2.1304, 48.8014], end: [2.1540, 48.8140],     // ≈ 2.3 km
  },
  {
    id: 'sub-ver-m-2', name: 'Versailles M-2',
    category: 'suburban', lengthCategory: 'medium',
    start: [2.1304, 48.8014], end: [2.1067, 48.7887],     // ≈ 2.3 km
  },
  {
    id: 'sub-ver-l-1', name: 'Versailles L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [2.1304, 48.8014], end: [2.2060, 48.8400],     // ≈ 7.5 km
  },
  {
    id: 'sub-ver-l-2', name: 'Versailles L-2',
    category: 'suburban', lengthCategory: 'long',
    start: [2.1304, 48.8014], end: [2.0548, 48.7628],     // ≈ 7.5 km
  },
  {
    id: 'sub-ver-xl-1', name: 'Versailles XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [2.1304, 48.8014], end: [2.3800, 48.9200],     // ≈ 23 km
  },

  // ── SUBURBAN — Long Island, NY ────────────────────────────────────────────
  // Anchor: Garden City [-73.7303, 40.7262]
  {
    id: 'sub-li-xs-1', name: 'Long Island XS-1',
    category: 'suburban', lengthCategory: 'extra-short',
    start: [-73.7303, 40.7262], end: [-73.7289, 40.7268], // ≈ 115 m
  },
  {
    id: 'sub-li-s-1', name: 'Long Island S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [-73.7303, 40.7262], end: [-73.7233, 40.7300], // ≈ 680 m
  },
  {
    id: 'sub-li-m-1', name: 'Long Island M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-73.7303, 40.7262], end: [-73.7003, 40.7420], // ≈ 3.0 km
  },
  {
    id: 'sub-li-l-1', name: 'Long Island L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [-73.7303, 40.7262], end: [-73.6403, 40.7720], // ≈ 8.8 km
  },
  {
    id: 'sub-li-xl-1', name: 'Long Island XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [-73.7303, 40.7262], end: [-73.4800, 40.8600], // ≈ 24 km
  },

  // ── COUNTRYSIDE — Beauce / Chartres area, France ─────────────────────────
  // Anchor: Chartres outskirts [1.4878, 48.4469]
  {
    id: 'ctr-cht-xs-1', name: 'Chartres XS-1',
    category: 'countryside', lengthCategory: 'extra-short',
    start: [1.4878, 48.4469], end: [1.4892, 48.4475],     // ≈ 110 m
  },
  {
    id: 'ctr-cht-s-1', name: 'Chartres S-1',
    category: 'countryside', lengthCategory: 'short',
    start: [1.4878, 48.4469], end: [1.4950, 48.4507],     // ≈ 650 m
  },
  {
    id: 'ctr-cht-s-2', name: 'Chartres S-2',
    category: 'countryside', lengthCategory: 'short',
    start: [1.4878, 48.4469], end: [1.4806, 48.4431],     // ≈ 650 m
  },
  {
    id: 'ctr-cht-m-1', name: 'Chartres M-1',
    category: 'countryside', lengthCategory: 'medium',
    start: [1.4878, 48.4469], end: [1.5120, 48.4600],     // ≈ 2.3 km
  },
  {
    id: 'ctr-cht-m-2', name: 'Chartres M-2',
    category: 'countryside', lengthCategory: 'medium',
    start: [1.4878, 48.4469], end: [1.4636, 48.4338],     // ≈ 2.3 km
  },
  {
    id: 'ctr-cht-l-1', name: 'Chartres L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [1.4878, 48.4469], end: [1.5760, 48.4960],     // ≈ 7.0 km
  },
  {
    id: 'ctr-cht-l-2', name: 'Chartres L-2',
    category: 'countryside', lengthCategory: 'long',
    start: [1.4878, 48.4469], end: [1.3996, 48.3978],     // ≈ 7.0 km
  },
  {
    id: 'ctr-cht-xl-1', name: 'Chartres XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [1.4878, 48.4469], end: [1.7200, 48.5800],     // ≈ 22 km
  },

  // ── COUNTRYSIDE — Rural Connecticut, USA ─────────────────────────────────
  // Anchor: Tolland County [-72.3140, 41.7658]
  {
    id: 'ctr-ct-xs-1', name: 'Connecticut XS-1',
    category: 'countryside', lengthCategory: 'extra-short',
    start: [-72.3140, 41.7658], end: [-72.3126, 41.7664], // ≈ 110 m
  },
  {
    id: 'ctr-ct-s-1', name: 'Connecticut S-1',
    category: 'countryside', lengthCategory: 'short',
    start: [-72.3140, 41.7658], end: [-72.3070, 41.7696], // ≈ 650 m
  },
  {
    id: 'ctr-ct-m-1', name: 'Connecticut M-1',
    category: 'countryside', lengthCategory: 'medium',
    start: [-72.3140, 41.7658], end: [-72.2840, 41.7820], // ≈ 2.7 km
  },
  {
    id: 'ctr-ct-l-1', name: 'Connecticut L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [-72.3140, 41.7658], end: [-72.2300, 41.8200], // ≈ 7.6 km
  },
  {
    id: 'ctr-ct-xl-1', name: 'Connecticut XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [-72.3140, 41.7658], end: [-72.0800, 41.9000], // ≈ 22 km
  },

  // ── RADIUS VARIANTS — same geographic pair, different forceRadius ─────────
  // These rows let the regression explore the (E, beeline) space orthogonally:
  // two routes with the same beeline but different E (more/fewer loaded tiles).
  {
    id: 'cc-par-m-1-r2', name: 'Paris Centre M-1 r=2',
    category: 'city-center', lengthCategory: 'medium',
    start: [2.3500, 48.8520], end: [2.3720, 48.8630],     // ≈ 2.3 km
    forceRadius: 2,
  },
  {
    id: 'cu-par-m-1-r2', name: 'Paris 11e M-1 r=2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [2.3690, 48.8533], end: [2.3920, 48.8660],     // ≈ 2.5 km
    forceRadius: 2,
  },
  {
    id: 'sub-ver-m-1-r2', name: 'Versailles M-1 r=2',
    category: 'suburban', lengthCategory: 'medium',
    start: [2.1304, 48.8014], end: [2.1540, 48.8140],     // ≈ 2.3 km
    forceRadius: 2,
  },
  {
    id: 'ctr-cht-m-1-r2', name: 'Chartres M-1 r=2',
    category: 'countryside', lengthCategory: 'medium',
    start: [1.4878, 48.4469], end: [1.5120, 48.4600],     // ≈ 2.3 km
    forceRadius: 2,
  },
  {
    id: 'cc-par-s-1-r2', name: 'Paris Centre S-1 r=2',
    category: 'city-center', lengthCategory: 'short',
    start: [2.3500, 48.8520], end: [2.3568, 48.8556],     // ≈ 640 m
    forceRadius: 2,
  },
  {
    id: 'sub-ver-l-1-r2', name: 'Versailles L-1 r=2',
    category: 'suburban', lengthCategory: 'long',
    start: [2.1304, 48.8014], end: [2.2060, 48.8400],     // ≈ 7.5 km
    forceRadius: 2,
  },
];

export const CATEGORIES = ['city-center', 'city-consolidated', 'suburban', 'countryside'];
export const LENGTH_CATEGORIES = ['extra-short', 'short', 'medium', 'long', 'extra-long'];

/** Current production thresholds (keep in sync with src/chRouter.js) */
export const GPU_MIN_EDGES     = 80_000;
export const GPU_MIN_BEELINE_M = 3_000;
