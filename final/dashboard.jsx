import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
  Activity, DollarSign, Brain, Database,
  TrendingUp, AlertTriangle, CheckCircle, Clock, Zap
} from "lucide-react";

// ─── Color Palette ───────────────────────────────────────────────
const COLORS = {
  bg: "#0a0a0f",
  card: "#12121a",
  cardHover: "#1a1a28",
  border: "#1e1e2e",
  borderLight: "#2a2a3e",
  text: "#e4e4ef",
  textDim: "#8888a0",
  textMuted: "#55556a",
  accent: "#6366f1",
  accentDim: "#4f46e5",
  green: "#10b981",
  greenDim: "#059669",
  amber: "#f59e0b",
  red: "#ef4444",
  cyan: "#06b6d4",
  purple: "#a855f7",
  pink: "#ec4899",
  orange: "#f97316",
  modelQwen: "#6366f1",
  modelMiniMax: "#10b981",
  modelDeepSeek: "#f59e0b",
};

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#06b6d4", "#a855f7", "#ec4899"];

// ─── Model Definitions ───────────────────────────────────────────
const MODELS = [
  { id: "qwen-37plus", name: "Qwen 3.7 Plus", color: COLORS.modelQwen, role: "Orchestrator" },
  { id: "minimax-m27", name: "MiniMax M2.7", color: COLORS.modelMiniMax, role: "Long Context" },
  { id: "deepseek-v4", name: "DeepSeek V4", color: COLORS.modelDeepSeek, role: "Reasoning" },
];

// ─── Mock Data Generators ────────────────────────────────────────
const genDays = (n) => {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(5, 10));
  }
  return days;
};

const DAYS_30 = genDays(30);

const costData = DAYS_30.map((day, i) => ({
  day,
  Qwen: +(1.8 + Math.random() * 2.8 + (i > 20 ? 1.5 : 0)).toFixed(2),
  MiniMax: +(1.0 + Math.random() * 2.0 + (i > 15 ? 0.8 : 0)).toFixed(2),
  DeepSeek: +(0.8 + Math.random() * 1.5).toFixed(2),
  total: 0,
})).map((d) => ({ ...d, total: +(d.Qwen + d.MiniMax + d.DeepSeek).toFixed(2) }));

const modelPerformance = [
  { metric: "Latency", Qwen: 85, MiniMax: 78, DeepSeek: 90 },
  { metric: "Cost Eff.", Qwen: 82, MiniMax: 92, DeepSeek: 88 },
  { metric: "Quality", Qwen: 93, MiniMax: 80, DeepSeek: 91 },
  { metric: "Reliability", Qwen: 90, MiniMax: 85, DeepSeek: 78 },
  { metric: "Ctx Window", Qwen: 82, MiniMax: 98, DeepSeek: 72 },
  { metric: "Tool Use", Qwen: 95, MiniMax: 88, DeepSeek: 70 },
];

const latencyData = [
  { name: "Qwen 3.7 Plus", avg: 1.9, p95: 3.5, p99: 5.5 },
  { name: "MiniMax M2.7", avg: 2.3, p95: 4.1, p99: 6.8 },
  { name: "DeepSeek V4", avg: 1.5, p95: 2.9, p99: 4.5 },
];

const modelTableData = [
  { name: "Qwen 3.7 Plus", status: "healthy", uptime: 99.8, errorRate: 0.2, avgTokens: 24500, color: COLORS.modelQwen },
  { name: "MiniMax M2.7", status: "healthy", uptime: 99.7, errorRate: 0.3, avgTokens: 45200, color: COLORS.modelMiniMax },
  { name: "DeepSeek V4", status: "degraded", uptime: 98.9, errorRate: 1.1, avgTokens: 22100, color: COLORS.modelDeepSeek },
];

const experienceGrowth = DAYS_30.map((day, i) => ({
  day,
  total: 180 + i * 3 + Math.floor(Math.random() * 4),
  added: Math.floor(2 + Math.random() * 6),
}));

