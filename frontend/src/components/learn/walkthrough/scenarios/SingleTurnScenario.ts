import type { WalkthroughScenario } from '@/types';

export const singleTurnScenario: WalkthroughScenario = {
  id: 'single-turn',
  type: 'single-turn',
  title: 'Single Turn Evaluation',
  description:
    'The most basic evaluation type: assessing a single query-response pair without reference to previous context or expected output.',
  steps: [
    {
      id: 'st-1',
      title: 'Input: Load Test Data',
      description:
        'The evaluation begins by loading a test case containing a query and the AI-generated response. This is the minimum data needed for single-turn evaluation.',
      highlightElements: ['input'],
      dataState: {
        input: 'Query + Actual Output loaded',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'st-2',
      title: 'Process: Send to AI Model',
      description:
        'The test query is sent to your AI model (if generating responses) or the existing response is prepared for evaluation.',
      highlightElements: ['input', 'process'],
      dataState: {
        input: 'Query ready',
        processing: 'Generating/preparing response',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'st-3',
      title: 'Judge: Evaluate Response',
      description:
        'An LLM judge analyzes the response against the query. It assesses quality dimensions like relevance, accuracy, helpfulness, and clarity without needing a reference answer.',
      highlightElements: ['process', 'judge'],
      dataState: {
        processing: 'Response generated',
        output: 'Judge analyzing...',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'st-4',
      title: 'Output: Receive Scores',
      description:
        'The judge returns metric scores with explanations. Common metrics include Relevance, Coherence, Fluency, and Helpfulness. Each score comes with a detailed explanation.',
      highlightElements: ['judge', 'output'],
      dataState: {
        output: 'Scores: Relevance 0.85, Helpfulness 0.90',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'st-5',
      title: 'Complete: Analysis Ready',
      description:
        'The evaluation is complete. Results are stored for analysis, visualization, and comparison. You can now explore score distributions and identify patterns.',
      highlightElements: ['output'],
      dataState: {
        output: 'Evaluation complete!',
      },
      animationType: 'fade',
      duration: 2000,
    },
  ],
  exampleData: {
    query: 'What are the benefits of regular exercise?',
    actualOutput:
      'Regular exercise offers numerous benefits including improved cardiovascular health, stronger muscles and bones, better mental health, weight management, and increased energy levels. It can also reduce the risk of chronic diseases like diabetes and heart disease.',
  },
  flowNodes: [
    { id: 'input', type: 'input', label: 'Test Data', position: { x: 20, y: 70 } },
    { id: 'process', type: 'process', label: 'AI Model', position: { x: 170, y: 70 } },
    { id: 'judge', type: 'judge', label: 'LLM Judge', position: { x: 320, y: 70 } },
    { id: 'output', type: 'output', label: 'Scores', position: { x: 470, y: 70 } },
  ],
  flowEdges: [
    { id: 'e1', source: 'input', target: 'process', animated: true },
    { id: 'e2', source: 'process', target: 'judge', animated: true },
    { id: 'e3', source: 'judge', target: 'output', animated: true },
  ],
};
