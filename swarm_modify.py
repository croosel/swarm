#!/usr/bin/env python3
"""
3 Worker Swarm — 同时调 3 个 LLM 修改 3 个文件
=================================================================

修改记录:
  v0.1 - 2026-06-17 初始版本(Mavis 写)

用法:
    # 1. 准备 API keys(三选一方式)
    export DASHSCOPE_API_KEY="sk-你的-qwen-key"      # Qwen 3.7 Plus
    export MINIMAX_API_KEY="sk-你的-minimax-key"     # MiniMax-M2.7
    export DEEPSEEK_API_KEY="sk-你的-deepseek-key"   # DeepSeek V4

    # 2. 安装依赖(一次性)
    pip install openai anthropic

    # 3. 跑
    python3 /Users/tungdebby/swarm/swarm_modify.py

输出:
    3 个修改后的文件 → *.modified(原文件不动)
    1 个修改报告 → MODIFY_REPORT.md
"""

import asyncio
import os
import sys
from pathlib import Path
from datetime import datetime

# ╔════════════════════════════════════════════════════════════════╗
# ║  路径配置 — 改这里                                                ║
# ╚════════════════════════════════════════════════════════════════╝
WORK_DIR = Path("/Users/tungdebby/swarm")

SPEC_MD       = WORK_DIR / "final/Scout-then-Swarm-技術規格書.md"        # 366KB
DASHBOARD_SPEC = WORK_DIR / "architecture/dashboard-spec.md"             # 82KB
DASHBOARD_JSX  = WORK_DIR / "final/dashboard.jsx"                          # 41KB


