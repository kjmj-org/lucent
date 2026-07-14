'use strict';

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Optimization strength presets. Sharpening cannot recreate detail that was
// never there — it only improves perceived clarity — so we keep it gentle.
const LEVELS = {
  conservative: { sigma: 0.5, jpegQuality: 92, label: 'Conservative' },
  balanced: { sigma: 0.8, jpegQuality: 86, label: 'Balanced' },
  strong: { sigma: 1.2, jpegQuality: 80, label: 'Strong' }
};

// For "Auto detected" (or a preset with no valid target yet) the output keeps
// the image's own native dimensions, so we resolve the target from metadata.
function effectivePreset(preset, meta) {
  if (preset.auto || !preset.width || !preset.height) {
    return { ...preset, width: meta.width, height: meta.height };
  }
  return preset;
}

// Resolve the effective output format for a job.
function resolveFormat(requested, preset, hasAlpha) {
  let fmt = requested || 'auto';
  if (fmt === 'auto') {
    fmt = preset.format === 'auto'
      ? (hasAlpha && preset.allowTransparency ? 'png' : 'jpeg')
      : preset.format;
  }
  return fmt === 'jpg' ? 'jpeg' : fmt;
}

// Build a sharp pipeline that applies the full preparation recipe:
// resize -> sRGB conversion -> flatten (when needed) -> output sharpening ->
// encode. Metadata is dropped by default (sharp does not carry it forward
// unless withMetadata() is called), which strips unnecessary EXIF/ICC.
function buildPipeline(input, opts) {
  const { preset, level, fitMode, format, hasAlpha } = opts;
  const lvl = LEVELS[level] || LEVELS.balanced;

  let pipe = sharp(input, { failOn: 'none' });

  // Resize to the preset target.
  const fit = fitMode === 'fill' ? 'cover' : fitMode === 'stretch' ? 'fill' : 'contain';
  pipe = pipe.resize({
    width: preset.width,
    height: preset.height,
    fit,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
    withoutEnlargement: false
  });

  // Convert to sRGB for consistent color after upload.
  pipe = pipe.toColorspace('srgb');

  // Flatten transparency onto white unless we are keeping a PNG with alpha.
  const keepAlpha = format === 'png' && preset.allowTransparency && hasAlpha;
  if (!keepAlpha) {
    pipe = pipe.flatten({ background: { r: 255, g: 255, b: 255 } });
  }

  // Light output sharpening.
  pipe = pipe.sharpen({ sigma: lvl.sigma });

  if (format === 'png') {
    pipe = pipe.png({ compressionLevel: 9 });
  } else {
    pipe = pipe.jpeg({ quality: lvl.jpegQuality, chromaSubsampling: '4:4:4', mozjpeg: true });
  }
  return pipe;
}

// Produce in-memory previews: the optimized image plus an approximate
// "after Amazon processing" simulation. The simulation downscales to a typical
// display size and re-encodes JPEG at a lower quality to make likely quality
// Build the full-resolution optimized image once. Shared by preview, export,
// and the optimized-score analysis so the pipeline is defined in one place.
async function buildOptimizedBuffer(filePath, options) {
  const meta = await sharp(filePath, { failOn: 'none' }).metadata();
  const preset = effectivePreset(options.preset, meta);
  const format = resolveFormat(options.format, preset, !!meta.hasAlpha);
  const buf = await buildPipeline(filePath, {
    preset,
    level: options.level,
    fitMode: options.fitMode,
    format,
    hasAlpha: !!meta.hasAlpha
  }).toBuffer();
  return { buf, format, preset, meta };
}

// loss visible. It is only an approximation — Amazon's real pipeline differs.
async function preview(filePath, options) {
  const { buf, format } = await buildOptimizedBuffer(filePath, options);
  const preset = effectivePreset(options.preset, await sharp(buf).metadata());
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';

  // Marketplace simulation: display-size downscale + aggressive recompress.
  const displayLong = Math.min(Math.max(preset.width, preset.height), 1200);
  const simBuf = await sharp(buf)
    .resize({ width: displayLong, height: displayLong, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 74, chromaSubsampling: '4:2:0' })
    .toBuffer();

  // Downscale the "optimized" preview too so the renderer stays light.
  const optPreviewBuf = await sharp(buf)
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  const optMeta = await sharp(buf).metadata();

  return {
    format,
    optimizedSize: buf.length,
    optimizedDataUrl: `data:${mime};base64,${optPreviewBuf.toString('base64')}`,
    optimizedDimensions: { width: optMeta.width, height: optMeta.height },
    simDataUrl: `data:image/jpeg;base64,${simBuf.toString('base64')}`,
    // Full-res buffer for in-process reuse (e.g. scoring); the main handler
    // strips this before sending the payload to the renderer.
    _buf: buf
  };
}

// Write a single optimized file to disk and return the output path.
async function exportOne(filePath, outputDir, options) {
  const { buf, format } = await buildOptimizedBuffer(filePath, options);

  const ext = format === 'png' ? '.png' : '.jpg';
  const base = path.basename(filePath, path.extname(filePath));
  let outPath = path.join(outputDir, `${base}_lucent${ext}`);
  // Avoid overwriting an existing export.
  let n = 1;
  while (fs.existsSync(outPath)) {
    outPath = path.join(outputDir, `${base}_lucent_${n}${ext}`);
    n++;
  }
  fs.writeFileSync(outPath, buf);
  return { filePath, outPath, size: buf.length, format };
}

module.exports = { LEVELS, preview, exportOne, resolveFormat, buildOptimizedBuffer };