const wikiEntries = [
  { id: "EXP-001", pattern: "Code Review Pipeline", category: "code", hits: 47, age: 3, stale: false },
  { id: "EXP-002", pattern: "API Design Pattern", category: "code", hits: 32, age: 7, stale: false },
  { id: "EXP-003", pattern: "Marketing Copy ZH", category: "creative", hits: 89, age: 2, stale: false },
  { id: "EXP-004", pattern: "Data Analysis Report", category: "analytical", hits: 56, age: 12, stale: false },
  { id: "EXP-005", pattern: "React Component Gen", category: "code", hits: 71, age: 5, stale: false },
  { id: "EXP-006", pattern: "Legal Doc Review", category: "analytical", hits: 23, age: 35, stale: true },
  { id: "EXP-007", pattern: "SQL Optimization", category: "code", hits: 44, age: 8, stale: false },
  { id: "EXP-008", pattern: "Email Draft EN/ZH", category: "creative", hits: 112, age: 1, stale: false },
  { id: "EXP-009", pattern: "Budget Forecasting", category: "analytical", hits: 18, age: 42, stale: true },
  { id: "EXP-010", pattern: "Unit Test Generation", category: "code", hits: 63, age: 4, stale: false },
  { id: "EXP-011", pattern: "Product Description", category: "creative", hits: 95, age: 6, stale: false },
  { id: "EXP-012", pattern: "Architecture Review", category: "code", hits: 38, age: 15, stale: false },
  { id: "EXP-013", pattern: "Competitive Analysis", category: "analytical", hits: 27, age: 22, stale: false },
  { id: "EXP-014", pattern: "Resume Screening", category: "analytical", hits: 15, age: 38, stale: true },
  { id: "EXP-015", pattern: "CI/CD Pipeline Setup", category: "code", hits: 41, age: 9, stale: false },
  { id: "EXP-016", pattern: "Social Media Posts", category: "creative", hits: 78, age: 3, stale: false },
  { id: "EXP-017", pattern: "DB Migration Plan", category: "code", hits: 29, age: 18, stale: false },
  { id: "EXP-018", pattern: "Risk Assessment", category: "analytical", hits: 11, age: 55, stale: true },
  { id: "EXP-019", pattern: "i18n Translation", category: "creative", hits: 67, age: 10, stale: false },
  { id: "EXP-020", pattern: "Performance Audit", category: "code", hits: 52, age: 14, stale: false },
  { id: "EXP-021", pattern: "Blog Post Outline", category: "creative", hits: 43, age: 6, stale: false },
  { id: "EXP-022", pattern: "Incident Postmortem", category: "analytical", hits: 34, age: 20, stale: false },
  { id: "EXP-023", pattern: "API Rate Limiter", category: "code", hits: 8, age: 61, stale: true },
  { id: "EXP-024", pattern: "Video Script ZH", category: "creative", hits: 59, age: 4, stale: false },
];

const TASK_DESCRIPTIONS = [
  "Refactor authentication module to OAuth2",
  "Generate Q3 financial analysis report",
  "Create product landing page copy (ZH)",
  "Design REST API for user management",
  "Optimize PostgreSQL query performance",
  "Write unit tests for payment service",
  "Analyze competitor pricing strategy",
  "Build React dashboard component library",
  "Translate user guide EN→ZH",
  "Review security audit findings",
];

const PHASE_NAMES = ["Scout", "Swarm", "Verify", "Learn"];
const PHASE_COLORS = [COLORS.cyan, COLORS.purple, COLORS.amber, COLORS.green];

