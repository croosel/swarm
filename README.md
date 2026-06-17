# Scout-then-Swarm

**基於蜂群決策模型的多 LLM Agent 協作架構**

> 不是 ensemble voting（冗餘投票），而是真正基於各 LLM 長處的分工協作。用模板匹配拆解任務，用蜂群分工執行，用交叉驗證融合結果，用經驗累積持續進化。

---

## 解決什麼問題？

現有的多模型協作方案（如 ensemble voting）讓多個模型做同一件事再投票選最佳，浪費 2/3 的 token。Scout-then-Swarm 採用**分工協作**模式：每個模型基於自身長處接收**不同的**子任務，最終產出的結果是任何單個模型都無法獨立完成的。

核心假說：**cross-verification + weighted fusion（交叉驗證 + 加權融合）顯著優於 simple ensemble（簡單集成）**。

---

## 架構概覽

四階段蜂群模型：**Scout → Swarm → Verify → Learn**

```
用戶輸入
    ↓
[Scout 階段] 任務拆解（DeepSeek V4 Pro + 經驗庫搜尋 + 模板匹配）
    ↓
[Swarm 階段] 並行執行（MiniMax M3 / Kimi K2.7 / Qwen 3.7 Max 分工協作）
    ↓
[Verify 階段] 交叉驗證（Qwen 3.7 Max 獨立審計，生產者不可驗證自己的輸出）
    ↓
[Learn 階段] 經驗回寫（SQLite + FTS + 90 天 TTL + 強制探索）
    ↓
最終輸出
```

### 三種執行模式

- **Swarm 模式**（低耦合）：子任務完全獨立，平行執行
- **Pipeline 模式**（高耦合）：子任務有線性依賴，順序執行
- **Checkpoint 模式**（混合）：階段內平行，階段間順序

### Fast-Track 快速通道

80% 的任務不需要完整四階段流程。Fast-Track Gate 在 50ms 內決定任務複雜度，簡單任務直達單模型執行。

---

## 模型陣容

| 角色 | 模型 | 負責的任務類型 |
|------|------|----------------|
| 排程蜂 (Orchestrator) | DeepSeek V4 Pro | 任務分解、推理、 cheapest |
| 長文蜂 (LongDoc) | MiniMax M3 | >50K tokens、文件分析 |
| 碼蜂 (Coder) | Kimi K2.7 Code | 程式碼生成/修改/審查 |
| 結構蜂 (Struct) | Qwen 3.7 Max | 結構化輸出、JSON、表格 |
| 裁判蜂 (Judge) | Qwen 3.7 Max | 交叉驗證紅隊、最終綜合 |
| 推理蜂 (Reasoner) | DeepSeek V4 Pro | 數學、邏輯、分析 |

**成本估算**：典型複雜任務（程式碼審查）約 ¥0.12 / 次，對比單模型 Qwen Max 約 ¥0.066，倍數約 1.8x（含 Fast-Track 後更低）。成本紅線：單次任務不超過 ¥0.50。

---

## 快速開始（MVP 路線）

**一個週末，一個假說驗證。**

```bash
# 1. 初始化
git clone <blueprint-url> && cd scout-then-swarm
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # 填入 API keys

# 2. Smoke test（單一任務）
python -c "
import asyncio
from swarm.swarm_judge import swarm_judge
result = asyncio.run(swarm_judge('Design a REST API for a todo app'))
print(f'Confidence: {result.confidence}')
print(f'Latency: {result.total_latency_s:.1f}s')
print(f'Cost: \${result.total_cost_usd:.4f}')
print(f'Mode: {result.execution_mode}')
"

# 3. 完整 A/B 基準測試
python -m tests.benchmark.run_benchmark --tasks tests/benchmark/tasks.json --concurrent 3

# 4. 查看統計結果
python -m tests.benchmark.analyze data/benchmark/latest.json
```

### MVP 成功標準（Go / No-Go）

| 指標 | 目標 | 測量方式 |
|------|------|----------|
| 品質提升 | swarm_judge confidence 比 baseline 高 ≥ 5% | Mann-Whitney U test |
| 統計顯著性 | p < 0.05 | 雙尾檢定 |
| P95 延遲 | < 15 秒 | 100 個任務的 P95 |
| Fast-Track 準確率 | 簡單任務 100% 被分類為 fast_track | 30 個簡單任務命中數 |
| 錯誤率 | < 5% | 100 個任務中失敗數 |
| 平均成本 | < $0.10 USD / 任務 | 總成本 / 100 |

