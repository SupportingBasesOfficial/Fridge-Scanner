import { z } from 'zod';

const databaseCapabilityRoleSchema = z.enum([
  'fridge_app',
  'fridge_worker',
  'fridge_readonly',
]);

const jwtAlgorithmSchema = z.enum(['ES256', 'RS256']);

const runtimeConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).url(),
  DATABASE_CAPABILITY_ROLE: databaseCapabilityRoleSchema.default('fridge_app'),
  HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
  AUTH_JWT_ISSUER: z.string().min(1).url().optional(),
  AUTH_JWT_AUDIENCE: z.string().min(1).optional(),
  AUTH_JWT_JWKS_URL: z.string().min(1).url().optional(),
  AUTH_JWT_ALGORITHMS: z.string().min(1).optional(),
}).superRefine((value, context) => {
  const authValues = [
    value.AUTH_JWT_ISSUER,
    value.AUTH_JWT_AUDIENCE,
    value.AUTH_JWT_JWKS_URL,
    value.AUTH_JWT_ALGORITHMS,
  ];
  const configuredCount = authValues.filter((entry) => entry !== undefined).length;

  if (configuredCount !== 0 && configuredCount !== authValues.length) {
    context.addIssue({
      code: 'custom',
      path: ['AUTH_JWT_ISSUER'],
      message: 'JWT trust configuration must be either fully absent or fully specified',
    });
  }

  if (
    value.NODE_ENV === 'production'
    && value.AUTH_JWT_JWKS_URL !== undefined
    && !value.AUTH_JWT_JWKS_URL.startsWith('https://')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['AUTH_JWT_JWKS_URL'],
      message: 'production JWKS URL must use HTTPS',
    });
  }
});

export type DatabaseCapabilityRole = z.infer<typeof databaseCapabilityRoleSchema>;
export type JwtAlgorithm = z.infer<typeof jwtAlgorithmSchema>;

export interface JwtAuthenticationConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl: string;
  readonly algorithms: readonly JwtAlgorithm[];
}

export interface RuntimeConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly databaseUrl: string;
  readonly databaseCapabilityRole: DatabaseCapabilityRole;
  readonly httpHost: string;
  readonly httpPort: number;
  readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly shutdownTimeoutMs: number;
  readonly authentication: JwtAuthenticationConfig | null;
}

export class RuntimeConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid runtime configuration: ${issues.join('; ')}`);
    this.name = 'RuntimeConfigError';
    this.issues = issues;
  }
}

function parseJwtAlgorithms(value: string): readonly JwtAlgorithm[] {
  const candidates = value.split(',');
  const algorithms: JwtAlgorithm[] = [];

  for (const candidate of candidates) {
    if (candidate.length === 0 || candidate !== candidate.trim()) {
      throw new RuntimeConfigError([
        'AUTH_JWT_ALGORITHMS: algorithms must be comma-separated without whitespace',
      ]);
    }

    const parsed = jwtAlgorithmSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new RuntimeConfigError([
        'AUTH_JWT_ALGORITHMS: only ES256 and RS256 are permitted',
      ]);
    }
    if (algorithms.includes(parsed.data)) {
      throw new RuntimeConfigError([
        'AUTH_JWT_ALGORITHMS: duplicate algorithms are not permitted',
      ]);
    }
    algorithms.push(parsed.data);
  }

  if (algorithms.length === 0) {
    throw new RuntimeConfigError(['AUTH_JWT_ALGORITHMS: at least one algorithm is required']);
  }

  return Object.freeze(algorithms);
}

export function parseRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = runtimeConfigSchema.safeParse(env);

  if (!parsed.success) {
    throw new RuntimeConfigError(
      parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `${path}: ${issue.message}`;
      }),
    );
  }

  const authentication = parsed.data.AUTH_JWT_ISSUER === undefined
    ? null
    : Object.freeze({
      issuer: parsed.data.AUTH_JWT_ISSUER,
      audience: parsed.data.AUTH_JWT_AUDIENCE!,
      jwksUrl: parsed.data.AUTH_JWT_JWKS_URL!,
      algorithms: parseJwtAlgorithms(parsed.data.AUTH_JWT_ALGORITHMS!),
    });

  return Object.freeze({
    nodeEnv: parsed.data.NODE_ENV,
    databaseUrl: parsed.data.DATABASE_URL,
    databaseCapabilityRole: parsed.data.DATABASE_CAPABILITY_ROLE,
    httpHost: parsed.data.HTTP_HOST,
    httpPort: parsed.data.HTTP_PORT,
    logLevel: parsed.data.LOG_LEVEL,
    shutdownTimeoutMs: parsed.data.SHUTDOWN_TIMEOUT_MS,
    authentication,
  });
}
