# GrowthOS Phase 2 Features

## Overview

This document catalogues every feature generated in Phase 2, with its definition, formula, data source, example, and purpose. All features use **integer minor units (paise)** for monetary values and **deterministic calculations** (no hidden stochasticity).

## Feature Catalogue

### Recency Features

#### `recencyDays`
- **Definition**: Number of days since the customer's most recent completed order.
- **Formula**: `days_between(now(), last_completed_order_date)`
- **Data Source**: `Order` table — find the most recent order for this customer where `status = COMPLETED`
- **Example**: `72` (customer hasn't purchased in 72 days)
- **Purpose**: Core RFM dimension — recency of purchase is the strongest predictor of repeat buying.

#### `daysSincePreviousPurchase`
- **Definition**: Days between this customer's most recent order and the one before it.
- **Formula**: `days_between(prev_completed_order_date, last_completed_order_date)`
- **Data Source**: `Order` table — order the customer's completed orders by date, take the gap between the top two
- **Example**: `14` (customer bought 14 days after their previous purchase)
- **Purpose**: Within-customer recency variation — detects accelerating or decelerating purchase patterns.

### Frequency Features

#### `frequencyTotal`
- **Definition**: Total number of completed orders placed by this customer.
- **Formula**: `count(completed_orders WHERE customerId = ?)`
- **Data Source**: `Order` table — `WHERE customerId = ? AND status = COMPLETED`
- **Example**: `8` (customer has 8 completed orders)
- **Purpose**: Core RFM dimension — how often the customer buys.

#### `purchaseFrequencyPerMonth`
- **Definition**: Number of orders per calendar month since the customer's first purchase.
- **Formula**: `frequencyTotal / months_between(first_order_date, now())` (if first_order_date exists, else 0)
- **Data Source**: `Order` table — first order date = `MIN(createdAt) WHERE customerId = ? AND status = COMPLETED`
- **Example**: `0.67` (8 orders over 12 months)
- **Purpose**: Normalises frequency by time period — enables comparison across customers with different tenures.

### Monetary Features

#### `monetaryTotal`
- **Definition**: Total spend across all completed orders, in paise (integer).
- **Formula**: `sum(amountMinor of completed_orders)`
- **Data Source**: `Order` table — `WHERE customerId = ? AND status = COMPLETED`, sum the `amountMinor` of associated payments, or derive from `totalMinor` on the order
- **Example**: `4280000` (= ₹42,800.00)
- **Purpose**: Core RFM dimension — total monetary value of the customer relationship.

#### `averageOrderValue`
- **Definition**: Mean order value across all completed orders, in paise.
- **Formula**: `monetaryTotal / frequencyTotal` (if `frequencyTotal > 0`, else 0)
- **Data Source**: Computed from `monetaryTotal` and `frequencyTotal`
- **Example**: `535000` (= ₹5,350.00)
- **Purpose**: Indicates the customer's typical basket size — useful for upsell/cross-sell targeting.

#### `monetaryPerMonth`
- **Definition**: Average monthly spend, in paise.
- **Formula**: `monetaryTotal / months_between(first_order_date, now())` (if first order exists, else 0)
- **Data Source**: Computed from `monetaryTotal` and tenure
- **Example**: `356667` (= ₹3,566.67 per month over 12 months)
- **Purpose**: Enables comparison across customers with different tenures.

### Derived Features

#### `aov` (alias for `averageOrderValue`)
- See `averageOrderValue` above. Kept as separate name for RFM compatibility.

#### `highValueFlag`
- **Definition**: Whether the customer's total spend meets or exceeds the merchant's high-value threshold.
- **Formula**: `monetaryTotal >= merchant_high_value_threshold`
- **Data Source**: `monetaryTotal` (computed) × `merchant.highValueThreshold` (configurable per merchant, default could be based on percentile of all customers' `monetaryTotal`)
- **Example**: `true` (customer has spend in the top 20% of this merchant's customers)
- **Purpose**: Quick segmentation flag — UI can flag "high-value" customers without re-running RFM.

#### `inactivityFlag`
- **Definition**: Whether the customer has been inactive beyond the merchant's inactivity threshold.
- **Formula**: `recencyDays >= merchant_inactivity_threshold`
- **Data Source**: `recencyDays` (computed) × `merchant.inactivityThreshold` (configurable per merchant, default could be 30, 60, or 90 days)
- **Example**: `true` (72 days since last purchase, threshold is 60)
- **Purpose**: Quick inactivity flag — UI can surface "at-risk" customers.

#### `categoryAffinity`
- **Definition**: The mode (most frequent) product categories purchased by this customer.
- **Formula**: `modes([product.category ORDER BY count(*) DESC] FROM order_items JOIN products ON order_items.productId = products.id WHERE order.order.customerId = ? AND order.status = COMPLETED)`
- **Data Source**: `OrderItem` JOIN `Product` — the customer's completed orders' products' categories
- **Example**: `["Footwear", "Apparel"]` (customer mostly buys shoes and clothes)
- **Purpose**: Enables category-specific recommendations (upsell/cross-sell within preferred categories).

### RFM Scoring Features

#### `rfmRecencyScore`
- **Definition**: Recency score on 1-5 scale (1 = very recency, 5 = very recent).
- **Formula**: 
  ```
  IF recencyDays > 365      THEN 1
  ELSE IF recencyDays > 180 THEN 2
  ELSE IF recencyDays > 90  THEN 3
  ELSE IF recencyDays > 30  THEN 4
  ELSE                       5
  ```
- **Purpose**: Normalises recency into an ordinal score for RFM combination.

#### `rfmFrequencyScore`
- **Definition**: Frequency score on 1-5 scale.
- **Formula**:
  ```
  IF frequencyTotal >= 20   THEN 5
  ELSE IF frequencyTotal >= 10 THEN 4
  ELSE IF frequencyTotal >= 5  THEN 3
  ELSE IF frequencyTotal >= 2  THEN 2
  ELSE                            1
  ```
- **Purpose**: Normalises frequency into an ordinal score for RFM combination.

#### `rfmMonetaryScore`
- **Definition**: Monetary score on 1-5 scale.
- **Formula**:
  ```
  IF monetaryTotal >= 1000000  THEN 5   // ₹10,000+
  ELSE IF monetaryTotal >= 100000  THEN 4   // ₹1,000-9,999
  ELSE IF monetaryTotal >= 10000   THEN 3   // ₹100-999
  ELSE IF monetaryTotal >= 1000    THEN 2   // <₹100
  ELSE                            1
  ```
- **Purpose**: Normalises monetary value into an ordinal score for RFM combination.

#### `rfmTotalScore`
- **Definition**: Sum of R + F + M scores (range 3-15).
- **Formula**: `rfmRecencyScore + rfmFrequencyScore + rfmMonetaryScore`
- **Purpose**: Single numeric RFM metric — higher = more valuable/active customer.

#### `rfmSegment`
- **Definition**: Business-named segment classification from RFM total.
- **Formula** (if `rfmTotalScore >= 13`: `HIGH_VALUE_LOYAL`
  else if `rfmTotalScore >= 11`: depends on individual scores — see segment definitions below)
  else if `rfmTotalScore >= 9`: 
    - if `rfmRecencyScore >= 4`: `ACTIVE_GROWING`
    - else: `LOW_ENGAGEMENT`
  else if `rfmTotalScore >= 7`:
    - if `rfmFrequencyScore >= 4 AND rfmMonetaryScore >= 4`: `HIGH_VALUE_INACTIVE`
    - else: `AT_RISK`
  else: `NEW_CUSTOMER` (if `rfmRecencyScore == 5` and `frequencyTotal == 1`)
  else: `LOW_ENGAGEMENT`
- **Purpose**: Human-readable segment classification — UI uses these names.

## Customer Intelligence Features

#### `customerSegment`
- **Definition**: High-level segment classification (same names as `rfmSegment` but possibly enriched with additional criteria).
- **Formula**: Same as `rfmSegment` logic, or enriched with `highValueFlag` and `inactivityFlag`:
  - if `highValueFlag && !inactivityFlag`: `HIGH_VALUE_LOYAL`
  - if `highValueFlag && inactivityFlag`: `HIGH_VALUE_INACTIVE`
  - if `!highValueFlag && !inactivityFlag && rfmTotalScore >= 9`: `ACTIVE_GROWING`
  - if `frequencyTotal == 1`: `NEW_CUSTOMER`
  - if `!highValueFlag && !inactivityFlag && rfmTotalScore <= 5`: `LOW_ENGAGEMENT`
  - if `!highValueFlag && inactivityFlag`: `AT_RISK`
  - else: `UNKNOWN`
- **Purpose**: UI-ready segment name — derived from RFM + flags for immediate understanding.

#### `daysSinceFirstPurchase`
- **Definition**: Calendar months (or days) since the customer's very first order.
- **Formula**: `months_between(first_order_date, now())` (or days version)
- **Data Source**: `Order` table — `MIN(createdAt) WHERE customerId = ? AND status = COMPLETED`
- **Example**: `14` (first purchase was 14 months ago)
- **Purpose**: Customer tenure — essential for normalising frequency/monetary.

#### `daysSinceLastPurchase`
- **Definition**: Alias for `recencyDays` (included for API consistency / clarity).
- **Formula**: Same as `recencyDays`
- **Purpose**: API consistency.

### Merchant Intelligence Features (Computed for the Merchant, Not Per-Customer)

#### `merchantHighValueThreshold`
- **Definition**: Paise amount that separates "high-value" from "regular" customers for this merchant.
- **Formula**: Configurable per merchant (could be based on percentiles of all customers' `monetaryTotal`; e.g., the 80th percentile).
- **Data Source**: Merchant config (not directly from database rows in Phase 2; could be stored as Merchant setting or computed on-the-fly)
- **Example**: `2000000` (= ₹200,000) — the top 20% of customers by spend
- **Purpose**: Enables `highValueFlag` per merchant.

#### `merchantInactivityThreshold`
- **Definition**: Days without purchase that classify a customer as "inactive" for this merchant.
- **Formula**: Configurable per merchant (e.g., 30, 60, or 90 days).
- **Data Source**: Merchant config
- **Example**: `60` (after 60 days without purchase, customer is "inactive")
- **Purpose**: Enables `inactivityFlag` per merchant.

## Opportunity Features (Detection Output)

#### `opportunityScore`
- **Definition**: Transparent 0-100 score for the opportunity.
- **Formula**: Weighted combination (see Opportunity Scorer documentation — Step 9)
- **Purpose**: Single numeric ranking for opportunities — higher = more actionable.

#### `opportunityType`
- **Definition**: Categorisation of the opportunity (see Opportunity Types, Step 7).
- **Formula**: Rule-based classification (see Opportunity Detection, Step 6).
- **Purpose**: Determines which strategy types are applicable.

#### `estimatedRevenueMinor`
- **Definition**: Estimated revenue impact if the recommended strategy is executed, in paise.
- **Formula**: `expectedConversions × expectedAOV` (see Strategy Calculations, Step 13)
- **Purpose**: Monetisable impact of the opportunity — must have documented formula.

#### `estimatedCostMinor`
- **Definition**: Estimated cost to implement the recommended strategy, in paise.
- **Formula**: `discountCost / campaignCost` or similar (see Strategy Calculations, Step 13)
- **Purpose**: Cost of pursuing the opportunity — must have documented formula.

#### `estimatedNetImpactMinor`
- **Definition**: `estimatedRevenueMinor - estimatedCostMinor`
- **Purpose**: The net financial impact — must have documented formula.

#### `estimatedROI`
- **Definition**: `estimatedNetImpactMinor / estimatedCostMinor` (if `estimatedCostMinor > 0`, else 0 or `null`)
- **Purpose**: Return-on-investment ratio — must have documented formula.

#### `confidence`
- **Definition**: How certain the system is about the opportunity's validity and estimated values.
- **Formula**: Weighted combination of evidence quality, historical conversion rate, and score components (see Opportunity Scorer, Step 9)
- **Purpose**: Indicates reliability — must be documented (not random).

#### `evidenceSummary`
- **Definition**: String summarising the top 3-5 feature values that drove the opportunity detection.
- **Formula**: Constructed from the top feature contributions (e.g., `"72 days inactive; AOV ₹1,842; 8 historical orders"`)
- **Purpose**: Human-readable explanation of *why* the opportunity was detected — must be derived from actual feature values, not hallucinated.

#### `affectedCustomerCount`
- **Definition**: Estimated number of customers this opportunity applies to.
- **Formula**: `count(distinct customerId) WHERE [opportunity-specific filter on customer features]`
- **Purpose**: Scale indicator — how many customers are impacted.

## Strategy Features (Generation Output)

#### `strategyName`
- **Definition**: Human-readable name of the strategy.
- **Formula**: One of: `DISCOUNT`, `BUNDLE`, `CROSS_SELL`, `UPSELL`, `REACTIVATION`, `PERSONALIZED_OFFER`
- **Purpose**: Identifies the strategy type.

#### `estimatedRevenueMinor`
- **Definition**: Same as opportunity's estimated revenue, strategy-specific.
- **Formula**: Strategy-specific calculation (see Step 13)
- **Purpose**: Revenue impact of this specific strategy.

#### `estimatedCostMinor`
- **Definition**: Same as opportunity's estimated cost, strategy-specific.
- **Formula**: Strategy-specific cost (see Step 13)
- **Purpose**: Cost of this specific strategy.

#### `estimatedNetImpactMinor`
- **Definition**: `estimatedRevenueMinor - estimatedCostMinor`
- **Purpose**: Net financial impact of this strategy.

#### `estimatedROI`
- **Definition**: `estimatedNetImpactMinor / estimatedCostMinor` (if cost > 0)
- **Purpose**: ROI ratio for ranking.

#### `riskLevel`
- **Definition**: `LOW` / `MEDIUM` / `HIGH`
- **Formula**: Based on confidence, historical evidence quality, and assumption fragility (see Step 15)
- **Purpose**: Risk indication for the merchant.

#### `assumptions`
- **Definition**: Explicitly listed assumptions (see Step 15)
- **Purpose**: Merchant can evaluate the strategy's validity.

#### `rationale`
- **Definition**: 2-3 sentence explanation of why this strategy was generated for this opportunity (see Step 12)
- **Purpose**: Explainability — merchant understands *why* this strategy was proposed.

## Data Storage Decisions

### Where Features Live

**Option A: Denormalized on Customer model** (simpler queries, slightly wider rows)
- Add JSON column `features` to `Customer` Prisma model
- Store: `{recencyDays, frequencyTotal, monetaryTotal, aov, highValueFlag, inactivityFlag, rfmTotalScore, rfmSegment, ...}`
- Advantage: Feature values pre-computed, fast reads
- Disadvantage: Need to recompute on every `analyze` run

**Option B: Compute on-the-fly via Service** (normalisation, always fresh)
- No new DB columns; service queries `Order`, `OrderItem`, `Product` each time
- Advantage: Always fresh; no migration needed
- Disadvantage: Slower reads; more complex service code

**Decision for Phase 2**: **Option B** (compute on-the-fly via Intelligence Service). 
- Phase 2 is about the intelligence pipeline, not database optimisation.
- Feature computation is part of the `analyze` flow.
- Keeps Prisma schema lean and avoids migration complexity in Phase 2.

### Where Opportunities Live

- Prisma `Opportunity` model — unchanged from Phase 1. Each opportunity is a row in the DB.
- New opportunities created during `analyze` run are upserted (idempotent, see Step 27).

### Where Strategies Live

- No new DB model needed in Phase 2. Strategies are generated in-memory during the `analyze` run and returned in the API response.
- If Phase 3 wants persistence, a `Strategy` model can be added later.

## Formula Documentation Rule

**Every single formula in this document must be**:
1. Written in plain mathematical notation + JavaScript-equivalent pseudo-code
2. Referenced by name in the code (function name matches feature name)
3. Documented in `/docs/PHASE_2_FEATURES.md`
4. Deterministic — same inputs always produce same outputs

**No formula may be**: "Ask an LLM", "use a random factor", or "undefined".

==================================================
PHASE_2_FEATURES.md — END
==================================================