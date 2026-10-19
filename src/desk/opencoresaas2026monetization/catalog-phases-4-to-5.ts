// SPDX-License-Identifier: MIT
/**
 * Open-Core 25-Step Catalog — Phases 4 to 5 (Steps 16 to 25)
 *
 * @module desk/opencoresaas2026monetization/catalog-phases-4-to-5
 */

import type { OpenCoreStep } from './catalog';
import { OPEN_CORE_STEPS_21_TO_25 } from './catalog-phase-5';

export * from './catalog-phase-5';

export const OPEN_CORE_STEPS_16_TO_20: readonly OpenCoreStep[] = [
  {
    stepNumber: 16,
    id: 'multi-tenant-rbac-isolation',
    name: 'Multi-Tenant RBAC Isolation',
    phase: 'PHASE_4_ENTERPRISE_MONETIZATION',
    targetModule: 'src/desk/subscriber-tenant-isolator.ts',
    minTier: 'ENTERPRISE',
    isOssCore: false,
    descriptionEn: 'Cryptographic tenant context partitioning and strict role-based access control.',
    descriptionVi: 'Cách ly dữ liệu tenant nhiều người dùng và kiểm soát truy cập dựa trên vai trò RBAC.',
  },
  {
    stepNumber: 17,
    id: 'immutable-compliance-audit-log',
    name: 'Immutable Compliance Audit Log',
    phase: 'PHASE_4_ENTERPRISE_MONETIZATION',
    targetModule: 'src/desk/security/audit-logger.ts',
    minTier: 'ENTERPRISE',
    isOssCore: false,
    descriptionEn: 'Append-only SHA-256 hash-chained compliance audit trail for automated trades.',
    descriptionVi: 'Sổ nhật ký kiểm toán tuân thủ bất biến gắn chuỗi băm SHA-256 cho giao dịch tự động.',
  },
  {
    stepNumber: 18,
    id: 'autonomous-24x7-desk-daemon',
    name: 'Autonomous 24/7 Desk Daemon',
    phase: 'PHASE_4_ENTERPRISE_MONETIZATION',
    targetModule: 'src/desk/commands/desk-auto.ts',
    minTier: 'PREMIUM',
    isOssCore: false,
    descriptionEn: 'Hosted 24/7 autonomous execution engine with Telegram @Sophia_Bbot alert bridge.',
    descriptionVi: 'Daemon thực thi tự động 24/7 trên đám mây kết nối thông báo Telegram @Sophia_Bbot.',
  },
  {
    stepNumber: 19,
    id: 'strategy-marketplace-revshare',
    name: 'Strategy Marketplace & RevShare',
    phase: 'PHASE_4_ENTERPRISE_MONETIZATION',
    targetModule: 'src/desk/strategies/marketplace.ts',
    minTier: 'ENTERPRISE',
    isOssCore: false,
    descriptionEn: 'Curated quantitative strategy marketplace with automated 70/30 creator rev-share.',
    descriptionVi: 'Chợ chiến lược định lượng có kiểm duyệt với cơ chế chia sẻ doanh thu 70/30 cho tác giả.',
  },
  {
    stepNumber: 20,
    id: 'nowpayments-payos-ipn-webhook',
    name: 'Crypto & Fiat IPN Webhooks',
    phase: 'PHASE_4_ENTERPRISE_MONETIZATION',
    targetModule: 'src/billing/ipn-webhook.ts',
    minTier: 'PREMIUM',
    isOssCore: false,
    descriptionEn: 'NOWPayments USDT & PayOS instant tier activation (Strictly No Polar per Sophia rules).',
    descriptionVi: 'Kích hoạt gói tức thì qua NOWPayments USDT và PayOS (Tuyệt đối không dùng Polar).',
  },
];

export const OPEN_CORE_STEPS_16_TO_25: readonly OpenCoreStep[] = [
  ...OPEN_CORE_STEPS_16_TO_20,
  ...OPEN_CORE_STEPS_21_TO_25,
];
