import type { WalkthroughScenario } from '@/types';

export const workflowScenario: WalkthroughScenario = {
  id: 'workflow',
  type: 'workflow',
  title: 'End-to-End Evaluation Workflow',
  description:
    'See the complete evaluation workflow from data preparation through analysis. This scenario covers the full lifecycle of running an evaluation campaign.',
  steps: [
    {
      id: 'wf-1',
      title: 'Prepare: Define Evaluation Goals',
      description:
        'Start by defining what you want to evaluate. Identify key quality dimensions, select appropriate metrics, and document your evaluation criteria.',
      highlightElements: ['prepare'],
      dataState: {
        input: 'Goals & criteria defined',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'wf-2',
      title: 'Prepare: Curate Test Dataset',
      description:
        'Build a representative test dataset covering common cases, edge cases, and adversarial examples. Ensure diversity across user personas and query types.',
      highlightElements: ['prepare', 'dataset'],
      dataState: {
        input: 'Test cases ready',
        processing: 'Dataset curated',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'wf-3',
      title: 'Execute: Generate Responses',
      description:
        'Run your AI model against the test dataset to generate responses. This can be done in batch for efficiency or integrated into your CI/CD pipeline.',
      highlightElements: ['dataset', 'execute'],
      dataState: {
        processing: 'Running model inference',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'wf-4',
      title: 'Execute: Run Evaluations',
      description:
        'Apply your configured judges (LLM, automated metrics, or human) to score each response. Multiple metrics can be evaluated in parallel.',
      highlightElements: ['execute'],
      dataState: {
        processing: 'Evaluating responses',
        output: 'Scores generating...',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'wf-5',
      title: 'Analyze: Review Results',
      description:
        'Examine score distributions, identify patterns, and flag outliers. Use visualizations to understand metric correlations and tradeoffs.',
      highlightElements: ['execute', 'analyze'],
      dataState: {
        output: 'Analyzing patterns',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'wf-6',
      title: 'Analyze: Deep Dive on Issues',
      description:
        'Investigate low-scoring responses to understand root causes. Group failures by type, identify systematic issues, and document findings.',
      highlightElements: ['analyze'],
      dataState: {
        output: 'Issues identified',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'wf-7',
      title: 'Act: Make Decisions',
      description:
        'Based on evaluation results, decide on next steps: ship the model, iterate on improvements, or run additional evaluations. Document your decision rationale.',
      highlightElements: ['analyze', 'act'],
      dataState: {
        output: 'Decision: Ready to ship',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'wf-8',
      title: 'Complete: Iterate & Monitor',
      description:
        'Evaluation is continuous. Set up monitoring for production, schedule regular re-evaluations, and update your test dataset as you learn more.',
      highlightElements: ['act'],
      dataState: {
        output: 'Continuous monitoring active',
      },
      animationType: 'fade',
      duration: 2000,
    },
  ],
  exampleData: {
    query: 'Evaluation campaign for Customer Support Bot v2.3',
    actualOutput:
      'Overall Score: 0.87 | Pass Rate: 94% | 127/135 test cases passed | Key improvements in tone and accuracy. Regression detected in multi-turn context handling.',
    expectedOutput: 'Target: Overall Score > 0.85, Pass Rate > 90%',
  },
  flowNodes: [
    { id: 'prepare', type: 'input', label: 'Prepare', position: { x: 20, y: 70 } },
    { id: 'dataset', type: 'process', label: 'Dataset', position: { x: 145, y: 70 } },
    { id: 'execute', type: 'judge', label: 'Execute', position: { x: 270, y: 70 } },
    { id: 'analyze', type: 'process', label: 'Analyze', position: { x: 395, y: 70 } },
    { id: 'act', type: 'output', label: 'Act', position: { x: 520, y: 70 } },
  ],
  flowEdges: [
    { id: 'e1', source: 'prepare', target: 'dataset', animated: true },
    { id: 'e2', source: 'dataset', target: 'execute', animated: true },
    { id: 'e3', source: 'execute', target: 'analyze', animated: true },
    { id: 'e4', source: 'analyze', target: 'act', animated: true },
  ],
};
