// TargetPDF — Main UI logic

(function () {
  'use strict';

  let currentFile = null;
  let compressedBlob = null;
  let originalUrl = null;
  let compressedUrl = null;
  let lastChangeInfo = null;
  let analysisRunning = false;

  const screenUpload = document.getElementById('screenUpload');
  const screenResult = document.getElementById('screenResult');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileInfo = document.getElementById('fileInfo');
  const targetSection = document.getElementById('targetSection');
  const targetValue = document.getElementById('targetValue');
  const targetUnit = document.getElementById('targetUnit');
  const compressBtn = document.getElementById('compressBtn');
  const progress = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const floorBox = document.getElementById('floorBox');
  const floorText = document.getElementById('floorText');
  const floorBtn = document.getElementById('floorBtn');

  const analyseHint = document.getElementById('analyseHint');
  const analyseLink = document.getElementById('analyseLink');

  const health = document.getElementById('health');
  const healthBadge = document.getElementById('healthBadge');
  const hSize = document.getElementById('hSize');
  const hPages = document.getElementById('hPages');
  const hType = document.getElementById('hType');
  const hPotential = document.getElementById('hPotential');
  const healthDeep = document.getElementById('healthDeep');
  const hFloor = document.getElementById('hFloor');
  const hMaxReduction = document.getElementById('hMaxReduction');
  const hVerdict = document.getElementById('hVerdict');

  const recommendResult = document.getElementById('recommendResult');
  const recommendTarget = document.getElementById('recommendTarget');
  const recommendNote = document.getElementById('recommendNote');
  const recommendApply = document.getElementById('recommendApply');
  const recommendQuality = document.getElementById('recommendQuality');

  const resultBefore = document.getElementById('resultBefore');
  const resultAfter = document.getElementById('resultAfter');
  const resultSaved = document.getElementById('resultSaved');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const previewOriginalFrame = document.getElementById('previewOriginalFrame');
  const previewCompressedFrame = document.getElementById('previewCompressedFrame');
  const previewOriginalSize = document.getElementById('previewOriginalSize');
  const previewCompressedSize = document.getElementById('previewCompressedSize');
  const previewOriginalLink = document.getElementById('previewOriginalLink');
  const previewCompressedLink = document.getElementById('previewCompressedLink');
  const mobileOriginalLink = document.getElementById('mobileOriginalLink');
  const mobileCompressedLink = document.getElementById('mobileCompressedLink');

  const changePages = document.getElementById('changePages');
  const changeText = document.getElementById('changeText');
  const changeLayout = document.getElementById('changeLayout');
  const changeImages = document.getElementById('changeImages');
  const changeMeta = document.getElementById('changeMeta');

  const MAX_SIZE_MB = 10;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getTargetKB() {
    const val = parseFloat(targetValue.value);
    if (!val || val <= 0) return null;
    return targetUnit.value === 'MB' ? val * 1024 : val;
  }

  function setTargetKB(kb) {
    if (kb >= 1024) {
      targetValue.value = (kb / 1024).toFixed(2).replace(/\.00$/, '');
      targetUnit.value = 'MB';
    } else {
      targetValue.value = Math.round(kb);
      targetUnit.value = 'KB';
    }
  }

  function refreshCompressButton() {
    const t = getTargetKB();
    compressBtn.disabled = !(currentFile && t && t > 0);
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      alert('File is larger than ' + MAX_SIZE_MB + ' MB.');
      return;
    }
    currentFile = file;
    compressedBlob = null;
    analysisRunning = false;
    fileInfo.textContent = file.name + ' (' + formatBytes(file.size) + ')';
    targetSection.style.display = 'block';
    analyseHint.style.display = 'block';
    health.style.display = 'none';
    healthDeep.classList.remove('active');
    recommendResult.style.display = 'none';
    floorBox.style.display = 'none';
    compressBtn.style.display = 'block';
    compressBtn.disabled = true;
    compressBtn.textContent = 'Compress PDF';
    progress.style.display = 'none';
    refreshCompressButton();
  }

  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    const files = e.dataTransfer.files;
    if (files && files.length) handleFile(files[0]);
  });
  dropzone.addEventListener('click', function (e) {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    fileInput.click();
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length) handleFile(fileInput.files[0]);
  });

  targetValue.addEventListener('input', function () {
    document.querySelectorAll('.preset').forEach(function (p) { p.classList.remove('active'); });
    refreshCompressButton();
  });
  targetUnit.addEventListener('change', refreshCompressButton);

  document.querySelectorAll('.preset').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const kb = parseInt(btn.getAttribute('data-kb'), 10);
      document.querySelectorAll('.preset').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      if (kb >= 1024 && kb % 1024 === 0) {
        targetValue.value = kb / 1024;
        targetUnit.value = 'MB';
      } else {
        targetValue.value = kb;
        targetUnit.value = 'KB';
      }
      refreshCompressButton();
    });
  });

  function setProgress(percent, text) {
    progress.style.display = 'block';
    progressFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
    if (text) progressText.textContent = text;
  }

