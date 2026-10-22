// TargetPDF — Web Worker using @bentopdf/gs-wasm
import { loadGhostscriptWASM } from 'https://cdn.jsdelivr.net/npm/@bentopdf/gs-wasm@0.1.1/+esm';

let gsModule = null;

async function ensureGs() {
  if (gsModule) return gsModule;
  postMessage({ type: 'progress', percent: 5, text: 'Loading compression engine...' });
  gsModule = await loadGhostscriptWASM({
    baseUrl: 'https://cdn.jsdelivr.net/npm/@bentopdf/gs-wasm@0.1.1/assets/'
  });
  return gsModule;
}

async function runGhostscript(inputBytes, dpi, quality) {
  const gs = await ensureGs();
  const inputPath = '/input.pdf';
  const outputPath = '/output.pdf';

  gs.FS.writeFile(inputPath, inputBytes);

  const args = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dPDFSETTINGS=/default',
    '-dNOPAUSE', '-dQUIET', '-dBATCH',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    '-dEmbedAllFonts=true',
    '-dAutoRotatePages=/None',
    '-dColorImageDownsampleType=/Bicubic',
    '-dColorImageResolution=' + dpi,
    '-dGrayImageDownsampleType=/Bicubic',
    '-dGrayImageResolution=' + dpi,
    '-dMonoImageDownsampleType=/Subsample',
    '-dMonoImageResolution=' + dpi,
    '-dColorImageDownsampleThreshold=1.0',
    '-dGrayImageDownsampleThreshold=1.0',
    '-dMonoImageDownsampleThreshold=1.0',
    '-dJPEGQ=' + quality,
    '-sOutputFile=' + outputPath,
    inputPath
  ];

  await gs.callMain(args);
  const outputBytes = gs.FS.readFile(outputPath, { encoding: 'binary' });

  try { gs.FS.unlink(inputPath); } catch (e) {}
  try { gs.FS.unlink(outputPath); } catch (e) {}
  return outputBytes;
}

// ---- Analyse only: find the floor size, don't compress ----
async function analyseOnly(inputBytes) {
  postMessage({ type: 'progress', percent: 15, text: 'Analysing document...' });
  const floorBytes = await runGhostscript(inputBytes, 72, 30);
  postMessage({ type: 'progress', percent: 100, text: 'Analysis complete' });
  return floorBytes;
}

// ---- Full compression ----
async function compressToTarget(inputBytes, targetBytes) {
  const originalSize = inputBytes.length;
  postMessage({ type: 'progress', percent: 10, text: 'Analysing document...' });

  let floorBytes;
  try {
    floorBytes = await runGhostscript(inputBytes, 72, 30);
  } catch (e) {
    throw new Error('Could not read this PDF. It may be corrupted or password-protected.');
  }

  if (floorBytes.length > targetBytes) {
    postMessage({
      type: 'floor',
      floorBytes: floorBytes.length,
      targetBytes: targetBytes,
      floorBytesRaw: floorBytes
    });
    return null;
  }

  if (originalSize <= targetBytes) {
    postMessage({ type: 'progress', percent: 90, text: 'Already under target. Optimising...' });
    const light = await runGhostscript(inputBytes, 200, 85);
    const best = light.length < originalSize ? light : inputBytes;
    postMessage({ type: 'progress', percent: 100, text: 'Done' });
    return new Blob([best], { type: 'application/pdf' });
  }

  let lowDPI = 72, highDPI = 300, bestBytes = floorBytes, iteration = 0;
  const MAX_ITER = 6;

  while (iteration < MAX_ITER) {
    iteration++;
    const midDPI = Math.round((lowDPI + highDPI) / 2);
    const quality = Math.round(30 + ((midDPI - 72) / (300 - 72)) * 55);

    postMessage({
      type: 'progress',
      percent: 10 + Math.round((iteration / MAX_ITER) * 80),
      text: 'Finding best quality for target (' + iteration + '/' + MAX_ITER + ')...'
    });

    let resultBytes;
    try {
      resultBytes = await runGhostscript(inputBytes, midDPI, quality);
    } catch (e) {
      highDPI = midDPI - 1;
      continue;
    }

    if (resultBytes.length > targetBytes) {
      highDPI = midDPI - 1;
    } else {
      if (resultBytes.length > bestBytes.length) bestBytes = resultBytes;
      lowDPI = midDPI + 1;
    }

    if (highDPI - lowDPI <= 5) break;
  }

  postMessage({ type: 'progress', percent: 100, text: 'Done' });
  return new Blob([bestBytes], { type: 'application/pdf' });
}

self.addEventListener('message', async function (e) {
  const msg = e.data;

  if (msg.type === 'analyse') {
    try {
      const inputBytes = new Uint8Array(msg.fileBuffer);
      const floorBytes = await analyseOnly(inputBytes);
      postMessage({
        type: 'analysis',
        floorBytes: floorBytes.length,
        originalBytes: inputBytes.length
      });
    } catch (err) {
      postMessage({ type: 'error', message: err.message || String(err) });
    }
    return;
  }

  if (msg.type === 'compress') {
    try {
      const inputBytes = new Uint8Array(msg.fileBuffer);
      const blob = await compressToTarget(inputBytes, msg.targetBytes);
      if (blob) {
        postMessage({ type: 'done', blob: blob });
      }
    } catch (err) {
      postMessage({ type: 'error', message: err.message || String(err) });
    }
  }
});