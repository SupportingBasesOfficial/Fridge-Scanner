import { createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  DependencyUnavailableError,
  UnauthenticatedError,
} from '@fridge/application';
import type { JwtAlgorithm, JwtAuthenticationConfig } from '@fridge/config';
import type {
  AuthenticationEvidenceVerifier,
  BearerAuthenticationEvidence,
  VerifiedExternalIdentity,
} from './auth.js';

const MAX_TOKEN_LENGTH = 32_768;
const MAX_JWKS_BYTES = 262_144;
const DEFAULT_JWKS_CACHE_MS = 60_000;
const DEFAULT_JWKS_FETCH_TIMEOUT_MS = 5_000;
const MIN_FORCED_REFRESH_INTERVAL_MS = 1_000;

type JsonObject = Record<string, unknown>;

interface Jwk extends JsonObject {
  readonly kid?: unknown;
  readonly alg?: unknown;
  readonly kty?: unknown;
  readonly crv?: unknown;
  readonly use?: unknown;
  readonly key_ops?: unknown;
}

interface CachedJwks {
  readonly keys: readonly Jwk[];
  readonly expiresAt: number;
}

export interface JwtJwksVerifierOptions {
  readonly trust: JwtAuthenticationConfig;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly jwksCacheMs?: number;
  readonly jwksFetchTimeoutMs?: number;
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new UnauthenticatedError();
  }
  return Buffer.from(value, 'base64url');
}

function parseJsonObject(value: Buffer): JsonObject {
  if (value.byteLength === 0 || value.byteLength > 65_536) {
    throw new UnauthenticatedError();
  }
  try {
    const parsed: unknown = JSON.parse(value.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new UnauthenticatedError();
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    throw new UnauthenticatedError();
  }
}

function requireString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new UnauthenticatedError();
  }
  return value;
}

function hasAudience(claim: unknown, expected: string): boolean {
  if (typeof claim === 'string') return claim === expected;
  return Array.isArray(claim)
    && claim.length > 0
    && claim.every((entry) => typeof entry === 'string')
    && claim.includes(expected);
}

function requireNumericDate(object: JsonObject, key: string): number {
  const value = object[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UnauthenticatedError();
  }
  return value;
}

function verifyClaims(payload: JsonObject, trust: JwtAuthenticationConfig, nowMs: number): string {
  const issuer = requireString(payload, 'iss');
  const subject = requireString(payload, 'sub');
  const expiresAt = requireNumericDate(payload, 'exp');
  const nowSeconds = Math.floor(nowMs / 1000);

  if (issuer !== trust.issuer || !hasAudience(payload.aud, trust.audience)) {
    throw new UnauthenticatedError();
  }
  if (expiresAt <= nowSeconds) {
    throw new UnauthenticatedError();
  }
  if (payload.nbf !== undefined && requireNumericDate(payload, 'nbf') > nowSeconds) {
    throw new UnauthenticatedError();
  }

  return subject;
}

function isAlgorithm(value: unknown, allowed: readonly JwtAlgorithm[]): value is JwtAlgorithm {
  return typeof value === 'string' && allowed.includes(value as JwtAlgorithm);
}

