// SPDX-License-Identifier: MIT
/**
 * Open-Core 25-Step Catalog — Phase 5 (Steps 21 to 25: PLG Growth & Governance)
 * Extracted from `catalog-phases-4-to-5.ts` for <80 LOC modularity.
 */

import type { OpenCoreStep } from './catalog';

export const OPEN_CORE_STEPS_21_TO_25: readonly OpenCoreStep[] = [
  {
    stepNumber: 21,
    id: 'sixty-second-quickstart-cli',
    name: '60-Second Quickstart CLI',
    phase: 'PHASE_5_PLG_GROWTH_AND_GOVERNANCE',
    targetModule: 'src/commands/cli-builder.ts',
    minTier: 'BASIC',
    isOssCore: true,
    descriptionEn: 'Zero-config onboarding: git clone -> npm install -> algo-trader setup in < 60s.',
    descriptionVi: 'Khởi động thần tốc trong 60 giây: clone repo -> npm install -> chạy setup.',
  },
  {
    stepNumber: 22,
    id: 'cli-http402-upgrade-prompt',
    name: 'CLI HTTP 402 Upgrade Prompt',
    phase: 'PHASE_5_PLG_GROWTH_AND_GOVERNANCE',
    targetModule: 'src/desk/commands/opencore-saas.ts',
    minTier: 'BASIC',
    isOssCore: true,
    descriptionEn: 'Native in-terminal upgrade prompt with direct checkout URL on quota depletion.',
    descriptionVi: 'Thông báo nâng cấp hiển thị trực tiếp trong terminal kèm link thanh toán khi hết quota.',
  },
  {
    stepNumber: 23,
    id: 'ci-loc-and-secret-gate',
    name: 'CI LOC & Secret Leak Gate',
    phase: 'PHASE_5_PLG_GROWTH_AND_GOVERNANCE',
    targetModule: '.github/workflows/ci.yml',
    minTier: 'BASIC',
    isOssCore: true,
    descriptionEn: 'Automated CI enforcement: < 200 LOC per file, 0 :any types, 0 secret leaks.',
    descriptionVi: 'Cổng CI tự động: bắt buộc mỗi file < 200 dòng, không kiểu any, không rò rỉ secret.',
  },
  {
    stepNumber: 24,
    id: 'public-backtest-leaderboard',
    name: 'Public Backtest Leaderboard',
    phase: 'PHASE_5_PLG_GROWTH_AND_GOVERNANCE',
    targetModule: 'docs/backtest-leaderboard.md',
    minTier: 'BASIC',
    isOssCore: true,
    descriptionEn: 'Reproducible Monte Carlo & walk-forward performance badges on GitHub README.',
    descriptionVi: 'Bảng xếp hạng hiệu suất Monte Carlo có thể tái lập công khai trên README GitHub.',
  },
  {
    stepNumber: 25,
    id: 'cla-and-dual-license-governance',
    name: 'CLA & Dual-License Governance',
    phase: 'PHASE_5_PLG_GROWTH_AND_GOVERNANCE',
    targetModule: 'CLA.md',
    minTier: 'ENTERPRISE',
    isOssCore: true,
    descriptionEn: 'Contributor License Agreement preserving IP rights and dual-license commercial terms.',
    descriptionVi: 'Thỏa thuận đóng góp mã nguồn CLA bảo vệ quyền sở hữu trí tuệ và giấy phép kép.',
  },
];