**Go 條件**：以上 6 項全部達成。**No-Go 條件**：任何 1 項未達成 → 停止或重新設計。

---

## 專案結構

```
swarm/
├── README.md                          # 本文件
├── ROADMAP.md                         # 專案路線圖
├── CONTRIBUTING.md                    # 貢獻指南
├── LICENSE                            # MIT License
├── .env                               # API keys（不提交）
├── .gitignore
├── swarm-state.md                     # 專案狀態追蹤
├── wiki-scout/
│   └── scout-findings.md              # 偵查蜂 Wiki 掃描報告
├── architecture/
│   ├── architecture-design.md         # 系統架構設計書
│   └── dashboard-spec.md              # Dashboard 規格
├── engineering/
│   └── engineering-plan.md            # 工程實作計畫
├── critique/
│   └── critic-bee-report.md           # 審稿蜂第一性原理挑戰報告
└── final/
    ├── Scout-then-Swarm-技術規格書.md  # 完整技術規格書（v1.0 定稿）
    ├── appendix-model-matrix.md       # 模型能力矩陣附錄
    ├── dashboard.jsx                  # Dashboard UI 元件
    └── verify-checklist.md            # 驗證清單
```

### 未來實作結構（Phase 0+）

```
scout-then-swarm/
├── pyproject.toml
├── config/
│   ├── models.yaml                    # 模型 Provider 註冊
│   ├── routing.yaml                   # 路由規則（子任務類型 → 模型）
│   └── policies.yaml                  # Fast-Track、超時、重試、成本策略
├── src/swarm/
│   ├── core/                          # Pydantic schemas, LiteLLM client, config
│   ├── stages/                        # scout.py, swarm.py, verify.py
│   ├── judge/                         # 加權融合、第一性原理檢查
│   ├── graph/                         # LangGraph StateGraph 定義
│   ├── wiki/                          # Wiki 經驗庫（SQLite MVP）
│   └── swarm_judge.py                 # 核心入口函式
├── tests/benchmark/                   # A/B 測試腳本與分析
└── data/wiki.db                       # SQLite 經驗庫
```

---

## 技術棧

- **Python 3.11+**
- **LangGraph** — 狀態機引擎（StateGraph, nodes, edges）
- **LiteLLM** — 統一模型調用層
- **SQLite + FTS5** — 經驗庫存儲
- **Pydantic v2** — 資料 Schema 驗證

**定位**：LangGraph Blueprint（可 clone 的 Graph 模板），不是獨立框架。價值在於：任務分解模板庫 + 結構化辯論協議 + 經驗系統。

---

## 核心設計原則

1. **分工，不投票** — 每個模型做不同的子任務，不是三個模型做同一件事再挑最好的
2. **任務類型感知的評估策略** — 分析型用一階原則，程式碼用可執行性，創意型用約束符合性
3. **經驗引導搜索** — Orchestrator 先搜 Wiki 經驗庫，用過去的任務拆解模式作為起點
4. **結構化辯論收斂** — 好的方向經過紅隊質詢後仍然成立才吸引更多資源，差的方向被質疑後自然衰減
5. **藍圖而非框架** — 不封裝 LangGraph 已有的原語，價值在應用層

---

## 文件與資源

- [完整技術規格書](final/Scout-then-Swarm-技術規格書.md) — v1.0 定稿，整合四蜂產出
- [系統架構設計書](architecture/architecture-design.md) — 建築蜂產出
- [工程實作計畫](engineering/engineering-plan.md) — 工程蜂產出
- [審稿蜂報告](critique/critic-bee-report.md) — 第一性原理挑戰與風險地圖
- [專案路線圖](ROADMAP.md) — 分階段開發計畫
- [貢獻指南](CONTRIBUTING.md) — 如何參與貢獻

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Badges（待補充）

<!-- TODO: 添加 CI/CD、coverage、license 等 badges -->

---

**不要建大教堂。先搭帳篷，看看有沒有人想住進來。**
