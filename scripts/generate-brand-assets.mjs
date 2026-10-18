// Regenerate raster exports after editing the SVG sources. Uses Next.js's installed sharp.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const brand = path.join(root, "public", "brand");
  const mark = await fs.readFile(path.join(brand, "veilcode-mark.svg"));
  const logo = await fs.readFile(path.join(brand, "veilcode-logo.svg"));

  await sharp(mark).resize(512, 512).png().toFile(path.join(brand, "veilcode-mark.png"));
  await sharp(logo, { density: 288 }).png().toFile(path.join(brand, "veilcode-logo.png"));
  await fs.writeFile(path.join(root, "app", "icon.svg"), mark);
  // Home-screen icons have an opaque background; the OS supplies its own corner mask.
  await sharp(mark).resize(180, 180).flatten({ background: "#2B59FF" }).png()
    .toFile(path.join(root, "app", "apple-icon.png"));

  // ICO directory with PNG frames for crisp browser/desktop rendering at each size.
  const sizes = [16, 32, 48];
  const frames = [];
  for (const size of sizes) frames.push(await sharp(mark).resize(size, size).png().toBuffer());
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  for (let i = 0; i < sizes.length; i++) {
    const entry = 6 + i * 16;
    directory[entry] = sizes[i];
    directory[entry + 1] = sizes[i];
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frames[i].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frames[i].length;
  }
  await fs.writeFile(path.join(root, "app", "favicon.ico"), Buffer.concat([directory, ...frames]));
  console.log("Generated VeilCode logo, mark, favicon, and Apple touch icon.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
