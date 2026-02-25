import type { WalkthroughScenario } from '@/types';

export const ragScenario: WalkthroughScenario = {
  id: 'rag',
  type: 'rag',
  title: 'RAG (Retrieval-Augmented Generation) Evaluation',
  description:
    'Evaluate responses that incorporate retrieved context. Assess both retrieval quality and how well the model uses the retrieved information.',
  steps: [
    {
      id: 'rag-1',
      title: 'Input: Query Arrives',
      description:
        'A user query arrives that requires external knowledge to answer properly. The query will be used both for retrieval and for generating the final response.',
      highlightElements: ['input'],
      dataState: {
        input: 'Query received',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'rag-2',
      title: 'Retrieve: Search Knowledge Base',
      description:
        'The retrieval system searches the knowledge base (documents, databases, etc.) to find relevant context. This is where embedding models and vector search come into play.',
      highlightElements: ['input', 'process'],
      dataState: {
        input: 'Query embedded',
        processing: 'Searching knowledge base...',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'rag-3',
      title: 'Retrieve: Context Selected',
      description:
        'Relevant documents or passages are retrieved and ranked. The quality of this retrieval step directly impacts the final response quality.',
      highlightElements: ['process'],
      dataState: {
        processing: 'Retrieved 3 relevant passages',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'rag-4',
      title: 'Generate: Create Response',
      description:
        'The AI model receives both the query and the retrieved context. It generates a response that should accurately use the retrieved information.',
      highlightElements: ['process', 'judge'],
      dataState: {
        processing: 'Query + Context → Model',
        output: 'Generating grounded response',
      },
      animationType: 'flow',
      duration: 2000,
    },
    {
      id: 'rag-5',
      title: 'Judge: Evaluate Retrieval',
      description:
        'First, evaluate the retrieval quality: Is the retrieved content relevant? Is it sufficient to answer the query? Are there missing pieces of information?',
      highlightElements: ['judge'],
      dataState: {
        output: 'Retrieval Relevance: 0.90',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'rag-6',
      title: 'Judge: Evaluate Grounding',
      description:
        'Assess how well the response uses the retrieved context: Is the response grounded in the retrieved content? Does it hallucinate beyond the sources? Is attribution clear?',
      highlightElements: ['judge'],
      dataState: {
        output: 'Groundedness: 0.85, Faithfulness: 0.92',
      },
      animationType: 'highlight',
      duration: 2000,
    },
    {
      id: 'rag-7',
      title: 'Output: RAG Metrics',
      description:
        'RAG-specific metrics include: Retrieval Precision/Recall, Context Relevance, Groundedness (uses only retrieved info), Faithfulness (no contradictions), and Answer Completeness.',
      highlightElements: ['judge', 'output'],
      dataState: {
        output: 'Full RAG evaluation complete',
      },
      animationType: 'flow',
      duration: 2000,
    },
  ],
  exampleData: {
    query: 'What are the opening hours of the Louvre Museum?',
    actualOutput:
      'The Louvre Museum is open from 9:00 AM to 6:00 PM on Monday, Thursday, Saturday, and Sunday. On Wednesday and Friday, it has extended hours until 9:45 PM. The museum is closed on Tuesdays.',
    retrievedContent:
      'The Louvre Museum operating hours: Monday, Thursday, Saturday, Sunday: 9 AM - 6 PM. Wednesday, Friday: 9 AM - 9:45 PM (extended hours). Closed: Tuesdays, January 1, May 1, December 25. Last admission 30 minutes before closing.',
    expectedOutput:
      'The Louvre is open 9 AM to 6 PM most days, with extended hours until 9:45 PM on Wednesdays and Fridays. It is closed on Tuesdays.',
  },
  flowNodes: [
    { id: 'input', type: 'input', label: 'Query', position: { x: 20, y: 70 } },
    { id: 'process', type: 'process', label: 'Retrieve', position: { x: 170, y: 70 } },
    { id: 'judge', type: 'judge', label: 'Generate', position: { x: 320, y: 70 } },
    { id: 'output', type: 'output', label: 'Evaluate', position: { x: 470, y: 70 } },
  ],
  flowEdges: [
    { id: 'e1', source: 'input', target: 'process', label: 'embed', animated: true },
    { id: 'e2', source: 'process', target: 'judge', label: 'context', animated: true },
    { id: 'e3', source: 'judge', target: 'output', animated: true },
  ],
};
