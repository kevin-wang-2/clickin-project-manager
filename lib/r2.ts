import crypto from "crypto";

const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
export const r2Bucket = process.env.R2_BUCKET ?? "click-in";

const region = "auto";
const host = `${accountId}.r2.cloudflarestorage.com`;
const endpoint = `https://${host}`;

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}
function sha256hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function dateParts(): { dateStr: string; amzDate: string } {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return { dateStr, amzDate };
}

function getSigningKey(dateStr: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStr), region), "s3"), "aws4_request");
}

function sortedParams(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))
  );
}

export function assetR2Key(assetFileId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `assets/${assetFileId}/${safe}`;
}

export function thumbnailR2Key(assetFileId: string): string {
  return `thumbnails/${assetFileId}.webp`;
}

/** Presigned GET URL. */
export function presignedGet(key: string, expiresIn = 3600): string {
  const { dateStr, amzDate } = dateParts();
  const scope = `${dateStr}/${region}/s3/aws4_request`;
  const params = sortedParams({
    "X-Amz-Algorithm":    "AWS4-HMAC-SHA256",
    "X-Amz-Credential":   `${accessKeyId}/${scope}`,
    "X-Amz-Date":         amzDate,
    "X-Amz-Expires":      String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });
  const canonical = [
    "GET",
    `/${r2Bucket}/${key}`,
    params.toString(),
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const sig = crypto
    .createHmac("sha256", getSigningKey(dateStr))
    .update(`AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonical)}`)
    .digest("hex");
  params.set("X-Amz-Signature", sig);
  return `${endpoint}/${r2Bucket}/${key}?${params.toString()}`;
}

/** Presigned PUT URL. Client must send Content-Type: mimeType header. */
export function presignedPut(key: string, mimeType: string, expiresIn = 3600): { url: string; contentType: string } {
  const { dateStr, amzDate } = dateParts();
  const scope = `${dateStr}/${region}/s3/aws4_request`;
  const signedHeaders = "content-type;host";
  const params = sortedParams({
    "X-Amz-Algorithm":    "AWS4-HMAC-SHA256",
    "X-Amz-Credential":   `${accessKeyId}/${scope}`,
    "X-Amz-Date":         amzDate,
    "X-Amz-Expires":      String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  const canonical = [
    "PUT",
    `/${r2Bucket}/${key}`,
    params.toString(),
    `content-type:${mimeType}\nhost:${host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const sig = crypto
    .createHmac("sha256", getSigningKey(dateStr))
    .update(`AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonical)}`)
    .digest("hex");
  params.set("X-Amz-Signature", sig);
  return { url: `${endpoint}/${r2Bucket}/${key}?${params.toString()}`, contentType: mimeType };
}

/** Upload a buffer to R2 from server-side. */
export async function putR2Object(key: string, body: Buffer, mimeType: string): Promise<void> {
  const { url, contentType } = presignedPut(key, mimeType);
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`R2 PUT failed: ${res.status} ${await res.text()}`);
}

/** Delete an object from R2. */
export async function deleteR2Object(key: string): Promise<void> {
  const { dateStr, amzDate } = dateParts();
  const scope = `${dateStr}/${region}/s3/aws4_request`;
  const signedHeaders = "host;x-amz-date";
  const canonical = [
    "DELETE",
    `/${r2Bucket}/${key}`,
    "",
    `host:${host}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    sha256hex(""),
  ].join("\n");
  const sig = crypto
    .createHmac("sha256", getSigningKey(dateStr))
    .update(`AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonical)}`)
    .digest("hex");
  await fetch(`${endpoint}/${r2Bucket}/${key}`, {
    method: "DELETE",
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
      "X-Amz-Date": amzDate,
    },
  });
}

/** Fetch R2 object as Buffer (for proxying). */
export async function getR2Object(key: string): Promise<{ body: Buffer; contentType: string | null } | null> {
  const url = presignedGet(key);
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET failed: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  return { body, contentType: res.headers.get("content-type") };
}