const initialTasks = [
  { id: "TSK-7821", desc: TASK_DESCRIPTIONS[0], phase: 3, elapsed: 42.3, models: ["DeepSeek V4", "Qwen 3.7 Plus"], cost: 0.084 },
  { id: "TSK-7822", desc: TASK_DESCRIPTIONS[1], phase: 1, elapsed: 8.7, models: ["MiniMax M2.7", "DeepSeek V4"], cost: 0.032 },
  { id: "TSK-7823", desc: TASK_DESCRIPTIONS[2], phase: 2, elapsed: 23.1, models: ["Qwen 3.7 Plus", "MiniMax M2.7"], cost: 0.058 },
  { id: "TSK-7824", desc: TASK_DESCRIPTIONS[3], phase: 0, elapsed: 2.1, models: ["DeepSeek V4"], cost: 0.005 },
  { id: "TSK-7825", desc: TASK_DESCRIPTIONS[4], phase: 2, elapsed: 31.5, models: ["MiniMax M2.7", "Qwen 3.7 Plus"], cost: 0.071 },
  { id: "TSK-7826", desc: TASK_DESCRIPTIONS[5], phase: 1, elapsed: 12.4, models: ["Qwen 3.7 Plus", "MiniMax M2.7", "DeepSeek V4"], cost: 0.045 },
  { id: "TSK-7827", desc: TASK_DESCRIPTIONS[6], phase: 3, elapsed: 55.8, models: ["MiniMax M2.7"], cost: 0.093 },
  { id: "TSK-7828", desc: TASK_DESCRIPTIONS[7], phase: 0, elapsed: 0.8, models: ["DeepSeek V4"], cost: 0.002 },
  { id: "TSK-7829", desc: TASK_DESCRIPTIONS[8], phase: 1, elapsed: 6.2, models: ["MiniMax M2.7", "Qwen 3.7 Plus"], cost: 0.019 },
  { id: "TSK-7830", desc: TASK_DESCRIPTIONS[9], phase: 2, elapsed: 28.9, models: ["DeepSeek V4", "Qwen 3.7 Plus"], cost: 0.067 },
];

// ─── Utility Components ──────────────────────────────────────────

function KPICard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <div className="rounded-xl border p-5 transition-all duration-200"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: COLORS.textDim }}>{label}</span>
        <div className="rounded-lg p-2" style={{ backgroundColor: color + "18" }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold mb-1" style={{ color: COLORS.text }}>{value}</div>
      {sub && (
        <div className="flex items-center gap-1 text-xs" style={{ color: trend === "up" ? COLORS.green : trend === "down" ? COLORS.red : COLORS.textMuted }}>
          {trend === "up" && <TrendingUp size={12} />}
          {trend === "down" && <AlertTriangle size={12} />}
          {sub}
        </div>
      )}
    </div>
  );
}

