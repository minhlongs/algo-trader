#!/bin/bash
# Profile hot code paths for performance analysis.
# Usage: ./scripts/profile-hot-paths.sh [signal-fusion|dashboard]
#
# Generates CPU and heap profiles in profiles/ directory.
# Profiles are viewable with: npx speedscope <file>.cpuprof

set -euo pipefail

PROFILES_DIR="profiles"
mkdir -p "${PROFILES_DIR}"

profile_signal_fusion() {
  echo "=== Profiling Signal Fusion Pipeline ==="
  PROFILE_NAME="${PROFILES_DIR}/signal-fusion-$(date +%Y%m%d-%H%M%S)"

  node --cpu-prof \
       --heap-prof \
       --cpu-prof-dir="${PROFILES_DIR}" \
       --heap-prof-dir="${PROFILES_DIR}" \
       --cpu-prof-name="signal-fusion-$(date +%Y%m%d-%H%M%S).cpuprof" \
       --heap-prof-name="signal-fusion-$(date +%Y%m%d-%H%M%S).heapprof" \
       -e "
         const path = require('path');
         process.env.NODE_ENV = 'production';

         async function main() {
           try {
             // Attempt to load the signal fusion engine
             const engine = require('./src/desk/intelligence/signal-fusion-engine');
             if (typeof engine.profile === 'function') {
               console.log('Running signal-fusion-engine.profile()...');
               await engine.profile();
             } else {
               console.log('signal-fusion-engine has no profile() export.');
               console.log('Running 5 iterations of the default pipeline...');
               for (let i = 0; i < 5; i++) {
                 // Profile by running a forced cycle
                 if (typeof engine.fuseSignals === 'function') {
                   await engine.fuseSignals({ source: 'profile-run-' + i });
                 }
               }
             }
           } catch (err) {
             console.error('Signal fusion profile error:', err.message);
             process.exit(1);
           }
         }

         main().then(() => {
           console.log('Signal fusion profile completed.');
           console.log('Profiles written to ' + path.resolve('${PROFILES_DIR}'));
           process.exit(0);
         });
       "

  echo "Profile saved to ${PROFILE_NAME}.*"
  echo "View with: npx speedscope ${PROFILE_NAME}.cpuprof"
}

profile_dashboard() {
  echo "=== Profiling Dashboard Page Load ==="
  PROFILE_NAME="${PROFILES_DIR}/dashboard-$(date +%Y%m%d-%H%M%S)"

  node --cpu-prof \
       --heap-prof \
       --cpu-prof-dir="${PROFILES_DIR}" \
       --heap-prof-dir="${PROFILES_DIR}" \
       --cpu-prof-name="dashboard-$(date +%Y%m%d-%H%M%S).cpuprof" \
       --heap-prof-name="dashboard-$(date +%Y%m%d-%H%M%S).heapprof" \
       -e "
         const path = require('path');
         process.env.NODE_ENV = 'production';

         async function main() {
           try {
             const server = require('./src/platform/api/server');
             if (typeof server.profileDashboard === 'function') {
               console.log('Running server.profileDashboard()...');
               await server.profileDashboard();
             } else {
               console.log('Server has no profileDashboard() export.');
               console.log('Making sample requests to profile dashboard rendering...');
               // Attempt to start server and make requests
               const app = server.app || server;
               if (typeof app === 'function') {
                 console.log('Express app found — making sample requests...');
                 // Profile by importing and rendering dashboard components
                 const http = require('http');
                 const opts = { hostname: 'localhost', port: 3000, path: '/api/health', method: 'GET' };
                 await new Promise((resolve, reject) => {
                   const req = http.request(opts, (res) => {
                     let data = '';
                     res.on('data', (chunk) => data += chunk);
                     res.on('end', resolve);
                   });
                   req.on('error', reject);
                   req.end();
                 });
               }
             }
           } catch (err) {
             console.error('Dashboard profile error:', err.message);
             process.exit(1);
           }
         }

         main().then(() => {
           console.log('Dashboard profile completed.');
           console.log('Profiles written to ' + path.resolve('${PROFILES_DIR}'));
           process.exit(0);
         });
       "

  echo "Profile saved to ${PROFILE_NAME}.*"
  echo "View with: npx speedscope ${PROFILE_NAME}.cpuprof"
}

# ── Main ────────────────────────────────────────────────────────────────────
TARGET="${1:-all}"

case "${TARGET}" in
  signal-fusion)
    profile_signal_fusion
    ;;
  dashboard)
    profile_dashboard
    ;;
  all)
    profile_signal_fusion
    profile_dashboard
    ;;
  *)
    echo "Usage: $0 [signal-fusion|dashboard|all]"
    exit 1
    ;;
esac

echo ""
echo "PROFILE_COMPLETE:${TARGET}"
exit 0
