# GrowthOS Phase 10A — AI/LLM Provider Abstraction

## Why This Exists

GrowthOS currently uses deterministic business logic for all AI agents (Opportunity, Strategy, Simulation, Decision, Security, Governance, Execution, Observation, Learning). While functional, this limits the system's ability to:

1. Understand natural language queries from merchants and AI buyers
2. Generate nuanced product recommendations
3. Reason about complex multi-step commerce scenarios
4. Scale intelligence beyond hardcoded rules

This phase introduces a **provider abstraction layer** that allows GrowthOS to swap between AI backends without changing the application architecture.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  AI PROVIDER ABSTRACTION                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AI Request (natural language)                          │
│       ↓                                                 │
│  ┌─────────────┐                                        │
│  │ Sanitizer   │  ← Filters secrets, prompt injection   │
│  └──────┬──────┘                                        │
│         ↓                                               │
│  ┌─────────────┐                                        │
│  │ Provider    │  ← select based on AI_PROVIDER env var  │
│  │ Factory     │                                        │
│  └──────┬──────┘                                        │
│         ↓                                               │
│  ┌─────────────┐                                        │
│  │ Provider    │  ← deterministic OR openai              │
│  │ Interface   │                                        │
│  │             │                                        │
│  │ generateStructured<T>()          │                    │
│  │ validateOutput<T>()              │                    │
│  └──────┬──────┘                                        │
│         ↓                                               │
│  ┌─────────────┐                                        │
│  │ AI Proposal │  ← Structured, validated output        │
│  │ Validator   │  ← Ensures schema compliance           │
│  └──────┬──────┘                                        │
│         ↓                                               │
│  ┌─────────────┐                                        │
│  │ Policy      │  ← AI proposal cannot directly execute │
│  │ Boundary    │    payment, refunds, or database writes│
│  └─────────────┘                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Provider Types

### Deterministic Provider (Default)

- **When**: No `OPENAI_API_KEY` configured, or `AI_PROVIDER=deterministic`
- **Behavior**: Returns structured proposals based on internal business rules and catalog data
- **Use case**: Development, testing, production without LLM costs
- **Guarantee**: Always works, no external dependencies

### OpenAI Provider

- **When**: `AI_PROVIDER=openai` and `OPENAI_API_KEY` is set
- **Behavior**: Uses OpenAI API to generate structured JSON proposals
- **Use case**: Enhanced natural language understanding, complex reasoning
- **Guardrails**: Prompt injection filtering, output validation, no direct execution

## Security Model

### LLM Output is Untrusted Input

All AI-generated output is treated as untrusted and must pass through validation before being used:

1. **Schema Validation**: Every AI proposal must have valid `intent`, `action`, `confidence`, `requiresApproval`, `reasoningSummary`
2. **Direct Execution Prevention**: AI proposals with actions like `DIRECT_PAYMENT`, `RAZORPAY_EXECUTE`, `ISSUE_REFUND` are rejected
3. **Input Sanitization**: AI requests are sanitized to remove secrets and prompt injection attempts
4. **No Secret Exposure**: AI providers never receive Razorpay keys, JWT secrets, or database credentials

### What AI Can Never Do

- ❌ Directly create Razorpay orders
- ❌ Directly issue refunds
- ❌ Directly modify merchant policies
- ❌ Directly mutate the database
- ❌ Access secrets through prompts
- ❌ Bypass RBAC or governance

### What AI Can Do

- ✅ Generate structured product discovery proposals
- ✅ Recommend products based on criteria
- ✅ Explain reasoning (short summary only)
- ✅ Propose purchase actions for human review
- ✅ Pass proposals through existing validation/policy/approval pipeline

## Configuration

### Environment Variables

```env
# AI Provider Selection
# Values: deterministic | openai
# Default: deterministic
AI_PROVIDER=deterministic

# OpenAI Configuration (only needed when AI_PROVIDER=openai)
OPENAI_API_KEY=          # Never commit real values
OPENAI_MODEL=gpt-4o-mini
OPENAI_ORG_ID=           # Optional

# AI Generation Parameters
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=2048
```

### Feature Flags

The existing `FEATURE_LLM` flag in `src/lib/config/features.ts` controls LLM feature activation. The new `AI_PROVIDER` flag controls which provider is active.

