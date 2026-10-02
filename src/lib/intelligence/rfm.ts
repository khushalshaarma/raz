/**
 * RFM (Recency, Frequency, Monetary) scoring module
 * All calculations are deterministic — same inputs always produce same outputs
 * No LLM involvement in scoring computations
 */

import { prisma } from "@/lib/prisma";
import { getCustomerRecency } from "@/lib/intelligence/features/recency";
import { getCustomerFrequency } from "@/lib/intelligence/features/frequency";
import { getCustomerMonetary } from "@/lib/intelligence/features/monetary";

/** RFM score on 1-5 scale for each dimension */
export type RfmScore = 1 | 2 | 3 | 4 | 5;

/** Full RFM computation result */
export interface RfmFeatures {
  recencyDays: number;
  rfmRecencyScore: RfmScore;
  frequencyTotal: number;
  rfmFrequencyScore: RfmScore;
  monetaryTotal: number;
  rfmMonetaryScore: RfmScore;
  rfmTotalScore: number; // 3-15
  rfmSegment: RfmSegment;
  computedAt: Date;
}

/** RFM segment classification */
export type RfmSegment =
  | "HIGH_VALUE_LOYAL"
  | "HIGH_VALUE_INACTIVE"
  | "ACTIVE_GROWING"
  | "NEW_CUSTOMER"
  | "LOW_ENGAGEMENT"
  | "AT_RISK";

/**
 * Compute RFM recency score (1-5)
 * 1 = >365 days (very stale)
 * 5 = <30 days (very recent)
 */
function computeRfmRecencyScore(recencyDays: number): RfmScore {
  if (recencyDays > 365) return 1;
  if (recencyDays > 180) return 2;
  if (recencyDays > 90) return 3;
  if (recencyDays > 30) return 4;
  return 5;
}

/**
 * Compute RFM frequency score (1-5)
 * 1 = 1 order only
 * 5 = 20+ orders
 */
function computeRfmFrequencyScore(frequencyTotal: number): RfmScore {
  if (frequencyTotal >= 20) return 5;
  if (frequencyTotal >= 10) return 4;
  if (frequencyTotal >= 5) return 3;
  if (frequencyTotal >= 2) return 2;
  return 1;
}

/**
 * Compute RFM monetary score (1-5)
 * 1 = <₹1,000 (paise: <100000)
 * 5 = ₹10,000+ (paise: >=1000000)
 */
function computeRfmMonetaryScore(monetaryTotal: number): RfmScore {
  if (monetaryTotal >= 1000000) return 5; // ₹10,000+
  if (monetaryTotal >= 100000) return 4; // ₹1,000-9,999
  if (monetaryTotal >= 10000) return 3; // ₹100-999
  if (monetaryTotal >= 1000) return 2; // <₹100
  return 1;
}

/**
 * Classify RFM segment from total score and individual dimensions
 *
 * Segment rules (deterministic, no LLM):
 * - HIGH_VALUE_LOYAL: total >= 13 (any combination of 5s)
 * - HIGH_VALUE_INACTIVE: recency 1-2, frequency 3-5, monetary 4-5
 * - ACTIVE_GROWING: total >= 9 AND recency >= 4
 * - NEW_CUSTOMER: recency 5 AND frequency 1 (just purchased, low spend yet)
 * - LOW_ENGAGEMENT: total <= 5
 * - AT_RISK: recency 1, frequency 3-5, monetary 3-5
 */
