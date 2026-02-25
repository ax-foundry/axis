export { singleTurnScenario } from './SingleTurnScenario';
export { expectedOutputScenario } from './ExpectedOutputScenario';
export { multiTurnScenario } from './MultiTurnScenario';
export { ragScenario } from './RAGScenario';
export { workflowScenario } from './WorkflowScenario';

import { expectedOutputScenario } from './ExpectedOutputScenario';
import { multiTurnScenario } from './MultiTurnScenario';
import { ragScenario } from './RAGScenario';
import { singleTurnScenario } from './SingleTurnScenario';
import { workflowScenario } from './WorkflowScenario';

import type { WalkthroughScenario, WalkthroughType } from '@/types';

export const scenarios: Record<WalkthroughType, WalkthroughScenario> = {
  'single-turn': singleTurnScenario,
  'expected-output': expectedOutputScenario,
  'multi-turn': multiTurnScenario,
  rag: ragScenario,
  workflow: workflowScenario,
};

export function getScenario(type: WalkthroughType): WalkthroughScenario {
  return scenarios[type];
}
