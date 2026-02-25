'use client';

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Bell,
  CheckCircle,
  Shield,
  Target,
  X,
  Zap,
  Beaker,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type AgentConfig, getAgentRegistry } from '@/config/agents';
import {
  useAppIconUrl,
  useBranding,
  useColors,
  useHeroFilter,
  useHeroImage,
  useHeroMode,
} from '@/lib/theme';

// ── Rotating Text ────────────────────────────────────
const rotatingMessages = [
  'Evaluate Complex Agent Behaviors',
  'Visualize Hierarchical Metrics',
  'Compare Model Performance',
  'Analyze Nuanced LLM Outputs',
];

function RotatingText() {
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(-1);

  useEffect(() => {
    const id = setInterval(() => {
      setCurrent((prev) => {
        setExiting(prev);
        setTimeout(() => setExiting(-1), 500);
        return (prev + 1) % rotatingMessages.length;
      });
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-center gap-4">
      <div className="sage-line-glow h-[1px] w-16" />
      <div className="relative h-9 min-w-[380px] overflow-hidden">
        {rotatingMessages.map((msg, i) => (
          <span
            key={i}
            className={`rotating-text-item text-xl font-semibold text-primary ${
              i === current ? 'active' : ''
            } ${i === exiting ? 'exiting' : ''}`}
          >
            {msg}
          </span>
        ))}
      </div>
      <div className="sage-line-glow h-[1px] w-16" />
    </div>
  );
}

// ── Animated Counter ─────────────────────────────────
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const duration = 2000;
          const start = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(target * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="text-5xl font-black text-text-primary">
      {count}
      {suffix}
    </span>
  );
}

// ── Scroll Reveal Wrapper ────────────────────────────
function ScrollReveal({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`scroll-reveal ${className}`}>
      {children}
    </div>
  );
}

// ── Bento feature cards data ─────────────────────────
const bentoFeatures = [
  {
    num: '01',
    title: 'Evaluate',
    description: 'Run evaluations, compare metrics, and pinpoint quality gaps before release.',
    href: '/evaluate/upload',
    cta: 'Run evaluations',
    accent: 'bg-primary',
    cols: 'col-span-12 md:col-span-7',
  },
  {
    num: '02',
    title: 'Monitor',
    description: 'Track live quality trends, catch regressions early, and respond to alerts.',
    href: '/monitoring',
    cta: 'Monitor live quality',
    accent: 'bg-sky-500',
    cols: 'col-span-12 md:col-span-5',
  },
  {
    num: '03',
    title: 'CaliberHQ',
    description: 'Calibrate LLM judges against human labels to improve scoring consistency.',
    href: '/caliber-hq',
    cta: 'Calibrate judges',
    accent: 'bg-rose-500',
    cols: 'col-span-12 md:col-span-4',
  },
  {
    num: '04',
    title: 'Memory',
    description: 'Review extracted memory rules and surface decision-quality breakdowns quickly.',
    href: '/memory',
    cta: 'Review memory rules',
    accent: 'bg-teal-500',
    cols: 'col-span-12 md:col-span-4',
  },
  {
    num: '05',
    title: 'Annotation Studio',
    description: 'Label outputs with human feedback to train better prompts, judges, and policies.',
    href: '/annotation-studio',
    cta: 'Review annotations',
    accent: 'bg-violet-500',
    cols: 'col-span-12 md:col-span-4',
  },
  {
    num: '06',
    title: 'Production',
    description:
      'Track KPI health at a glance, then drill into operational and model-level drivers.',
    href: '/production',
    cta: 'Review KPI health',
    badge: 'Overview',
    accent: 'bg-accent-gold',
    cols: 'col-span-12 md:col-span-6',
  },
  {
    num: '07',
    title: 'Human Signals',
    description: 'Analyze human feedback signals to prioritize fixes and improve agent behavior.',
    href: '/human-signals',
    cta: 'Review human signals',
    accent: 'bg-slate-500',
    cols: 'col-span-12 md:col-span-6',
  },
];

// ── Slide Content Blocks ─────────────────────────────

function MonitoringSlide() {
  return (
    <div className="bg-[#fafbfc] p-5">
      {/* KPI Row */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          {
            icon: BarChart3,
            value: '0.847',
            label: 'Avg Score',
            iconBg: 'bg-primary/10',
            iconColor: 'text-primary',
          },
          {
            icon: CheckCircle,
            value: '91.2%',
            label: 'Pass Rate',
            iconBg: 'bg-success/10',
            iconColor: 'text-success',
          },
          {
            icon: Clock,
            value: '342ms',
            label: 'P95 Latency',
            iconBg: 'bg-accent-gold/10',
            iconColor: 'text-accent-gold',
          },
          {
            icon: Bell,
            value: '0',
            label: 'Active Alerts',
            iconBg: 'bg-primary/10',
            iconColor: 'text-primary',
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.iconBg}`}>
                <Icon className={`h-[18px] w-[18px] ${kpi.iconColor}`} />
              </div>
              <div>
                <div className="text-lg font-bold text-text-primary">{kpi.value}</div>
                <div className="text-[10px] text-text-muted">{kpi.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        {/* Score Trend */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border px-4 py-2">
            <span className="text-xs font-medium text-text-primary">Score Trend</span>
          </div>
          <div className="p-4">
            <svg viewBox="0 0 400 120" className="h-auto w-full">
              <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
              <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
              <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
              <path
                d="M0,80 L50,72 L100,68 L150,55 L200,50 L250,42 L300,38 L350,30 L400,25 L400,120 L0,120 Z"
                fill="rgba(139,159,79,0.08)"
              />
              <path
                d="M0,80 L50,72 L100,68 L150,55 L200,50 L250,42 L300,38 L350,30 L400,25"
                fill="none"
                stroke="#8B9F4F"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="0" cy="80" r="3" fill="#8B9F4F" />
              <circle cx="100" cy="68" r="3" fill="#8B9F4F" />
              <circle cx="200" cy="50" r="3" fill="#8B9F4F" />
              <circle cx="300" cy="38" r="3" fill="#8B9F4F" />
              <circle cx="400" cy="25" r="3.5" fill="white" stroke="#8B9F4F" strokeWidth="2" />
              <text x="0" y="10" fill="#7F8C8D" fontSize="9" fontFamily="Inter">
                1.0
              </text>
              <text x="0" y="98" fill="#7F8C8D" fontSize="9" fontFamily="Inter">
                0.6
              </text>
            </svg>
          </div>
        </div>

        {/* Metric Pass Rates */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border px-4 py-2">
            <span className="text-xs font-medium text-text-primary">Metric Pass Rates</span>
          </div>
          <div className="space-y-2.5 p-4">
            {[
              { name: 'Faithfulness', pct: 94, color: '#8B9F4F' },
              { name: 'Relevance', pct: 89, color: '#A4B86C' },
              { name: 'Coherence', pct: 92, color: '#B8C78A' },
              { name: 'Safety', pct: 97, color: '#6B7A3A' },
            ].map((m) => (
              <div key={m.name} className="flex items-center gap-3">
                <span className="w-20 text-right text-[10px] text-text-muted">{m.name}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-full bg-[#f0f1f3]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${m.pct}%`, backgroundColor: m.color }}
                  />
                </div>
                <span className="w-8 text-[10px] font-semibold text-text-primary">{m.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Executive Summary Mini Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-2">
          <span className="text-xs font-medium text-text-primary">Executive Summary</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Component
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Score
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Status
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                name: 'Response Quality',
                score: '0.89',
                status: 'Healthy',
                statusColor: 'text-success',
                dotColor: 'bg-success',
                trend: '+2.1%',
                trendColor: 'text-success',
              },
              {
                name: 'Safety & Compliance',
                score: '0.95',
                status: 'Healthy',
                statusColor: 'text-success',
                dotColor: 'bg-success',
                trend: '+0.5%',
                trendColor: 'text-success',
              },
              {
                name: 'User Satisfaction',
                score: '0.78',
                status: 'Warning',
                statusColor: 'text-warning',
                dotColor: 'bg-warning',
                trend: '-1.3%',
                trendColor: 'text-error',
              },
            ].map((row, i) => (
              <tr key={row.name} className={i < 2 ? 'border-b border-border' : ''}>
                <td className="px-4 py-2 text-[11px] font-medium text-text-primary">{row.name}</td>
                <td className="px-4 py-2 text-[11px] text-text-primary">{row.score}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${row.dotColor}`} />
                    <span className={`text-[11px] ${row.statusColor}`}>{row.status}</span>
                  </span>
                </td>
                <td className={`px-4 py-2 text-[11px] ${row.trendColor}`}>{row.trend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniBoxPlot({ q1, median, q3 }: { q1: number; median: number; q3: number }) {
  // Scale 0-1 to 0-60px range
  const scale = (v: number) => v * 60;
  return (
    <svg viewBox="0 0 70 16" className="h-4 w-[70px]">
      {/* Whisker line */}
      <line x1={scale(q1)} y1="8" x2={scale(q3)} y2="8" stroke="#d1d5db" strokeWidth="1" />
      {/* Box */}
      <rect x={scale(q1)} y="3" width={scale(q3) - scale(q1)} height="10" fill="#e5e7eb" rx="1" />
      {/* Median line */}
      <line
        x1={scale(median)}
        y1="2"
        x2={scale(median)}
        y2="14"
        stroke="#f87171"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ScorecardSlide() {
  const rows = [
    {
      name: 'model',
      type: 'COMPONENT',
      score: '0.743',
      range: '0.412 - 0.925',
      weight: '1.00',
      norm: '100.0%',
      indent: 0,
      expandable: true,
      q1: 0.41,
      median: 0.74,
      q3: 0.93,
    },
    {
      name: 'PERFORMANCE',
      type: 'COMPONENT',
      score: '0.378',
      range: '0.152 - 0.628',
      weight: '1.00',
      norm: '50.0%',
      indent: 1,
      expandable: true,
      q1: 0.15,
      median: 0.38,
      q3: 0.63,
    },
    {
      name: 'Latency',
      type: 'METRIC',
      score: '0.378',
      range: '0.152 - 0.628',
      weight: '1.00',
      norm: '100.0%',
      indent: 2,
      expandable: false,
      q1: 0.15,
      median: 0.38,
      q3: 0.63,
    },
    {
      name: 'ANSWER_QUALITY',
      type: 'COMPONENT',
      score: '0.819',
      range: '0.3 - 0.971',
      weight: '0.50',
      norm: '25.0%',
      indent: 1,
      expandable: true,
      q1: 0.3,
      median: 0.82,
      q3: 0.97,
    },
    {
      name: 'Completeness',
      type: 'METRIC',
      score: '0.911',
      range: '0 - 1',
      weight: '0.40',
      norm: '40.0%',
      indent: 2,
      expandable: false,
      q1: 0.0,
      median: 0.91,
      q3: 1.0,
    },
    {
      name: 'Correctness',
      type: 'METRIC',
      score: '0.796',
      range: '0.25 - 1',
      weight: '0.40',
      norm: '40.0%',
      indent: 2,
      expandable: false,
      q1: 0.25,
      median: 0.8,
      q3: 1.0,
    },
    {
      name: 'Relevance',
      type: 'METRIC',
      score: '0.716',
      range: '0.429 - 1',
      weight: '0.20',
      norm: '20.0%',
      indent: 2,
      expandable: false,
      q1: 0.43,
      median: 0.72,
      q3: 1.0,
    },
  ];

  return (
    <div className="bg-[#fafbfc] p-5">
      {/* KPI Strip */}
      <div className="mb-4 grid grid-cols-5 gap-2">
        {[
          { label: 'Overall Weighted Score', value: '0.743', sub: 'Weighted avg across hierarchy' },
          { label: 'Score Variance', value: '0.194', sub: 'Consistency measure' },
          { label: 'Test Cases', value: '20', sub: 'Unique evaluations' },
          { label: 'Metrics', value: '8', sub: 'metric_type = metric' },
          { label: 'Components', value: '5', sub: 'metric_type = component' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-border bg-white px-3 py-2.5">
            <div className="text-[9px] text-text-muted">{kpi.label}</div>
            <div className="text-lg font-bold text-text-primary">{kpi.value}</div>
            <div className="text-[8px] text-text-muted">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* AI Report Generation bar */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <BookOpen className="h-4 w-4 text-text-muted" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-text-primary">AI Report Generation</div>
            <div className="text-[10px] text-text-muted">
              8 metrics &middot; 5 components &middot; 20 test cases &middot;{' '}
              <span className="text-error">1 low</span> /{' '}
              <span className="text-success">7 high</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-[#334155] px-4 py-2">
          <Sparkles className="h-3.5 w-3.5 text-white" />
          <span className="text-[11px] font-semibold text-white">Generate Report</span>
        </div>
      </div>

      {/* Table header row */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-text-muted">8 metrics &middot; 5 components</span>
        <span className="text-[10px] font-medium text-primary">Collapse All</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Hierarchy
              </th>
              <th className="px-2 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Type
              </th>
              <th className="px-2 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Score
              </th>
              <th className="px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Weight
              </th>
              <th className="px-2 py-2 text-right text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Norm. Weight
              </th>
              <th className="px-2 py-2 text-center text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.name} className={i < rows.length - 1 ? 'border-b border-border' : ''}>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{ paddingLeft: row.indent * 16 }}
                  >
                    {row.expandable ? (
                      <ChevronDown className="h-3 w-3 text-text-muted" />
                    ) : (
                      <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-300" />
                    )}
                    <span className="text-[11px] font-medium text-text-primary">{row.name}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${
                      row.type === 'COMPONENT'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-gray-100 text-text-muted'
                    }`}
                  >
                    {row.type}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <span className="text-[11px] font-semibold text-text-primary">{row.score}</span>
                  <span className="ml-1 text-[9px] text-text-muted">({row.range})</span>
                </td>
                <td className="px-2 py-2.5 text-right text-[11px] text-text-primary">
                  {row.weight}
                </td>
                <td className="px-2 py-2.5 text-right text-[11px] font-medium text-text-primary">
                  {row.norm}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <MiniBoxPlot q1={row.q1} median={row.median} q3={row.q3} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TreeViewSlide() {
  const statements = [
    { id: 0, pass: true, text: 'credits are used to call generative AI and other f...' },
    { id: 1, pass: true, text: 'For more information on credits Billable Usage, vi...' },
    { id: 2, pass: true, text: 'the AI assistant Conversations and other feature...' },
    { id: 3, pass: true, text: 'For more details on the AI assistant Billable Usag...' },
    { id: 4, pass: true, text: 'AI requests are billed based on the number of re...' },
    { id: 5, pass: true, text: 'For further details on AI requests Billable Usage, ...' },
    {
      id: 6,
      pass: false,
      text: 'Additional resources for understanding metering...',
      expanded: true,
    },
    { id: 7, pass: false, text: 'Understanding Human and System Context in AI ...' },
  ];

  return (
    <div className="bg-[#fafbfc] p-5">
      {/* Tip banner */}
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
        <span className="text-[10px] text-blue-600">
          Tip: Click on leaf nodes (metrics) to see detailed explanations, signals, and critique.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Tree SVG */}
        <div className="overflow-hidden rounded-lg border border-border bg-white p-3">
          <svg viewBox="0 0 320 280" className="h-auto w-full">
            {/* Curved paths from model to children */}
            <path
              d="M80,140 C140,140 140,50 200,50"
              fill="none"
              stroke="#e1e5ea"
              strokeWidth="1.5"
            />
            <path
              d="M80,140 C140,140 140,110 200,110"
              fill="none"
              stroke="#e1e5ea"
              strokeWidth="1.5"
            />
            <path
              d="M80,140 C140,140 140,180 200,180"
              fill="none"
              stroke="#e1e5ea"
              strokeWidth="1.5"
            />
            <path
              d="M80,140 C140,140 140,245 200,245"
              fill="none"
              stroke="#e1e5ea"
              strokeWidth="1.5"
            />
            {/* Path from ANSWER_QUALITY to Relevance leaf */}
            <path
              d="M230,50 C260,50 260,25 290,25"
              fill="none"
              stroke="#e1e5ea"
              strokeWidth="1.5"
            />

            {/* Root: model */}
            <text x="40" y="137" textAnchor="middle" fill="#2c3e50" fontSize="9" fontWeight="600">
              model
            </text>
            <text x="40" y="149" textAnchor="middle" fill="#7f8c8d" fontSize="8">
              0.803
            </text>
            <circle cx="68" cy="140" r="5" fill="#27ae60" />

            {/* ANSWER_QUALITY */}
            <text x="175" y="45" textAnchor="end" fill="#2c3e50" fontSize="8" fontWeight="500">
              ANSWER_QUALITY
            </text>
            <text x="210" y="60" textAnchor="middle" fill="#7f8c8d" fontSize="7">
              0.933
            </text>
            <circle cx="218" cy="47" r="5" fill="#27ae60" />

            {/* CONVERSATIONAL */}
            <text x="175" y="107" textAnchor="end" fill="#2c3e50" fontSize="8" fontWeight="500">
              CONVERSATIONAL
            </text>
            <text x="210" y="122" textAnchor="middle" fill="#7f8c8d" fontSize="7">
              1
            </text>
            <circle cx="218" cy="109" r="5" fill="#27ae60" />

            {/* RETRIEVER_QUALITY */}
            <text x="175" y="177" textAnchor="end" fill="#2c3e50" fontSize="8" fontWeight="500">
              RETRIEVER_QUALITY
            </text>
            <text x="210" y="192" textAnchor="middle" fill="#7f8c8d" fontSize="7">
              0.181
            </text>
            <circle cx="218" cy="179" r="5" fill="#e74c3c" />

            {/* PERFORMANCE */}
            <text x="175" y="242" textAnchor="end" fill="#2c3e50" fontSize="8" fontWeight="500">
              PERFORMANCE
            </text>
            <text x="210" y="257" textAnchor="middle" fill="#7f8c8d" fontSize="7">
              0.398
            </text>
            <circle cx="218" cy="244" r="5" fill="#f59e0b" />

            {/* Leaf: Relevance */}
            <text x="298" y="22" textAnchor="middle" fill="#2c3e50" fontSize="7" fontWeight="500">
              Relevance
            </text>
            <circle cx="298" cy="30" r="4" fill="#f59e0b" />
          </svg>
        </div>

        {/* Signal Detail Panel */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-xs font-semibold text-text-primary">Relevance</span>
              <span className="text-sm font-bold text-amber-500">0.667</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-text-muted">Weight: 0.2</span>
              <span className="text-text-muted">&times;</span>
            </div>
          </div>

          {/* Signals section */}
          <div className="max-h-[310px] overflow-y-auto px-3 py-2">
            <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
              Signals
            </div>

            {/* OVERALL row */}
            <div className="mb-2 rounded-md bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-text-primary">
                  OVERALL <span className="text-text-muted">(1 signal)</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted">total_statements</span>
                  <span className="text-[10px] font-semibold text-text-primary">9</span>
                  <span className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    <span className="text-[10px] font-medium text-success">9</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Statement list */}
            <div className="space-y-1">
              {statements.map((s) => (
                <div key={s.id}>
                  <div
                    className={`flex items-center gap-1.5 rounded px-2 py-1.5 ${
                      s.expanded ? 'border border-blue-300 bg-blue-50/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <ChevronRight
                      className={`h-3 w-3 flex-shrink-0 text-text-muted ${s.expanded ? 'rotate-90' : ''}`}
                    />
                    <span
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] ${
                        s.pass ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                      }`}
                    >
                      {s.pass ? '\u2713' : '\u2717'}
                    </span>
                    <span className="text-[9px] font-semibold text-text-primary">
                      STATEMENT {s.id}
                    </span>
                    <span className="truncate text-[9px] text-text-muted">{s.text}</span>
                  </div>

                  {/* Expanded detail for STATEMENT 6 */}
                  {s.expanded && (
                    <div className="ml-5 mt-1 space-y-1 rounded border border-blue-200 bg-white px-3 py-2">
                      <div className="flex items-center gap-8">
                        <span className="text-[9px] text-text-muted">verdict</span>
                        <span className="flex items-center gap-1 text-[9px] font-semibold text-error">
                          <span className="bg-error/10 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px]">
                            &#x2717;
                          </span>
                          NO
                        </span>
                      </div>
                      <div className="flex items-start gap-8">
                        <span className="flex-shrink-0 text-[9px] text-text-muted">statement</span>
                        <span className="text-[9px] text-text-primary">
                          Additional resources for understanding meter...
                        </span>
                      </div>
                      <div className="flex items-start gap-8">
                        <span className="flex-shrink-0 text-[9px] text-text-muted">reason</span>
                        <span className="text-[9px] text-text-primary">
                          While it mentions additional resources, it doe...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaliberHQSlide() {
  return (
    <div className="bg-[#fafbfc] p-5">
      {/* Step navigation */}
      <div className="mb-4 flex items-center gap-2">
        {[
          { label: 'Upload', done: true },
          { label: 'Review & Label', done: true },
          { label: 'Build Eval', active: true },
        ].map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-3 w-3 text-text-muted" />}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                step.active
                  ? 'bg-primary text-white'
                  : 'border border-border bg-white text-text-muted'
              }`}
            >
              {step.done && !step.active && <CheckCircle className="h-3 w-3" />}
              {step.active && <Sparkles className="h-3 w-3" />}
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Left: Pattern Insights */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-accent-gold" />
              <span className="text-[11px] font-semibold text-text-primary">Pattern Insights</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] text-text-muted">
                2 patterns &middot; 5 notes
              </span>
            </div>
          </div>
          <div className="p-3">
            {/* Clustering method tabs */}
            <div className="mb-3 flex items-center gap-1">
              <span className="mr-1 text-[9px] text-text-muted">Clustering:</span>
              {['LLM', 'BERTopic', 'Hybrid'].map((m) => (
                <span
                  key={m}
                  className={`rounded-md px-2.5 py-1 text-[9px] font-medium ${
                    m === 'LLM' ? 'bg-[#334155] text-white' : 'bg-gray-50 text-text-muted'
                  }`}
                >
                  {m}
                </span>
              ))}
            </div>

            {/* Pattern cluster - Incomplete Responses */}
            <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-text-primary">
                  Incomplete Responses
                </span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                  3
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  'The response fails to address the specific question about billing tiers, providing only generic pricing information without concrete tier breakdowns.',
                  'Missing critical implementation details — no code examples, API endpoints, or configuration steps were provided despite being explicitly requested.',
                  'Response covers authentication but omits authorization flows, token refresh handling, and error states essential for a complete implementation.',
                ].map((note, i) => (
                  <div
                    key={i}
                    className="rounded bg-white px-2.5 py-1.5 text-[9px] leading-relaxed text-text-secondary"
                  >
                    &ldquo;{note}&rdquo;
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[9px] font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                Use as criteria
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-[9px] text-text-muted">
              <span>
                Annotations: <span className="font-semibold text-text-primary">12</span>
              </span>
              <span>
                With Notes: <span className="font-semibold text-text-primary">5</span>
              </span>
              <span>
                Patterns: <span className="font-semibold text-text-primary">2</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: LLM Judge Configuration */}
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border px-4 py-2.5">
            <span className="text-[11px] font-semibold text-text-primary">
              LLM Judge Configuration
            </span>
          </div>
          <div className="p-3">
            {/* Tabs */}
            <div className="mb-3 flex items-center gap-1">
              {[
                { label: 'Model', active: false },
                { label: 'Prompt', active: true },
                { label: 'Examples', active: false, badge: '4' },
              ].map((tab) => (
                <span
                  key={tab.label}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[9px] font-medium ${
                    tab.active ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  {tab.badge && (
                    <span className="rounded-full bg-gray-100 px-1.5 text-[8px]">{tab.badge}</span>
                  )}
                </span>
              ))}
            </div>

            {/* Prompt section header */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-text-primary">
                Prompt Configuration
              </span>
              <span className="text-[9px] text-text-muted">Reset to Default</span>
            </div>

            {/* Info banner */}
            <div className="mb-2 rounded-md bg-blue-50 px-3 py-2">
              <span className="text-[9px] leading-relaxed text-blue-600">
                The system prompt defines how the LLM judge evaluates responses. Use{' '}
                <code className="rounded bg-blue-100 px-1 text-[8px]">
                  {'{evaluation_criteria}'}
                </code>{' '}
                as a placeholder for your evaluation criteria.
              </span>
            </div>

            {/* System prompt textarea */}
            <div>
              <span className="mb-1 block text-[9px] font-medium text-text-primary">
                System Prompt
              </span>
              <div className="rounded-md border border-border bg-gray-50 p-2.5">
                <pre className="whitespace-pre-wrap font-mono text-[8px] leading-relaxed text-text-secondary">
                  {`You are an expert evaluator assessing the quality of AI-generated responses.

## Evaluation Criteria
{evaluation_criteria}

## Scoring Guidelines
- Score 1 (Poor): Response is irrelevant, incorrect, or harmful
- Score 2 (Fair): Partially addresses the query with notable gaps
- Score 3 (Good): Adequately addresses the query with minor issues`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Carousel Slides Config ───────────────────────────

const PREVIEW_SLIDES = [
  {
    id: 'monitoring',
    label: 'Monitoring',
    urlLabel: '/ monitoring',
    icon: Shield,
    content: <MonitoringSlide />,
  },
  {
    id: 'scorecard',
    label: 'Scorecard',
    urlLabel: '/ evaluate / scorecard',
    icon: BarChart3,
    content: <ScorecardSlide />,
  },
  {
    id: 'tree-view',
    label: 'Tree View',
    urlLabel: '/ evaluate / tree-view',
    icon: Target,
    content: <TreeViewSlide />,
  },
  {
    id: 'caliber-hq',
    label: 'CaliberHQ',
    urlLabel: '/ caliber-hq',
    icon: Beaker,
    content: <CaliberHQSlide />,
  },
];

// ── Product Preview Carousel ─────────────────────────

function ProductPreviewCarousel({ isLight }: { isLight: boolean }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = PREVIEW_SLIDES.length;

  const goTo = useCallback(
    (index: number) => {
      setActiveSlide(((index % total) + total) % total);
    },
    [total]
  );

  const goNext = useCallback(() => goTo(activeSlide + 1), [activeSlide, goTo]);
  const goPrev = useCallback(() => goTo(activeSlide - 1), [activeSlide, goTo]);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused) return;
    timerRef.current = setInterval(goNext, 6000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, goNext]);

  const slide = PREVIEW_SLIDES[activeSlide];
  const SlideIcon = slide.icon;

  return (
    <section
      className="relative"
      style={{
        background: isLight
          ? 'linear-gradient(180deg, #f0f1f3 0%, #fafbfc 100%)'
          : 'linear-gradient(180deg, #111113 0%, #f0f1f3 100%)',
      }}
    >
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <div
          className="overflow-hidden rounded-xl border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.4)]"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* macOS title bar */}
          <div className="flex items-center gap-2 border-b border-white/5 bg-[#1e1e20] px-4 py-3">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex flex-1 justify-center">
              <div className="flex items-center gap-2 rounded-md bg-white/5 px-4 py-1.5 text-xs text-white/40">
                <SlideIcon className="h-3 w-3" />
                {slide.urlLabel}
              </div>
            </div>
            <div className="w-14" />
          </div>

          {/* Content area with crossfade */}
          <div className="relative" style={{ minHeight: 380 }}>
            {PREVIEW_SLIDES.map((s, i) => (
              <div key={s.id} className={`preview-slide ${i === activeSlide ? 'active' : ''}`}>
                {s.content}
              </div>
            ))}

            {/* Left arrow */}
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 shadow-md backdrop-blur-sm transition-colors hover:bg-white"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-4 w-4 text-text-primary" />
            </button>

            {/* Right arrow */}
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 shadow-md backdrop-blur-sm transition-colors hover:bg-white"
              aria-label="Next slide"
            >
              <ChevronRight className="h-4 w-4 text-text-primary" />
            </button>
          </div>
        </div>

        {/* Slide nav pills */}
        <div className="mt-5 flex items-center justify-center gap-1">
          {PREVIEW_SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-300 ${
                i === activeSlide
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:bg-gray-100 hover:text-text-primary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Biography Modal ──────────────────────────────────
function BiographyModal({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="animate-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-modal-content relative mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent header band */}
        <div className="relative h-24 bg-gradient-to-r from-primary/10 via-primary/5 to-accent-gold/10">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-text-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Avatar overlapping the band */}
          <div className="absolute -bottom-8 left-8">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-md">
              {agent.avatar ? (
                <Image
                  src={agent.avatar}
                  alt={agent.label}
                  width={64}
                  height={64}
                  className="h-16 w-16 object-cover"
                />
              ) : (
                <Bot className="h-8 w-8 text-text-muted" />
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[calc(80vh-6rem)] overflow-y-auto px-8 pb-8 pt-12">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-text-primary">{agent.label}</h2>
            {agent.role && <p className="text-sm text-text-muted">{agent.role}</p>}
          </div>

          {/* Biography content rendered as simple formatted text */}
          <div className="prose prose-sm max-w-none text-text-secondary">
            {agent.biography?.split('\n').map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={i} />;
              if (trimmed.startsWith('## '))
                return (
                  <h2 key={i} className="mb-3 mt-6 text-lg font-bold text-text-primary">
                    {trimmed.replace('## ', '')}
                  </h2>
                );
              if (trimmed.startsWith('### '))
                return (
                  <h3 key={i} className="mb-2 mt-5 text-base font-semibold text-text-primary">
                    {trimmed.replace('### ', '')}
                  </h3>
                );
              if (trimmed.startsWith('**') && trimmed.endsWith('**'))
                return (
                  <p key={i} className="mb-1 font-semibold text-text-primary">
                    {trimmed.replace(/\*\*/g, '')}
                  </p>
                );
              if (trimmed.startsWith('* '))
                return (
                  <li key={i} className="mb-1 ml-4 list-disc text-sm text-text-secondary">
                    {trimmed
                      .replace('* ', '')
                      .split('**')
                      .map((part, j) =>
                        j % 2 === 1 ? (
                          <strong key={j} className="font-semibold text-text-primary">
                            {part}
                          </strong>
                        ) : (
                          part
                        )
                      )}
                  </li>
                );
              if (trimmed === '---') return <hr key={i} className="my-4 border-border" />;
              return (
                <p key={i} className="mb-2 text-sm leading-relaxed text-text-secondary">
                  {trimmed.split('**').map((part, j) =>
                    j % 2 === 1 ? (
                      <strong key={j} className="font-semibold text-text-primary">
                        {part}
                      </strong>
                    ) : (
                      part
                    )
                  )}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Meet the Team Section ────────────────────────────
function MeetTheTeam({ isLight }: { isLight: boolean }) {
  const agents = getAgentRegistry();
  const colors = useColors();
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);

  // Only render when agents are configured
  if (agents.length === 0) return null;

  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? 'linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)'
            : 'linear-gradient(180deg, #1a1a1c 0%, #111113 100%)',
        }}
      />
      {/* Subtle radial glow behind cards */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse 50% 60% at 50% 60%, rgba(139,159,79,0.06) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 50% 60% at 50% 60%, rgba(139,159,79,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-20">
        <ScrollReveal className="mb-5 text-center">
          <p
            className={`mb-3 text-xs font-semibold uppercase tracking-[0.2em] ${
              isLight ? 'text-primary' : 'text-primary-light'
            }`}
          >
            Your AI Workforce
          </p>
          <h2
            className={`text-[32px] font-bold leading-tight tracking-[-0.02em] ${
              isLight ? 'text-text-primary' : 'text-white'
            }`}
          >
            Meet the Team
          </h2>
        </ScrollReveal>

        {/* Decorative divider */}
        <div className="mb-12 flex justify-center">
          <div className="sage-line-glow h-[1px] w-20" />
        </div>

        <ScrollReveal>
          <div
            className={`grid gap-6 ${
              agents.length === 1 ? 'mx-auto max-w-lg grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {agents.map((agent) => {
              const isActive = agent.active !== false;
              return (
                <div
                  key={agent.name}
                  className={`group relative overflow-hidden rounded-xl border p-7 transition-all duration-300 ${
                    isLight
                      ? 'border-border bg-white shadow-sm hover:shadow-lg'
                      : 'border-white/10 bg-white/5 backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.08]'
                  }`}
                >
                  {/* Hover accent line */}
                  <div className="absolute left-0 top-0 h-[2px] w-0 bg-gradient-to-r from-primary to-primary-light transition-all duration-500 group-hover:w-full" />

                  {/* Avatar + name row */}
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      {/* Larger avatar with ring */}
                      <div
                        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full"
                        style={{
                          backgroundColor: isLight ? '#f3f4f6' : 'rgba(255,255,255,0.1)',
                          boxShadow: `0 0 0 2px ${isLight ? '#fff' : '#1a1a1c'}, 0 0 0 4px ${isActive ? `${colors.primary}40` : `${colors.textMuted}30`}`,
                        }}
                      >
                        {agent.avatar ? (
                          <Image
                            src={agent.avatar}
                            alt={agent.label}
                            width={56}
                            height={56}
                            className="h-14 w-14 object-cover"
                          />
                        ) : (
                          <Bot
                            className={`h-6 w-6 ${isLight ? 'text-text-muted' : 'text-white/40'}`}
                          />
                        )}
                      </div>
                      <div>
                        <h3
                          className={`text-lg font-bold tracking-[-0.01em] ${
                            isLight ? 'text-text-primary' : 'text-white'
                          }`}
                        >
                          {agent.label}
                        </h3>
                        {agent.role && (
                          <p className={`text-sm ${isLight ? 'text-text-muted' : 'text-white/50'}`}>
                            {agent.role}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status badge with pulsing dot */}
                    <span
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: isActive ? colors.success : colors.textMuted,
                        backgroundColor: isActive ? `${colors.success}12` : `${colors.textMuted}12`,
                      }}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${isActive ? 'animate-status-pulse' : ''}`}
                        style={{
                          backgroundColor: isActive ? colors.success : colors.textMuted,
                        }}
                      />
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Description */}
                  {agent.description && (
                    <p
                      className={`mb-5 text-sm leading-relaxed ${
                        isLight ? 'text-text-secondary' : 'text-white/60'
                      }`}
                    >
                      {agent.description}
                    </p>
                  )}

                  {/* Learn More link */}
                  {agent.biography && (
                    <button
                      onClick={() => setSelectedAgent(agent)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-all duration-200 hover:gap-2.5 hover:text-primary-dark"
                    >
                      Learn More
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollReveal>
      </div>

      {/* Biography Modal */}
      {selectedAgent && (
        <BiographyModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </section>
  );
}

// ── Main Page ────────────────────────────────────────
export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const heroImage = useHeroImage();
  const heroFilter = useHeroFilter();
  const heroMode = useHeroMode();
  const isLight = heroMode === 'light';
  const branding = useBranding();
  const appIconUrl = useAppIconUrl();
  const docsBaseUrl = branding.docs_url?.replace(/\/+$/, '');
  const userGuideUrl = docsBaseUrl ? `${docsBaseUrl}/user-guide/` : '/learn';

  return (
    <div className="relative min-h-screen bg-white">
      {/* ── Section 1: Dark Hero ───────────────────── */}
      <section
        ref={heroRef}
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
        style={{
          background: isLight
            ? '#ffffff'
            : 'linear-gradient(180deg, #0a0a0b 0%, #111113 60%, #1a1a1c 100%)',
        }}
      >
        {/* Custom hero image (from branded palette) */}
        {heroImage && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `url(${heroImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: heroFilter.filterString || undefined,
              opacity: heroFilter.opacity ?? (isLight ? 0.6 : 0.15),
            }}
          />
        )}
        {/* Light mode overlay to keep text readable over image */}
        {isLight && heroImage && (
          <div className="pointer-events-none absolute inset-0 bg-white/60" />
        )}

        {/* Radial glows */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: isLight
              ? 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(139,159,79,0.06) 0%, transparent 70%)'
              : 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(139,159,79,0.08) 0%, transparent 70%)',
          }}
        />
        {!isLight && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 40% 40% at 60% 50%, rgba(212,175,55,0.04) 0%, transparent 60%)',
            }}
          />
        )}

        <div className="relative z-10 px-6 text-center">
          {/* Pill badge */}
          <div
            className={`mb-10 inline-flex items-center gap-2 rounded-full border px-5 py-2 backdrop-blur-sm ${
              isLight ? 'border-primary/20 bg-white/80' : 'border-white/10 bg-white/5'
            }`}
          >
            <Zap className="h-4 w-4 text-accent-gold" />
            <span
              className={`text-sm font-semibold ${isLight ? 'text-text-secondary' : 'text-white/60'}`}
            >
              {branding.tagline}
            </span>
          </div>

          {/* Title */}
          <h1
            className={`mb-4 text-[120px] font-black leading-none tracking-[-0.04em] ${
              isLight ? 'text-text-primary' : 'text-white'
            }`}
            style={{
              textShadow: isLight ? 'none' : '0 0 80px rgba(139,159,79,0.15)',
            }}
          >
            {branding.app_name}
          </h1>

          {/* Subtitle */}
          <h2
            className="mb-3 text-3xl font-bold"
            style={{
              background: 'linear-gradient(135deg, #8B9F4F 0%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {branding.subtitle}
          </h2>

          {/* Acronym */}
          <p
            className={`mb-8 whitespace-pre-line text-sm font-medium uppercase tracking-[0.15em] ${
              isLight ? 'text-text-muted/50' : 'text-white/25'
            }`}
          >
            {branding.description}
          </p>

          {/* Rotating text */}
          <div className="mb-8">
            <RotatingText />
          </div>

          {/* Tagline */}
          <p
            className={`mx-auto mb-12 max-w-xl text-lg leading-relaxed ${
              isLight ? 'text-text-muted' : 'text-white/40'
            }`}
          >
            Comprehensive metrics, hierarchical analysis, and human-calibrated evaluation for AI
            agents.
          </p>

          {/* CTAs */}
          <div className="mx-auto flex w-full max-w-xl flex-wrap justify-center gap-3 sm:gap-4">
            <Link
              href="/production"
              className="animate-glow-pulse inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-light sm:w-auto"
            >
              <BarChart3 className="h-5 w-5" />
              Production Overview
            </Link>
            <Link
              href={userGuideUrl}
              target={userGuideUrl.startsWith('http') ? '_blank' : undefined}
              rel={userGuideUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-8 py-3.5 text-base font-semibold backdrop-blur-sm transition-colors sm:w-auto ${
                isLight
                  ? 'border-primary bg-white text-primary hover:bg-primary/5'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'
              }`}
            >
              <BookOpen className="h-5 w-5" />
              User Guides
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <ChevronDown
            className={`animate-scroll-bounce h-6 w-6 ${isLight ? 'text-text-muted/30' : 'text-white/30'}`}
          />
        </div>
      </section>

      {/* ── Section 2: Meet the Team ────────────────── */}
      <MeetTheTeam isLight={isLight} />

      {/* ── Section 3: Stats Strip (hidden — update with real data later) */}
      <section className="hidden bg-[#fafbfc] py-24">
        <ScrollReveal className="mx-auto max-w-4xl px-6">
          <div className="flex items-center justify-center divide-x divide-border">
            {[
              {
                target: 15,
                suffix: '+',
                label: 'Models Evaluated',
                sub: 'LLMs & Agents',
              },
              {
                target: 150,
                suffix: '+',
                label: 'Metrics Tracked',
                sub: 'Hierarchical Analysis',
              },
              {
                target: 95,
                suffix: '%',
                label: 'Accuracy Rate',
                sub: 'Human-Calibrated',
              },
            ].map((stat) => (
              <div key={stat.label} className="flex-1 px-8 text-center">
                <div className="mb-1">
                  <AnimatedCounter target={stat.target} suffix={stat.suffix} />
                </div>
                <p className="text-sm font-semibold text-text-primary">{stat.label}</p>
                <p className="mt-0.5 text-xs text-text-muted">{stat.sub}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* ── Section 4: Product Preview Carousel ───── */}
      <ProductPreviewCarousel isLight={isLight} />

      {/* ── Section 5: Bento Feature Grid ────────────── */}
      <section className="bg-white py-28">
        <div className="mx-auto max-w-[1120px] px-8">
          <ScrollReveal className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              The Platform
            </p>
            <h2 className="mb-3 text-[32px] font-bold leading-tight tracking-[-0.02em] text-text-primary">
              Everything you need to ship trustworthy AI
            </h2>
            <p className="mx-auto max-w-[520px] text-base leading-relaxed text-text-muted">
              Evaluate, compare, monitor, and improve AI models and agents — all in one place.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <div className="grid grid-cols-12 gap-[2px]">
              {bentoFeatures.map((f) => (
                <Link
                  key={f.title}
                  href={f.href}
                  className={`bento-card group relative flex flex-col overflow-hidden bg-[#fafbfc] p-9 transition-colors duration-300 hover:bg-[#f3f4f6] ${f.cols}`}
                >
                  {/* Accent line */}
                  <div
                    className={`absolute left-0 top-0 h-[2px] w-12 opacity-0 transition-all duration-300 group-hover:w-16 group-hover:opacity-100 ${f.accent}`}
                  />
                  {f.badge && (
                    <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                      {f.badge}
                    </span>
                  )}
                  <span className="mb-5 text-[11px] font-medium tracking-[0.08em] text-text-muted">
                    {f.num}
                  </span>
                  <h3 className="mb-2.5 text-xl font-bold tracking-[-0.01em] text-text-primary transition-colors duration-300 group-hover:text-primary">
                    {f.title}
                  </h3>
                  <p className="max-w-[420px] text-sm leading-relaxed text-text-muted">
                    {f.description}
                  </p>
                  <div className="mt-auto flex -translate-x-1 items-center gap-2 pt-6 text-sm font-medium text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                    {f.cta}
                    <ArrowRight className="h-[18px] w-[18px] text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Section 6: CTA + Footer ─────────────────── */}
      <section className={isLight ? 'bg-[#fafbfc] py-24' : 'bg-[#0a0a0b] py-24'}>
        <ScrollReveal className="mx-auto max-w-4xl px-6 text-center">
          <h2 className={`mb-4 text-3xl font-bold ${isLight ? 'text-text-primary' : 'text-white'}`}>
            New to evaluation workflows?
          </h2>
          <p
            className={`mx-auto mb-10 max-w-lg text-base ${isLight ? 'text-text-muted' : 'text-white/40'}`}
          >
            Checkout the Learning guide for practical concepts, workflows, and examples.
          </p>
          <Link
            href="/learn"
            className="animate-glow-pulse inline-flex items-center gap-2 rounded-xl bg-primary px-10 py-4 text-base font-semibold text-white transition-colors hover:bg-primary-light"
          >
            Start with Learn
            <BookOpen className="h-5 w-5" />
          </Link>

          {/* Footer */}
          <div
            className={`mt-20 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row ${
              isLight ? 'border-border' : 'border-white/5'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {(branding.footer_icon || appIconUrl) && (
                <Image
                  src={branding.footer_icon || appIconUrl!}
                  alt={branding.footer_name}
                  width={16}
                  height={16}
                  className="h-4 w-4 object-contain"
                  unoptimized
                />
              )}
              <span
                className={`text-sm font-semibold ${isLight ? 'text-text-muted' : 'text-white/40'}`}
              >
                {branding.footer_name}
              </span>
              <span className={`ml-2 text-xs ${isLight ? 'text-text-muted/50' : 'text-white/20'}`}>
                &copy; {new Date().getFullYear()}
              </span>
            </div>
            <a
              href="https://github.com/ax-foundry/axion"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs transition-colors ${
                isLight
                  ? 'text-text-muted hover:text-text-primary'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              Powered by Axion
            </a>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
