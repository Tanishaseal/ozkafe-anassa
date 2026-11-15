# Menu photographs

The 83 menu photographs are stored in `public/menu-photos`. They are real photographs sourced from Wikimedia Commons and Pexels, with a distinct source and file for each dish. Close visual matches are used for signature drinks and combinations where exact café photographs are unavailable.

`src/data/menu-photo-credits.json` records the source, photographer, licence, dimensions and SHA-256 checksum. Credits are also available at `/photo-credits`. Photos are resized to a maximum of 1200 pixels and encoded as WebP without cropping or background removal. Customer hero images, thumbnails, search results and admin previews use `object-fit: contain`.

## Publishing photo updates

1. Add the photographs, credits and matching intrinsic dimensions in `src/data/menu-photo-layout.json`. Update the initial menu and SQL seed paths for fresh installations.
2. Build, verify the images and deploy the assets to Vercel.
3. With the existing server environment configured, run `node scripts/sync-menu-photos.cjs` to review the mapping, then `node scripts/sync-menu-photos.cjs --apply`.
4. The apply command checks the deployed image checksums before updating only `menu_items.image_url`, saves an ignored local backup and verifies all saved paths. It does not change prices, availability, stock, orders or customer data. Concurrent image edits cause it to stop for review.
5. Verify the live menu before removing obsolete assets. Do not rerun the full menu seed against production for an image update.

Menu and admin read the same database records. Kitchen orders retain their existing dish IDs and pricing; photographs do not change order processing.
