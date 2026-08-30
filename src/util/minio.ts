import * as Minio from 'minio';

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'play.min.io',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_SECURE === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || ''
});

export const bucket = process.env.MINIO_BUCKET || 'nodejs-complete-guide';

minioClient.bucketExists(bucket).then(exists => {
  if (exists) {
    return console.log('Bucket ' + bucket + ' exists.');
  }
  return minioClient.makeBucket(bucket, 'us-east-1').then(() => {
    console.log('Bucket ' + bucket + ' created in "us-east-1".');
  });
}).catch(err => {
  console.error(err);
});
