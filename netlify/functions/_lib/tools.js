// Tool definitions for Claude (text intake channel).
// Voice channel uses post-call Claude extraction, not runtime tools.

export const TOOLS = [
  {
    name: 'capture_answer',
    description:
      "Record a structured answer from the prospect. Call this generously — every meaningful piece of info the prospect shares should be captured. Rick's own words, lightly edited for clarity if needed.",
    input_schema: {
      type: 'object',
      properties: {
        objective_id: {
          type: 'string',
          description:
            "Objective identifier matching INTAKE_OBJECTIVES.md (e.g. 'pain_top_timeconsumers', 'pol_gaps', 'org_downline_size', 'vision_2yr', 'constraints_approvers').",
        },
        field: {
          type: 'string',
          description: "Short snake_case field name for this specific answer (e.g. 'downline_size', 'pol_gaps_summary').",
        },
        value: {
          type: 'string',
          description: "The answer in the prospect's own words, lightly edited only for clarity.",
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Your read on whether they answered directly (high) or hedged/deflected (low).',
        },
        notes: {
          type: 'string',
          description: 'Optional — any relevant framing, uncertainty, or context for Brad.',
        },
      },
      required: ['objective_id', 'field', 'value', 'confidence'],
    },
  },
  {
    name: 'flag_for_brad',
    description:
      'Surface something Brad needs to notice personally. Use for: numbers, names, concerns, champions, skeptics, urgency hints, emotional weight, commercial language, corporate mentions, past failures.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['commercial', 'constraint', 'sensitive', 'insight', 'concern', 'champion', 'skeptic', 'urgency', 'corporate', 'past_failure'],
          description: 'Category of flag.',
        },
        content: {
          type: 'string',
          description: "What the prospect said, verbatim or close to it.",
        },
        context: {
          type: 'string',
          description: 'Why this matters — your brief framing for Brad.',
        },
      },
      required: ['reason', 'content'],
    },
  },
  {
    name: 'skip_topic',
    description:
      'Mark a topic as skipped when the prospect defers, declines, or wants to save it for in-person. Never push back on a skip.',
    input_schema: {
      type: 'object',
      properties: {
        objective_id: { type: 'string' },
        reason: {
          type: 'string',
          description: "The prospect's phrasing or your brief paraphrase of why they skipped.",
        },
      },
      required: ['objective_id', 'reason'],
    },
  },
  {
    name: 'conclude_intake',
    description:
      'Call when the conversation is complete — either because all required objectives are covered, the prospect has indicated they are done, or time is up. Do NOT call this before wrapping up verbally.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['objectives_covered', 'rick_ready_to_end', 'out_of_time', 'technical_issue'],
        },
        summary: {
          type: 'string',
          description: '3-5 sentences capturing what the prospect shared, for Brad to read before the meeting.',
        },
      },
      required: ['reason', 'summary'],
    },
  },
];
