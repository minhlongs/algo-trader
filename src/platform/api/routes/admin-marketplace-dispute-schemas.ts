import { z } from 'zod';

export const resolveDisputeSchema = z.object({
  resolution: z.string().min(10).max(5000),
  compensationType: z.enum(['full_refund', 'partial_refund', 'credit', 'none']).optional(),
  compensationAmountCents: z.number().int().min(0).optional(),
  adminNotes: z.string().max(5000).optional(),
});

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const disputeFilterSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed']).optional(),
});

export type DisputeFilterInput = z.infer<typeof disputeFilterSchema>;
