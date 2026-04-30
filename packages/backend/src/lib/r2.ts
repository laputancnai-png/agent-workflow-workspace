import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createId } from '@paralleldrive/cuid2';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY ?? '',
    secretAccessKey: process.env.R2_SECRET_KEY ?? '',
  },
});

function bucketName() {
  const bucket = process.env.R2_BUCKET;

  if (!bucket) {
    throw new Error('R2_BUCKET is required');
  }

  return bucket;
}

export async function getUploadUrl(key: string, contentType = 'text/plain') {
  const command = new PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType });

  return getSignedUrl(r2, command, { expiresIn: 900 });
}

export async function getDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: bucketName(), Key: key });

  return getSignedUrl(r2, command, { expiresIn: 900 });
}

export const INLINE_CONTENT_LIMIT = 64 * 1024;

export async function putArtifactContent(content: string): Promise<{ blobKey: string }> {
  const key = `artifacts/${createId()}`;
  await r2.send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Body: content,
    ContentType: 'text/plain; charset=utf-8',
  }));
  return { blobKey: key };
}