let worker = null;
function ensureWorker() {
  if (worker) return worker;
  worker = new Worker('/worker.js', { type: 'module' });
  return worker;
}

  analyseLink.addEventListener('click', function () {
    if (!currentFile || analysisRunning) return;
    analysisRunning = true;
    analyseHint.style.display = 'none';
    health.style.display = 'block';
    recommendResult.style.display = 'none';
    healthDeep.classList.remove('active');

    hSize.textContent = formatBytes(currentFile.size);
    hPages.textContent = 'reading...';
    hType.textContent = 'Detecting...';
    hType.classList.add('dim');
    hPotential.textContent = '—';
    hPotential.classList.add('dim');
    healthBadge.textContent = 'Analysing...';

    currentFile.arrayBuffer().then(function (buf) {
      return PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    }).then(function (doc) {
      const pages = doc.getPageCount();
      hPages.textContent = pages;
      const kbPerPage = (currentFile.size / 1024) / Math.max(pages, 1);
      let type = 'Mixed';
      if (kbPerPage > 200) type = 'Image-heavy';
      else if (kbPerPage > 80) type = 'Scanned or mixed';
      else if (kbPerPage < 30) type = 'Text-heavy';
      hType.textContent = type;
      hType.classList.remove('dim');
      lastChangeInfo = { pages: pages };
    }).catch(function () {
      hPages.textContent = '?';
      hType.textContent = 'Unknown';
      lastChangeInfo = { pages: null };
    });

    const w = ensureWorker();
    let resolved = false;
    progress.style.display = 'block';
    progressFill.style.width = '5%';
    progressText.textContent = 'Analysing document...';

    const onMessage = function (e) {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress(msg.percent, msg.text);
      } else if (msg.type === 'analysis') {
        if (resolved) return;
        resolved = true;
        w.removeEventListener('message', onMessage);
        progress.style.display = 'none';
        analysisRunning = false;
        showFullAnalysis(msg.originalBytes, msg.floorBytes);
      } else if (msg.type === 'error') {
        if (resolved) return;
        resolved = true;
        w.removeEventListener('message', onMessage);
        progress.style.display = 'none';
        analysisRunning = false;
        alert('Could not analyse this PDF: ' + msg.message);
      }
    };
    w.addEventListener('message', onMessage);

    currentFile.arrayBuffer().then(function (buf) {
      w.postMessage({ type: 'analyse', fileBuffer: buf }, [buf]);
    }).catch(function () {
      progress.style.display = 'none';
      analysisRunning = false;
    });
  });

  function showFullAnalysis(originalBytes, floorBytes) {
    const originalKB = originalBytes / 1024;
    const floorKB = floorBytes / 1024;
    const maxReduction = Math.round((1 - floorKB / originalKB) * 100);

    healthDeep.classList.add('active');
    hFloor.textContent = formatBytes(floorBytes);
    hMaxReduction.textContent = maxReduction + '%';
    hPotential.textContent = 'Up to ' + maxReduction + '%';
    hPotential.classList.remove('dim');
    healthBadge.textContent = 'Detailed analysis';

    let verdictClass = 'good';
    let verdictText = '';
    if (maxReduction >= 60) {
      verdictClass = 'good';
      verdictText = '✓ High compression potential. Images dominate this file and can be reduced significantly without harming readability.';
    } else if (maxReduction >= 30) {
      verdictClass = 'ok';
      verdictText = '◐ Moderate compression potential. You can reduce the size meaningfully, but heavy compression may soften fine details.';
    } else {
      verdictClass = 'limited';
      verdictText = '⚠ Already well-optimised or text-only. Limited room for further reduction without losing content.';
    }
    hVerdict.className = 'health-verdict ' + verdictClass;
    hVerdict.textContent = verdictText;

    let recKB = Math.min(floorKB * 1.4, originalKB * 0.85);
    if (recKB >= 1024) recKB = Math.round(recKB);
    else recKB = Math.round(recKB / 10) * 10;
    if (recKB < floorKB) recKB = Math.ceil(floorKB);

    let quality = '';
    if (recKB <= floorKB * 1.2) quality = 'Acceptable readability';
    else if (recKB <= floorKB * 1.6) quality = 'Excellent readability';
    else quality = 'Near-original quality';

    let note = '';
    if (floorKB >= originalKB * 0.95) {
      note = 'This PDF is already near its smallest size. Compression will be minimal.';
    } else {
      const reduction = Math.round((1 - recKB / originalKB) * 100);
      note = 'About ' + reduction + '% smaller. ' + quality + '.';
    }

    recommendTarget.textContent = formatBytes(recKB * 1024);
    recommendNote.textContent = note;
    recommendQuality.textContent = quality;
    recommendResult.style.display = 'block';

    recommendApply.onclick = function () {
      setTargetKB(recKB);
      document.querySelectorAll('.preset').forEach(function (p) { p.classList.remove('active'); });
      refreshCompressButton();
    };
  }

  function runCompression(targetKB) {
    return new Promise(function (resolve, reject) {
      const w = ensureWorker();
      const onMessage = function (e) {
        const msg = e.data;
        if (msg.type === 'progress') {
          setProgress(msg.percent, msg.text);
        } else if (msg.type === 'done') {
          w.removeEventListener('message', onMessage);
          resolve({ kind: 'done', blob: msg.blob });
        } else if (msg.type === 'floor') {
          w.removeEventListener('message', onMessage);
          resolve({
            kind: 'floor',
            floorBytes: msg.floorBytes,
            targetBytes: msg.targetBytes,
            floorBytesRaw: msg.floorBytesRaw
          });
        } else if (msg.type === 'error') {
          w.removeEventListener('message', onMessage);
          reject(new Error(msg.message));
        }
      };
      w.addEventListener('message', onMessage);

      currentFile.arrayBuffer().then(function (buf) {
        w.postMessage({
          type: 'compress',
          fileBuffer: buf,
          targetBytes: Math.floor(targetKB * 1024)
        }, [buf]);
      }).catch(reject);
    });
  }

  function startCompression(targetKB) {
    compressBtn.disabled = true;
    compressBtn.textContent = 'Compressing...';
    floorBox.style.display = 'none';
    setProgress(5, 'Reading file...');

    runCompression(targetKB).then(function (res) {
      if (res.kind === 'done') {
        compressedBlob = res.blob;
        setProgress(100, 'Done');
        showResult(res.blob);
      } else if (res.kind === 'floor') {
        progress.style.display = 'none';
        compressBtn.style.display = 'none';
        floorText.textContent =
          'This document\u2019s smallest readable size is ' +
          formatBytes(res.floorBytes) +
          '. Compress to that instead?';
        floorBox.style.display = 'block';
        floorBtn.onclick = function () {
          floorBox.style.display = 'none';
          const floorBlob = new Blob([res.floorBytesRaw], { type: 'application/pdf' });
          compressedBlob = floorBlob;
          progress.style.display = 'none';
          compressBtn.style.display = 'none';
          showResult(floorBlob);
        };
      }
    }).catch(function (err) {
      progress.style.display = 'none';
      alert('Compression failed: ' + (err.message || err));
      compressBtn.disabled = false;
      compressBtn.textContent = 'Compress PDF';
    });
  }

  compressBtn.addEventListener('click', function () {
    if (!currentFile) return;
    const targetKB = getTargetKB();
    if (!targetKB) { alert('Please enter a target size.'); return; }
    startCompression(targetKB);
  });

  function cleanupUrls() {
    if (originalUrl) { URL.revokeObjectURL(originalUrl); originalUrl = null; }
    if (compressedUrl) { URL.revokeObjectURL(compressedUrl); compressedUrl = null; }
  }

  function showResult(blob) {
    const before = currentFile.size;
    const after = blob.size;
    const saved = Math.round((1 - after / before) * 100);
    resultBefore.textContent = formatBytes(before);
    resultAfter.textContent = formatBytes(after);
    resultSaved.textContent = 'Saved ' + saved + '%';

    const pageCount = (lastChangeInfo && lastChangeInfo.pages) ? lastChangeInfo.pages : null;
    changePages.textContent = pageCount ? ('All ' + pageCount + ' pages kept') : 'All pages kept';
    changeText.textContent = 'Text content unchanged';
    changeLayout.textContent = 'Page layout and structure intact';
    changeImages.textContent = 'Images resized to fit your target size';
    changeMeta.textContent = 'Hidden metadata removed';

    cleanupUrls();
    originalUrl = URL.createObjectURL(currentFile);
    compressedUrl = URL.createObjectURL(blob);

    previewOriginalFrame.src = originalUrl;
    previewCompressedFrame.src = compressedUrl;
    previewOriginalLink.href = originalUrl;
    previewCompressedLink.href = compressedUrl;
    mobileOriginalLink.href = originalUrl;
    mobileCompressedLink.href = compressedUrl;

    previewOriginalSize.textContent = formatBytes(before);
    previewCompressedSize.textContent = formatBytes(after);

    screenUpload.classList.remove('active');
    screenResult.classList.add('active');
    window.scrollTo(0, 0);
  }

  downloadBtn.addEventListener('click', function () {
    if (!compressedBlob) return;
    const name = currentFile.name.replace(/\.pdf$/i, '') + '-targetpdf.pdf';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(compressedBlob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  resetBtn.addEventListener('click', function () {
    cleanupUrls();
    currentFile = null;
    compressedBlob = null;
    analysisRunning = false;
    fileInput.value = '';
    targetValue.value = '';
    targetUnit.value = 'KB';
    document.querySelectorAll('.preset').forEach(function (p) { p.classList.remove('active'); });
    fileInfo.textContent = '';
    targetSection.style.display = 'none';
    analyseHint.style.display = 'none';
    health.style.display = 'none';
    healthDeep.classList.remove('active');
    recommendResult.style.display = 'none';
    progress.style.display = 'none';
    floorBox.style.display = 'none';
    compressBtn.style.display = 'block';
    compressBtn.disabled = true;
    compressBtn.textContent = 'Compress PDF';

    previewOriginalFrame.src = '';
    previewCompressedFrame.src = '';

    screenResult.classList.remove('active');
    screenUpload.classList.add('active');
    window.scrollTo(0, 0);
  });

})();
