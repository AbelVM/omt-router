import { minify } from 'terser';
import fs from 'fs';

function getFileSizeInKB(filePath) {
  const stats = fs.statSync(filePath);
  return (stats.size / 1024).toFixed(2);
}

async function compressFile(filePath) {
  const sizeBefore = getFileSizeInKB(filePath);
  const code = fs.readFileSync(filePath, 'utf8');

  const result = await minify(code, {
    compress: {
      passes: 5,
      dead_code: true,
      drop_debugger: true,
      evaluate: true,
      unsafe: true,
      unsafe_comps: true,
      unsafe_math: true,
      reduce_vars: true,
      collapse_vars: true,
      comparisons: true,
      computed_props: true,
      hoist_funs: true,
      inline: 3,
      keep_fargs: false,
      loops: true,
      side_effects: true,
      switches: true,
    },
    mangle: {
      toplevel: true,
      eval: true,
      module: true,
      properties: false,
    },
    format: {
      comments: false,
      ecma: 2020,
    },
  });

  fs.writeFileSync(filePath, result.code, 'utf8');

  const sizeAfter = getFileSizeInKB(filePath);
  const reduction = (sizeBefore - sizeAfter).toFixed(2);
  const percentage = ((reduction / sizeBefore) * 100).toFixed(1);

  console.log(`📦 File: ${filePath}`);
  console.log(`   └─ Initial:  ${sizeBefore} KB`);
  console.log(`   └─ Final:    ${sizeAfter} KB`);
  console.log(`   └─ Shaved:   -${reduction} KB (${percentage}% reduction)`);
  console.log('--------------------------------------------------');
}

async function run() {
  console.log('🚀 Starting Terser post-processing...');
  console.log('--------------------------------------------------');

  try {
    await compressFile('dist/omt-router.js');
    await compressFile('dist/omt-router.cjs');
    console.log('✅ Ultra-aggressive minification completed successfully!');
  } catch (error) {
    console.error('❌ Error during minification:', error);
  }
}

run();