function PhaseIndicator({ currentPhase }) {
  return (
    <div className="flex items-center gap-1">
      {PHASE_NAMES.map((name, i) => (
        <div key={name} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className="rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500"
              style={{
                width: i <= currentPhase ? 24 : 20,
                height: i <= currentPhase ? 24 : 20,
                backgroundColor: i < currentPhase ? PHASE_COLORS[i] : i === currentPhase ? PHASE_COLORS[i] : COLORS.borderLight,
                color: i <= currentPhase ? "#fff" : COLORS.textMuted,
                boxShadow: i === currentPhase ? `0 0 12px ${PHASE_COLORS[i]}66` : "none",
              }}>
              {i < currentPhase ? "✓" : i + 1}
            </div>
            <span className="text-xs mt-1" style={{
              color: i <= currentPhase ? PHASE_COLORS[i] : COLORS.textMuted,
              fontSize: 9,
              fontWeight: i === currentPhase ? 700 : 400,
            }}>{name}</span>
          </div>
          {i < 3 && (
            <div className="mb-4 mx-0.5" style={{
              width: 16, height: 2,
              backgroundColor: i < currentPhase ? PHASE_COLORS[i] : COLORS.borderLight,
              borderRadius: 1,
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, expanded, onToggle }) {
  const phaseLabel = PHASE_NAMES[task.phase];
  const phaseColor = PHASE_COLORS[task.phase];
  const isComplete = task.phase >= 3;

  return (
    <div
      className="rounded-xl border p-4 cursor-pointer transition-all duration-300"
      style={{
        backgroundColor: expanded ? COLORS.cardHover : COLORS.card,
        borderColor: expanded ? phaseColor + "55" : COLORS.border,
        boxShadow: expanded ? `0 4px 24px ${phaseColor}11` : "none",
      }}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
              backgroundColor: phaseColor + "22", color: phaseColor,
            }}>{task.id}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
              backgroundColor: isComplete ? COLORS.green + "22" : phaseColor + "22",
              color: isComplete ? COLORS.green : phaseColor,
            }}>
              {isComplete ? "Complete" : phaseLabel}
            </span>
          </div>
          <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{task.desc}</p>
        </div>
        <div className="text-right ml-4 flex-shrink-0">
          <div className="flex items-center gap-1 text-xs" style={{ color: COLORS.textDim }}>
            <Clock size={11} />
            {task.elapsed.toFixed(1)}s
          </div>
          <div className="flex items-center gap-1 text-xs mt-1" style={{ color: COLORS.green }}>
            <DollarSign size={11} />
            ¥{task.cost.toFixed(3)}
          </div>
        </div>
      </div>

      <PhaseIndicator currentPhase={task.phase} />

      {expanded && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: COLORS.borderLight }}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>Models Involved</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {task.models.map((m) => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full" style={{
                    backgroundColor: COLORS.borderLight, color: COLORS.textDim,
                  }}>{m}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>Token Usage</span>
              <p className="text-sm font-medium mt-1" style={{ color: COLORS.text }}>
                {Math.floor(2000 + Math.random() * 15000).toLocaleString()} tokens
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>Subtasks</span>
              <p className="text-sm font-medium" style={{ color: COLORS.text }}>{Math.floor(2 + Math.random() * 5)}</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>Wiki Hits</span>
              <p className="text-sm font-medium" style={{ color: COLORS.text }}>{Math.floor(Math.random() * 5)}</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>Confidence</span>
              <p className="text-sm font-medium" style={{ color: COLORS.text }}>
                {(0.6 + Math.random() * 0.35).toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-xs" style={{ color: COLORS.textMuted }}>Debate Rounds</span>
              <p className="text-sm font-medium" style={{ color: COLORS.text }}>{Math.floor(1 + Math.random() * 4)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Components ──────────────────────────────────────────────

function LiveTasksTab() {
  const [tasks, setTasks] = useState(initialTasks);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTasks((prev) =>
        prev.map((t) => {
          const newElapsed = t.elapsed + 0.5;
          let newPhase = t.phase;
          if (t.phase < 3 && Math.random() < 0.06) newPhase = t.phase + 1;
          const newCost = t.cost + (t.phase < 3 ? 0.001 + Math.random() * 0.003 : 0);
          return { ...t, elapsed: newElapsed, phase: newPhase, cost: +newCost.toFixed(4) };
        })
      );
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const phaseCounts = PHASE_NAMES.map((_, i) => tasks.filter((t) => t.phase === i).length);
  const completedCount = tasks.filter((t) => t.phase >= 3).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {PHASE_NAMES.map((name, i) => (
          <div key={name} className="rounded-xl border p-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PHASE_COLORS[i] }} />
              <span className="text-xs font-medium" style={{ color: COLORS.textDim }}>{name}</span>
            </div>
            <div className="text-xl font-bold" style={{ color: PHASE_COLORS[i] }}>{phaseCounts[i]}</div>
          </div>
        ))}
        <div className="rounded-xl border p-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={12} style={{ color: COLORS.green }} />
            <span className="text-xs font-medium" style={{ color: COLORS.textDim }}>Completed</span>
          </div>
          <div className="text-xl font-bold" style={{ color: COLORS.green }}>{completedCount}</div>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            expanded={expandedId === task.id}
            onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CostAnalyticsTab() {
  const todayCost = costData[costData.length - 1].total;
  const monthlyTotal = costData.reduce((s, d) => s + d.total, 0);
  const avgPerTask = (monthlyTotal / 342).toFixed(2);
  const budgetTotal = 300;
  const budgetRemaining = (budgetTotal - monthlyTotal).toFixed(2);
  const budgetPct = ((monthlyTotal / budgetTotal) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={DollarSign} label="Today's Cost" value={`¥${todayCost.toFixed(2)}`} sub="+12% vs yesterday" color={COLORS.accent} trend="up" />
        <KPICard icon={TrendingUp} label="Monthly Burn" value={`¥${monthlyTotal.toFixed(0)}`} sub={`${budgetPct}% of budget`} color={COLORS.amber} />
        <KPICard icon={Activity} label="Avg Cost/Task" value={`¥${avgPerTask}`} sub="-8% vs last month" color={COLORS.green} trend="down" />
        <KPICard icon={Zap} label="Budget Left" value={`¥${budgetRemaining}`} sub={`${(budgetTotal - monthlyTotal > 0 ? "" : "")}remaining of ¥${budgetTotal}`} color={+budgetRemaining > 50 ? COLORS.green : COLORS.red} />
      </div>

      <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Daily Cost Trend (30 Days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={costData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
            <XAxis dataKey="day" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
            <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
            <Tooltip
              contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: COLORS.textDim }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
            <Line type="monotone" dataKey="Qwen" stroke={COLORS.modelQwen} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="MiniMax" stroke={COLORS.modelMiniMax} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="DeepSeek" stroke={COLORS.modelDeepSeek} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Cost Breakdown by Model</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costData.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
              <XAxis dataKey="day" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: COLORS.textDim }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
              <Bar dataKey="Qwen" stackId="a" fill={COLORS.modelQwen} radius={[0, 0, 0, 0]} />
              <Bar dataKey="MiniMax" stackId="a" fill={COLORS.modelMiniMax} radius={[0, 0, 0, 0]} />
              <Bar dataKey="DeepSeek" stackId="a" fill={COLORS.modelDeepSeek} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Budget Utilization</h3>
          <div className="flex items-center justify-center mb-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Spent", value: +monthlyTotal.toFixed(2) },
                    { name: "Remaining", value: Math.max(0, +(budgetTotal - monthlyTotal).toFixed(2)) },
                  ]}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  <Cell fill={COLORS.accent} />
                  <Cell fill={COLORS.borderLight} />
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: COLORS.text }}>{budgetPct}%</div>
            <div className="text-xs mt-1" style={{ color: COLORS.textDim }}>of ¥{budgetTotal} monthly budget used</div>
          </div>
          <div className="mt-4 w-full rounded-full h-2" style={{ backgroundColor: COLORS.borderLight }}>
            <div className="h-2 rounded-full transition-all duration-700" style={{
              width: `${Math.min(100, +budgetPct)}%`,
              backgroundColor: +budgetPct > 80 ? COLORS.red : +budgetPct > 60 ? COLORS.amber : COLORS.green,
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelPerformanceTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Model Capability Radar</h3>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={modelPerformance} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke={COLORS.borderLight} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: COLORS.textDim, fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: COLORS.textMuted, fontSize: 9 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, fontSize: 12 }}
              />
              <Radar name="Qwen 3.7 Plus" dataKey="Qwen" stroke={COLORS.modelQwen} fill={COLORS.modelQwen} fillOpacity={0.15} strokeWidth={2} />
              <Radar name="MiniMax M2.7" dataKey="MiniMax" stroke={COLORS.modelMiniMax} fill={COLORS.modelMiniMax} fillOpacity={0.15} strokeWidth={2} />
              <Radar name="DeepSeek V4" dataKey="DeepSeek" stroke={COLORS.modelDeepSeek} fill={COLORS.modelDeepSeek} fillOpacity={0.15} strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Latency Distribution (seconds)</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={latencyData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} horizontal={false} />
              <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
              <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 11 }} axisLine={{ stroke: COLORS.borderLight }} width={110} />
              <Tooltip
                contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: COLORS.textDim }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
              <Bar dataKey="avg" name="Avg" fill={COLORS.accent} radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="p95" name="P95" fill={COLORS.amber} radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="p99" name="P99" fill={COLORS.red} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Model Status Overview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                {["Model", "Status", "Uptime", "Error Rate", "Avg Tokens/Task", "Role"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: COLORS.textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelTableData.map((m) => (
                <tr key={m.name} className="transition-colors" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                      <span className="font-medium" style={{ color: COLORS.text }}>{m.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium" style={{
                      backgroundColor: m.status === "healthy" ? COLORS.green + "22" : COLORS.amber + "22",
                      color: m.status === "healthy" ? COLORS.green : COLORS.amber,
                    }}>
                      {m.status === "healthy" ? "Healthy" : "Degraded"}
                    </span>
                  </td>
                  <td className="py-3 px-4" style={{ color: m.uptime >= 99.5 ? COLORS.green : COLORS.amber }}>
                    {m.uptime}%
                  </td>
                  <td className="py-3 px-4" style={{ color: m.errorRate > 1 ? COLORS.amber : COLORS.text }}>
                    {m.errorRate}%
                  </td>
                  <td className="py-3 px-4 font-mono text-xs" style={{ color: COLORS.textDim }}>
                    {m.avgTokens.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: COLORS.borderLight, color: COLORS.textDim }}>
                      {MODELS.find((x) => x.name === m.name)?.role || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MODELS.map((m) => {
          const row = modelTableData.find((x) => x.name === m.name);
          return (
            <div key={m.id} className="rounded-xl border p-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                <span className="text-xs font-medium" style={{ color: COLORS.textDim }}>{m.name}</span>
              </div>
              <div className="text-lg font-bold" style={{ color: COLORS.text }}>
                ¥{costData[costData.length - 1][m.name.split(" ")[0]] || "—"}
              </div>
              <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>today's spend</div>
              <div className="mt-3 w-full rounded-full h-1.5" style={{ backgroundColor: COLORS.borderLight }}>
                <div className="h-1.5 rounded-full" style={{
                  width: `${row.uptime - 97}%`,
                  backgroundColor: m.color,
                }} />
              </div>
              <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>uptime {row.uptime}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExperienceBaseTab() {
  const totalEntries = wikiEntries.length;
  const staleEntries = wikiEntries.filter((e) => e.stale).length;
  const hitRate = ((wikiEntries.reduce((s, e) => s + e.hits, 0) / totalEntries) / 100 * 100).toFixed(1);
  const growthRate = ((experienceGrowth[experienceGrowth.length - 1].total - experienceGrowth[0].total) / experienceGrowth[0].total * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Database} label="Total Entries" value={totalEntries} sub={`+${experienceGrowth[experienceGrowth.length - 1].added} today`} color={COLORS.accent} />
        <KPICard icon={Zap} label="Avg Hit Rate" value={`${hitRate}%`} sub="per entry usage" color={COLORS.green} />
        <KPICard icon={AlertTriangle} label="Stale Entries" value={staleEntries} sub="older than 30 days" color={staleEntries > 3 ? COLORS.amber : COLORS.green} />
        <KPICard icon={TrendingUp} label="Growth Rate" value={`${growthRate}%`} sub="last 30 days" color={COLORS.cyan} trend="up" />
      </div>

      <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: COLORS.text }}>Experience Base Growth</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={experienceGrowth}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
            <XAxis dataKey="day" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
            <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.borderLight }} />
            <Tooltip
              contentStyle={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.borderLight}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: COLORS.textDim }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
            <Line type="monotone" dataKey="total" name="Total Entries" stroke={COLORS.accent} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="added" name="Daily Added" stroke={COLORS.green} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border p-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>Wiki Experience Entries</h3>
          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: COLORS.borderLight, color: COLORS.textDim }}>
            {totalEntries} entries
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.borderLight}` }}>
                {["ID", "Pattern", "Category", "Hits", "Age (days)", "Status"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium uppercase tracking-wider" style={{ color: COLORS.textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wikiEntries.map((e) => (
                <tr key={e.id} className="transition-colors" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="py-3 px-4 font-mono text-xs" style={{ color: COLORS.textDim }}>{e.id}</td>
                  <td className="py-3 px-4 font-medium" style={{ color: COLORS.text }}>{e.pattern}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded text-xs" style={{
                      backgroundColor:
                        e.category === "code" ? COLORS.accent + "22" :
                        e.category === "creative" ? COLORS.pink + "22" :
                        COLORS.modelDeepSeek + "22",
                      color:
                        e.category === "code" ? COLORS.accent :
                        e.category === "creative" ? COLORS.pink :
                        COLORS.modelDeepSeek,
                    }}>
                      {e.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono" style={{ color: COLORS.text }}>
                    {e.hits}
                  </td>
                  <td className="py-3 px-4" style={{ color: e.stale ? COLORS.amber : COLORS.textDim }}>
                    {e.age}d
                  </td>
                  <td className="py-3 px-4">
                    {e.stale ? (
                      <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.amber }}>
                        <AlertTriangle size={12} /> Stale
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.green }}>
                        <CheckCircle size={12} /> Fresh
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────

const TABS = [
  { key: "tasks", label: "Live Tasks", labelZH: "任務監控", icon: Activity },
  { key: "cost", label: "Cost Analytics", labelZH: "成本分析", icon: DollarSign },
  { key: "models", label: "Model Performance", labelZH: "模型表現", icon: Brain },
  { key: "wiki", label: "Experience Base", labelZH: "經驗庫", icon: Database },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("tasks");
  const [pulse, setPulse] = useState(false);
  const [clock, setClock] = useState(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

  useEffect(() => {
    const pulseTimer = setInterval(() => setPulse((p) => !p), 2000);
    const clockTimer = setInterval(() => setClock(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 1000);
    return () => { clearInterval(pulseTimer); clearInterval(clockTimer); };
  }, []);

  const renderTab = () => {
    switch (activeTab) {
      case "tasks": return <LiveTasksTab />;
      case "cost": return <CostAnalyticsTab />;
      case "models": return <ModelPerformanceTab />;
      case "wiki": return <ExperienceBaseTab />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8" style={{ backgroundColor: COLORS.bg }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2" style={{ backgroundColor: COLORS.accent + "22" }}>
              <Zap size={20} style={{ color: COLORS.accent }} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.text }}>
                Scout-then-Swarm
              </h1>
              <p className="text-xs" style={{ color: COLORS.textMuted }}>
                Multi-LLM Agent Orchestration Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{
              backgroundColor: COLORS.green + "18",
              border: `1px solid ${COLORS.green}33`,
            }}>
              <div className="w-2 h-2 rounded-full transition-opacity duration-1000"
                style={{ backgroundColor: COLORS.green, opacity: pulse ? 1 : 0.4 }} />
              <span className="text-xs font-medium" style={{ color: COLORS.green }}>System Online</span>
            </div>
            <div className="text-xs font-mono px-3 py-1.5 rounded-lg" style={{ backgroundColor: COLORS.card, color: COLORS.textDim, border: `1px solid ${COLORS.border}` }}>
              {clock}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center"
              style={{
                backgroundColor: isActive ? COLORS.accent + "22" : "transparent",
                color: isActive ? COLORS.accent : COLORS.textMuted,
                border: isActive ? `1px solid ${COLORS.accent}33` : "1px solid transparent",
              }}
            >
              <Icon size={15} />
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden text-xs">{tab.labelZH}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="transition-all duration-300">
        {renderTab()}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t flex items-center justify-between" style={{ borderColor: COLORS.border }}>
        <span className="text-xs" style={{ color: COLORS.textMuted }}>
          Scout-then-Swarm v1.0 — LangGraph Blueprint
        </span>
        <div className="flex items-center gap-4">
          {MODELS.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="text-xs" style={{ color: COLORS.textMuted }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}