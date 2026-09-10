import type { ReviewRepository } from './repositories';
import type { IMarketplaceReview } from '../models/types';

export async function createReview(
  data: {
    strategyId: string;
    tenantId: string;
    userId: string;
    rating: number;
    comment: string;
  },
  reviewRepo: ReviewRepository,
): Promise<IMarketplaceReview> {
  const id = `rev_${Date.now()}_${data.userId.slice(0, 8)}`;
  return reviewRepo.create({
    id,
    tenantId: data.tenantId,
    strategyId: data.strategyId,
    subscriptionId: '',
    rating: data.rating,
    comment: data.comment,
    isVerified: true,
  });
}

export async function getReview(
  id: string,
  reviewRepo: ReviewRepository,
): Promise<IMarketplaceReview | null> {
  return reviewRepo.findById(id);
}

export async function markReviewHelpful(
  id: string,
  reviewRepo: ReviewRepository,
): Promise<IMarketplaceReview | null> {
  reviewRepo.incrementHelpful(id);
  return reviewRepo.findById(id);
}

export async function flagReview(
  id: string,
  reviewRepo: ReviewRepository,
): Promise<IMarketplaceReview | null> {
  reviewRepo.incrementReported(id);
  return reviewRepo.update(id, { isFlagged: true });
}
