const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const GREEN_FROM = '#0F6B44';
const GREEN_TO = '#0A4A2E';
const WHITE = '#FFFFFF';

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function createLinearGradient(ctx, x1, y1, x2, y2, color1, color2) {
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  const radius = size * 0.22;
  
  drawRoundedRect(ctx, 0, 0, size, size, radius);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, GREEN_FROM);
  gradient.addColorStop(1, GREEN_TO);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  const shineGrad = ctx.createLinearGradient(0, 0, 0, size * 0.5);
  shineGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
  shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shineGrad;
  drawRoundedRect(ctx, 0, 0, size, size, radius);
  ctx.fill();
  
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const fontSize = size * 0.38;
  ctx.font = `300 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillText('C', size / 2 - fontSize * 0.22, size / 2 + 1);
  
  ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillText('N', size / 2 + fontSize * 0.25, size / 2 + 1);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`Created: ${filename} (${size}x${size})`);
}

function drawSplash(width, height, filename) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, GREEN_FROM);
  gradient.addColorStop(0.5, '#0C5A38');
  gradient.addColorStop(1, GREEN_TO);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  const patternSize = 200;
  ctx.globalAlpha = 0.03;
  for (let x = -patternSize; x < width + patternSize; x += patternSize) {
    for (let y = -patternSize; y < height + patternSize; y += patternSize) {
      ctx.save();
      ctx.translate(x + patternSize/2, y + patternSize/2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = WHITE;
      ctx.fillRect(-4, -patternSize, 8, patternSize * 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  
  const iconSize = Math.min(width, height) * 0.35;
  const iconX = width / 2;
  const iconY = height * 0.38;
  const radius = iconSize * 0.26;
  
  ctx.save();
  ctx.translate(iconX, iconY);
  
  drawRoundedRect(ctx, -iconSize/2, -iconSize/2, iconSize, iconSize, radius);
  const iconGrad = ctx.createLinearGradient(-iconSize/2, -iconSize/2, iconSize/2, iconSize/2);
  iconGrad.addColorStop(0, '#0F7A4A');
  iconGrad.addColorStop(1, '#085A30');
  ctx.fillStyle = iconGrad;
  ctx.fill();
  
  const shineGrad = ctx.createLinearGradient(0, -iconSize/2, 0, 0);
  shineGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
  shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shineGrad;
  drawRoundedRect(ctx, -iconSize/2, -iconSize/2, iconSize, iconSize/2, radius);
  ctx.fill();
  
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const fontSize = iconSize * 0.4;
  ctx.font = `300 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillText('C', -fontSize * 0.2, 2);
  
  ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillText('N', fontSize * 0.22, 2);
  
  ctx.restore();
  
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const wordmarkY = height * 0.62;
  const wordFontSize = iconSize * 0.35;
  
  ctx.font = `300 ${wordFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  const careWidth = ctx.measureText('Care').width;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Care', width/2 - careWidth/2 + 2, wordmarkY);
  
  ctx.font = `800 ${wordFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillStyle = WHITE;
  ctx.fillText('Nearby', width/2 + careWidth/2 + 2, wordmarkY);
  
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `300 ${wordFontSize * 0.35}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillText('Personal Support Workers', width/2, height * 0.75);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`Created: ${filename} (${width}x${height})`);
}

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

console.log('\n=== Generating Glow Icon & Splash ===\n');

drawIcon(1024, path.join(assetsDir, 'icon.png'));
drawIcon(512, path.join(assetsDir, 'adaptive-icon.png'));

drawSplash(1284, 2778, path.join(assetsDir, 'splash.png'));

drawIcon(192, path.join(assetsDir, 'favicon.png'));

console.log('\n=== All assets generated successfully! ===\n');
