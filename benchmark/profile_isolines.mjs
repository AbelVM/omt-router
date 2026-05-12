import { tricontour } from 'd3-tricontour';

async function makeGrid(n) {
  const coordsArr = new Array(n * n);
  const distances = new Float64Array(n * n);
  const center = (n - 1) / 2;
  const spacing = 25; // meters

  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i - center) * spacing;
      const y = (j - center) * spacing;
      coordsArr[k] = [x, y];
      distances[k] = Math.hypot(x, y);
      k++;
    }
  }
  return { coordsArr, distances };
}

async function run() {
  const argN = Number(process.argv[2] || process.env.PROFILE_N || 120);
  const n = Math.max(10, Math.floor(argN)); // default 120 (~14.4k points)
  console.log('Preparing grid', n, 'x', n);
  const { coordsArr, distances } = await makeGrid(n);
  const prepared = { coordsArr };
  const isoResult = { distances };

  // Build points expected by d3-tricontour
  const points = [];
  for (let i = 0; i < distances.length; i++) {
    const v = distances[i];
    if (!Number.isFinite(v)) continue;
    const coord = coordsArr[i];
    if (!coord || coord.length < 2) continue;
    points.push({ x: coord[0], y: coord[1], value: v });
  }

  for (let i = 0; i < 3; i++) {
    console.log('\nRun', i + 1);
    const start = Date.now();
    const contoursFn = tricontour();
    const segments = contoursFn(points);
    const total = Date.now() - start;
    console.log('Overall time (ms):', total);
    const count = Array.isArray(segments) ? segments.length : (segments && segments.features ? segments.features.length : 0);
    console.log('Result: polygons for', count, 'breaks');
  }
}

run().catch(err => {
  console.error('Error during profiling:', err);
  process.exit(1);
});
