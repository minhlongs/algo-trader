import { logger } from '../../utils/logger';
import { AuditLogService } from '../../audit/audit-log-service';
import { DisputeRepository, disputeRepository, SubscriptionRepository, subscriptionRepository } from './repositories';
import type { IMarketplaceDispute } from '../models/types';

export class DisputeService {
  private static instance: DisputeService;
  private disputeRepo: DisputeRepository;
  private subRepo: SubscriptionRepository;
  private auditService: AuditLogService;

  private constructor() {
    this.disputeRepo = disputeRepository;
    this.subRepo = subscriptionRepository;
    this.auditService = AuditLogService.getInstance();
  }

  static getInstance(): DisputeService {
    if (!DisputeService.instance) {
      DisputeService.instance = new DisputeService();
    }
    return DisputeService.instance;
  }

  async fileDispute(data: {
    tenantId: string;
    listingId: string;
    subscriptionId: string;
    reason: string;
    description: string;
    evidenceUrls?: string[];
  }): Promise<IMarketplaceDispute> {
    const id = `disp_${Date.now()}_${data.tenantId.slice(0, 8)}`;
    return this.disputeRepo.create({
      id,
      tenantId: data.tenantId,
      listingId: data.listingId,
      subscriptionId: data.subscriptionId,
      reason: data.reason as any,
      description: data.description,
      evidenceUrls: data.evidenceUrls,
    });
  }

  async getDispute(id: string): Promise<IMarketplaceDispute | null> {
    return this.disputeRepo.findById(id);
  }

  async listDisputes(
    tenantId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ): Promise<{
    data: IMarketplaceDispute[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const result = await this.disputeRepo.findAll({ tenantId, status: filters?.status });
    return {
      data: result.data,
      total: result.total,
      page: filters?.page || 1,
      limit: filters?.limit || 20,
      totalPages: result.totalPages,
    };
  }

  async listAllDisputes(filters?: { status?: string; page?: number; limit?: number }): Promise<{
    data: IMarketplaceDispute[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const result = await this.disputeRepo.findAll({ status: filters?.status });
    return {
      data: result.data,
      total: result.total,
      page: filters?.page || 1,
      limit: filters?.limit || 50,
      totalPages: result.totalPages,
    };
  }

  async getSubscriptionForDispute(subscriptionId: string): Promise<any | null> {
    return this.subRepo.findById(subscriptionId);
  }

  async resolveDispute(
    id: string,
    data: {
      resolution: string;
      compensationType: string;
      compensationAmountCents?: number;
      resolvedBy: string;
      adminNotes?: string;
    },
  ): Promise<IMarketplaceDispute | null> {
    return this.disputeRepo.update(id, {
      status: 'resolved_subscriber' as any,
      resolution: data.resolution,
      compensationType: data.compensationType as any,
      compensationAmountCents: data.compensationAmountCents,
      resolvedBy: data.resolvedBy,
      resolvedAt: new Date(),
      adminNotes: data.adminNotes,
    });
  }

  async escalateDispute(id: string, adminId: string): Promise<IMarketplaceDispute | null> {
    return this.disputeRepo.update(id, { status: 'escalated' as any });
  }
}
