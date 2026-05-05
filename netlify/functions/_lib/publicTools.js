// Tool definitions for the public "Talk to us" intake AI.
// Mirrors the shape of _lib/tools.js but with public-specific enums:
//   - flag_for_brad has new_vertical_pattern_fit + fit_strong/weak signals
//   - conclude_intake includes spam/low-engagement reasons + fit_read enum

export const PUBLIC_TOOLS = [
  {
    name: 'capture_answer',
    description:
      "Record a structured answer from the visitor. Call generously — every meaningful piece of info shared should be captured. Visitor's own words, lightly edited only for clarity.",
    input_schema: {
      type: 'object',
      properties: {
        objective_id: {
          type: 'string',
          description:
            "Objective identifier from public OBJECTIVES.md (e.g. 'who_business_type', 'whats_broken_top', 'vision_magic_tool', 'stakes_timeline').",
        },
        field: {
          type: 'string',
          description: "Short snake_case field name (e.g. 'business_type', 'team_size', 'pain_summary').",
        },
        value: {
          type: 'string',
          description: "The answer in the visitor's own words, lightly edited for clarity.",
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Your read on whether they answered directly (high) or hedged (low).',
        },
        notes: {
          type: 'string',
          description: 'Optional — any relevant framing or uncertainty for Brad.',
        },
      },
      required: ['objective_id', 'field', 'value', 'confidence'],
    },
  },

  {
    name: 'flag_for_brad',
    description:
      'Surface something Brad needs to see personally. Use generously for: numbers, urgency, strong/weak fit signals, concerns, competitor mentions, insights, and especially when a visitor describes a vertical Brad has not built for yet but the operator pattern clearly fits.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: [
            'commercial',
            'urgency',
            'fit_strong',
            'fit_weak',
            'concern',
            'competitor_mentioned',
            'insight',
            'new_vertical_pattern_fit',
          ],
          description:
            "Category of flag. 'new_vertical_pattern_fit' is special — use when the visitor's business is a vertical Brad hasn't built for yet but the pattern (independent operator, small team, drowning in coordination, underserved by enterprise tools) clearly applies. These tell Brad what to consider building next.",
        },
        content: {
          type: 'string',
          description: "What the visitor said, verbatim or close to it.",
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
      'Mark a topic as skipped when the visitor defers or declines. Never push back on a skip.',
    input_schema: {
      type: 'object',
      properties: {
        objective_id: { type: 'string' },
        reason: {
          type: 'string',
          description: "The visitor's phrasing or your brief paraphrase of why they skipped.",
        },
      },
      required: ['objective_id', 'reason'],
    },
  },

  {
    name: 'conclude_intake',
    description:
      'Call when the conversation is complete — either because objectives are covered, the visitor has indicated they are done, or the visitor is clearly not legitimate. Wrap verbally first (reflect what they said, set expectation that Brad will be in touch, ask if there is anything you should have asked) THEN call this tool.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: [
            'objectives_covered',
            'visitor_ready_to_end',
            'out_of_time',
            'no_email',
            'low_engagement',
            'not_legitimate',
          ],
          description:
            "Why the conversation ended. Default to 'objectives_covered' or 'visitor_ready_to_end' for any real conversation that produced real signal — even if the visitor admitted to testing, is a friend of Brad's, or revealed at the end they're not the actual operator. 'low_engagement' = real person but answers were too thin to be useful (one-word replies, no business detail). 'not_legitimate' = ONLY use for: obvious spam, bot submissions, vendors pitching their services AT us, recruiter outreach, or hostile/abusive content. NEVER use 'not_legitimate' for visitors who admit to testing or who turn out to be Brad himself — those are valid intakes that produced valid signal.",
        },
        summary: {
          type: 'string',
          description: '3-5 sentences capturing what the visitor shared, for Brad to read before reaching out.',
        },
        fit_read: {
          type: 'string',
          enum: ['strong', 'possible', 'weak', 'not_a_fit', 'unclear'],
          description:
            'Your overall read on whether this visitor matches the ClearPath operator pattern. strong = clearly fits, possible = plausible, weak = unlikely fit, not_a_fit = wrong shape entirely, unclear = couldn\'t tell.',
        },
      },
      required: ['reason', 'summary', 'fit_read'],
    },
  },
];
