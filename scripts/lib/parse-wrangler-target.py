#!/usr/bin/env python3
"""
parse-wrangler-target.py

Parses wrangler.toml using tomli/tomllib to resolve target environment configuration:
- Worker name
- Routes
- D1 Database bindings
- KV Namespace bindings
- Vars

Outputs JSON representation of the resolved target configuration.
"""

import sys
import json
import os

try:
    import tomllib  # Python 3.11+
except ImportError:
    try:
        import tomli as tomllib  # Fallback
    except ImportError:
        sys.stderr.write("FATAL: Neither tomllib nor tomli is available.\n")
        sys.exit(1)

def resolve_target(config_path: str, target_env: str) -> dict:
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, "rb") as f:
        doc = tomllib.load(f)

    if target_env == "production" or target_env == "default":
        env_block = {}
        worker_name = doc.get("name", "")
        account_id = doc.get("account_id")
        routes = [r.get("pattern", "") for r in doc.get("routes", []) if isinstance(r, dict)]
        d1_databases = doc.get("d1_databases", [])
        kv_namespaces = doc.get("kv_namespaces", [])
        vars_dict = doc.get("vars", {})
    else:
        env_block = doc.get("env", {}).get(target_env)
        if env_block is None:
            raise ValueError(f"Environment [env.{target_env}] block not found in {config_path}")

        # Worker name: overrides top-level if present, else defaults to top-level
        worker_name = env_block.get("name", doc.get("name", ""))

        # Account ID: env.CLOUDFLARE_ACCOUNT_ID overrides if explicitly passed (can be empty string to test missing account)
        if "CLOUDFLARE_ACCOUNT_ID" in os.environ:
            env_acct = os.environ["CLOUDFLARE_ACCOUNT_ID"].strip()
            account_id = env_acct if env_acct else None
        else:
            account_id = env_block.get("account_id", doc.get("account_id"))

        # Routes: In wrangler, routes are NOT merged. If specified in env block, it overrides top-level.
        # If env omits routes, top-level routes are inherited!
        if "routes" in env_block:
            routes = env_block["routes"]
        else:
            routes = [r.get("pattern", "") for r in doc.get("routes", []) if isinstance(r, dict)]

        # D1 databases: in wrangler environments, d1_databases is NOT inherited unless explicitly defined in env
        # But if declared under env, use env; otherwise empty list
        d1_databases = env_block.get("d1_databases", [])
        kv_namespaces = env_block.get("kv_namespaces", [])
        vars_dict = env_block.get("vars", {})

    resolved_account_id = account_id or None

    return {
        "targetEnv": target_env,
        "workerName": worker_name,
        "accountId": resolved_account_id,
        "routes": routes,
        "d1Databases": d1_databases,
        "kvNamespaces": kv_namespaces,
        "vars": vars_dict
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: parse-wrangler-target.py <path-to-wrangler.toml> <target_env>\n")
        sys.exit(1)

    try:
        res = resolve_target(sys.argv[1], sys.argv[2])
        print(json.dumps(res, indent=2))
    except Exception as e:
        sys.stderr.write(f"ERROR: {e}\n")
        sys.exit(1)
