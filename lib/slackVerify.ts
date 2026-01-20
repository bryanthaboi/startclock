import crypto from "crypto";

export type SlackVerifyResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifySlackRequest(opts: {
  signingSecret: string | undefined;
  timestampHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  nowMs?: number;
}): SlackVerifyResult {
  const { signingSecret, timestampHeader, signatureHeader, rawBody } = opts;
  const nowMs = opts.nowMs ?? Date.now();

  if (!signingSecret) {
    return { ok: false, status: 500, message: "Server misconfigured." };
  }
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, status: 401, message: "Missing Slack signature headers." };
  }
  if (!signatureHeader.startsWith("v0=")) {
    return { ok: false, status: 401, message: "Invalid Slack signature format." };
  }

  const tsSec = Number(timestampHeader);
  if (!Number.isFinite(tsSec)) {
    return { ok: false, status: 401, message: "Invalid Slack timestamp header." };
  }
  // Reject requests older than 5 minutes to prevent replay attacks.
  const ageMs = Math.abs(nowMs - tsSec * 1000);
  if (ageMs > 5 * 60 * 1000) {
    return { ok: false, status: 401, message: "Slack request timestamp too old." };
  }

  const base = `v0:${timestampHeader}:${rawBody}`;
  const digest = crypto.createHmac("sha256", signingSecret).update(base, "utf8").digest("hex");
  const expected = `v0=${digest}`;

  if (!timingSafeEqual(expected, signatureHeader)) {
    return { ok: false, status: 401, message: "Slack signature mismatch." };
  }
  return { ok: true };
}

