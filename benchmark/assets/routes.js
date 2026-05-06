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
 *   extra-short   100 – 300 m
 *   short        300 m – 1.5 km
 *   medium       1.5 – 6 km
 *   long         6 – 20 km
 *   extra-long   20 – 60 km
 *   xxl          60+ km
 *
 * `forceRadius` (optional): override the auto-computed tile-fetch radius.
 * Use the same geographic route pair with forceRadius: 1 and forceRadius: 2
 * to sample the same (beeline, category) point at two different E levels.
 */

const HARDCODED_ROUTES = [
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
    start: [-73.9808, 40.6701], end: [-73.7303, 40.7262], // ≈ 22 km (moved to LI anchor road node)
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
  // ── XXL — very long routes (30–80 km beeline) ────────────────────────────
  // These force the largest tile fetches and highest E values (auto radius = 3).
  {
    id: 'cc-par-xxl-1', name: 'Paris → Mantes-la-Jolie',
    category: 'city-center', lengthCategory: 'xxl',
    start: [2.3500, 48.8520], end: [1.7200, 48.9900], // ≈ 51 km
  },
  {
    id: 'cc-par-xxl-2', name: 'Paris → Meaux',
    category: 'city-center', lengthCategory: 'xxl',
    start: [2.3500, 48.8520], end: [2.8884, 48.9605], // ≈ 47 km
  },
  {
    id: 'cc-nyc-xxl-1', name: 'Manhattan → Princeton NJ',
    category: 'city-center', lengthCategory: 'xxl',
    start: [-73.9857, 40.7484], end: [-74.6593, 40.3574], // ≈ 72 km
  },
  {
    id: 'cu-par-xxl-1', name: 'Paris 11e → Chartres',
    category: 'city-consolidated', lengthCategory: 'xxl',
    start: [2.3690, 48.8533], end: [1.4878, 48.4469], // ≈ 80 km
  },
  {
    id: 'sub-ver-xxl-1', name: 'Versailles → Orléans',
    category: 'suburban', lengthCategory: 'xxl',
    start: [2.1304, 48.8014], end: [1.9040, 47.9030], // ≈ 102 km
  },
  {
    id: 'sub-li-xxl-1', name: 'Long Island → New Haven CT',
    category: 'suburban', lengthCategory: 'xxl',
    start: [-73.7949, 40.7282], end: [-72.9248, 41.3082], // ≈ 90 km
  },

  // ── forceRadius:3 — stress-test dense graphs (very large E) ──────────────
  // Same beeline as medium routes but 7×7 tile window → E in hundreds of thousands.
  {
    id: 'cc-par-m-1-r3', name: 'Paris Centre M-1 r=3',
    category: 'city-center', lengthCategory: 'medium',
    start: [2.3500, 48.8520], end: [2.3720, 48.8630],    // ≈ 2.3 km
    forceRadius: 3,
  },
  {
    id: 'cc-nyc-m-1-r3', name: 'Manhattan M-1 r=3',
    category: 'city-center', lengthCategory: 'medium',
    start: [-73.9857, 40.7484], end: [-73.9602, 40.7614], // ≈ 2.5 km
    forceRadius: 3,
  },
  {
    id: 'cu-par-m-1-r3', name: 'Paris 11e M-1 r=3',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [2.3690, 48.8533], end: [2.3920, 48.8660],    // ≈ 2.5 km
    forceRadius: 3,
  },
  {
    id: 'cc-par-l-1-r3', name: 'Paris Centre L-1 r=3',
    category: 'city-center', lengthCategory: 'long',
    start: [2.3500, 48.8520], end: [2.4300, 48.8800],    // ≈ 7 km
    forceRadius: 3,
  },
  {
    id: 'cc-nyc-l-1-r3', name: 'Manhattan L-1 r=3',
    category: 'city-center', lengthCategory: 'long',
    start: [-73.9857, 40.7484], end: [-73.9350, 40.8100], // ≈ 7 km
    forceRadius: 3,
  },

  // ── MADRID — City center historic core (Puerta del Sol / Plaza Mayor) ─────
  // Anchor: Puerta del Sol [-3.7038, 40.4168]
  {
    id: 'cc-mad-xs-1', name: 'Madrid Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-3.7038, 40.4168], end: [-3.7015, 40.4180],   // ≈ 180 m
  },
  {
    id: 'cc-mad-xs-2', name: 'Madrid Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-3.7146, 40.4156], end: [-3.7125, 40.4172],   // ≈ 200 m
  },
  {
    id: 'cc-mad-s-1', name: 'Madrid Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [-3.7038, 40.4168], end: [-3.7095, 40.4050],   // ≈ 1.3 km
  },
  {
    id: 'cc-mad-s-2', name: 'Madrid Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [-3.7146, 40.4156], end: [-3.6956, 40.4084],   // ≈ 1.4 km
  },
  {
    id: 'cc-mad-m-1', name: 'Madrid Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [-3.7038, 40.4168], end: [-3.6815, 40.4158],   // ≈ 2.0 km
  },
  {
    id: 'cc-mad-m-2', name: 'Madrid Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [-3.7146, 40.4156], end: [-3.6688, 40.4087],   // ≈ 3.7 km
  },
  {
    id: 'cc-mad-l-1', name: 'Madrid Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [-3.7038, 40.4168], end: [-3.5850, 40.4428],   // ≈ 8.5 km
  },
  {
    id: 'cc-mad-l-2', name: 'Madrid Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [-3.7146, 40.4156], end: [-3.5686, 40.3844],   // ≈ 10.0 km
  },
  {
    id: 'cc-mad-xl-1', name: 'Madrid Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [-3.7038, 40.4168], end: [-3.5200, 40.3500],   // ≈ 18.0 km
  },

  // ── MADRID CONSOLIDATED — Inner suburbs (Retiro, Atocha, Moncloa) ────────
  // Anchor: Retiro Park [-3.6815, 40.4158]
  {
    id: 'cu-mad-xs-1', name: 'Madrid Inner S XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [-3.6815, 40.4158], end: [-3.6800, 40.4170],   // ≈ 140 m
  },
  {
    id: 'cu-mad-s-1', name: 'Madrid Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-3.6815, 40.4158], end: [-3.6956, 40.4084],   // ≈ 1.2 km
  },
  {
    id: 'cu-mad-s-2', name: 'Madrid Inner S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-3.6815, 40.4158], end: [-3.7060, 40.4320],   // ≈ 2.0 km (includes part of city-center)
  },
  {
    id: 'cu-mad-m-1', name: 'Madrid Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-3.6815, 40.4158], end: [-3.6440, 40.4050],   // ≈ 3.2 km
  },
  {
    id: 'cu-mad-m-2', name: 'Madrid Inner M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-3.6815, 40.4158], end: [-3.7300, 40.4450],   // ≈ 4.5 km
  },
  {
    id: 'cu-mad-l-1', name: 'Madrid Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [-3.6815, 40.4158], end: [-3.5800, 40.3600],   // ≈ 12.0 km
  },
  {
    id: 'cu-mad-xl-1', name: 'Madrid Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [-3.6815, 40.4158], end: [-3.4600, 40.3000],   // ≈ 22.0 km
  },

  // ── MADRID SUBURBAN — Outer areas (Alcalá, Aranjuez) ─────────────────────
  // Anchor: Alcalá de Henares [-3.3694, 40.4844]
  {
    id: 'sub-mad-s-1', name: 'Madrid→Alcalá S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [-3.7038, 40.4168], end: [-3.6450, 40.4550],   // ≈ 5.5 km
  },
  {
    id: 'sub-mad-m-1', name: 'Madrid→Alcalá M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-3.7038, 40.4168], end: [-3.5000, 40.4500],   // ≈ 15.0 km
  },
  {
    id: 'sub-mad-l-1', name: 'Madrid→Alcalá L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [-3.7038, 40.4168], end: [-3.3694, 40.4844],   // ≈ 31.0 km
  },
  {
    id: 'sub-mad-l-2', name: 'Madrid→Aranjuez L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [-3.7038, 40.4168], end: [-3.6094, 40.0328],   // ≈ 37.0 km
  },
  {
    id: 'sub-mad-xl-1', name: 'Madrid→El Escorial XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [-3.7038, 40.4168], end: [-4.1431, 40.5435],   // ≈ 42.0 km
  },
  {
    id: 'sub-mad-xxl-1', name: 'Madrid→Toledo XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [-3.7038, 40.4168], end: [-4.0276, 39.8628],   // ≈ 67.0 km
  },

  // ── MADRID COUNTRYSIDE — Very sparse rural areas ────────────────────────
  // Anchor: El Escorial area [-4.1431, 40.5435]
  {
    id: 'cnt-mad-l-1', name: 'El Escorial→Rural L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [-4.1431, 40.5435], end: [-4.2950, 40.5120],   // ≈ 13.3 km (moved near Valdemaqueda roads)
  },
  {
    id: 'cnt-mad-xl-1', name: 'Toledo→Rural XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [-4.0276, 39.8628], end: [-4.4000, 39.6000],   // ≈ 45.0 km
  },

  // ── JAPAN CITY CENTER — Tokyo core (Shibuya, Ginza, Tokyo Station) ──────
  // Anchor: Shibuya Crossing [139.7006, 35.6595]
  {
    id: 'cc-tok-xs-1', name: 'Tokyo Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [139.7006, 35.6595], end: [139.7024, 35.6610], // ≈ 220 m
  },
  {
    id: 'cc-tok-xs-2', name: 'Tokyo Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [139.7648, 35.6717], end: [139.7670, 35.6728], // ≈ 230 m
  },
  {
    id: 'cc-tok-s-1', name: 'Tokyo Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [139.7006, 35.6595], end: [139.7023, 35.6702], // ≈ 1.2 km
  },
  {
    id: 'cc-tok-s-2', name: 'Tokyo Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [139.7671, 35.6812], end: [139.7742, 35.6837], // ≈ 700 m
  },
  {
    id: 'cc-tok-m-1', name: 'Tokyo Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [139.7006, 35.6595], end: [139.7314, 35.6628], // ≈ 2.8 km
  },
  {
    id: 'cc-tok-m-2', name: 'Tokyo Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [139.7671, 35.6812], end: [139.7774, 35.7138], // ≈ 3.7 km
  },
  {
    id: 'cc-tok-l-1', name: 'Tokyo Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [139.7036, 35.6895], end: [139.7950, 35.6550], // ≈ 9.0 km
  },
  {
    id: 'cc-tok-l-2', name: 'Tokyo Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [139.7100, 35.7295], end: [139.7768, 35.6272], // ≈ 12.8 km
  },
  {
    id: 'cc-tok-xl-1', name: 'Tokyo Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [139.7671, 35.6812], end: [139.5160, 35.6830], // ≈ 22.8 km
  },

  // ── JAPAN CONSOLIDATED — Osaka/Kyoto inner urban fabric ─────────────────
  // Anchor: Osaka Umeda [135.4973, 34.7025]
  {
    id: 'cu-kans-xs-1', name: 'Osaka Inner XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [135.4973, 34.7025], end: [135.4994, 34.7019], // ≈ 200 m
  },
  {
    id: 'cu-kans-s-1', name: 'Osaka Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [135.4973, 34.7025], end: [135.4895, 34.6913], // ≈ 1.4 km
  },
  {
    id: 'cu-kans-s-2', name: 'Kyoto Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [135.7751, 35.0037], end: [135.7708, 35.0100], // ≈ 800 m
  },
  {
    id: 'cu-kans-m-1', name: 'Osaka Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [135.5013, 34.6673], end: [135.5197, 34.6466], // ≈ 2.8 km
  },
  {
    id: 'cu-kans-m-2', name: 'Kyoto Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [135.7588, 34.9855], end: [135.7727, 34.9671], // ≈ 2.4 km
  },
  {
    id: 'cu-kans-l-1', name: 'Osaka Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [135.5259, 34.6873], end: [135.4831, 34.5733], // ≈ 13.0 km
  },
  {
    id: 'cu-kans-xl-1', name: 'Kyoto Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [135.7681, 35.0116], end: [135.6173, 34.8486], // ≈ 23.0 km
  },

  // ── JAPAN SUBURBAN — Greater Tokyo / Kansai commuter belts ──────────────
  {
    id: 'sub-jpn-s-1', name: 'Yokohama S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [139.6380, 35.4437], end: [139.6495, 35.4478], // ≈ 1.1 km
  },
  {
    id: 'sub-jpn-m-1', name: 'Yokohama M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [139.6380, 35.4437], end: [139.6650, 35.4700], // ≈ 3.8 km
  },
  {
    id: 'sub-jpn-m-2', name: 'Kobe M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [135.1955, 34.6901], end: [135.2270, 34.6760], // ≈ 3.3 km
  },
  {
    id: 'sub-jpn-l-1', name: 'Tokyo→Kawasaki L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [139.7671, 35.6812], end: [139.7031, 35.5308], // ≈ 17.5 km
  },
  {
    id: 'sub-jpn-xl-1', name: 'Tokyo→Yokohama XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [139.7671, 35.6812], end: [139.6380, 35.4437], // ≈ 28.0 km
  },
  {
    id: 'sub-jpn-xxl-1', name: 'Tokyo→Chiba XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [139.7671, 35.6812], end: [140.1233, 35.6073], // ≈ 33.0 km
  },

  // ── JAPAN COUNTRYSIDE — Smaller towns and mountain/coastal corridors ─────
  {
    id: 'cnt-jpn-l-1', name: 'Matsumoto→Azumino L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [137.9689, 36.2309], end: [137.8870, 36.3390], // ≈ 14.0 km
  },
  {
    id: 'cnt-jpn-l-2', name: 'Awa-Ikeda→Oboke L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [133.8076, 34.0265], end: [133.7616, 33.9215], // ≈ 12.0 km
  },
  {
    id: 'cnt-jpn-xl-1', name: 'Biei→Furano XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [142.4667, 43.5889], end: [142.3833, 43.3417], // ≈ 28.0 km
  },
  {
    id: 'cnt-jpn-xl-2', name: 'Hirosaki→Ajigasawa XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [140.4859, 40.5968], end: [140.2202, 40.7778], // ≈ 29.0 km
  },
  {
    id: 'cnt-jpn-xxl-1', name: 'Obihiro→Shintoku XXL-1',
    category: 'countryside', lengthCategory: 'xxl',
    start: [143.2040, 42.9170], end: [142.8357, 43.0783], // ≈ 36.0 km
  },

  // ── SAO PAULO CITY CENTER — Se, Republica, Paulista, Faria Lima ─────────
  // Anchor: Praca da Se [-46.6333, -23.5505]
  {
    id: 'cc-sao-xs-1', name: 'Sao Paulo Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-46.6333, -23.5505], end: [-46.6315, -23.5493], // ≈ 230 m
  },
  {
    id: 'cc-sao-xs-2', name: 'Sao Paulo Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-46.6559, -23.5614], end: [-46.6538, -23.5607], // ≈ 220 m
  },
  {
    id: 'cc-sao-s-1', name: 'Sao Paulo Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [-46.6333, -23.5505], end: [-46.6409, -23.5485], // ≈ 820 m
  },
  {
    id: 'cc-sao-s-2', name: 'Sao Paulo Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [-46.6559, -23.5614], end: [-46.6472, -23.5578], // ≈ 1.0 km
  },
  {
    id: 'cc-sao-m-1', name: 'Sao Paulo Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [-46.6333, -23.5505], end: [-46.6202, -23.5565], // ≈ 1.6 km
  },
  {
    id: 'cc-sao-m-2', name: 'Sao Paulo Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [-46.6559, -23.5614], end: [-46.6336, -23.5672], // ≈ 2.4 km
  },
  {
    id: 'cc-sao-l-1', name: 'Sao Paulo Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [-46.6333, -23.5505], end: [-46.5850, -23.5630], // ≈ 5.3 km
  },
  {
    id: 'cc-sao-l-2', name: 'Sao Paulo Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [-46.6559, -23.5614], end: [-46.6050, -23.5730], // ≈ 5.8 km
  },
  {
    id: 'cc-sao-xl-1', name: 'Sao Paulo Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [-46.6333, -23.5505], end: [-46.4667, -23.5680], // ≈ 17.0 km
  },

  // ── SAO PAULO CONSOLIDATED — Vila Mariana, Santana, Pinheiros ───────────
  {
    id: 'cu-sao-xs-1', name: 'Sao Paulo Inner XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [-46.6388, -23.5880], end: [-46.6370, -23.5872], // ≈ 210 m
  },
  {
    id: 'cu-sao-s-1', name: 'Sao Paulo Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-46.6388, -23.5880], end: [-46.6320, -23.5805], // ≈ 1.1 km
  },
  {
    id: 'cu-sao-s-2', name: 'Sao Paulo Inner S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-46.6990, -23.5670], end: [-46.6912, -23.5590], // ≈ 1.2 km
  },
  {
    id: 'cu-sao-m-1', name: 'Sao Paulo Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-46.6388, -23.5880], end: [-46.6200, -23.5995], // ≈ 2.3 km
  },
  {
    id: 'cu-sao-m-2', name: 'Sao Paulo Inner M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-46.6990, -23.5670], end: [-46.6755, -23.5545], // ≈ 2.8 km
  },
  {
    id: 'cu-sao-l-1', name: 'Sao Paulo Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [-46.6388, -23.5880], end: [-46.6260, -23.5425], // ≈ 5.2 km
  },
  {
    id: 'cu-sao-xl-1', name: 'Sao Paulo Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [-46.6990, -23.5670], end: [-46.5730, -23.6200], // ≈ 15.0 km
  },

  // ── SAO PAULO SUBURBAN — Guarulhos, Osasco, Santo Andre, Barueri ───────
  {
    id: 'sub-sao-s-1', name: 'Sao Paulo→Osasco S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [-46.6333, -23.5505], end: [-46.6900, -23.5360], // ≈ 6.0 km
  },
  {
    id: 'sub-sao-m-1', name: 'Sao Paulo→Guarulhos M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-46.6333, -23.5505], end: [-46.5317, -23.4628], // ≈ 14.0 km
  },
  {
    id: 'sub-sao-m-2', name: 'Sao Paulo→Santo Andre M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-46.6333, -23.5505], end: [-46.5333, -23.6639], // ≈ 16.0 km
  },
  {
    id: 'sub-sao-l-1', name: 'Sao Paulo→Barueri L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [-46.6333, -23.5505], end: [-46.8778, -23.5057], // ≈ 25.0 km
  },
  {
    id: 'sub-sao-xl-1', name: 'Sao Paulo→Mogi das Cruzes XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [-46.6333, -23.5505], end: [-46.1861, -23.5228], // ≈ 46.0 km
  },
  {
    id: 'sub-sao-xxl-1', name: 'Sao Paulo→Jundiai XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [-46.6333, -23.5505], end: [-46.8842, -23.1857], // ≈ 49.0 km
  },

  // ── SAO PAULO COUNTRYSIDE — Atibaia, Ibiuna, countryside corridors ──────
  {
    id: 'cnt-sao-l-1', name: 'Atibaia→Rural L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [-46.5503, -23.1171], end: [-46.6670, -23.0670], // ≈ 13.0 km
  },
  {
    id: 'cnt-sao-xl-1', name: 'Ibiuna→Rural XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [-47.2225, -23.6564], end: [-47.4460, -23.7610], // ≈ 27.0 km
  },
  {
    id: 'cnt-sao-xxl-1', name: 'Jundiai→Atibaia XXL-1',
    category: 'countryside', lengthCategory: 'xxl',
    start: [-46.8842, -23.1857], end: [-46.5503, -23.1171], // ≈ 35.0 km
  },

  // ── SAN FRANCISCO CITY CENTER — Financial District, SoMa, Embarcadero ──
  // Anchor: Union Square [-122.4075, 37.7879]
  {
    id: 'cc-sfo-xs-1', name: 'San Francisco Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-122.4075, 37.7879], end: [-122.4054, 37.7888], // ≈ 220 m
  },
  {
    id: 'cc-sfo-xs-2', name: 'San Francisco Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-122.3969, 37.7936], end: [-122.3950, 37.7945], // ≈ 210 m
  },
  {
    id: 'cc-sfo-s-1', name: 'San Francisco Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [-122.4075, 37.7879], end: [-122.4145, 37.7818], // ≈ 950 m
  },
  {
    id: 'cc-sfo-s-2', name: 'San Francisco Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [-122.3969, 37.7936], end: [-122.3897, 37.7864], // ≈ 1.0 km
  },
  {
    id: 'cc-sfo-m-1', name: 'San Francisco Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [-122.4075, 37.7879], end: [-122.4312, 37.7739], // ≈ 2.6 km
  },
  {
    id: 'cc-sfo-m-2', name: 'San Francisco Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [-122.3969, 37.7936], end: [-122.4183, 37.8078], // ≈ 2.5 km
  },
  {
    id: 'cc-sfo-l-1', name: 'San Francisco Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [-122.4075, 37.7879], end: [-122.4580, 37.7694], // ≈ 4.9 km
  },
  {
    id: 'cc-sfo-l-2', name: 'San Francisco Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [-122.3969, 37.7936], end: [-122.5107, 37.7793], // ≈ 10.1 km
  },
  {
    id: 'cc-sfo-xl-1', name: 'San Francisco Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [-122.4075, 37.7879], end: [-122.3550, 37.7081], // ≈ 10.2 km
  },

  // ── SAN FRANCISCO CONSOLIDATED — Mission, Sunset, Richmond, Potrero ─────
  {
    id: 'cu-sfo-xs-1', name: 'San Francisco Inner XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [-122.4194, 37.7599], end: [-122.4175, 37.7608], // ≈ 210 m
  },
  {
    id: 'cu-sfo-s-1', name: 'San Francisco Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-122.4194, 37.7599], end: [-122.4308, 37.7624], // ≈ 1.0 km
  },
  {
    id: 'cu-sfo-s-2', name: 'San Francisco Inner S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-122.4862, 37.7694], end: [-122.4770, 37.7648], // ≈ 980 m
  },
  {
    id: 'cu-sfo-m-1', name: 'San Francisco Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-122.4194, 37.7599], end: [-122.4477, 37.7689], // ≈ 2.7 km
  },
  {
    id: 'cu-sfo-m-2', name: 'San Francisco Inner M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-122.4490, 37.7749], end: [-122.3933, 37.7550], // ≈ 5.4 km
  },
  {
    id: 'cu-sfo-l-1', name: 'San Francisco Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [-122.4194, 37.7599], end: [-122.5050, 37.7395], // ≈ 7.9 km
  },
  {
    id: 'cu-sfo-xl-1', name: 'San Francisco Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [-122.4862, 37.7694], end: [-122.3569, 37.7301], // ≈ 12.4 km
  },

  // ── SAN FRANCISCO SUBURBAN — Daly City, Oakland, Berkeley, San Mateo ────
  {
    id: 'sub-sfo-s-1', name: 'San Francisco→Daly City S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [-122.4075, 37.7879], end: [-122.4702, 37.6879], // ≈ 12.2 km
  },
  {
    id: 'sub-sfo-m-1', name: 'San Francisco→Oakland M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-122.4075, 37.7879], end: [-122.2712, 37.8044], // ≈ 12.1 km
  },
  {
    id: 'sub-sfo-m-2', name: 'San Francisco→Berkeley M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-122.4075, 37.7879], end: [-122.2730, 37.8715], // ≈ 15.5 km
  },
  {
    id: 'sub-sfo-l-1', name: 'San Francisco→San Mateo L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [-122.4075, 37.7879], end: [-122.3255, 37.5629], // ≈ 26.0 km
  },
  {
    id: 'sub-sfo-xl-1', name: 'San Francisco→San Jose XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [-122.4075, 37.7879], end: [-121.8863, 37.3382], // ≈ 69.0 km
  },
  {
    id: 'sub-sfo-xxl-1', name: 'San Francisco→Santa Rosa XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [-122.4075, 37.7879], end: [-122.7141, 38.4404], // ≈ 77.0 km
  },

  // ── SAN FRANCISCO COUNTRYSIDE — Half Moon Bay, Napa, Sonoma corridors ───
  {
    id: 'cnt-sfo-l-1', name: 'Half Moon Bay→Rural L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [-122.4286, 37.4636], end: [-122.3560, 37.4210], // ≈ 7.7 km
  },
  {
    id: 'cnt-sfo-xl-1', name: 'Napa→Rural XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [-122.2869, 38.2975], end: [-122.4430, 38.3650], // ≈ 16.0 km
  },
  {
    id: 'cnt-sfo-xxl-1', name: 'Sonoma→Napa XXL-1',
    category: 'countryside', lengthCategory: 'xxl',
    start: [-122.4580, 38.2919], end: [-122.2869, 38.2975], // ≈ 15.0 km
  },

  // ── LONDON CITY CENTER — Westminster, Soho, City, South Bank ────────────
  // Anchor: Charing Cross [-0.1278, 51.5074]
  {
    id: 'cc-lon-xs-1', name: 'London Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-0.1278, 51.5074], end: [-0.1260, 51.5083], // ≈ 180 m
  },
  {
    id: 'cc-lon-xs-2', name: 'London Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [-0.1005, 51.5142], end: [-0.0986, 51.5150], // ≈ 170 m
  },
  {
    id: 'cc-lon-s-1', name: 'London Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [-0.1278, 51.5074], end: [-0.1168, 51.5033], // ≈ 900 m
  },
  {
    id: 'cc-lon-s-2', name: 'London Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [-0.1005, 51.5142], end: [-0.0890, 51.5090], // ≈ 1.0 km
  },
  {
    id: 'cc-lon-m-1', name: 'London Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [-0.1278, 51.5074], end: [-0.1419, 51.5154], // ≈ 1.5 km
  },
  {
    id: 'cc-lon-m-2', name: 'London Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [-0.1005, 51.5142], end: [-0.0761, 51.5081], // ≈ 1.8 km
  },
  {
    id: 'cc-lon-l-1', name: 'London Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [-0.1278, 51.5074], end: [-0.1764, 51.5007], // ≈ 3.5 km
  },
  {
    id: 'cc-lon-l-2', name: 'London Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [-0.1005, 51.5142], end: [-0.0387, 51.5045], // ≈ 4.4 km
  },
  {
    id: 'cc-lon-xl-1', name: 'London Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [-0.1278, 51.5074], end: [-0.3300, 51.5080], // ≈ 14.0 km
  },

  // ── LONDON CONSOLIDATED — Camden, Islington, Hackney, Greenwich ─────────
  {
    id: 'cu-lon-xs-1', name: 'London Inner XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [-0.1425, 51.5363], end: [-0.1407, 51.5372], // ≈ 180 m
  },
  {
    id: 'cu-lon-s-1', name: 'London Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-0.1425, 51.5363], end: [-0.1313, 51.5340], // ≈ 820 m
  },
  {
    id: 'cu-lon-s-2', name: 'London Inner S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [-0.0550, 51.5465], end: [-0.0428, 51.5488], // ≈ 900 m
  },
  {
    id: 'cu-lon-m-1', name: 'London Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-0.1425, 51.5363], end: [-0.1020, 51.5290], // ≈ 3.0 km
  },
  {
    id: 'cu-lon-m-2', name: 'London Inner M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [-0.0550, 51.5465], end: [0.0005, 51.4826], // ≈ 8.0 km
  },
  {
    id: 'cu-lon-l-1', name: 'London Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [-0.1425, 51.5363], end: [-0.0117, 51.4769], // ≈ 11.0 km
  },
  {
    id: 'cu-lon-xl-1', name: 'London Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [-0.0550, 51.5465], end: [0.0850, 51.5630], // ≈ 10.0 km
  },

  // ── LONDON SUBURBAN — Croydon, Heathrow, Watford, Romford, St Albans ────
  {
    id: 'sub-lon-s-1', name: 'London→Canary Wharf S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [-0.1278, 51.5074], end: [-0.0196, 51.5054], // ≈ 7.5 km
  },
  {
    id: 'sub-lon-m-1', name: 'London→Croydon M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-0.1278, 51.5074], end: [-0.0982, 51.3762], // ≈ 14.8 km
  },
  {
    id: 'sub-lon-m-2', name: 'London→Heathrow M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [-0.1278, 51.5074], end: [-0.4543, 51.4700], // ≈ 23.0 km
  },
  {
    id: 'sub-lon-l-1', name: 'London→Watford L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [-0.1278, 51.5074], end: [-0.3960, 51.6565], // ≈ 26.0 km
  },
  {
    id: 'sub-lon-xl-1', name: 'London→Romford XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [-0.1278, 51.5074], end: [0.1821, 51.5751], // ≈ 23.0 km
  },
  {
    id: 'sub-lon-xxl-1', name: 'London→St Albans XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [-0.1278, 51.5074], end: [-0.3370, 51.7527], // ≈ 32.0 km
  },

  // ── LONDON COUNTRYSIDE — Surrey, Chilterns, Essex corridors ─────────────
  {
    id: 'cnt-lon-l-1', name: 'Guildford→Rural L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [-0.5704, 51.2362], end: [-0.6620, 51.2170], // ≈ 6.7 km
  },
  {
    id: 'cnt-lon-xl-1', name: 'Marlow→Rural XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [-0.7774, 51.5710], end: [-0.9120, 51.6180], // ≈ 11.0 km
  },
  {
    id: 'cnt-lon-xxl-1', name: 'Chelmsford→Colchester XXL-1',
    category: 'countryside', lengthCategory: 'xxl',
    start: [0.4685, 51.7356], end: [0.9039, 51.8892], // ≈ 35.0 km
  },

  // ── MOSCOW CITY CENTER — Kremlin, Tverskaya, Kitay-Gorod, Arbat ─────────
  // Anchor: Red Square [37.6208, 55.7539]
  {
    id: 'cc-msk-xs-1', name: 'Moscow Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [37.6208, 55.7539], end: [37.6227, 55.7546], // ≈ 150 m
  },
  {
    id: 'cc-msk-xs-2', name: 'Moscow Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [37.6057, 55.7570], end: [37.6077, 55.7578], // ≈ 160 m
  },
  {
    id: 'cc-msk-s-1', name: 'Moscow Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [37.6208, 55.7539], end: [37.6120, 55.7524], // ≈ 600 m
  },
  {
    id: 'cc-msk-s-2', name: 'Moscow Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [37.6057, 55.7570], end: [37.5964, 55.7614], // ≈ 820 m
  },
  {
    id: 'cc-msk-m-1', name: 'Moscow Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [37.6208, 55.7539], end: [37.6325, 55.7460], // ≈ 1.2 km
  },
  {
    id: 'cc-msk-m-2', name: 'Moscow Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [37.6057, 55.7570], end: [37.6400, 55.7600], // ≈ 2.2 km
  },
  {
    id: 'cc-msk-l-1', name: 'Moscow Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [37.6208, 55.7539], end: [37.6700, 55.7420], // ≈ 3.4 km
  },
  {
    id: 'cc-msk-l-2', name: 'Moscow Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [37.6057, 55.7570], end: [37.5600, 55.7300], // ≈ 4.3 km
  },
  {
    id: 'cc-msk-xl-1', name: 'Moscow Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [37.6208, 55.7539], end: [37.4450, 55.7550], // ≈ 11.0 km
  },

  // ── MOSCOW CONSOLIDATED — Sokolniki, Danilovsky, Basmanny, Presnya ──────
  {
    id: 'cu-msk-xs-1', name: 'Moscow Inner XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [37.6660, 55.7890], end: [37.6681, 55.7897], // ≈ 150 m
  },
  {
    id: 'cu-msk-s-1', name: 'Moscow Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [37.6660, 55.7890], end: [37.6552, 55.7840], // ≈ 850 m
  },
  {
    id: 'cu-msk-s-2', name: 'Moscow Inner S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [37.6030, 55.7150], end: [37.6124, 55.7087], // ≈ 900 m
  },
  {
    id: 'cu-msk-m-1', name: 'Moscow Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [37.6660, 55.7890], end: [37.6330, 55.7810], // ≈ 2.2 km
  },
  {
    id: 'cu-msk-m-2', name: 'Moscow Inner M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [37.6030, 55.7150], end: [37.5620, 55.7355], // ≈ 3.4 km
  },
  {
    id: 'cu-msk-l-1', name: 'Moscow Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [37.6660, 55.7890], end: [37.7390, 55.7590], // ≈ 5.8 km
  },
  {
    id: 'cu-msk-xl-1', name: 'Moscow Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [37.6030, 55.7150], end: [37.7600, 55.7800], // ≈ 12.5 km
  },

  // ── MOSCOW SUBURBAN — Khimki, Mytishchi, Lyubertsy, Odintsovo ───────────
  {
    id: 'sub-msk-s-1', name: 'Moscow→Khimki S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [37.6208, 55.7539], end: [37.4450, 55.8970], // ≈ 18.0 km
  },
  {
    id: 'sub-msk-m-1', name: 'Moscow→Mytishchi M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [37.6208, 55.7539], end: [37.7330, 55.9105], // ≈ 19.0 km
  },
  {
    id: 'sub-msk-m-2', name: 'Moscow→Lyubertsy M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [37.6208, 55.7539], end: [37.8932, 55.6750], // ≈ 18.5 km
  },
  {
    id: 'sub-msk-l-1', name: 'Moscow→Odintsovo L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [37.6208, 55.7539], end: [37.2828, 55.6780], // ≈ 23.0 km
  },
  {
    id: 'sub-msk-xl-1', name: 'Moscow→Zelenograd XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [37.6208, 55.7539], end: [37.1815, 55.9825], // ≈ 38.0 km
  },
  {
    id: 'sub-msk-xxl-1', name: 'Moscow→Domodedovo XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [37.6208, 55.7539], end: [37.7661, 55.4431], // ≈ 36.0 km
  },

  // ── MOSCOW COUNTRYSIDE — Istra, Klin, Volokolamsk corridors ─────────────
  {
    id: 'cnt-msk-l-1', name: 'Istra→Rural L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [36.8601, 55.9142], end: [36.7600, 55.9300], // ≈ 6.5 km
  },
  {
    id: 'cnt-msk-xl-1', name: 'Klin→Rural XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [36.7276, 56.3334], end: [36.5000, 56.3970], // ≈ 15.0 km
  },
  {
    id: 'cnt-msk-xxl-1', name: 'Volokolamsk→Istra XXL-1',
    category: 'countryside', lengthCategory: 'xxl',
    start: [35.9586, 56.0330], end: [36.8601, 55.9142], // ≈ 58.0 km
  },

  // ── LAGOS CITY CENTER — Marina, Lagos Island, Victoria Island, Ikoyi ────
  // Anchor: Marina [3.3947, 6.4541]
  {
    id: 'cc-lag-xs-1', name: 'Lagos Centre XS-1',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [3.3947, 6.4541], end: [3.3964, 6.4550], // ≈ 210 m
  },
  {
    id: 'cc-lag-xs-2', name: 'Lagos Centre XS-2',
    category: 'city-center', lengthCategory: 'extra-short',
    start: [3.4219, 6.4281], end: [3.4238, 6.4290], // ≈ 220 m
  },
  {
    id: 'cc-lag-s-1', name: 'Lagos Centre S-1',
    category: 'city-center', lengthCategory: 'short',
    start: [3.3947, 6.4541], end: [3.4025, 6.4478], // ≈ 1.1 km
  },
  {
    id: 'cc-lag-s-2', name: 'Lagos Centre S-2',
    category: 'city-center', lengthCategory: 'short',
    start: [3.4219, 6.4281], end: [3.4325, 6.4315], // ≈ 1.2 km
  },
  {
    id: 'cc-lag-m-1', name: 'Lagos Centre M-1',
    category: 'city-center', lengthCategory: 'medium',
    start: [3.3947, 6.4541], end: [3.4190, 6.4380], // ≈ 3.2 km
  },
  {
    id: 'cc-lag-m-2', name: 'Lagos Centre M-2',
    category: 'city-center', lengthCategory: 'medium',
    start: [3.4219, 6.4281], end: [3.4500, 6.4355], // ≈ 3.2 km
  },
  {
    id: 'cc-lag-l-1', name: 'Lagos Centre L-1',
    category: 'city-center', lengthCategory: 'long',
    start: [3.3947, 6.4541], end: [3.4680, 6.4350], // ≈ 8.4 km
  },
  {
    id: 'cc-lag-l-2', name: 'Lagos Centre L-2',
    category: 'city-center', lengthCategory: 'long',
    start: [3.4219, 6.4281], end: [3.3300, 6.4550], // ≈ 10.5 km
  },
  {
    id: 'cc-lag-xl-1', name: 'Lagos Centre XL-1',
    category: 'city-center', lengthCategory: 'extra-long',
    start: [3.3947, 6.4541], end: [3.5650, 6.4310], // ≈ 19.0 km
  },

  // ── LAGOS CONSOLIDATED — Yaba, Surulere, Ikeja, Maryland ────────────────
  {
    id: 'cu-lag-xs-1', name: 'Lagos Inner XS-1',
    category: 'city-consolidated', lengthCategory: 'extra-short',
    start: [3.3792, 6.5095], end: [3.3810, 6.5102], // ≈ 210 m
  },
  {
    id: 'cu-lag-s-1', name: 'Lagos Inner S-1',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [3.3792, 6.5095], end: [3.3665, 6.5035], // ≈ 1.5 km
  },
  {
    id: 'cu-lag-s-2', name: 'Lagos Inner S-2',
    category: 'city-consolidated', lengthCategory: 'short',
    start: [3.3580, 6.5480], end: [3.3710, 6.5530], // ≈ 1.6 km
  },
  {
    id: 'cu-lag-m-1', name: 'Lagos Inner M-1',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [3.3792, 6.5095], end: [3.3320, 6.5090], // ≈ 5.2 km
  },
  {
    id: 'cu-lag-m-2', name: 'Lagos Inner M-2',
    category: 'city-consolidated', lengthCategory: 'medium',
    start: [3.3580, 6.5480], end: [3.3480, 6.5860], // ≈ 4.4 km
  },
  {
    id: 'cu-lag-l-1', name: 'Lagos Inner L-1',
    category: 'city-consolidated', lengthCategory: 'long',
    start: [3.3792, 6.5095], end: [3.3180, 6.5580], // ≈ 8.6 km
  },
  {
    id: 'cu-lag-xl-1', name: 'Lagos Inner XL-1',
    category: 'city-consolidated', lengthCategory: 'extra-long',
    start: [3.3580, 6.5480], end: [3.5020, 6.5790], // ≈ 16.0 km
  },

  // ── LAGOS SUBURBAN — Lekki, Ikorodu, Badagry, Epe corridors ─────────────
  {
    id: 'sub-lag-s-1', name: 'Lagos→Lekki S-1',
    category: 'suburban', lengthCategory: 'short',
    start: [3.3947, 6.4541], end: [3.5000, 6.4370], // ≈ 12.0 km
  },
  {
    id: 'sub-lag-m-1', name: 'Lagos→Ikeja M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [3.3947, 6.4541], end: [3.3420, 6.6018], // ≈ 17.0 km
  },
  {
    id: 'sub-lag-m-2', name: 'Lagos→Ikorodu M-1',
    category: 'suburban', lengthCategory: 'medium',
    start: [3.3947, 6.4541], end: [3.5069, 6.6194], // ≈ 22.0 km
  },
  {
    id: 'sub-lag-l-1', name: 'Lagos→Badagry L-1',
    category: 'suburban', lengthCategory: 'long',
    start: [3.3947, 6.4541], end: [2.8860, 6.4150], // ≈ 56.0 km
  },
  {
    id: 'sub-lag-xl-1', name: 'Lagos→Epe XL-1',
    category: 'suburban', lengthCategory: 'extra-long',
    start: [3.3947, 6.4541], end: [3.9833, 6.5833], // ≈ 67.0 km
  },
  {
    id: 'sub-lag-xxl-1', name: 'Lagos→Agbara XXL-1',
    category: 'suburban', lengthCategory: 'xxl',
    start: [3.3947, 6.4541], end: [3.0860, 6.5260], // ≈ 35.0 km
  },

  // ── LAGOS COUNTRYSIDE — Epe and Ogun border corridors ───────────────────
  {
    id: 'cnt-lag-l-1', name: 'Epe→Rural L-1',
    category: 'countryside', lengthCategory: 'long',
    start: [3.9833, 6.5833], end: [4.1080, 6.6460], // ≈ 15.0 km
  },
  {
    id: 'cnt-lag-xl-1', name: 'Ijebu-Ode→Rural XL-1',
    category: 'countryside', lengthCategory: 'extra-long',
    start: [3.9242, 6.8198], end: [4.1430, 6.8840], // ≈ 25.0 km
  },
  {
    id: 'cnt-lag-xxl-1', name: 'Epe→Ijebu-Ode XXL-1',
    category: 'countryside', lengthCategory: 'xxl',
    start: [3.9833, 6.5833], end: [3.9242, 6.8198], // ≈ 27.0 km
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// PROGRAMMATIC ROUTE GENERATION FOR GLOBAL CITIES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Haversine distance between two [lng, lat] points in meters.
 */
function haversineDistance(p1, p2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = Math.PI / 180;
  const lat1 = p1[1] * toRad, lon1 = p1[0] * toRad;
  const lat2 = p2[1] * toRad, lon2 = p2[0] * toRad;
  const dlat = lat2 - lat1, dlon = lon2 - lon1;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Destination point given start, bearing (degrees), and distance (meters).
 * Returns [lng, lat].
 */
function destPoint(start, bearing, distMeters) {
  const R = 6371e3;
  const toRad = Math.PI / 180;
  const lat1 = start[1] * toRad, lon1 = start[0] * toRad;
  const brng = bearing * toRad;
  const d = distMeters / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [lon2 / toRad, lat2 / toRad];
}

/**
 * Generates 100 diverse routes around a city anchor.
 * Distributes across environment categories and length categories.
 */
function generateCityRoutes(cityKey, cityName, anchor, regionType = 'urban') {
  const routes = [];
  const categories = ['city-center', 'city-consolidated', 'suburban', 'countryside'];
  const lengthBounds = {
    'extra-short': { min: 100, max: 300 },
    'short': { min: 300, max: 1500 },
    'medium': { min: 1500, max: 6000 },
    'long': { min: 6000, max: 20000 },
    'extra-long': { min: 20000, max: 60000 },  // Extended from 30km to 60km to match hardcoded xxl routes
    'xxl': { min: 60000, max: 120000 },        // Added xxl category for very long routes (60-120km)
  };
  const lengthKeys = Object.keys(lengthBounds);
  
  // Generate routes per (category, length) combination
  // 4 categories × 6 length categories × ~4 routes each = 96 routes, round to 100 total
  let routeIdx = 0;
  for (const category of categories) {
    for (const lengthKey of lengthKeys) {
      // Generate 4 routes per combination for 96 total, skip one for 100 total
      const routesPerCombo = (category === 'city-center' && lengthKey === 'xxl') ? 5 : 4;
      for (let i = 0; i < routesPerCombo; i++) {
        const bearing1 = (Math.random() * 360); // Random bearing for start
        const bearing2 = bearing1 + 180 + (Math.random() * 60 - 30); // Offset for end
        const { min: minDist, max: maxDist } = lengthBounds[lengthKey];
        const distance = minDist + Math.random() * (maxDist - minDist);
        
        const start = destPoint(anchor, bearing1, (minDist + maxDist) / 2 * (0.3 + Math.random() * 0.4));
        const end = destPoint(start, bearing2, distance);
        const actualDist = Math.round(haversineDistance(start, end));
        
        routes.push({
          id: `${cityKey}-${lengthKey.substring(0, 2)}-${i + 1}`,
          name: `${cityName} ${lengthKey} #${i + 1}`,
          category,
          lengthCategory: lengthKey,
          start,
          end,
          // Comment with approximate distance for verification
          __comment: `≈ ${actualDist} m`,
        });
        routeIdx++;
      }
    }
  }
  
  return routes;
}

/**
 * City definitions: [key, name, [lng, lat]].
 * Coordinates are approximate city centers.
 */
const CITY_DEFINITIONS = [
  ['bcn', 'Barcelona', [2.1686, 41.3851]],
  ['lon', 'London', [-0.1276, 51.5074]],
  ['ber', 'Berlin', [13.4050, 52.5200]],
  ['rom', 'Rome', [12.4964, 41.9028]],
  ['mil', 'Milan', [9.1900, 45.4642]],
  ['alc', 'Alicante', [-0.4821, 38.3452]],
  ['cru', 'A Coruña', [-8.3915, 43.3623]],
  ['lyo', 'Lyon', [4.8357, 45.7640]],
  ['muc', 'Munich', [11.5820, 48.1351]],
  ['osl', 'Oslo', [10.7522, 59.9139]],
  ['bsas', 'Buenos Aires', [-58.3816, -34.6037]],
  ['bra', 'Brasilia', [-47.8822, -15.7942]],
  ['cdmx', 'Ciudad de Mexico', [-99.1332, 19.4326]],
  ['den', 'Denver', [-104.9903, 39.7392]],
  ['var', 'Varsovia', [21.0122, 52.2297]],
  ['cai', 'El Cairo', [31.2357, 30.0444]],
  ['nai', 'Nairobi', [36.8219, -1.2921]],
  ['lua', 'Luanda', [13.2344, -8.8368]],
  ['sha', 'Shanghai', [121.4737, 31.2304]],
  ['bei', 'Beijing', [116.4074, 39.9042]],
  ['mac', 'Macao', [113.5439, 22.1987]],
  ['kul', 'Kuala Lumpur', [101.6869, 3.1390]],
  ['ndl', 'New Delhi', [77.2090, 28.6139]],
  ['mum', 'Mumbai', [72.8479, 19.0760]],
  ['ban', 'Bangalore', [77.5946, 12.9716]],
  ['ont', 'Ontario', [-117.0382, 34.0630]],
  ['ber2', 'Berna', [7.4474, 46.9479]],
  ['rab', 'Rabat', [-6.8416, 34.0209]],
  ['krt', 'Jartum', [32.5263, 15.5007]],
  ['kin', 'Kinshasa', [15.3136, -4.3369]],
  ['syd', 'Sydney', [151.2093, -33.8688]],
  ['jak', 'Jakarta', [106.8456, -6.2088]],
  ['hno', 'Hanoi', [105.8342, 21.0285]],
  ['man', 'Manila', [120.9842, 14.5994]],
  ['alb', 'Alberta', [-114.0708, 53.5461]],
  ['was', 'Washington', [-77.0369, 38.9072]],
  ['bos', 'Boston', [-71.0596, 42.3601]],
  // --- Added cities ---
  ['lis', 'Lisbon', [-9.142685, 38.736946]],
  ['nte', 'Nantes', [-1.553621, 47.218371]],
  ['dub', 'Dublin', [-6.26031, 53.349805]],
  ['inv', 'Inverness', [-4.223996, 57.477773]],
  ['ams', 'Amsterdam', [4.904139, 52.367573]],
  ['bru', 'Brussels', [4.351721, 50.850346]],
  ['ham', 'Hamburgo', [9.993682, 53.551086]],
  ['cop', 'Copenhagen', [12.568337, 55.676098]],
  ['pra', 'Praga', [14.4378, 50.0755]],
  ['med', 'Medellin', [-75.563591, 6.25184]],
  ['cal', 'Cali', [-76.522499, 3.451647]],
  ['bsa', 'Brasilia', [-47.8822, -15.7942]],
  ['rio', 'Rio do Janeiro', [-43.172896, -22.906847]],
  ['scl', 'Santiago de Chile', [-70.64827, -33.45694]],
  ['lpz', 'La Paz', [-68.119293, -16.500000]],
  ['cus', 'Cusco', [-71.967461, -13.53195]],
  ['lim', 'Lima', [-77.042793, -12.046374]],
  ['mga', 'Managua', [-86.251389, 12.136389]],
  ['hou', 'Houston', [-95.369803, 29.760427]],
  ['mia', 'Miami', [-80.191790, 25.761680]],
  ['nor', 'New Orleans', [-90.071533, 29.951065]],
  ['lvg', 'Las Vegas', [-115.139830, 36.169941]],
  ['qbc', 'Quebec', [-71.2080, 46.8139]],
  ['fbk', 'Fairbanks', [-147.7164, 64.8378]],
  ['osa', 'Osaka', [135.5022, 34.6937]],
  ['tpe', 'Taipei', [121.5654, 25.0330]],
  ['sel', 'Seoul', [126.9780, 37.5665]],
  ['shz', 'Shenzhen', [114.0579, 22.5431]],
  ['bkk', 'Bangkok', [100.5018, 13.7563]],
  ['mdn', 'Medan', [98.6742, 3.5952]],
  ['jkt', 'Yakarta', [106.8456, -6.2088]],
  ['npr', 'Nanpur', [88.3639, 22.5726]],
  ['jai', 'Jaipur', [75.7873, 26.9124]],
  ['kar', 'Karachi', [67.0011, 24.8607]],
  ['thr', 'Teheran', [51.3890, 35.6892]],
  ['dam', 'Damasco', [36.2765, 33.5138]],
  ['rid', 'Riad', [46.6753, 24.7136]],
  ['dubai', 'Dubai', [55.2708, 25.2048]],
  ['kiv', 'Kiev', [30.5234, 50.4501]],
  ['mog', 'Mogadiscio', [45.3182, 2.0469]],
  ['yub', 'Yuba', [30.6570, 6.4343]],
  ['kam', 'Kampala', [32.5825, 0.3476]],
  ['lus', 'Lusaka', [28.3228, -15.3875]],
  ['lub', 'Lubango', [13.4894, -14.9172]],
  ['drb', 'Durban', [31.0218, -29.8587]],
  ['kan', 'Kano', [8.5167, 12.0000]],
  ['mon', 'Monrovia', [-10.7972, 6.3005]],
  ['fre', 'Freetown', [-13.2317, 8.4657]],
  ['kkn', 'Kankan', [-9.3077, 10.3854]],
  ['nim', 'Niamey', [2.1157, 13.5128]],
  ['mrk', 'Marrakech', [-7.9811, 31.6295]],
  ['mlg', 'Malaga', [-4.4214, 36.7213]],
  ['vlc', 'Valencia', [-0.3763, 39.4699]],
  ['mad', 'Madrid', [-3.7038, 40.4168]],
  ['bil', 'Bilbao', [-2.93499, 43.2630]],
  ['sev', 'Sevilla', [-5.9845, 37.3891]],
  ['tls', 'Toulouse', [1.4442, 43.6047]],
  ['pal', 'Palermo', [13.3615, 38.1157]],
  ['zur', 'Zurich', [8.5417, 47.3769]],
  ['ess', 'Essen', [7.0123, 51.4566]],
  ['dre', 'Dresde', [13.7373, 51.0504]],
  ['kau', 'Kaunas', [23.8813, 54.8985]],
  ['man', 'Manchester', [-2.2426, 53.4808]],
  ['sfo', 'San Francisco', [-122.4194, 37.7749]],
  ['nyc', 'New York City', [-74.0060, 40.7128]],
  ['chi', 'Chicago', [-87.6298, 41.8781]],
  ['la', 'Los Angeles', [-118.2437, 34.0522]],
  ['tyo', 'Tokyo', [139.6917, 35.6895]],
  ['sao', 'Sao Paulo', [-46.6333, -23.5505]],
  ['cpt', 'Cape Town', [18.4241, -33.9249]],
  [ 'dhk', 'Dhaka', [90.4125, 23.8103]],
  [ 'acc', 'Accra', [-0.186964, 5.603717]],
  ['rec', 'Recife', [-34.8813, -8.0476]],
  ['ry', 'Reykjavik', [-21.8277, 64.1355]],
  ['xna', 'Xian', [108.9398, 34.3416]],
  ['cgn', 'Cologne', [6.9603, 50.9375]],
  ['vce', 'Venice', [12.3155, 45.4408]],
  ['mar', 'Marseille', [5.3698, 43.2965]],
  ['str', 'Strasbourg', [7.7521, 48.5734]],
  ['stp', 'St. Petersburg', [30.3351, 59.9343]],
  ['kgn', 'Kingston', [-76.7928, 17.9712]],
  ['cba', 'Cordoba', [-64.1811, -31.4201]],
  ['ros', 'Rosario', [-60.6393, -32.9442]],
  ['mon', 'Monterrey', [-100.3161, 25.6866]],
  ['gua', 'Guadalajara', [-103.3496, 20.6597]],
  ['mall', 'Mallorca', [2.6502, 39.5696]],
  ['can', 'Canberra', [149.1300, -35.2809]],
  ['per', 'Perth', [115.8605, -32.0000]]
];

// Generate and merge all city routes
const GENERATED_ROUTES = CITY_DEFINITIONS.flatMap(([key, name, anchor]) => 
  generateCityRoutes(key, name, anchor)
);

// Merge hardcoded routes with generated routes, stripping comments for final export
const ALL_ROUTES = [
  ...HARDCODED_ROUTES,
  ...GENERATED_ROUTES.map(({ __comment, ...r }) => r),
];

export const ROUTES = ALL_ROUTES;
export const CATEGORIES = ['city-center', 'city-consolidated', 'suburban', 'countryside'];
export const LENGTH_CATEGORIES = ['extra-short', 'short', 'medium', 'long', 'extra-long', 'xxl'];

/** Human-readable labels for filter UI — kept in sync with the arrays above. */
export const CATEGORY_LABELS = {
  'city-center':       'City center',
  'city-consolidated': 'City consolidated',
  'suburban':          'Suburban',
  'countryside':       'Countryside',
};
export const LENGTH_CATEGORY_LABELS = {
  'extra-short': 'Extra-short (<300 m)',
  'short':       'Short (300 m–1.5 km)',
  'medium':      'Medium (1.5–6 km)',
  'long':        'Long (6–20 km)',
  'extra-long':  'Extra-long (20–60 km)',
  'xxl':         'XXL (60+ km)',
};

/** Current production thresholds (keep in sync with src/chRouter.js) */
export const GPU_MIN_EDGES     = 80_000;
export const GPU_MIN_BEELINE_M = 3_000;