function classifyRfmSegment(
  rfmTotalScore: number,
  rfmRecencyScore: RfmScore,
  rfmFrequencyScore: RfmScore,
  rfmMonetaryScore: RfmScore
): RfmSegment {
  // HIGH_VALUE_LOYAL: total >= 13
  if (rfmTotalScore >= 13) return "HIGH_VALUE_LOYAL";

  // HIGH_VALUE_INACTIVE: R=1-2, F=3-5, M=4-5
  if (rfmRecencyScore <= 2 && rfmFrequencyScore >= 3 && rfmMonetaryScore >= 4)
    return "HIGH_VALUE_INACTIVE";

  // ACTIVE_GROWING: total >= 9 AND recency >= 4
  if (rfmTotalScore >= 9 && rfmRecencyScore >= 4) return "ACTIVE_GROWING";

  // NEW_CUSTOMER: R=5, F=1 (just purchased, low spend yet)
  if (rfmRecencyScore === 5 && rfmFrequencyScore === 1) return "NEW_CUSTOMER";

  // LOW_ENGAGEMENT: total <= 5
  if (rfmTotalScore <= 5) return "LOW_ENGAGEMENT";

  // AT_RISK: R=1, F=3-5, M=3-5
  if (rfmRecencyScore === 1 && rfmFrequencyScore >= 3 && rfmMonetaryScore >= 3)
    return "AT_RISK";

  // Default fallback
  return "LOW_ENGAGEMENT";
}

/**
 * Compute full RFM features for a customer
 */
export async function computeRfmFeatures(
  customerId: string,
  merchantId: string
): Promise<RfmFeatures> {
  // Get recency features
  const recency = await getCustomerRecency(customerId, merchantId);

  // Get frequency features
  const frequency = await getCustomerFrequency(customerId, merchantId);

  // Get monetary features
  const monetary = await getCustomerMonetary(customerId, merchantId);

  // Compute RFM scores
  const rfmRecencyScore = computeRfmRecencyScore(recency.recencyDays);
  const rfmFrequencyScore = computeRfmFrequencyScore(frequency.frequencyTotal);
  const rfmMonetaryScore = computeRfmMonetaryScore(monetary.monetaryTotal);
  const rfmTotalScore = rfmRecencyScore + rfmFrequencyScore + rfmMonetaryScore; // 3-15

  return {
    recencyDays: recency.recencyDays,
    rfmRecencyScore,
    frequencyTotal: frequency.frequencyTotal,
    rfmFrequencyScore,
    monetaryTotal: monetary.monetaryTotal,
    rfmMonetaryScore,
    rfmTotalScore,
    rfmSegment: classifyRfmSegment(
      rfmTotalScore,
      rfmRecencyScore,
      rfmFrequencyScore,
      rfmMonetaryScore
    ),
    computedAt: new Date(),
  };
}

/**
 * Classify customer segment from RFM + flags
 *
 * Derived from RFM segment + highValueFlag + inactivityFlag:
 * - highValueFlag && !inactivityFlag → HIGH_VALUE_LOYAL
 * - highValueFlag && inactivityFlag → HIGH_VALUE_INACTIVE
 * - !highValueFlag && !inactivityFlag && rfmTotalScore >= 9 → ACTIVE_GROWING
 * - frequencyTotal == 1 → NEW_CUSTOMER
 * - !highValueFlag && !inactivityFlag && rfmTotalScore <= 5 → LOW_ENGAGEMENT
 * - !highValueFlag && inactivityFlag → AT_RISK
 * - else → UNKNOWN
 */
export function classifyCustomerSegment(
  rfmSegment: RfmSegment,
  highValueFlag: boolean,
  inactivityFlag: boolean,
  frequencyTotal: number,
  rfmTotalScore: number
): string {
  if (highValueFlag && !inactivityFlag) return "HIGH_VALUE_LOYAL";
  if (highValueFlag && inactivityFlag) return "HIGH_VALUE_INACTIVE";
  if (!highValueFlag && !inactivityFlag && rfmTotalScore >= 9) return "ACTIVE_GROWING";
  if (frequencyTotal === 1) return "NEW_CUSTOMER";
  if (!highValueFlag && !inactivityFlag && rfmTotalScore <= 5) return "LOW_ENGAGEMENT";
  if (!highValueFlag && inactivityFlag) return "AT_RISK";
  return "UNKNOWN";
}