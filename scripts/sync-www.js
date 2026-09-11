const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const www = path.join(root, "www");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "firebase-config.js",
  "manifest.webmanifest",
  "sw.js",
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.mkdirSync(path.join(www, "icons"), { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(www, file));
}
for (const icon of fs.readdirSync(path.join(root, "icons"))) {
  if (icon.endsWith(".png")) {
    fs.copyFileSync(path.join(root, "icons", icon), path.join(www, "icons", icon));
  }
}
copyDir(path.join(root, "assets"), path.join(www, "assets"));
console.log("www synced");
