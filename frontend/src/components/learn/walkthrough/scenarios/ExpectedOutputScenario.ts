import type { WalkthroughScenario } from '@/types';

export const expectedOutputScenario: WalkthroughScenario = {
  id: 'expected-output',
  type: 'expected-output',
  title: 'Evaluation with Expected Output',
  description:
    'Compare AI responses against ground truth or reference answers. This enables metrics like correctness, semantic similarity, and factual accuracy.',
  steps: [
    {
      id: 'eo-1',
      title: 'Input: Load Test Case with Reference',
      description:
        'Load a test case that includes the query, AI response, AND an expected output (ground truth). The expected output serves as the benchmark for comparison.',
      highlightElements: ['input'],
      dataState: {
        input: 'Query + Actual + Expected loaded',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'eo-2',
      title: 'Process: Prepare Comparison',
      description:
        'The system prepares both the actual and expected outputs for comparison. This may involve normalization, tokenization, or embedding generation.',
      highlightElements: ['input', 'process'],
      dataState: {
        input: 'Both outputs ready',
        processing: 'Preparing for comparison',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'eo-3',
      title: 'Judge: Compare Against Reference',
      description:
        'The LLM judge compares the actual output against the expected output. It evaluates semantic similarity, factual alignment, completeness, and any discrepancies.',
      highlightElements: ['process', 'judge'],
      dataState: {
        processing: 'Actual vs Expected',
        output: 'Comparing outputs...',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'eo-4',
      title: 'Judge: Assess Correctness',
      description:
        'Beyond similarity, the judge assesses whether the actual output is factually correct based on the reference. It identifies missing information, additions, and contradictions.',
      highlightElements: ['judge'],
      dataState: {
        output: 'Checking factual correctness',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'eo-5',
      title: 'Output: Comparison Scores',
      description:
        'Results include comparison-specific metrics: Correctness (factual accuracy), Similarity (semantic overlap), Completeness (coverage of reference), and Precision (avoiding extra claims).',
      highlightElements: ['judge', 'output'],
      dataState: {
        output: 'Correctness 0.92, Similarity 0.88',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'eo-6',
      title: 'Complete: Detailed Analysis',
      description:
        'The evaluation shows exactly how the response compares to the reference. Use this to identify systematic errors, missing knowledge, or areas where your model exceeds expectations.',
      highlightElements: ['output'],
      dataState: {
        output: 'Detailed diff available',
      },
      animationType: 'fade',
      duration: 2000,
    },
  ],
  exampleData: {
    query: 'What is the capital of France?',
    actualOutput:
      "The capital of France is Paris. Paris is also the largest city in France and serves as the country's major cultural and economic center.",
    expectedOutput: 'Paris is the capital city of France.',
  },
  flowNodes: [
    { id: 'input', type: 'input', label: 'Test Data', position: { x: 20, y: 70 } },
    { id: 'process', type: 'process', label: 'Prepare', position: { x: 170, y: 70 } },
    { id: 'judge', type: 'judge', label: 'Compare', position: { x: 320, y: 70 } },
    { id: 'output', type: 'output', label: 'Results', position: { x: 470, y: 70 } },
  ],
  flowEdges: [
    { id: 'e1', source: 'input', target: 'process', label: 'actual + expected', animated: true },
    { id: 'e2', source: 'process', target: 'judge', animated: true },
    { id: 'e3', source: 'judge', target: 'output', animated: true },
  ],
};
