import type { WalkthroughScenario } from '@/types';

export const multiTurnScenario: WalkthroughScenario = {
  id: 'multi-turn',
  type: 'multi-turn',
  title: 'Multi-Turn Conversation Evaluation',
  description:
    'Evaluate responses in the context of a conversation history. Essential for chatbots and conversational AI where context matters.',
  steps: [
    {
      id: 'mt-1',
      title: 'Input: Load Conversation History',
      description:
        'Load the full conversation history along with the current query. The history provides essential context that influences how responses should be evaluated.',
      highlightElements: ['input'],
      dataState: {
        input: 'Conversation history loaded',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'mt-2',
      title: 'Process: Build Context',
      description:
        'The system constructs the full context by combining conversation history with the current query. This context is crucial for accurate evaluation.',
      highlightElements: ['input', 'process'],
      dataState: {
        input: 'History + Query',
        processing: 'Building full context',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'mt-3',
      title: 'Process: Context-Aware Response',
      description:
        'The AI model receives the full context and generates a response that should be coherent with the conversation history and address the current query.',
      highlightElements: ['process'],
      dataState: {
        processing: 'Generating context-aware response',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'mt-4',
      title: 'Judge: Evaluate in Context',
      description:
        'The LLM judge evaluates the response considering the full conversation. It checks for consistency with previous exchanges, context retention, and appropriate follow-up.',
      highlightElements: ['process', 'judge'],
      dataState: {
        processing: 'Response ready',
        output: 'Evaluating with context...',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'mt-5',
      title: 'Judge: Assess Conversation Quality',
      description:
        'Additional metrics specific to conversations: Context Coherence, Topic Continuity, Reference Resolution, and Memory (recalling earlier information).',
      highlightElements: ['judge'],
      dataState: {
        output: 'Checking conversation flow',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'mt-6',
      title: 'Output: Conversation Metrics',
      description:
        'Results include both standard quality metrics and conversation-specific metrics. Identify if your model loses context, contradicts itself, or fails to maintain coherent dialogue.',
      highlightElements: ['judge', 'output'],
      dataState: {
        output: 'Context Coherence 0.88, Memory 0.85',
      },
      animationType: 'flow',
      duration: 2000,
    },
  ],
  exampleData: {
    query: 'What about its population?',
    actualOutput:
      'Paris has a population of approximately 2.1 million people in the city proper, while the greater Paris metropolitan area is home to over 12 million people, making it one of the largest urban areas in Europe.',
    conversation: [
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'The capital of France is Paris.' },
      { role: 'user', content: 'What about its population?' },
    ],
  },
  flowNodes: [
    { id: 'input', type: 'input', label: 'History', position: { x: 20, y: 70 } },
    { id: 'process', type: 'process', label: 'Context', position: { x: 170, y: 70 } },
    { id: 'judge', type: 'judge', label: 'Judge', position: { x: 320, y: 70 } },
    { id: 'output', type: 'output', label: 'Metrics', position: { x: 470, y: 70 } },
  ],
  flowEdges: [
    { id: 'e1', source: 'input', target: 'process', label: 'context', animated: true },
    { id: 'e2', source: 'process', target: 'judge', animated: true },
    { id: 'e3', source: 'judge', target: 'output', animated: true },
  ],
};
