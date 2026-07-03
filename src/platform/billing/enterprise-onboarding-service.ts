/**
 * Enterprise Onboarding Service
 * Orchestrates the full enterprise inquiry flow:
 *   1. Validate + store inquiry
 *   2. Notify TAM
 *   3. Auto-provision paper-trading demo
 *   4. Return credentials to caller
 *
 * Pricing: $49k (growth) / $199k (scale) / $499k (unlimited) — invoice only.
 * Polar.sh is NOT used for enterprise; checkout is handled offline by TAM.
 */

import { enterpriseInquiryStore, EnterpriseTier, EnterpriseInquiry } from './enterprise-inquiry-store';
import { notifyTam } from './enterprise-tam-notifier';
import { provisionPaperDemo, PaperDemoCredentials } from './enterprise-paper-demo-provisioner';
import { logger } from '../../shared/utils/logger';

export interface SubmitEnterpriseInquiryInput {
  email: string;
  companyName: string;
  contactName: string;
  tier: EnterpriseTier;
  useCase: string;
  teamSize?: string;
}

export interface SubmitEnterpriseInquiryResult {
  inquiryId: string;
  status: 'received';
  paperDemo: PaperDemoCredentials | null;
  message: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateInput(input: SubmitEnterpriseInquiryInput): void {
  if (!validateEmail(input.email)) throw new Error('Invalid email address');
  if (!input.companyName.trim()) throw new Error('Company name is required');
  if (!input.contactName.trim()) throw new Error('Contact name is required');
  if (!['growth', 'scale', 'unlimited'].includes(input.tier)) {
    throw new Error('Invalid enterprise tier. Must be growth, scale, or unlimited');
  }
  if (!input.useCase.trim() || input.useCase.trim().length < 20) {
    throw new Error('Use case description must be at least 20 characters');
  }
}

export class EnterpriseOnboardingService {
  private static instance: EnterpriseOnboardingService;

  static getInstance(): EnterpriseOnboardingService {
    if (!EnterpriseOnboardingService.instance) {
      EnterpriseOnboardingService.instance = new EnterpriseOnboardingService();
    }
    return EnterpriseOnboardingService.instance;
  }

  /**
   * Submit a new enterprise inquiry.
   * Validates input, persists inquiry, notifies TAM, provisions paper demo.
   */
  async submitInquiry(input: SubmitEnterpriseInquiryInput): Promise<SubmitEnterpriseInquiryResult> {
    validateInput(input);

    // Prevent duplicate submissions (same email + active inquiry)
    const existing = enterpriseInquiryStore
      .getByEmail(input.email.trim().toLowerCase())
      .filter((i) => !['closed_won', 'closed_lost'].includes(i.status));

    if (existing.length > 0) {
      throw new Error('An open enterprise inquiry already exists for this email. Our team will be in touch.');
    }

    const inquiry = enterpriseInquiryStore.create({
      email: input.email.trim().toLowerCase(),
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      tier: input.tier,
      useCase: input.useCase.trim(),
      teamSize: input.teamSize?.trim(),
    });

    logger.info('[EnterpriseOnboarding] Inquiry submitted', {
      inquiryId: inquiry.id,
      tier: inquiry.tier,
      company: inquiry.companyName,
    });

    // Notify TAM (non-blocking failure)
    const tamNotified = await notifyTam(inquiry);
    if (tamNotified) {
      enterpriseInquiryStore.update(inquiry.id, { status: 'tam_notified' });
    }

    // Provision paper demo (non-blocking failure)
    const paperDemo = await provisionPaperDemo(inquiry);
    if (paperDemo) {
      enterpriseInquiryStore.update(inquiry.id, {
        paperdemoProvisioned: true,
        paperdemoKey: paperDemo.demoKey,
        status: 'demo_active',
      });
    }

    return {
      inquiryId: inquiry.id,
      status: 'received',
      paperDemo,
      message: 'Inquiry received. Our team will contact you within 24 hours.',
    };
  }

  /** Retrieve a single inquiry by ID (for TAM dashboard). */
  getInquiry(id: string): EnterpriseInquiry | undefined {
    return enterpriseInquiryStore.getById(id);
  }

  /** List all inquiries (TAM dashboard). */
  listInquiries(): EnterpriseInquiry[] {
    return enterpriseInquiryStore.list();
  }

  /** Update inquiry status or TAM assignment. */
  updateInquiry(
    id: string,
    patch: Partial<Pick<EnterpriseInquiry, 'status' | 'tamAssigned' | 'notes'>>,
  ): EnterpriseInquiry | undefined {
    return enterpriseInquiryStore.update(id, patch);
  }
}
