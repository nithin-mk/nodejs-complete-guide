const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: 'play.min.io',
  port: 9000,
  secure: true,
  accessKey: 'Q3AM3UQ867SPQQA43P2F',
  secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG',
});

const bucket = 'nodejs-complete-guide';

minioClient.bucketExists(bucket).then(exists => {
  if (exists) {
    return console.log("Bucket " + bucket + " exists.");
  } else {
    return minioClient.makeBucket(bucket, "us-east-1").then(() => {
      console.log("Bucket " + bucket + ' created in "us-east-1".');
    });
  }
}).catch(err => {
  console.error(err);
});

exports.minioClient = minioClient;
exports.bucket = bucket;

