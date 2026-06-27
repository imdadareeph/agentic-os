import { useEffect, useRef, useState } from 'react'
import {
  Layers,
  Brain,
  LayoutDashboard,
  Share2,
  ArrowRight,
  GitBranch,
  Repeat,
  FileText,
  Bot,
  Workflow,
  Database,
  BookOpen,
  FolderTree,
  Rocket,
  Users,
  Package,
  Globe,
} from 'lucide-react'

const levels = [
  {
    id: 1,
    title: 'Backbone',
    subtitle: 'Skills + Loop Engineering',
    icon: Layers,
    color: '#E5A93D',
    description: 'The foundation is not prompts—it\'s codified workflows. Convert repetitive manual work into deterministic AI skills.',
    components: [
      { icon: Workflow, label: 'Workflow Audit' },
      { icon: GitBranch, label: 'Skills (Reusable)' },
      { icon: Bot, label: 'Automations' },
      { icon: Repeat, label: 'Loop Engineering' },
    ],
    goal: 'Every task becomes repeatable, measurable, and automatable.',
  },
  {
    id: 2,
    title: 'Memory & State',
    subtitle: 'Second Brain',
    icon: Brain,
    color: '#D4941E',
    description: 'The persistent intelligence layer. Long-term memory, state persistence, and knowledge retrieval.',
    components: [
      { icon: Database, label: 'Obsidian Vault' },
      { icon: FileText, label: 'Local Markdown' },
      { icon: BookOpen, label: 'Claude Code Vault' },
      { icon: FolderTree, label: 'Structured Folders' },
    ],
    structure: `Vault/
  ├── raw/
  │   ├── research
  │   ├── transcripts
  │   └── notes
  ├── wiki/
  │   ├── knowledge
  │   └── entities
  ├── outputs/
  ├── runs/
  └── skills/`,
    goal: 'Historical context drives self-improvement over time.',
  },
  {
    id: 3,
    title: 'Dashboard',
    subtitle: 'Command Center UI',
    icon: LayoutDashboard,
    color: '#C4830A',
    description: 'The UI is only a wrapper. One-click buttons, metrics, and voice interaction hide terminal complexity.',
    components: [
      { icon: Rocket, label: 'One-click Launch' },
      { icon: LayoutDashboard, label: 'Metrics Display' },
      { icon: Globe, label: 'Command Center' },
      { icon: Share2, label: 'Voice Interface' },
    ],
    goal: 'Buttons trigger background executions while hiding complexity.',
  },
  {
    id: 4,
    title: 'Distribution',
    subtitle: 'Package for Others',
    icon: Share2,
    color: '#B07000',
    description: 'The final layer packages everything for others. Share skills, automations, and dashboards.',
    components: [
      { icon: Package, label: 'Share Skills' },
      { icon: Users, label: 'Enable Users' },
      { icon: Globe, label: 'Web App' },
      { icon: LayoutDashboard, label: 'Obsidian Plugin' },
    ],
    goal: 'Non-technical users interact with buttons instead of terminals.',
  },
]

