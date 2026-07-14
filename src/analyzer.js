'use strict';

const fs = require('fs');
const sharp = require('sharp');

// -------------------------------------------------------------------------
// Lucent image analyzer
//
// Everything here is an ESTIMATE produced locally on the user's machine. None
// of these values are official Amazon scores. The goal is to help a seller
// understand *why* an image might look soft or degrade after upload, not to
// perfectly predict Amazon's processing.
// -------------------------------------------------------------------------

// Compute a relative sharpness metric using the variance of a Laplacian
// response over a downscaled grayscale copy of the image. Higher variance =>
// more high-frequency detail => visually sharper. This is scale-normalised by
// working on a fixed-size grayscale buffer.
function laplacianVariance(gray, w, h) {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        gray[i - w] +
        gray[i + w] +
        gray[i - 1] +
        gray[i + 1] -
        4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

// Map a raw Laplacian variance into a 0-100 sharpness score using a soft log
// curve tuned against typical product photography.
function sharpnessScoreFromVariance(v) {
  if (v <= 0) return 0;
  // ~15 => quite soft, ~120 => crisp, ~400+ => very crisp.
  const score = (Math.log10(v + 1) - Math.log10(16)) / (Math.log10(400) - Math.log10(16));
  return clamp(Math.round(score * 100), 0, 100);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function ratioLabel(w, h) {
  const g = gcd(w, h) || 1;
  return `${Math.round(w / g)}:${Math.round(h / g)}`;
}

// Grade helper -> { score, status } where status is good | warn | bad.
function statusFromScore(score) {
  if (score >= 80) return 'good';
  if (score >= 55) return 'warn';
  return 'bad';
}

// `input` may be a file path (original on disk) or a Buffer (the optimized
// output we build in memory), so the same scoring applies to both.
// opts.skipThumb avoids generating a list thumbnail when it isn't needed.
async function analyze(input, preset, opts = {}) {
  const isBuffer = Buffer.isBuffer(input);
  const fileSize = isBuffer ? input.length : fs.statSync(input).size;
  const image = sharp(input, { failOn: 'none' });
  const meta = await image.metadata();

  const width = meta.width || 0;
  const height = meta.height || 0;
  const megapixels = (width * height) / 1_000_000;
  const format = (meta.format || 'unknown').toLowerCase();
  const hasAlpha = !!meta.hasAlpha;
  const space = (meta.space || '').toLowerCase();
  const hasIcc = !!meta.icc;
  // Embedded metadata bloat (EXIF/XMP/IPTC) that Lucent strips on export.
  const hasMetadata = !!(meta.exif || meta.xmp || meta.iptc);
  // sharp reports non-sRGB working spaces; treat srgb / b-w as fine.
  const isSrgb = space === 'srgb' || space === 'b-w' || space === '';
  const bitsPerPixel = width && height ? (fileSize * 8) / (width * height) : 0;

  // --- Sharpness on a downscaled grayscale buffer -----------------------
  const sampleW = 400;
  const gray = await sharp(input, { failOn: 'none' })
    .grayscale()
    .resize({ width: sampleW, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const gw = gray.info.width;
  const gh = gray.info.height;
  const variance = laplacianVariance(gray.data, gw, gh);
  const sharpnessScore = sharpnessScoreFromVariance(variance);

  // === Category scoring =================================================
  const categories = {};
  const issues = [];

  // Under a specific preset we score against its target. Under "Auto detected"
  // there is no resize target and we don't know the use case (main image, A+,
  // mobile module…), so we keep the image's own size and only flag it when it
  // is genuinely small enough to look low-resolution in any context.
  const target = preset.auto
    ? { width: width || 1, height: height || 1 }
    : { width: preset.width || width || 1, height: preset.height || height || 1 };
  const long = Math.max(width, height);

  // Size & dimensions ----------------------------------------------------
  {
    let score = 100;
    if (preset.auto) {
      if (long < 1000) {
        score = 60;
        issues.push({
          category: 'size',
          severity: 'warn',
          key: 'issue.small',
          detail: `${width}×${height}px is fairly small and may look low-resolution if it is displayed large.`
        });
      }
    } else {
      const targetLong = Math.max(target.width, target.height);
      if (long < targetLong * 0.5) {
        score = 25;
        issues.push({
          category: 'size',
          severity: 'bad',
          key: 'issue.tooSmall',
          detail: `${width}×${height}px — much smaller than the ${target.width}×${target.height}px target. Enlarging it will look soft.`
        });
      } else if (long < targetLong) {
        score = 60;
        issues.push({
          category: 'size',
          severity: 'warn',
          key: 'issue.slightlySmall',
          detail: `${width}×${height}px is below the ${target.width}×${target.height}px target and will be upscaled.`
        });
      } else if (long > targetLong * 3) {
        score = 80;
        issues.push({
          category: 'size',
          severity: 'warn',
          key: 'issue.tooLarge',
          detail: `${width}×${height}px is far larger than needed; it will be downscaled and recompressed.`
        });
      }
    }
    categories.size = { score, status: statusFromScore(score), value: `${width}×${height}` };
  }

  // Aspect ratio ---------------------------------------------------------
  {
    const targetRatio = target.width / target.height;
    const actual = width && height ? width / height : 0;
    const diff = targetRatio ? Math.abs(actual - targetRatio) / targetRatio : 1;
    let score = 100;
    if (diff > 0.15) {
      score = 45;
      issues.push({
        category: 'aspect',
        severity: 'warn',
        key: 'issue.aspectMismatch',
        detail: `Image ratio ${ratioLabel(width, height)} differs from the preset ratio ${ratioLabel(target.width, target.height)}. It will be padded or cropped.`
      });
    } else if (diff > 0.03) {
      score = 75;
    }
    categories.aspect = { score, status: statusFromScore(score), value: ratioLabel(width, height) };
  }

  // Sharpness ------------------------------------------------------------
  {
    const score = sharpnessScore;
    if (score < 45) {
      issues.push({
        category: 'sharpness',
        severity: 'bad',
        key: 'issue.soft',
        detail: 'The image reads as soft or low in fine detail. Light output sharpening will help, but it cannot recreate detail that was never captured.'
      });
    } else if (score < 65) {
      issues.push({
        category: 'sharpness',
        severity: 'warn',
        key: 'issue.slightlySoft',
        detail: 'The image could be a little crisper. A touch of output sharpening is recommended.'
      });
    }
    categories.sharpness = { score, status: statusFromScore(score), value: `${score}/100` };
  }

  // Compression quality --------------------------------------------------
  {
    let score = 100;
    let value = `${bitsPerPixel.toFixed(2)} bpp`;
    if (format === 'jpeg' || format === 'jpg' || format === 'webp') {
      if (bitsPerPixel < 0.7) {
        score = 35;
        issues.push({
          category: 'compression',
          severity: 'bad',
          key: 'issue.heavyCompression',
          detail: `The source is already heavily compressed (${bitsPerPixel.toFixed(2)} bits/pixel). Amazon will compress again on top of this, which can reveal artifacts.`
        });
      } else if (bitsPerPixel < 1.2) {
        score = 65;
        issues.push({
          category: 'compression',
          severity: 'warn',
          key: 'issue.someCompression',
          detail: 'The source shows moderate compression. Re-exporting at high quality avoids compounding artifacts.'
        });
      }
    }
    categories.compression = { score, status: statusFromScore(score), value };
  }

  // Color profile --------------------------------------------------------
  {
    let score = 100;
    let value = isSrgb ? 'sRGB' : (space || 'non-sRGB');
    if (!isSrgb) {
      score = 50;
      issues.push({
        category: 'color',
        severity: 'warn',
        key: 'issue.colorProfile',
        detail: `Working space is "${space || 'non-sRGB'}". Amazon expects sRGB — colors may shift after upload. Convert to sRGB before exporting.`
      });
    } else if (hasIcc && space !== 'srgb') {
      score = 80;
    }
    categories.color = { score, status: statusFromScore(score), value };
  }

  // Text clarity (heuristic) --------------------------------------------
  {
    // We can't OCR, so we only penalize when small size + low detail put fine
    // text/icons at real risk; otherwise it scores full and the value still
    // nudges the user to verify text in the after-upload preview.
    let score = 100;
    if (long < 1000 && sharpnessScore < 70) {
      score = 55;
      issues.push({
        category: 'text',
        severity: 'warn',
        key: 'issue.textClarity',
        detail: 'If this image contains text or icons, they may become hard to read after Amazon resizes it. Add text in a design tool at full size when possible.'
      });
    }
    categories.text = { score, status: statusFromScore(score), value: score >= 80 ? 'Check preview' : 'At risk' };
  }

  // Format suitability ---------------------------------------------------
  {
    let score = 100;
    let value = format.toUpperCase();
    let recommended = preset.format;
    if (recommended === 'auto') {
      recommended = hasAlpha && preset.allowTransparency ? 'png' : 'jpeg';
    }
    if (hasAlpha && !preset.allowTransparency) {
      score = 70;
      issues.push({
        category: 'format',
        severity: 'warn',
        key: 'issue.transparency',
        detail: 'The image has transparency but this preset needs a solid background. It will be flattened onto white.'
      });
    }
    if ((format === 'jpeg' || format === 'jpg') && recommended === 'png') {
      score = Math.min(score, 75);
      issues.push({
        category: 'format',
        severity: 'warn',
        key: 'issue.preferPng',
        detail: 'For crisp text, lines, or transparency, PNG is usually the better choice for this use case.'
      });
    }
    categories.format = { score, status: statusFromScore(score), value, recommended };
  }

  // Upscaling risk -------------------------------------------------------
  {
    // Large in pixels but low detail-per-pixel => likely upscaled / AI-inflated.
    let score = 100;
    let value = 'Low';
    if (megapixels > 2 && sharpnessScore < 40) {
      score = 40;
      value = 'High';
      issues.push({
        category: 'upscale',
        severity: 'warn',
        key: 'issue.upscaleRisk',
        detail: 'The image has high pixel dimensions but low real detail — a sign it may have been upscaled or AI-generated. Remember: resolution is not the same as detail.'
      });
    } else if (megapixels > 1 && sharpnessScore < 55) {
      score = 70;
      value = 'Moderate';
    }
    categories.upscale = { score, status: statusFromScore(score), value };
  }

  // Marketplace preparation ---------------------------------------------
  {
    // Measures whether the file has actually been prepared for Amazon:
    // sRGB-normalised, output-sharpened for marketplace downscaling, and
    // stripped of metadata. A raw original hasn't been through this; the
    // optimized output (opts.optimized) has. This is the dimension that
    // optimization reliably and honestly improves.
    let score;
    let value;
    if (opts.optimized) {
      score = 100;
      value = 'Ready';
    } else {
      score = 100;
      score -= 20; // not yet output-sharpened / run through preparation
      if (!isSrgb) score -= 20; // colour not normalised to sRGB
      if (hasMetadata) score -= 10; // carries EXIF/XMP/IPTC bloat
      score = clamp(score, 0, 100);
      value = 'Not optimized';
    }
    categories.prep = { score, status: statusFromScore(score), value };
  }

  // === Weighted overall score ==========================================
  const weights = {
    size: 0.18,
    aspect: 0.12,
    sharpness: 0.2,
    compression: 0.15,
    color: 0.1,
    text: 0.08,
    format: 0.08,
    upscale: 0.09,
    prep: 0.16
  };
  let weighted = 0;
  let totalW = 0;
  for (const key of Object.keys(weights)) {
    weighted += categories[key].score * weights[key];
    totalW += weights[key];
  }
  const overall = clamp(Math.round(weighted / totalW), 0, 100);

  // Always-on caution. A high score means the FILE is well prepared — it cannot
  // predict how Amazon's re-compression will treat AI-generated detail or text,
  // which is exactly where ChatGPT/Midjourney images tend to go soft. This is a
  // note, not a scored penalty, so it never inflates or deflates the number.
  issues.push({
    category: 'info',
    severity: 'info',
    key: 'issue.aiCaution',
    detail: 'A high score means the file is well prepared — it can’t predict how Amazon will re-compress it. AI-generated images and any text or icons can look sharp here yet soften after upload. Check the “Estimated after upload” tab before publishing.'
  });

  // A small thumbnail for the list view (only needed for on-disk originals).
  let thumbDataUrl = null;
  if (!opts.skipThumb) {
    const thumb = await sharp(input, { failOn: 'none' })
      .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    thumbDataUrl = `data:image/jpeg;base64,${thumb.toString('base64')}`;
  }

  return {
    filePath: isBuffer ? null : input,
    fileName: isBuffer ? null : input.split(/[\\/]/).pop(),
    fileSize,
    width,
    height,
    megapixels: Number(megapixels.toFixed(2)),
    format,
    hasAlpha,
    colorSpace: space || 'unknown',
    isSrgb,
    bitsPerPixel: Number(bitsPerPixel.toFixed(3)),
    overall,
    overallStatus: statusFromScore(overall),
    categories,
    issues,
    thumbDataUrl
  };
}

module.exports = { analyze };
