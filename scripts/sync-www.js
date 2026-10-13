const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const www = path.join(root, "www");
const files = ["index.html","styles.css","theme-veggie.css","app.js","firebase-config.js","manifest.webmanifest","sw.js"];
const assetDirs = [
  ["icons", (f) => f.endsWith(".png")],
  ["img", (f) => /\.(jpe?g|png|webp)$/i.test(f)],
];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(www, file));
for (const [dir, keep] of assetDirs) {
  fs.mkdirSync(path.join(www, dir), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, dir))) {
    if (keep(f)) fs.copyFileSync(path.join(root, dir, f), path.join(www, dir, f));
  }
}
console.log("www synced");
