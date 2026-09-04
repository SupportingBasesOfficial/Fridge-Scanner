import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PROTECTED_PACKAGES = [
  {
    name: '@fridge/domain',
    directory: path.join(ROOT, 'packages/domain/src'),
    allowedWorkspaceImports: new Set(),
  },
  {
    name: '@fridge/application',
    directory: path.join(ROOT, 'packages/application/src'),
    allowedWorkspaceImports: new Set(['@fridge/domain']),
  },
];

const FORBIDDEN_EXTERNAL_PREFIXES = [
  'fastify',
  'pg',
  'zod',
  '@supabase/',
  '@aws-sdk/',
  '@google-cloud/',
  '@azure/',
  'node:process',
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:cluster',
  'node:worker_threads',
];

const TEST_FILE_PATTERN = /(?:\.test|\.spec|\.typecheck)\.ts$/;
const IMPORT_PATTERN = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !TEST_FILE_PATTERN.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function isForbiddenExternal(specifier) {
  return FORBIDDEN_EXTERNAL_PREFIXES.some((prefix) =>
    specifier === prefix || specifier.startsWith(`${prefix}/`),
  );
}

function validateImport(packageRule, file, specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;

  if (specifier.startsWith('@fridge/')) {
    if (packageRule.allowedWorkspaceImports.has(specifier)) return null;
    return `${packageRule.name} must not import workspace dependency ${specifier}`;
  }

  if (isForbiddenExternal(specifier)) {
    return `${packageRule.name} must not import infrastructure/runtime dependency ${specifier}`;
  }

  return `${packageRule.name} production code must not import undeclared external dependency ${specifier}`;
}

const violations = [];

for (const packageRule of PROTECTED_PACKAGES) {
  for (const file of await walk(packageRule.directory)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const violation = validateImport(packageRule, file, specifier);
      if (violation !== null) {
        violations.push(`${path.relative(ROOT, file)}: ${violation}`);
      }
    }

    if (/\bprocess\s*\./.test(source)) {
      violations.push(`${path.relative(ROOT, file)}: protected production code must not read process globals`);
    }
  }
}

if (violations.length > 0) {
  console.error('BE-01 dependency boundary violations:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('BE-01 dependency boundaries: CLEAN');
}
