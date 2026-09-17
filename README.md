# XSPOT

XSPOT is a static, client-side prototype for invisible image watermarking.

## What it does

- Adds a personalized invisible watermark to JPG, PNG and WEBP images.
- Stores project/brand, owner, ID, note and creation date.
- Detects XSPOT watermarks and displays their data.
- Uses an 8×8 DCT-based differential watermark.
- Performs processing in the browser; there is no backend.
- Works on GitHub Pages.

## Files

- `index.html` — interface
- `style.css` — design
- `app.js` — watermarking and detection algorithm

## GitHub Pages

1. Create a GitHub repository, for example `xspot-watermark`.
2. Upload these three files to the repository root.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**, branch `main`, folder `/root`.
5. Save. GitHub will provide the Pages URL.

## Important technical limitation

This is a self-contained prototype, not a forensic or cryptographic proof-of-ownership system.

The public key/algorithm is intentionally visible in `app.js`, because GitHub Pages is static. Therefore someone who studies the code can reproduce the watermark format. The watermark is also not guaranteed to survive every operation: severe JPEG compression, screenshots, printing, aggressive crops, rotations, filters or repeated re-encoding can destroy or weaken it.

For a production ownership/authenticity system, keep signing keys on a server and add error-correcting codes, geometric synchronization, stronger DWT/DCT or neural watermarking, and a server-side registry.

## Privacy

Images are processed locally by JavaScript in the browser. XSPOT itself does not upload the selected image.

The Google Fonts import in `style.css` is the only external resource used by the UI. If you need a fully offline/no-third-party version, remove that `@import` line.
