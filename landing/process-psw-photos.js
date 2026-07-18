// One-off: crop/clean 5 real Provider photos → landing/public/providers/*.jpg (512px squares)
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = '/home/aassh/project/screenshot/providers';
const OUT = path.join(__dirname, 'public', 'providers');
fs.mkdirSync(OUT, { recursive: true });

// mode 'circle': image is a circular headshot composited on blurred bg —
// crop the centered square inside the circle. 'plain': normal photo,
// crop a square around the face region.
const JOBS = [
  { src: 'sandesh Bhetwal.jpeg', out: 'sandesh-bhetwal.jpg', mode: 'circle' },
  { src: 'rajan kc.jpeg', out: 'rajan-kc.jpg', mode: 'circle' },
  { src: 'aman konda.jpeg', out: 'aman-konda.jpg', mode: 'circle' },
  // biswash: face upper-middle, lots of sky — crop tighter around subject
  { src: 'biswash shahi thkarui.jpeg', out: 'biswash-shahi-thakuri.jpg', mode: 'rect', box: (w, h) => { const side = Math.round(h * 0.72); return { left: Math.round(w / 2 - side / 2), top: Math.round(h * 0.18), width: side, height: side }; } },
  // hari: good headshot already, center square biased to top (face)
  { src: 'hari timalsena.jpeg', out: 'hari-timalsena.jpg', mode: 'rect', box: (w, h) => { const side = Math.min(w, h); return { left: Math.round((w - side) / 2), top: 0, width: side, height: side }; } },
];

(async () => {
  for (const j of JOBS) {
    const img = sharp(path.join(SRC, j.src)).rotate();
    const { width: w, height: h } = await img.metadata();
    let box;
    if (j.mode === 'circle') {
      // circle diameter ≈ 0.84*h, centered; crop slightly inside to hide blur edges
      const side = Math.round(h * 0.54); // inscribed square of ~0.84h circle
      box = { left: Math.round(w / 2 - side / 2), top: Math.round((h - side) / 2), width: side, height: side };
    } else {
      box = j.box(w, h);
    }
    await img.extract(box).resize(512, 512).jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(OUT, j.out));
    console.log('✅', j.out);
  }
})();
