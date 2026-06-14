'use strict';

function buildLocalAiFallback(account) {
  const topPage = account.top_pages?.[0]?.label || 'the website';
  const stage = account.buying_stage || 'Awareness';
  const focus = Object.entries(account.interest_scores || {})
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'customer service AI';

  return {
    summary: `${account.name} shows ${stage.toLowerCase()}-stage interest based on ${account.total_sessions} sessions from ${account.unique_ips} identified visitor${account.unique_ips === 1 ? '' : 's'}. The strongest observed signal is engagement with ${topPage}, with highest product interest around ${focus}.`,
    stage_rationale: `The ${stage} stage is inferred from the mix of pages visited, recency, and depth of activity in the parsed weblog sessions.`,
    recommendations: [
      {
        title: `Lead with ${focus}`,
        body: `Open outreach around ${focus} because it is the strongest interest area in this account's observed web activity.`,
        priority: 'high',
      },
      {
        title: 'Reference recent site behavior',
        body: `Mention the recent engagement with ${topPage} and connect it to a practical customer service outcome.`,
        priority: 'medium',
      },
      {
        title: 'Confirm evaluation priorities',
        body: 'Ask which contact center, knowledge, or self-service initiatives are active this quarter before pitching a specific package.',
        priority: 'medium',
      },
    ],
    email: {
      subject: `${account.name} and ${focus}`,
      body: `Hi,\n\nI noticed recent interest from ${account.name} around ${focus} and related eGain content. Teams looking at these topics are often evaluating ways to improve service accuracy, agent productivity, and customer self-service.\n\nWould it be useful to compare what you are seeing today with how eGain customers approach this?\n\nBest,`,
    },
    generatedAt: Date.now(),
    isDefault: true,
  };
}

module.exports = { buildLocalAiFallback };
