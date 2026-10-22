// SPDX-License-Identifier: MIT
/**
 * Governance probes, part 1 — quarantine, env template, license/SBOM, OpenAPI spec.
 *
 * These steps point at documents and config, so the risk is a probe that rubber-stamps whatever
 * it reads. Every probe is exercised against the real repository AND against a stub whose claim
 * is broken, so a probe that cannot detect its own gap fails this suite.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  probeEnvTemplate,
  probeLicenseAndSbom,
  probeOpenApiSpec,
  probeQuarantineLock,
} from '../step-governance-probes';

/** Tests live in src/desk/opencoresaas2026monetization/__tests__ — four levels to the repo root. */
const REPO_ROOT = path.resolve(__dirname, '../../../../');

const cleanups: string[] = [];

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-probe-'));
  cleanups.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('quarantine lock (step 3)', () => {
  it('reports the real repository as not quarantining key material', () => {
    // The repo genuinely omits PEM and wallet patterns; that gap must surface, not be hidden.
    const result = probeQuarantineLock(REPO_ROOT);
    expect(result.verified).toBe(false);
    expect(result.evidence).toMatch(/PEM|wallet/i);
  });

  it('verifies a .gitignore that quarantines the material', () => {
    const dir = tmpRepo();
    fs.writeFileSync(
      path.join(dir, '.gitignore'),
      ['.env', '.env.*', '*.pem', 'id_rsa', 'wallet*', '*.keystore'].join('\n'),
    );

    expect(probeQuarantineLock(dir).verified).toBe(true);
  });

  it('fails a .gitignore that only lists .env', () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');

    const result = probeQuarantineLock(dir);
    expect(result.verified).toBe(false);
    expect(result.evidence).toContain('*.pem');
  });
});

describe('env template (step 4)', () => {
  it('verifies the real .env.example documents many keys', () => {
    expect(probeEnvTemplate(REPO_ROOT).verified).toBe(true);
  });

  it('fails a template that declares almost nothing', () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, '.env.example'), 'FOO=bar\n');

    expect(probeEnvTemplate(dir).verified).toBe(false);
  });

  it('fails a template carrying a live-looking key', () => {
    const dir = tmpRepo();
    const keys = Array.from({ length: 25 }, (_, i) => `KEY_${i}=`).join('\n');
    fs.writeFileSync(
      path.join(dir, '.env.example'),
      `${keys}\nAPI_KEY=sk-abcdefghijklmnopqrstuvwxyz012345\n`,
    );

    expect(probeEnvTemplate(dir).verified).toBe(false);
  });
});

describe('MIT license and SBOM (step 5)', () => {
  it('reports the real repository as lacking an SBOM', () => {
    const result = probeLicenseAndSbom(REPO_ROOT);
    expect(result.verified).toBe(false);
    expect(result.evidence).toMatch(/SBOM/);
  });

  it('verifies when both the license and an SBOM exist', () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License\n');
    fs.writeFileSync(path.join(dir, 'sbom.cdx.json'), '{"bomFormat":"CycloneDX"}\n');

    expect(probeLicenseAndSbom(dir).verified).toBe(true);
  });

  it('fails when the license is absent', () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'sbom.cdx.json'), '{"bomFormat":"CycloneDX"}\n');

    expect(probeLicenseAndSbom(dir).verified).toBe(false);
  });
});

describe('OpenAPI spec (step 10)', () => {
  it('verifies the real spec declares a version and documents paths', () => {
    expect(probeOpenApiSpec(REPO_ROOT).verified).toBe(true);
  });

  it('fails a spec with no paths', () => {
    const dir = tmpRepo();
    fs.mkdirSync(path.join(dir, 'docs', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs/api/openapi.yaml'),
      'openapi: 3.0.3\ninfo:\n  title: x\npaths: {}\n',
    );

    expect(probeOpenApiSpec(dir).verified).toBe(false);
  });

  it('fails a spec that declares no version', () => {
    const dir = tmpRepo();
    fs.mkdirSync(path.join(dir, 'docs', 'api'), { recursive: true });
    const paths = Array.from({ length: 12 }, (_, i) => `  /p${i}:\n    get: {}`).join('\n');
    fs.writeFileSync(path.join(dir, 'docs/api/openapi.yaml'), `info:\n  title: x\npaths:\n${paths}`);

    expect(probeOpenApiSpec(dir).verified).toBe(false);
  });
});