# ╔════════════════════════════════════════════════════════════════╗
# ║  3 Worker 配置 — API endpoint / model id / 任务                     ║
# ║  ⚠️  如果 endpoint 或 model id 不对,改这里(都是常量)              ║
# ╚════════════════════════════════════════════════════════════════╝
WORKERS = [
    # ─── Worker 1: Qwen 3.7 Plus (改 dashboard.jsx) ──────────────
    {
        "name": "Qwen3.7-Plus",
        "file": DASHBOARD_JSX,
        "client_type": "openai",  # DashScope 用 OpenAI 兼容协议
        "client_kwargs": {
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "api_key": os.getenv("DASHSCOPE_API_KEY"),
        },
        "model": "qwen3.7-plus",  # 阿里百炼 model id
        "max_tokens": 32000,
        "system": (
            "你是 React 代码专家。改代码时输出完整的新文件内容,"
            "保留所有原有功能,只按修改要求做精确变更。"
            "不要解释,直接输出新文件。"
        ),
        "task": """请修改 dashboard.jsx:

【必改】模型 id 修正(数据对齐 bug)
- minimax-m3 → MiniMax-M2.7
- kimi-k27 → 删除整个 Kimi 相关 card(老板已放弃 Kimi K2.7)
- qwen-37max → Qwen3.7-Max
- deepseek-v4pro → DeepSeek-V4-Pro

【新增】Qwen3.7-Plus 视觉能力卡片
- 在 MODELS 数组里加 1 个 { id: "qwen-37plus", name: "Qwen 3.7 Plus", color: COLORS.orange, role: "Vision/Visual" }

【删除】所有 Waggle Dance / 法定人数 / 摆尾舞 相关代码和 UI

输出:完整的新 dashboard.jsx 文件内容。""",
    },

    # ─── Worker 2: MiniMax-M2.7 (改规格书) ───────────────────────
    {
        "name": "MiniMax-M2.7",
        "file": SPEC_MD,
        "client_type": "openai",  # ⚠️ 默认 OpenAI 兼容,如果是 Anthropic 协议要改
        "client_kwargs": {
            "base_url": "https://api.minimaxi.com/v1",  # ⚠️ 默认 MiniMax 官方中国 endpoint,如不对改
            "api_key": os.getenv("MINIMAX_API_KEY"),
        },
        "model": "MiniMax-M2.7",  # ⚠️ 默认 model id
        "max_tokens": 32000,
        "system": (
            "你是中文技术文档编辑专家。改 Markdown 文档时输出完整的新文档,"
            "保留所有原有信息,只按修改要求做精确变更。"
            "不要解释,直接输出完整的新文档。"
        ),
        "task": """请修改 Scout-then-Swarm-技術規格書.md(366KB):

【必改】模型名全量更新
- minimax-m3 → MiniMax-M2.7
- kimi-k27-code → Kimi-K2.6(全文,包括定价表、模型矩阵、附录 B)
- qwen-37-max → Qwen3.7-Max
- deepseek-v4-pro → DeepSeek-V4-Pro

【必改】Kimi 降级
- 附录 B 中 Kimi Agent Swarm 从"核心对比"移至"参考案例"附录
- §3.5 模型分工策略表格:Kimi 改为"备选",加备注"老板 2026-06-17 决定放弃"
- §7 MVP 范围:删除 Kimi 相关引用

【标注】Waggle Dance
- §1.4 / §3.2 / §4.4 / §5.1 / §7.3 所有 Waggle Dance 相关章节,标题前加 "[Phase 2 - 已 disabled]"
- 保留内容,但明确标注"MVP 不实现,Phase 2 再说"

【加章节】附录 D:模型选型决策树
- 何时用 Qwen3.7-Plus(视觉 + 便宜 6 倍 vs Max)
- 何时用 Qwen3.7-Max(纯文本旗舰)
- 何时用 MiniMax-M2.7(长文 200K context)
- 何时用 DeepSeek-V4-Pro(推理最便宜)

输出:完整的新规格书内容(保留所有原有信息 + 上述修改)。""",
    },

    # ─── Worker 3: DeepSeek V4 (改 dashboard-spec) ───────────────
    {
        "name": "DeepSeek-V4-Pro",
        "file": DASHBOARD_SPEC,
        "client_type": "openai",  # DeepSeek 用 OpenAI 兼容协议
        "client_kwargs": {
            "base_url": "https://api.deepseek.com/v1",
            "api_key": os.getenv("DEEPSEEK_API_KEY"),
        },
        "model": "deepseek-reasoner",  # ⚠️ 候选:"deepseek-v4-pro" 如不对改
        "max_tokens": 32000,
        "system": (
            "你是架构师。把复杂架构简化,删除过度工程化部分。"
            "改 Markdown 文档时输出完整的新文档。不要解释,直接输出。"
        ),
        "task": """请重写 dashboard-spec.md,从 82KB 砍到 20KB 以内:

【必砍】
- 删除 §1.1 Redis Streams + InfluxDB + Grafana + FastAPI + React 全套架构
- 删除 §2.2.2 Waggle Dance 收敛时间(整个小节)
- 删除 §3.2.1 TaskCompletedEvent 的 60+ 字段,只保留 10 个核心字段(task_id, timestamp, execution_mode, model_calls_summary, total_cost_cny, total_latency_ms, final_status, final_confidence, phases_count, error_summary)
- 删除 §3.2.2 ModelCallEvent 中所有 waggle_dance 相关字段
- 删除 §3.2.3 PhaseEvent 的 waggle 阶段
- 删除所有 InfluxDB Flux 查询代码示例
- 删除 §4 Dashboard 4 个视图,简化为 1 个最简视图(Live Task View)

【新增】§1 极简架构(替代原 §1)
- 数据存储:1 个 JSON 文件(events.jsonl,append-only)
- 实时推送:跳过,改为 5 秒轮询
- 前端:1 个 HTML + vanilla JS,不要 React
- 总部署:1 个 Python Flask 服务 + 1 个静态 HTML,单机跑

【新增】§2 核心指标(只保留 5 个)
- task_throughput(tasks/min)
- total_cost_cny_per_day
- e2e_latency_p95_ms
- task_success_rate(%)
- experience_hit_rate(%)

输出:完整的新 dashboard-spec.md(20KB 以内)。""",
    },
]


# ╔════════════════════════════════════════════════════════════════╗
# ║  内部函数                                                         ║
# ╚════════════════════════════════════════════════════════════════╝
async def call_llm(worker: dict, file_content: str) -> str:
    """调 1 个 LLM 改文件"""
    client_type = worker["client_type"]
    kwargs = worker["client_kwargs"]
    model = worker["model"]
    max_tokens = worker["max_tokens"]
    system = worker["system"]
    task = worker["task"]

    user_prompt = f"""原文件内容(共 {len(file_content)} 字符):

```
{file_content}
```

修改任务:

{task}

---

请输出修改后的完整文件内容。用 markdown 代码块包裹(```文件名 ... ```)。"""

    if client_type == "openai":
        from openai import AsyncOpenAI
        client = AsyncOpenAI(**kwargs)
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        return resp.choices[0].message.content

    elif client_type == "anthropic":
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(**kwargs)
        resp = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.2,
        )
        return resp.content[0].text

    else:
        raise ValueError(f"Unknown client_type: {client_type}")


async def extract_file_content(llm_output: str, filename: str) -> str:
    """从 LLM 输出提取代码块内容"""
    import re
    patterns = [
        rf"```{re.escape(filename)}\s*\n(.*?)```",
        rf"```\w*\s*\n(.*?)```",
    ]
    for pat in patterns:
        m = re.search(pat, llm_output, re.DOTALL)
        if m:
            return m.group(1).strip()
    return llm_output.strip()