function keyMatchesAlgorithm(key: Jwk, algorithm: JwtAlgorithm): boolean {
  if (key.alg !== undefined && key.alg !== algorithm) return false;
  if (key.use !== undefined && key.use !== 'sig') return false;
  if (key.key_ops !== undefined) {
    if (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify')) return false;
  }
  if (algorithm === 'ES256') return key.kty === 'EC' && key.crv === 'P-256';
  return key.kty === 'RSA';
}

function verifyCompactSignature(
  algorithm: JwtAlgorithm,
  signingInput: string,
  signature: Buffer,
  jwk: Jwk,
): boolean {
  let key;
  try {
    key = createPublicKey({ key: jwk as never, format: 'jwk' });
  } catch {
    throw new UnauthenticatedError();
  }

  const options = algorithm === 'ES256'
    ? { key, dsaEncoding: 'ieee-p1363' as const }
    : key;

  try {
    return verifySignature(
      'sha256',
      Buffer.from(signingInput, 'ascii'),
      options,
      signature,
    );
  } catch {
    return false;
  }
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JWKS_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new DependencyUnavailableError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DependencyUnavailableError) throw error;
    throw new DependencyUnavailableError();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export class JwtJwksAuthenticationEvidenceVerifier implements AuthenticationEvidenceVerifier {
  readonly #trust: JwtAuthenticationConfig;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => number;
  readonly #jwksCacheMs: number;
  readonly #jwksFetchTimeoutMs: number;
  #cache: CachedJwks | null = null;
  #lastForcedRefreshAt: number | null = null;

  constructor(options: JwtJwksVerifierOptions) {
    this.#trust = options.trust;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
    this.#jwksCacheMs = options.jwksCacheMs ?? DEFAULT_JWKS_CACHE_MS;
    this.#jwksFetchTimeoutMs = options.jwksFetchTimeoutMs ?? DEFAULT_JWKS_FETCH_TIMEOUT_MS;

    if (!Number.isInteger(this.#jwksCacheMs) || this.#jwksCacheMs < 0 || this.#jwksCacheMs > 600_000) {
      throw new TypeError('JWKS cache duration is outside the accepted range');
    }
    if (
      !Number.isInteger(this.#jwksFetchTimeoutMs)
      || this.#jwksFetchTimeoutMs < 100
      || this.#jwksFetchTimeoutMs > 30_000
    ) {
      throw new TypeError('JWKS fetch timeout is outside the accepted range');
    }
  }

  async verify(evidence: BearerAuthenticationEvidence): Promise<VerifiedExternalIdentity> {
    if (evidence.kind !== 'bearer' || evidence.token.length === 0 || evidence.token.length > MAX_TOKEN_LENGTH) {
      throw new UnauthenticatedError();
    }

    const parts = evidence.token.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw new UnauthenticatedError();
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
    const header = parseJsonObject(decodeBase64Url(encodedHeader));
    const payload = parseJsonObject(decodeBase64Url(encodedPayload));
    const signature = decodeBase64Url(encodedSignature);

    const algorithm = header.alg;
    const kid = requireString(header, 'kid');
    if (!isAlgorithm(algorithm, this.#trust.algorithms)) {
      throw new UnauthenticatedError();
    }
    if (header.jwk !== undefined || header.jku !== undefined || header.x5u !== undefined || header.crit !== undefined) {
      throw new UnauthenticatedError();
    }

    let key = await this.#findKey(kid, algorithm, false);
    if (key === null) {
      key = await this.#findKey(kid, algorithm, true);
    }
    if (key === null) {
      throw new UnauthenticatedError();
    }

    const validSignature = verifyCompactSignature(
      algorithm,
      `${encodedHeader}.${encodedPayload}`,
      signature,
      key,
    );
    if (!validSignature) {
      throw new UnauthenticatedError();
    }

    const subject = verifyClaims(payload, this.#trust, this.#now());
    return Object.freeze({ authority: this.#trust.issuer, subject });
  }

  async #findKey(kid: string, algorithm: JwtAlgorithm, forceRefresh: boolean): Promise<Jwk | null> {
    const keys = await this.#loadKeys(forceRefresh);
    const matches = keys.filter((key) => key.kid === kid && keyMatchesAlgorithm(key, algorithm));
    return matches.length === 1 ? matches[0]! : null;
  }

  async #loadKeys(forceRefresh: boolean): Promise<readonly Jwk[]> {
    const now = this.#now();
    if (!forceRefresh && this.#cache !== null && this.#cache.expiresAt > now) {
      return this.#cache.keys;
    }

    const forcedRefreshInterval = Math.max(this.#jwksCacheMs, MIN_FORCED_REFRESH_INTERVAL_MS);
    if (
      forceRefresh
      && this.#lastForcedRefreshAt !== null
      && now - this.#lastForcedRefreshAt < forcedRefreshInterval
    ) {
      return this.#cache?.keys ?? [];
    }
    if (forceRefresh) {
      this.#lastForcedRefreshAt = now;
    }

    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;

    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new DependencyUnavailableError());
      }, this.#jwksFetchTimeoutMs);
      timeout.unref();
    });

    let body: string;
    try {
      body = await Promise.race([
        (async () => {
          const response = await this.#fetch(this.#trust.jwksUrl, {
            method: 'GET',
            headers: { accept: 'application/json' },
            redirect: 'error',
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new DependencyUnavailableError();
          }
          return readBoundedResponseBody(response);
        })(),
        deadline,
      ]);
    } catch (error) {
      if (error instanceof DependencyUnavailableError) throw error;
      throw new DependencyUnavailableError();
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new DependencyUnavailableError();
    }
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as JsonObject).keys)) {
      throw new DependencyUnavailableError();
    }

    const keys = (parsed as { keys: unknown[] }).keys.filter(
      (entry): entry is Jwk => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    );
    if (keys.length === 0 || keys.length > 100) {
      throw new DependencyUnavailableError();
    }

    this.#cache = {
      keys: Object.freeze([...keys]),
      expiresAt: now + this.#jwksCacheMs,
    };
    return this.#cache.keys;
  }
}
