# Menu photographs

## Editing a dish photo in admin

Open **Menu Management → Edit** (or **Add New Dish**). Paste an image URL and choose **Edit image**, or select **Upload photo**. JPG, PNG and WebP files up to 20 MB are supported.

The editor previews the exact 3:2 landscape crop. Drag or use the position sliders, zoom, rotate in 90-degree steps, flip horizontally/vertically, and choose an output size from 600×400 to 2400×1600. **Reset edits** restores the current editor session to its starting settings; **Cancel editing** discards that session. **Use edited image** saves a finished image, then **Save Changes** (or **Publish Dish Live**) publishes it on the dish. Saving the dish is disabled while an image edit is in progress.

Edited images are validated and encoded as WebP on the server, stored in the private `menu-images` Supabase bucket, and served through `/api/menu-images/[name]`. Unique immutable URLs prevent old crops being cached under new edits. The normal menu polling updates customers; all devices use the same saved pixels. Existing orders and pricing are unaffected. No database schema migration is required. For a fresh environment, run `node scripts/setup-menu-image-storage.cjs` once with the server environment configured.

The customer menu uses each dish's first/default size without a size selector. Photographer attribution remains on `/photo-credits`; its former main-menu link has been removed.

## Original photograph collection

The 83 menu photographs are stored in `public/menu-photos`. They are real photographs sourced from Wikimedia Commons and Pexels, with a distinct source and file for each dish. Close visual matches are used for signature drinks and combinations where exact café photographs are unavailable.

`src/data/menu-photo-credits.json` records the source, photographer, licence, dimensions and SHA-256 checksum. Credits are also available at `/photo-credits`. Photos are resized to a maximum of 1200 pixels and encoded as WebP without cropping or background removal. Customer hero images, thumbnails, search results and admin previews use `object-fit: contain`.

## Publishing the original photograph collection

The following script is for the original collection migration, not routine admin photo edits; rerunning it would replace custom dish images with the original collection.

1. Add the photographs, credits and matching intrinsic dimensions in `src/data/menu-photo-layout.json`. Update the initial menu and SQL seed paths for fresh installations.
2. Build, verify the images and deploy the assets to Vercel.
3. With the existing server environment configured, run `node scripts/sync-menu-photos.cjs` to review the mapping, then `node scripts/sync-menu-photos.cjs --apply`.
4. The apply command checks the deployed image checksums before updating only `menu_items.image_url`, saves an ignored local backup and verifies all saved paths. It does not change prices, availability, stock, orders or customer data. Concurrent image edits cause it to stop for review.
5. Verify the live menu before removing obsolete assets. Do not rerun the full menu seed against production for an image update.

Menu and admin read the same database records. Kitchen orders retain their existing dish IDs and pricing; photographs do not change order processing.