async def run_worker(worker: dict) -> dict:
    """1 个 worker 跑 1 个文件"""
    name = worker["name"]
    file_path = worker["file"]

    print(f"[{name}] 读文件: {file_path.name}")
    file_content = file_path.read_text(encoding="utf-8")
    print(f"[{name}] 文件大小: {len(file_content):,} 字符")

    api_key = worker["client_kwargs"]["api_key"]
    if not api_key:
        return {
            "worker": name,
            "status": "skipped",
            "error": f"API key 未设置(env var: {[k for k in os.environ if 'API_KEY' in k]})",
        }

    print(f"[{name}] 调 LLM ({worker['model']})...")
    try:
        llm_output = await call_llm(worker, file_content)
        new_content = await extract_file_content(llm_output, file_path.name)

        # 写回原文件(加 .modified 后缀,原文件保留)
        out_path = file_path.with_suffix(file_path.suffix + ".modified")
        out_path.write_text(new_content, encoding="utf-8")

        print(f"[{name}] ✅ 完成 → {out_path.name} ({len(new_content):,} 字符)")
        return {
            "worker": name,
            "status": "success",
            "original_size": len(file_content),
            "modified_size": len(new_content),
            "output_path": str(out_path),
            "llm_output_preview": llm_output[:500],
        }
    except Exception as e:
        print(f"[{name}] ❌ 失败: {e}")
        return {"worker": name, "status": "failed", "error": str(e)}


# ╔════════════════════════════════════════════════════════════════╗
# ║  Main                                                           ║
# ╚════════════════════════════════════════════════════════════════╝
async def main():
    print("=" * 60)
    print("  3 Worker Swarm — 同时调 3 个 LLM")
    print("=" * 60)
    print(f"  开始时间: {datetime.now().isoformat()}")
    print()

    # 检查 API keys
    missing = []
    for w in WORKERS:
        if not w["client_kwargs"].get("api_key"):
            missing.append(f"{w['name']} ({'DASHSCOPE_API_KEY' if 'dashscope' in w['client_kwargs']['base_url'] else 'MINIMAX_API_KEY' if 'minimax' in w['client_kwargs']['base_url'] else 'DEEPSEEK_API_KEY'})")
    if missing:
        print(f"  ⚠️  以下 worker 缺 API key,将被跳过:")
        for m in missing:
            print(f"     - {m}")
        print()

    # 检查文件存在
    print("  文件检查:")
    for w in WORKERS:
        p = w["file"]
        status = "✅" if p.exists() else "❌ MISSING"
        print(f"     [{status}] {p}")
    print()

    # 并行跑 3 个 worker
    results = await asyncio.gather(*[run_worker(w) for w in WORKERS])

    print()
    print("=" * 60)
    print("  结果汇总")
    print("=" * 60)
    for r in results:
        if r["status"] == "success":
            print(f"  ✅ {r['worker']}: {r['original_size']:,} → {r['modified_size']:,} 字符")
            print(f"     输出: {r['output_path']}")
        elif r["status"] == "skipped":
            print(f"  ⏭️  {r['worker']}: 跳过 ({r['error']})")
        else:
            print(f"  ❌ {r['worker']}: 失败 ({r['error']})")

    # 写报告
    report_path = WORK_DIR / "MODIFY_REPORT.md"
    report_lines = [
        "# 3 Worker Swarm 修改报告",
        "",
        f"**生成时间**: {datetime.now().isoformat()}",
        "",
        "## 结果",
        "",
    ]
    for r in results:
        report_lines.append(f"### {r['worker']}")
        report_lines.append(f"- 状态: `{r['status']}`")
        if r["status"] == "success":
            report_lines.append(f"- 原始大小: {r['original_size']:,} 字符")
            report_lines.append(f"- 修改后大小: {r['modified_size']:,} 字符")
            delta = r['modified_size'] - r['original_size']
            pct = (delta / r['original_size']) * 100
            report_lines.append(f"- 变化: {delta:+,} 字符 ({pct:+.1f}%)")
            report_lines.append(f"- 输出文件: `{r['output_path']}`")
            report_lines.append("")
            report_lines.append("**LLM 输出预览**:")
            report_lines.append("```")
            report_lines.append(r["llm_output_preview"])
            report_lines.append("```")
        elif r["status"] == "failed":
            report_lines.append(f"- 错误: `{r['error']}`")
        report_lines.append("")

    report_lines.extend([
        "## 下一步",
        "",
        "1. 老板 review 3 个 `.modified` 文件",
        "2. 确认无误后:`mv file.ext.modified file.ext` 覆盖原文件",
        "3. git commit + push",
        "4. Mavis 出 1 份整合报告(Spec / Spec / Code 的一致性)",
    ])

    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"\n  📄 报告: {report_path}")


if __name__ == "__main__":
    asyncio.run(main())