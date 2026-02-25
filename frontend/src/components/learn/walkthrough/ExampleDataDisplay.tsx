'use client';

import { MessageSquare, FileText, FileCheck, BookOpen } from 'lucide-react';

import type { WalkthroughScenario } from '@/types';

interface ExampleDataDisplayProps {
  exampleData: WalkthroughScenario['exampleData'];
  highlightField?:
    | 'query'
    | 'actualOutput'
    | 'expectedOutput'
    | 'conversation'
    | 'retrievedContent';
}

export function ExampleDataDisplay({ exampleData, highlightField }: ExampleDataDisplayProps) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-text-muted">
        <BookOpen className="h-4 w-4" />
        Example Test Case
      </h4>

      <div className="space-y-3">
        {/* Query */}
        <div
          className={`rounded-lg border p-3 transition-all duration-300 ${
            highlightField === 'query'
              ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-200'
              : 'border-border bg-gray-50'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <MessageSquare
              className={`h-4 w-4 ${highlightField === 'query' ? 'text-blue-500' : 'text-gray-400'}`}
            />
            <span className="text-xs font-medium uppercase text-text-muted">Query (Input)</span>
          </div>
          <p className="text-sm text-text-secondary">{exampleData.query}</p>
        </div>

        {/* Actual Output */}
        <div
          className={`rounded-lg border p-3 transition-all duration-300 ${
            highlightField === 'actualOutput'
              ? 'border-green-300 bg-green-50 ring-2 ring-green-200'
              : 'border-border bg-gray-50'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <FileText
              className={`h-4 w-4 ${highlightField === 'actualOutput' ? 'text-green-500' : 'text-gray-400'}`}
            />
            <span className="text-xs font-medium uppercase text-text-muted">Actual Output</span>
          </div>
          <p className="text-sm text-text-secondary">{exampleData.actualOutput}</p>
        </div>

        {/* Expected Output (if present) */}
        {exampleData.expectedOutput && (
          <div
            className={`rounded-lg border p-3 transition-all duration-300 ${
              highlightField === 'expectedOutput'
                ? 'border-purple-300 bg-purple-50 ring-2 ring-purple-200'
                : 'border-border bg-gray-50'
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <FileCheck
                className={`h-4 w-4 ${highlightField === 'expectedOutput' ? 'text-purple-500' : 'text-gray-400'}`}
              />
              <span className="text-xs font-medium uppercase text-text-muted">Expected Output</span>
            </div>
            <p className="text-sm text-text-secondary">{exampleData.expectedOutput}</p>
          </div>
        )}

        {/* Conversation (if present) */}
        {exampleData.conversation && exampleData.conversation.length > 0 && (
          <div
            className={`rounded-lg border p-3 transition-all duration-300 ${
              highlightField === 'conversation'
                ? 'border-orange-300 bg-orange-50 ring-2 ring-orange-200'
                : 'border-border bg-gray-50'
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare
                className={`h-4 w-4 ${highlightField === 'conversation' ? 'text-orange-500' : 'text-gray-400'}`}
              />
              <span className="text-xs font-medium uppercase text-text-muted">
                Conversation History
              </span>
            </div>
            <div className="space-y-2">
              {exampleData.conversation.map((msg, idx) => (
                <div
                  key={idx}
                  className={`text-sm ${msg.role === 'user' ? 'text-blue-600' : 'text-green-600'}`}
                >
                  <span className="font-medium capitalize">{msg.role}:</span> {msg.content}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Retrieved Content (if present) */}
        {exampleData.retrievedContent && (
          <div
            className={`rounded-lg border p-3 transition-all duration-300 ${
              highlightField === 'retrievedContent'
                ? 'border-cyan-300 bg-cyan-50 ring-2 ring-cyan-200'
                : 'border-border bg-gray-50'
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <BookOpen
                className={`h-4 w-4 ${highlightField === 'retrievedContent' ? 'text-cyan-500' : 'text-gray-400'}`}
              />
              <span className="text-xs font-medium uppercase text-text-muted">
                Retrieved Content (RAG)
              </span>
            </div>
            <p className="text-sm text-text-secondary">{exampleData.retrievedContent}</p>
          </div>
        )}
      </div>
    </div>
  );
}
