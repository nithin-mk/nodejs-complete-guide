import fs from 'fs/promises';
import * as Minio from 'minio';

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'play.min.io',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_SECURE === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || ''
});

export const bucket = process.env.MINIO_BUCKET || 'nodejs-complete-guide';

minioClient
  .bucketExists(bucket)
  .then(exists => {
    if (exists) {
      return console.log('Bucket ' + bucket + ' exists.');
    }
    return minioClient.makeBucket(bucket, 'us-east-1').then(() => {
      console.log('Bucket ' + bucket + ' created in "us-east-1".');
    });
  })
  .catch(err => {
    console.error(err);
  });

// In-flight downloads, keyed by local destination path. Product filenames are
// timestamp-based and immutable once uploaded (edits/deletes always create or
// remove a distinct object), so once a file is fully downloaded locally it
// never needs to be re-fetched.
const inFlightDownloads = new Map<string, Promise<void>>();

/**
 * Downloads a product image from MinIO to local disk, but only if it isn't
 * already cached there, and de-duplicates concurrent requests for the same
 * object.
 *
 * Without this, every single page render unconditionally called
 * `fGetObject` for every product shown, regardless of whether the file
 * already existed locally. Besides the wasted I/O, calling `fGetObject`
 * concurrently for the *same* destination path is unsafe: the MinIO SDK
 * writes to a shared `<file>.<etag>.part.minio` temp file while resuming/
 * downloading, and two simultaneous writers (e.g. two users browsing the
 * shop at the same time) can corrupt that temp file. The corrupted temp
 * file then permanently breaks all future downloads of that object with an
 * `S3Error: The requested range ... is not satisfiable` (500 response)
 * until it's manually deleted from disk.
 */
export function downloadImageIfMissing(imageUrl: string): Promise<void> {
  const destinationObject = imageUrl.split('/')[1];

  const cached = inFlightDownloads.get(imageUrl);
  if (cached) return cached;

  const download = fs
    .stat(imageUrl)
    .then(stat => {
      if (stat.size > 0) return; // already cached locally
      return minioClient.fGetObject(bucket, destinationObject, imageUrl);
    })
    .catch(() => minioClient.fGetObject(bucket, destinationObject, imageUrl))
    .finally(() => inFlightDownloads.delete(imageUrl));

  inFlightDownloads.set(imageUrl, download);
  return download;
}
