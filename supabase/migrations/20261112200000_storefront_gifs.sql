-- Allow animated GIFs in the public storefront bucket alongside images and short videos.
-- GIFs are served as-is (Next.js does not optimise animated images), so the 25 MB bucket limit
-- still applies; the admin recommends MP4 for anything longer than a few seconds.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm']
where id = 'storefront';
