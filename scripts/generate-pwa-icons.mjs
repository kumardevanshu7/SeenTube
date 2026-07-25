import sharp from "sharp";

const standard = (size) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#ff385c"/>
  <rect x="92" y="146" width="328" height="220" rx="68" fill="#fff" fill-opacity=".2"/>
  <path d="M218 193 333 256 218 319V193Z" fill="#fff"/>
</svg>`);

const maskable = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ff385c"/>
  <rect x="116" y="166" width="280" height="180" rx="56" fill="#fff" fill-opacity=".2"/>
  <path d="M226 208 318 256 226 304V208Z" fill="#fff"/>
</svg>`);

await Promise.all([
  sharp(standard(192)).png().toFile("public/icons/icon-192.png"),
  sharp(standard(512)).png().toFile("public/icons/icon-512.png"),
  sharp(maskable).png().toFile("public/icons/maskable-512.png"),
  sharp(standard(180)).png().toFile("public/icons/apple-touch-icon.png"),
]);