function LevelCard({ level, index }: { level: typeof levels[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
        }
      },
      { threshold: 0.15 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const Icon = level.icon

  return (
    <div
      ref={ref}
      className={`
        border border-white/10 p-6 transition-all duration-700
        hover:border-white/25 hover:bg-white/[0.02]
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
      `}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-10 h-10 flex items-center justify-center border border-white/15 flex-shrink-0"
          style={{ borderColor: `${level.color}40` }}
        >
          <Icon size={18} style={{ color: level.color }} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-mono tracking-wider" style={{ color: level.color }}>
              LEVEL {level.id}
            </span>
          </div>
          <h3 className="text-lg font-medium text-white tracking-wide">{level.title}</h3>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">{level.subtitle}</p>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-white/50 leading-relaxed mb-5">{level.description}</p>

      {/* Components Grid */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {level.components.map((comp, i) => {
          const CompIcon = comp.icon
          return (
            <div
              key={i}
              className="flex items-center gap-2 p-2 border border-white/5 bg-white/[0.01]"
            >
              <CompIcon size={11} className="text-white/30 flex-shrink-0" />
              <span className="text-[9px] text-white/40 tracking-wider uppercase">{comp.label}</span>
            </div>
          )
        })}
      </div>

      {/* Structure (Level 2 only) */}
      {'structure' in level && level.structure && (
        <pre className="text-[9px] text-white/25 font-mono leading-relaxed mb-4 p-3 border border-white/5 bg-black/30 overflow-x-auto">
          {level.structure}
        </pre>
      )}

      {/* Goal */}
      <div className="flex items-start gap-2 pt-4 border-t border-white/5">
        <ArrowRight size={10} className="text-white/20 mt-0.5 flex-shrink-0" />
        <span className="text-[10px] text-white/40 italic">{level.goal}</span>
      </div>
    </div>
  )
}

// Loop Engineering Flow
function LoopFlow() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true)
      },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const steps = [
    'Manual Workflow',
    'Create Skill',
    'Automation',
    'Run',
    'Save Output',
    'Evaluate',
    'Improve Skill',
    'Run Again',
  ]

  return (
    <div
      ref={ref}
      className={`border border-white/10 p-8 transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="text-center mb-8">
        <span className="text-label mb-2 block">Loop Engineering</span>
        <h3 className="text-xl font-light text-white tracking-wide">
          The Feedback Mechanism
        </h3>
        <p className="text-xs text-white/40 mt-2 max-w-md mx-auto">
          Every execution leaves behind memory. Future executions use previous results to improve quality automatically.
        </p>
      </div>

      {/* Flow steps */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`
                px-4 py-2.5 border text-[10px] tracking-wider uppercase
                transition-all duration-500
                ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
              `}
              style={{
                transitionDelay: `${400 + i * 100}ms`,
                borderColor: i === 0 || i === steps.length - 1 ? 'rgba(229,169,61,0.3)' : 'rgba(255,255,255,0.1)',
                backgroundColor: i === 0 || i === steps.length - 1 ? 'rgba(229,169,61,0.05)' : 'transparent',
                color: i === 0 || i === steps.length - 1 ? '#E5A93D' : 'rgba(255,255,255,0.5)',
              }}
            >
              {step}
            </div>
            {i < steps.length - 1 && (
              <ArrowRight size={10} className="text-white/15 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Skill Creation Methods */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Manual Validation',
            steps: ['Perform task once', 'Convert into reusable skill'],
          },
          {
            title: 'Session Mining',
            steps: ['Analyze Claude sessions', 'Detect repeated workflows', 'Generate candidate skills'],
          },
          {
            title: 'Interview Method',
            steps: ['Explain daily work', 'Claude interviews you', 'Extract recurring workflows', 'Convert into skills'],
          },
        ].map((method, i) => (
          <div
            key={i}
            className={`border border-white/10 p-4 transition-all duration-500 ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: `${1200 + i * 150}ms` }}
          >
            <h4 className="text-xs font-medium text-amber-300/80 mb-3 tracking-wider uppercase">
              {method.title}
            </h4>
            <div className="space-y-2">
              {method.steps.map((s, j) => (
                <div key={j} className="flex items-start gap-2">
                  <span className="text-amber-400/40 text-[9px] mt-0.5">{j + 1}.</span>
                  <span className="text-[10px] text-white/40">{s}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Philosophy Section
function PhilosophySection() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true)
      },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`border border-white/10 p-8 transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <span className="text-label mb-3 block">Second Brain Philosophy</span>
          <h3 className="text-xl font-light text-white tracking-wide mb-4">
            Think Like a Person Navigating a Building
          </h3>
          <p className="text-xs text-white/40 leading-relaxed mb-4">
            Instead of seeing 5000 files, the AI should navigate through a structured hierarchy—Building → Floor → Room → Cabinet → Document.
          </p>
          <p className="text-xs text-white/40 leading-relaxed">
            That is why index.md exists at every folder level. It acts as a localized navigation map, reducing search cost and token usage.
          </p>
        </div>

        {/* Visual hierarchy */}
        <div className="flex flex-col items-center gap-2">
          {[
            { label: 'Building', color: '#E5A93D', width: '100%' },
            { label: 'Floor', color: '#D4A030', width: '80%' },
            { label: 'Room', color: '#C09020', width: '60%' },
            { label: 'Cabinet', color: '#A87810', width: '40%' },
            { label: 'Document', color: '#906000', width: '25%' },
          ].map((item, i) => (
            <div
              key={i}
              className={`
                flex items-center justify-center py-2 border transition-all duration-500
                ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
              `}
              style={{
                width: item.width,
                transitionDelay: `${300 + i * 150}ms`,
                borderColor: `${item.color}30`,
                backgroundColor: `${item.color}08`,
              }}
            >
              <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: item.color }}>
                {item.label}
              </span>
            </div>
          ))}
          {/* Arrow down */}
          <div className="text-white/10 text-lg leading-none my-1">↓</div>
        </div>
      </div>
    </div>
  )
}

export default function FeatureShowcase() {
  return (
    <div className="relative z-20 bg-[#050505] border-t border-white/10">
      {/* Four Evolutionary Levels */}
      <section className="py-20 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-label mb-3 block">Evolutionary Architecture</span>
            <h2 className="text-3xl font-light text-white tracking-wide glow-amber-subtle">
              Four Levels of Agentic OS
            </h2>
            <p className="text-sm text-white/30 mt-3 max-w-lg mx-auto">
              From codified workflows to distributed intelligence—each layer builds upon the previous.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {levels.map((level, i) => (
              <LevelCard key={level.id} level={level} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Loop Engineering */}
      <section className="px-6 md:px-12 pb-16">
        <div className="max-w-5xl mx-auto">
          <LoopFlow />
        </div>
      </section>

      {/* Philosophy */}
      <section className="px-6 md:px-12 pb-20">
        <div className="max-w-5xl mx-auto">
          <PhilosophySection />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6 text-center">
        <p className="text-[10px] text-white/15 tracking-[0.3em] uppercase">
          Agentic OS — Visual Autonomous Utility Live Terminal
        </p>
        <p className="text-[9px] text-white/10 mt-2 tracking-wider">
          Built with React, Three.js & Loop Engineering
        </p>
      </footer>
    </div>
  )
}
