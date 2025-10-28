const path = require('path');
const { PNG } = require('pngjs');
const fs = require('fs');

function readDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height };
}

const baseDir = path.resolve(__dirname, '..', '..');
const referencePath = path.join(
  baseDir,
  'screenshots',
  'dev',
  'reference',
  '2025',
  '10',
  '28',
  'reference__root__desktop-1280x720__20251028T144542.png'
);
const targetPath = path.join(
  baseDir,
  'screenshots',
  'dev',
  'target',
  '2025',
  '10',
  '28',
  'target__root__desktop-1280x720__20251028T144558.png'
);

const referenceDims = readDimensions(referencePath);
const targetDims = readDimensions(targetPath);

console.log('reference', referenceDims);
console.log('target', targetDims);
