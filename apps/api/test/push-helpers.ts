import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestEnv, type TestEnv, type TestEnvOptions } from './helpers.js';

export interface CapturedPush {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export interface FakePushServer {
  base: string;
  requests: CapturedPush[];
  /** Statuscode je Pfad (Standard 201). */
  statusFor: Map<string, number>;
  close(): Promise<void>;
}

/** Lokaler Push-Dienst, der Anfragen mitschreibt. */
export async function startPushServer(): Promise<FakePushServer> {
  const requests: CapturedPush[] = [];
  const statusFor = new Map<string, number>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const path = req.url ?? '';
      requests.push({ path, headers: req.headers, body: Buffer.concat(chunks) });
      res.statusCode = statusFor.get(path) ?? 201;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    statusFor,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Ein Empfangsgerät mit eigenem Schlüsselpaar, wie es Browser oder UnifiedPush-Verteiler erzeugen. */
export function newDevice(endpoint: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    /** Entschlüsselt eine aes128gcm-Nachricht (RFC 8291/8188) mit dem privaten Schlüssel des Geräts. */
    decrypt(body: Buffer): string {
      const salt = body.subarray(0, 16);
      const idLength = body[20] as number;
      const senderPublic = body.subarray(21, 21 + idLength);
      const ciphertext = body.subarray(21 + idLength);
      const secret = ecdh.computeSecret(senderPublic);
      const keyInfo = Buffer.concat([
        Buffer.from('WebPush: info\0'),
        ecdh.getPublicKey(),
        senderPublic,
      ]);
      const ikm = Buffer.from(hkdfSync('sha256', secret, auth, keyInfo, 32));
      const cek = Buffer.from(
        hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
      );
      const nonce = Buffer.from(
        hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
      );
      const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
      decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
      const padded = Buffer.concat([
        decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
        decipher.final(),
      ]);
      let end = padded.length;
      while (end > 0 && padded[end - 1] === 0) end--;
      return padded.subarray(0, end - 1).toString('utf8'); // letztes Byte ist der Delimiter 0x02
    },
  };
}

export function pushEnv(options: TestEnvOptions = {}): TestEnv {
  return createTestEnv({ ...options, env: { PUSH_ALLOWED_HOSTS: '127.0.0.1', ...options.env } });
}
