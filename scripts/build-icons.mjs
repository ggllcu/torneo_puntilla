// Generates the optimized app icons from the source artwork. Run with: npm run icons:build
import sharp from "sharp";

const SOURCE = "public/icons/la-puntilla-app-icon.png";
const OUTPUTS = [
	["icon-192.png", 192],
	["icon-512.png", 512],
	["apple-touch-icon.png", 180],
	["favicon-32.png", 32],
];

for (const [file, size] of OUTPUTS) {
	const info = await sharp(SOURCE)
		.resize(size, size)
		.png({ palette: true, quality: 70, dither: 0, compressionLevel: 9, effort: 10 })
		.toFile(`public/icons/${file}`);
	console.log(`${file}: ${info.width}x${info.height}, ${(info.size / 1024).toFixed(1)} KB`);
}

const { dominant } = await sharp(SOURCE).stats();
console.log("dominant colour:", dominant);
