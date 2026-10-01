// Puts the title over the promo render (tools/blender/promo.py) and saves the banner.
//
//   npm i sharp
//   node promo.mjs <render.png> <out.jpg|png> [width]
import sharp from 'sharp';

const [src, out, widthArg] = process.argv.slice(2);
const meta = await sharp(src).metadata();
const W = Number(widthArg) || meta.width;
const H = Math.round(meta.height * W / meta.width);
const title = Math.round(H * 0.2);
const sub = Math.round(H * 0.06);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6d8"/><stop offset="0.55" stop-color="#ffd25a"/><stop offset="1" stop-color="#f0962a"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${H * 0.012}"/></filter>
  </defs>
  <g font-family="DejaVu Serif" font-weight="bold" text-anchor="middle">
    <text x="${W / 2}" y="${H * 0.24}" font-size="${title}" fill="#0b1030" opacity="0.7" filter="url(#glow)">Aetherfall</text>
    <text x="${W / 2}" y="${H * 0.24}" font-size="${title}" fill="url(#gold)" stroke="#2a1a2e" stroke-width="${title * 0.05}" paint-order="stroke">Aetherfall</text>
    <text x="${W / 2}" y="${H * 0.33}" font-size="${sub}" fill="#ffffff" stroke="#16204a" stroke-width="${sub * 0.18}" paint-order="stroke" letter-spacing="${sub * 0.12}">ROGUELITE D’AVENTURE 3D</text>
  </g>
</svg>`;
const image = sharp(src).resize(W, H).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
await (out.endsWith('.png') ? image.png() : image.jpeg({ quality: 88, mozjpeg: true })).toFile(out);
console.log('promo', out, W, H);
