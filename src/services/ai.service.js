const { query } = require('../config/database');

// ─── Get AI Settings for a Business ───────────────────────────
const getAISettings = async (businessId) => {
  const result = await query(
    `SELECT * FROM ai_settings WHERE business_id = $1`,
    [businessId]
  );

  if (result.rows.length === 0) {
    // Return sensible defaults if no settings exist
    return {
      personality: 'friendly',
      languages: ['English'],
      greeting_message: 'Hi! Welcome. How can I help you today?',
      away_message: 'We are currently away. We will respond as soon as possible.',
      min_price_percentage: 80,
      max_discount: 10,
      max_negotiation_rounds: 3,
      handoff_keywords: ['speak to human', 'agent', 'representative', 'manager'],
      business_hours: {},
      auto_follow_up: true,
      follow_up_delay: 24,
      is_active: true,
      knowledge_base: '',
      qa_pairs: []
    };
  }

  return result.rows[0];
};

// ─── Build System Prompt from AI Settings ──────────────────────
const buildSystemPrompt = (settings, businessName) => {
  const personalityMap = {
    friendly: 'friendly, warm, and helpful',
    professional: 'professional, formal, and precise',
    casual: 'casual, conversational, and relatable',
    pidgin: 'using Nigerian Pidgin English (mix of Pidgin and English naturally)'
  };

  const languages = Array.isArray(settings.languages)
    ? settings.languages.join(', ')
    : (typeof settings.languages === 'string' ? settings.languages : 'English');

  const handoffKeywords = Array.isArray(settings.handoff_keywords)
    ? settings.handoff_keywords
    : (typeof settings.handoff_keywords === 'string'
      ? JSON.parse(settings.handoff_keywords)
      : ['speak to human', 'agent']);

  const qaPairs = Array.isArray(settings.qa_pairs)
    ? settings.qa_pairs
    : (typeof settings.qa_pairs === 'string' ? JSON.parse(settings.qa_pairs) : []);

  let qaContext = '';
  if (qaPairs.length > 0) {
    const qaText = qaPairs.map(pair => `Q: ${pair.question}\nA: ${pair.answer}`).join('\n\n');
    qaContext = `\n\nKnown Q&A:\n${qaText}`;
  }

  return `You are an AI sales agent for ${businessName}.
Be ${personalityMap[settings.personality] || 'friendly, warm, and helpful'}.
Language: ${languages}.
Business hours: ${JSON.stringify(settings.business_hours || {})}.
Max discount you can offer: ${settings.max_discount || 10}%.
Never go below ${settings.min_price_percentage || 80}% of the listed price.
Max negotiation rounds: ${settings.max_negotiation_rounds || 3}.
If the customer asks to speak to a human or uses keywords like: ${handoffKeywords.join(', ')}, politely acknowledge and escalate to a human agent.
${settings.knowledge_base ? `Business knowledge: ${settings.knowledge_base}` : ''}${qaContext}
Keep responses concise and conversational (under 150 words).
Do not make up product prices or details not provided to you.`;
};

// ─── Default Response (no OpenAI) ─────────────────────────────
const getDefaultResponse = (message) => {
  const lower = message.toLowerCase();

  if (lower.includes('price') || lower.includes('how much') || lower.includes('cost') || lower.includes('naira')) {
    return "Thank you for your interest! Please check our product catalog for pricing, or tell me which specific item you're interested in and I'll get the details for you.";
  }
  if (lower.includes('order') || lower.includes('buy') || lower.includes('purchase')) {
    return "Great! I'd love to help you place an order. Which product are you interested in? You can also browse our catalog for more options.";
  }
  if (lower.includes('available') || lower.includes('stock') || lower.includes('in stock')) {
    return "Let me check availability for you. Which product would you like to know about?";
  }
  if (lower.includes('deliver') || lower.includes('shipping') || lower.includes('location')) {
    return "We deliver across Nigeria. Delivery times and costs vary by location. What area are you located in?";
  }
  if (lower.includes('discount') || lower.includes('promo') || lower.includes('deal') || lower.includes('cheap')) {
    return "We occasionally have promotions! Let me know which product you're interested in and I can check if there are any current deals.";
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('good')) {
    return "Hello! Welcome. I'm here to help you with any questions about our products or services. What can I help you with today?";
  }
  if (lower.includes('thank')) {
    return "You're welcome! Is there anything else I can help you with?";
  }

  return "Thank you for reaching out! How can I help you today? Feel free to ask about our products, pricing, or availability.";
};

// ─── Generate AI Response ──────────────────────────────────────
const generateAIResponse = async (businessId, conversationHistory, newMessage, businessName) => {
  try {
    const settings = await getAISettings(businessId);

    // Check for handoff triggers before calling AI
    const rawKeywords = settings.handoff_keywords;
    const handoffKeywords = Array.isArray(rawKeywords)
      ? rawKeywords
      : (typeof rawKeywords === 'string' ? JSON.parse(rawKeywords) : ['speak to human', 'agent']);

    const needsHandoff = handoffKeywords.some(kw =>
      newMessage.toLowerCase().includes(kw.toLowerCase())
    );

    if (needsHandoff) {
      return {
        response: "Of course! I'm connecting you with a human agent right now. Please hold on — someone from our team will be with you shortly.",
        handoff: true
      };
    }

    // Use OpenAI if key is set
    if (process.env.OPENAI_API_KEY) {
      try {
        const { OpenAI } = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const systemPrompt = buildSystemPrompt(settings, businessName);

        const messages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-10).map(m => ({
            role: m.sender === 'customer' ? 'user' : 'assistant',
            content: m.content
          })),
          { role: 'user', content: newMessage }
        ];

        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages,
          max_tokens: 200,
          temperature: 0.7
        });

        const response = completion.choices[0].message.content;

        // Double-check response for handoff triggers
        const responseNeedsHandoff = handoffKeywords.some(kw =>
          newMessage.toLowerCase().includes(kw.toLowerCase())
        );

        return { response, handoff: responseNeedsHandoff };
      } catch (openAiError) {
        console.error('OpenAI API error, falling back to default response:', openAiError.message);
        return { response: getDefaultResponse(newMessage), handoff: false };
      }
    }

    // Fallback: template-based response
    return { response: getDefaultResponse(newMessage), handoff: false };
  } catch (error) {
    console.error('AI service error:', error);
    return { response: getDefaultResponse(newMessage), handoff: false };
  }
};

module.exports = { generateAIResponse, getAISettings, buildSystemPrompt };