## Flow

### No API Key → Deterministic Fallback

```
No OPENAI_API_KEY
    ↓
AI_PROVIDER defaults to "deterministic"
    ↓
initializeAIProvider() creates deterministic provider
    ↓
Application continues working normally
```

### API Key → OpenAI Provider

```
OPENAI_API_KEY is set
    ↓
AI_PROVIDER=openai
    ↓
initializeAIProvider() creates OpenAI provider
    ↓
LLM generates structured proposals
    ↓
Proposals pass validation → Policy → Approval → Execution
```

## Integration with Existing Architecture

### Agent System Compatibility

The AI provider abstraction is designed to work alongside the existing 9-agent system:

- Existing agents use `Agent` interface (`execute(input, context) → AgentOutput`)
- AI provider uses `AIProvider` interface (`generateStructured<T>(prompt, schema) → AIProviderResult<T>`)
- AI proposals can feed into existing `AgentProposalData` structures
- Growth cycles can optionally use AI providers for enhanced intelligence

### Execution Pipeline

```
AI Proposal
    ↓
Validation (src/lib/ai/validator.ts)
    ↓
Policy Engine (src/lib/governance/policy-engine.ts) — existing, unchanged
    ↓
Approval Engine (src/lib/governance/approval-engine.ts) — existing, unchanged
    ↓
Execution Service (src/lib/execution/execution-service.ts) — existing, unchanged
    ↓
Razorpay Provider (src/lib/execution/providers/razorpay/) — existing, unchanged
```

**No existing system is modified.** The AI layer is additive.

## Future: AI Buyer (Phase 10B)

The AI provider abstraction enables the following future architecture:

```
AI Buyer (external agent)
    ↓
Queries merchant catalog via AI-readable API
    ↓
AI Provider generates structured proposal
    ↓
Proposal validated against merchant policies
    ↓
Human approval (if required)
    ↓
Order creation via existing execution pipeline
    ↓
Razorpay checkout
    ↓
Webhook → Reconciliation → Outcome → Learning
```

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/ai/types.ts` | AI types: AIRequest, AIResponse, AIProposal, AIProvider, AIProviderResult, AIReasoningMetadata, AIConfidence |
| `src/lib/ai/config.ts` | AI configuration, provider selection, env var parsing |
| `src/lib/ai/provider.ts` | AIProvider interface, factory, registry |
| `src/lib/ai/providers/deterministic.ts` | Deterministic fallback provider with prompt sanitization |
| `src/lib/ai/providers/openai.ts` | OpenAI provider with structured output generation |
| `src/lib/ai/validator.ts` | AI output validation, direct execution prevention, input sanitization |
| `src/lib/ai/index.ts` | Public exports and provider initialization |
| `tests/ai/ai-provider.test.ts` | Provider config, validation, sanitization tests |
| `tests/ai/ai-registry.test.ts` | Provider registry and initialization tests |
| `docs/PHASE_10_AI_ARCHITECTURE.md` | This document |

## Files Modified

| File | Change |
|------|--------|
| `src/lib/config/env.ts` | Added AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_ORG_ID, AI_TEMPERATURE, AI_MAX_TOKENS env vars |
| `src/lib/config/features.ts` | Added AI_PROVIDER to FeatureFlags |
| `package.json` | Added openai dependency |

## Tests

Run with: `npm test` or `npx vitest run`

Test files:
- `tests/ai/ai-provider.test.ts` — 20+ tests covering config defaults, deterministic provider, validation, sanitization
- `tests/ai/ai-registry.test.ts` — 5+ tests covering provider registry and initialization

All existing Phase 1-9 tests must continue passing.

## Safety Guarantees

1. **No API key required**: Application works with `AI_PROVIDER=deterministic` and no OpenAI credentials
2. **No secrets exposed**: AI providers never receive Razorpay keys, JWT secrets, or database credentials
3. **No direct execution**: AI proposals cannot directly trigger payment, refund, or database mutations
4. **All output validated**: Every AI response must pass structural validation before being used
5. **Fallback guaranteed**: If OpenAI fails to initialize, deterministic provider is used
6. **Existing code untouched**: Phases 1-9 are completely unchanged
