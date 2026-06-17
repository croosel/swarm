## Scout-then-Swarm：基於蜂群決策模型的多 Agent 協作架構

### 技術規格書 v1.0

> **版本**: 1.0.0
> **日期**: 2026-07-17
> **狀態**: 整合四蜂產出（偵查蜂、建築蜂、工程蜂、審稿蜂），交叉驗證後定稿
> **定位**: LangGraph Blueprint — 可 clone 的多 LLM 協作模板，不是獨立框架

---

> **架構哲學**：不是 ensemble voting（冗餘投票），而是真正基於 LLM 長處的分工協作。
> 用模板匹配 + 第一性原理拆解任務，用蜂群分工執行，用交叉驗證融合結果，用經驗累積持續進化。

---

### 一、核心原則

#### 1.1 分工，不投票

每個模型基於自身長處接收**不同的**子任務，而非三個模型做同一件事再選最好的。分工產出的最終結果，是任何單個模型都產不出的東西。

- **反原則**：不做 ensemble voting。三個模型回答同一個問題再投票選最佳 = 浪費 2/3 的 token。

#### 1.2 任務類型感知的評估策略（非通用第一性原理）

> **審稿蜂修正**：原「第一性原理評估」對開放式創意任務無效。改為按任務類型路由評估策略。

| 任務類型 | 評估策略 | 具體檢查項 |
|---------|---------|----------|
| 分析型（analytical） | 一階原則 | 邏輯自洽？覆蓋所有要求？有事實錯誤？推導完整？ |
| 程式碼（code） | 可執行性 | 能編譯/執行？處理邊界？符合框架版本？有安全漏洞？ |
| 創意型（creative） | 約束符合性 | 符合風格/調性？滿足長度/格式？有 AI 味？偏離主題？ |

任務類型在模板匹配階段確定，不依賴 Orchestrator 即時判斷。

#### 1.3 經驗引導搜索

Orchestrator 先搜 Wiki 經驗庫，用過去的任務拆解模式作為起點，再用第一性原理校驗適用性。經驗決定往哪看，第一性原理決定看到之後怎麼判斷。

#### 1.4 結構化辯論收斂（非純正反饋）

> **審稿蜂修正**：原「搖擺舞正反饋」有馬太效應風險。改為結構化辯論協議。

好的方向經過紅隊質詢後仍然成立才吸引更多資源（擺尾舞），差的方向被質疑後自然衰減。多路徑收斂到相似結論時才定稿（法定人數閾值），沒有共識時不假裝有共識。

防馬太效應機制：
- 置信度上限 0.8（保留不確定性）
- 強制紅隊質詢（每個方向都必須被挑戰）
- 衰減函數（未被再次確認的方向權重自然下降）
- 20% 最低探索預算

#### 1.5 藍圖而非框架

> **審稿蜂修正**：不做獨立框架，定位為 LangGraph Blueprint。

- 不封裝 LangGraph 已有的原語（StateGraph, nodes, edges）
- 價值在於：任務分解模板庫 + 結構化辯論協議 + 經驗系統
- 發布形式：可 clone 的 LangGraph Blueprint 專案

---

### 二、蜂群四層機制 → 技術映射

| 蜂群機制 | 技術實現 | 說明 | Wiki 先驗原型 |
|---------|---------|------|-------------|
| 偵查蜂（Scout） | Orchestrator + Experience DB 搜尋 + 模板匹配 | 帶經驗做任務分析和拆解 | PAP Stage 1-2 + P0 指揮官 |
| 排程蜂（Orchestrator） | DeepSeek V4 Pro + 分解覆核檢查 | DAG 任務圖生成 + 耦合度判斷 | 3-Phase 主 Agent |
| 工蜂（Worker Bee N） | LiteLLM 並行調用，按子任務類型路由模型 | 各模型執行不同子任務 | 3-Phase Phase 2 並行 Agent |
| 擺尾舞（Waggle Dance） | 結構化辯論：紅隊質詢 + 倡議蜂回應 + 交叉授粉 | 取代純正反饋，防止馬太效應 | — |
| 裁判蜂（Judge） | Qwen 3.7 Max 交叉驗證 + 加權融合 | 不參與執行，獨立審計 | OPC 質檢總監 |
| 法定人數（Quorum） | 置信度 >= 0.6 + 領先第二名 1.5 倍 + 無致命缺陷 | 三條件同時滿足才收斂 | — |
| 經驗回寫（Learn） | SQLite + FTS + TTL + 強制探索 | 成功經驗沉澱，過期自動清理 | 經驗反饋閉環 |

---

### 三、系統架構

#### 3.1 系統元件圖

```
+====================================================================+
|                     Scout-then-Swarm                               |
|                   (LangGraph Blueprint)                            |
|                                                                    |
|  +-------------------+    +-------------------+                    |
|  |   User / Client   |    |   Experience DB   |                    |
|  +--------+----------+    |   (SQLite + FTS)  |                    |
|           |               +--------+----------+                    |
|           v                        |                               |
|  +--------+----------+            |                                |
|  |   Fast-Track      |            |                                |
|  |   Gate            |            |                                |
|  |   (規則引擎,<50ms) |            |                                |
|  +--+----------+-----+            |                                |
|     |          |                   |                                |
|  簡單|       複雜|                  |                               |
|     v          v                   |                                |
|  +----+  +----+----------+--------+------+                         |
|  |單模|  |   Orchestrator (排程蜂)        |                         |
|  |型直|  |   DeepSeek V4 Pro              |                         |
|  |接執|  |   + Template Matching Engine   |                         |
|  |行  |  |   + Experience Search          |                         |
|  +----+  +----+----------+----------------+                         |
|            |                |                                       |
|     分解結果|          任務圖|                                       |
|            v                v                                       |
|  +---------+---+    +------+--------+                              |
|  | Task Graph  |    | Mode Selector |                              |
|  | (DAG)       |    | Swarm/Pipe/CP |                              |
|  +---------+---+    +------+--------+                              |
|            |                |                                       |
|            v                v                                       |
|  +---------+----------------+----------+                           |
|  |         Execution Engine             |                          |
|  |  +------------+ +------------+      |                           |
|  |  | Worker Bee | | Worker Bee |      |                           |
|  |  | (MiniMax)  | | (Kimi K2.7)|      |                           |
|  |  +------------+ +------------+      |                           |
|  |  +------------+ +------------+      |                           |
|  |  | Worker Bee | | Judge Bee  |      |                           |
|  |  | (Qwen Max) | | (Qwen Max) |      |                           |
|  |  +------------+ +------------+      |                           |
|  +---------+---------------------------+                           |
|            |                                                        |
|            v                                                        |
|  +---------+----------+                                            |
|  |   Waggle Dance     |  (Phase 2 — MVP 不實作)                     |
|  |   (結構化辯論收斂)   |                                            |
|  +---------+----------+                                            |
|            |                                                        |
|            v                                                        |
|  +---------+----------+                                            |
|  |   Synthesizer      |                                            |
|  |   (Qwen 3.7 Max)   |                                            |
|  +---------+----------+                                            |
|            |                                                        |
|            v                                                        |
|  +---------+----------+                                            |
|  |   Output + Exp.    |                                            |
|  |   Writeback        |                                            |
|  +--------------------+                                            |
+====================================================================+
```

#### 3.2 三種執行模式

**Swarm 模式**（低耦合 — 子任務完全獨立）：

```
Task Graph → [Worker A ∥ Worker B ∥ Worker C] → Self-Check → Synthesizer → 輸出
```

適用場景：程式碼審查（靜態分析、邏輯審查、風格檢查平行進行）

**Pipeline 模式**（高耦合 — 子任務有線性依賴）：

```
Task Graph → Stage 1 → Checkpoint α → Stage 2 → Checkpoint β → Stage 3 → 輸出
```

適用場景：需求分析 → 程式碼實現 → 測試生成

**Checkpoint 模式**（混合 — 階段內平行，階段間順序）：

```
Task Graph → [Phase 1: A ∥ B ∥ C] → Checkpoint γ → [Phase 2: D ∥ E] → Checkpoint δ → Pipeline Stage 3 → 輸出
```

適用場景：前端元件開發（多元件平行）→ 整合測試（依賴所有元件）

**耦合度判斷規則**（三級，非二元）：

```python
def determine_coupling(task_graph):
    output_deps = count_output_as_input_edges(task_graph)
    if output_deps == 0:
        return "low"      # → Swarm
    elif output_deps <= len(task_graph.nodes) * 0.3:
        return "medium"   # → Checkpoint
    else:
        return "high"     # → Pipeline
```

> **審稿蜂建議 + 整合者裁決**：不確定時預設 Pipeline（寧可慢，不要錯）。只有經驗庫命中高置信度經驗時才用 Swarm。

#### 3.3 Fast-Track 快速通道

> 80% 的任務不需要完整四階段流程。Fast-Track Gate 在 50ms 內決定任務複雜度。

```python
class FastTrackGate:
    """純規則引擎，不呼叫 LLM。50ms 內決定任務是否走快速通道。"""
    FAST_TRACK_TEMPLATES = {
        "translation":        {"model": "kimi-k27-code",   "reason": "中文理解強"},
        "summarization":      {"model": "minimax-m3",     "reason": "長文本處理"},
        "code_snippet":       {"model": "kimi-k27-code",   "reason": "程式碼生成"},
        "structured_extract": {"model": "qwen-37-max",    "reason": "結構化輸出"},
        "reasoning_step":     {"model": "deepseek-v4-pro", "reason": "推理最便宜"},
    }

    def classify(self, user_input: str) -> GateResult:
        if len(user_input) < 500 and not self._has_multi_step_signals(user_input):
            template = self._match_fast_template(user_input)
            if template:
                return GateResult(fast_track=True, template=template)
        return GateResult(fast_track=False)
```

延遲預算：
- Fast-Track 分類：< 50ms
- 簡單任務直達：< 2s
- 複雜任務完整流程：< 30s（P95 < 15s 為 MVP 目標）
- 目標：80% 的請求走 Fast-Track

#### 3.4 Orchestrator 決策樹

```
用戶輸入 → Fast-Track Gate (規則, <50ms)
    ├── 命中 → 單模型直達 → 經驗回寫 → END
    └── 未命中 → 查詢經驗庫
        ├── 命中經驗 → 使用歷史分解模板
        └── 未命中 → 模板匹配 (最近似)
            └── 分解覆核檢查
                ├── 通過 → 判斷耦合度 → Swarm / Checkpoint / Pipeline
                └── 未通過 → 降級到 Pipeline 或人類確認
```

**分解覆核檢查（Decomposition Sanity Check）**：
1. 完整性：子任務輸出集合是否覆蓋原始任務所有要求？
2. 無環性：DAG 是否真的是 DAG？（DFS 循環依賴檢測）
3. 可驗證性：每個子任務是否有明確完成條件？
4. 模型匹配：分配的模型是否在能力範圍內？
5. 數量上限：子任務 <= 8 個（超過 = 過度分解）

#### 3.5 模型分工策略

```
+====================+==================+=========================+
| 角色               | 模型             | 負責的任務類型           |
+====================+==================+=========================+
| 排程蜂 (Orch.)     | DeepSeek V4 Pro  | 任務分解、推理、 cheapest|
| 長文蜂 (LongDoc)   | MiniMax M3       | >50K tokens、文件分析    |
| 碼蜂 (Coder)       | Kimi K2.7 Code   | 程式碼生成/修改/審查     |
| 結構蜂 (Struct)    | Qwen 3.7 Max     | 結構化輸出、JSON、表格   |
| 裁判蜂 (Judge)     | Qwen 3.7 Max     | 交叉驗證紅隊、最終綜合   |
| 推理蜂 (Reasoner)  | DeepSeek V4 Pro  | 數學、邏輯、分析         |
+====================+==================+=========================+
```

成本估算（以程式碼審查為例）：
- Orchestrator 分解: ~500 tokens out → ¥0.003
- Kimi K2.7 靜態分析: ~2K in, ~1K out → ¥0.04
- DeepSeek V4 邏輯審查: ~2K in, ~1K out → ¥0.012
- Qwen 3.7 綜合: ~3K in, ~1.5K out → ¥0.045
- **總計: ~¥0.12 / 次**（對比單模型 Qwen Max ~¥0.066，約 1.8 倍）
- **成本紅線**: 單次任務不超過 ¥0.50

---

### 四、實作細節

#### 4.1 專案結構

```
scout-then-swarm/
├── pyproject.toml
├── .env.example
├── config/
│   ├── models.yaml          # 模型 Provider 註冊
│   ├── routing.yaml         # 路由規則（子任務類型 → 模型）
│   └── policies.yaml        # Fast-Track 分類、超時、重試、成本策略
├── src/
│   ├── swarm/
│   │   ├── core/
│   │   │   ├── models.py        # Pydantic schemas（所有資料結構）
│   │   │   ├── litellm_client.py # LiteLLM 統一呼叫層
│   │   │   └── config.py        # 設定載入
│   │   ├── stages/
│   │   │   ├── scout.py         # Scout 階段：任務拆解
│   │   │   ├── swarm.py         # Swarm 階段：並行執行
│   │   │   └── verify.py        # Verify 階段：交叉驗證
│   │   ├── judge/
│   │   │   ├── fusion.py        # 加權融合邏輯
│   │   │   └── first_principles.py # 第一性原理檢查
│   │   ├── graph/
│   │   │   └── swarm_graph.py   # LangGraph StateGraph 定義
│   │   ├── wiki/
│   │   │   └── experience.py    # Wiki 經驗庫（SQLite MVP）
│   │   └── swarm_judge.py       # 核心入口函式
│   └── baseline/
│       └── simple_ensemble.py   # 對照組：簡單集成
├── tests/
│   └── benchmark/
│       ├── tasks.json           # 100 個測試任務
│       ├── run_benchmark.py     # A/B 測試腳本
│       └── analyze.py           # 統計分析
└── data/
    └── wiki.db                  # SQLite 經驗庫
```

#### 4.2 核心入口：`swarm_judge()`

```python
async def swarm_judge(
    task: str,
    *,
    wiki: WikiStore | None = None,
    config_path: str = "config/",
    timeout: float = 30.0,
) -> SwarmOutput:
    """
    Scout-then-Swarm 完整流水線。
    核心假說：cross-verification + weighted fusion > simple ensemble
    """
    t0 = time.monotonic()
    cfg = load_config(config_path)
    wiki = wiki or WikiStore("data/wiki.db")

    # ── Stage 1: Scout ──────────────────────────────────────
    past_experience = wiki.search(task, limit=3)
    decomposition = await decompose_task(
        task=task, past_experience=past_experience,
        model=cfg.routing.scout_model, timeout=timeout,
    )

    # ── Fast-track: 單子任務 → 跳過 Swarm ───────────────────
    if len(decomposition.subtasks) <= 1:
        result = await _fast_track(task, decomposition, cfg, timeout)
        result.total_latency_s = time.monotonic() - t0
        return result

    # ── Stage 2: Swarm ──────────────────────────────────────
    worker_responses = await execute_workers(
        decomposition=decomposition,
        routing_cfg=cfg.routing, timeout=timeout,
    )

    # ── Stage 3: Verify ─────────────────────────────────────
    verify_results = await cross_verify(
        task=task, decomposition=decomposition,
        responses=worker_responses,
        judge_model=cfg.routing.judge_model, timeout=timeout,
    )

    # ── Stage 4: Fuse ───────────────────────────────────────
    fused = await weighted_fuse(
        task=task, responses=worker_responses,
        verifications=verify_results,
        judge_model=cfg.routing.judge_model, timeout=timeout,
    )

    # ── Learn: 經驗回寫 ─────────────────────────────────────
    output = SwarmOutput(
        task=task, result=fused.result, confidence=fused.confidence,
        subtasks=decomposition.subtasks,
        worker_responses=worker_responses,
        verifications=verify_results,
        execution_mode=decomposition.execution_mode,
        total_latency_s=time.monotonic() - t0,
        total_cost_usd=sum(r.cost_usd for r in worker_responses) + fused.cost_usd,
    )
    wiki.write_experience(task, output)
    return output
```

#### 4.3 加權融合算法

權重公式：**w_i = 0.4 * self_confidence + 0.6 * verification_score**

> 60/40 分配偏向獨立驗證，因為模型自我報告的置信度傾向過度自信。

```python
def _compute_weights(responses, verifications):
    SELF_W, VERIFY_W = 0.4, 0.6
    verify_map = {v.subtask_id: v for v in verifications}
    weights = []
    for r in responses:
        v = verify_map.get(r.subtask_id)
        verify_score = v.check.overall_confidence if v else 0.5
        raw = r.confidence * SELF_W + verify_score * VERIFY_W
        weights.append(WeightInfo(subtask_id=r.subtask_id,
                                  raw_confidence=r.confidence,
                                  verification_score=verify_score,
                                  final_weight=raw))
    # 正規化
    total = sum(w.final_weight for w in weights)
    for w in weights:
        w.final_weight = w.final_weight / total if total > 0 else 1.0 / len(weights)
    return weights
```

#### 4.4 交叉驗證規則

**核心原則：生產者不可驗證自己的輸出。**

```python
def _pick_verifier(worker_model: str, default_judge: str) -> str:
    """驗證模型必須與生產模型不同。"""
    if worker_model == default_judge:
        return "deepseek-v4-pro"   # Qwen 生產 → DeepSeek 驗證
    return default_judge            # 其他 → Qwen 驗證
```

驗證路由表：

| 生產模型 | 驗證模型 |
|---------|---------|
| deepseek-v4-pro | qwen-37-max |
| kimi-k27-code | qwen-37-max |
| minimax-m3 | deepseek-v4-pro |
| qwen-37-max | deepseek-v4-pro |

#### 4.5 資料 Schema（Pydantic v2）

核心模型定義：

```python
class SubTask(BaseModel):
    subtask_id: str            # "st_1", "st_2", ...
    description: str           # 明確、可執行的任務描述
    subtask_type: SubTaskType  # reasoning | code | analysis | creative | data
    expected_output: str       # 預期輸出格式
    depends_on: list[str]      # 依賴的子任務 ID（空 = 獨立）
    estimated_difficulty: float  # 0.0-1.0
    max_tokens: int = 4096

class TaskDecomposition(BaseModel):
    original_task: str
    subtasks: list[SubTask]          # 1-8 個子任務
    execution_mode: ExecutionMode    # swarm | pipeline | checkpoint | fast_track
    scout_confidence: float          # 0.0-1.0
    experience_used: bool

class FirstPrincipleCheck(BaseModel):
    logical_consistency: float   # 0.0-1.0
    completeness: float          # 0.0-1.0
    accuracy: float              # 0.0-1.0
    relevance: float             # 0.0-1.0
    issues: list[str]
    overall_confidence: float    # 加權平均

class FusedResult(BaseModel):
    result: str
    confidence: float
    contradictions: list[str]
    weights: list[WeightInfo]
    cost_usd: float
```

完整 JSON Schema 見工程蜂產出 §3.2。

#### 4.6 經驗庫 Schema（SQLite）

```sql
CREATE TABLE experiences (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_summary    TEXT NOT NULL,        -- 任務摘要（<=200字）
    task_hash       TEXT NOT NULL,        -- MD5(normalized_task)
    subtask_types   TEXT,                 -- JSON array
    execution_mode  TEXT,                 -- swarm | pipeline | checkpoint
    outcome         TEXT,                 -- success | partial | failure
    confidence      REAL,                 -- 0.0-1.0
    lesson          TEXT,                 -- 關鍵教訓
    model_versions  TEXT,                 -- JSON {role: model_version}
    sample_size     INTEGER DEFAULT 1,    -- 觀察次數
    created_at      TEXT NOT NULL,
    expires_at      TEXT,                 -- 90 天 TTL
    raw_output      TEXT                  -- 完整 JSON 輸出
);
CREATE INDEX idx_task_hash ON experiences(task_hash);
CREATE INDEX idx_created_at ON experiences(created_at);
```

經驗生命周期：
1. 任務成功 → 寫入經驗庫（TTL = 90 天，model_versions = 當前版本）
2. 被後續使用 → sample_size++，置信度加權更新
3. 模型版本變更 → stale = TRUE，置信度 *= 0.5
4. 連續失敗 3 次 → 刪除
5. 過期 → 歸檔

#### 4.7 LangGraph StateGraph

```python
def build_swarm_graph() -> StateGraph:
    """
    Scout-then-Swarm 的 LangGraph 圖。
    Flow:
      START → scout → [simple?] → fast_track → learn → END
                                → swarm → verify → [confidence?] → fuse → learn → END
                                                         ↓ (低置信度，未重試過)
                                                       swarm (重試一次)
    """
    graph = StateGraph(SwarmState)
    graph.add_node("scout", scout_node)
    graph.add_node("fast_track", fast_track_node)
    graph.add_node("swarm", swarm_node)
    graph.add_node("verify", verify_node)
    graph.add_node("fuse", fuse_node)
    graph.add_node("learn", learn_node)

    graph.add_edge(START, "scout")
    graph.add_conditional_edges("scout", route_after_scout, {
        "fast_track": "fast_track", "swarm": "swarm",
    })
    graph.add_edge("fast_track", "learn")
    graph.add_edge("swarm", "verify")
    graph.add_conditional_edges("verify", route_after_verify, {
        "fuse": "fuse", "swarm": "swarm",  # 重試路徑
    })
    graph.add_edge("fuse", "learn")
    graph.add_edge("learn", END)
    return graph.compile()
```

#### 4.8 設定檔範例

**`config/models.yaml`**（模型 Provider 註冊）：

```yaml
providers:
  deepseek-v4-pro:
    api_base: "https://api.deepseek.com"
    api_key_env: "DEEPSEEK_API_KEY"
    litellm_model: "openai/deepseek-reasoner"
    context_window: 131072
    strengths: [reasoning, cost_efficiency]
    pricing:
      input_per_million_cny: 3.0
      output_per_million_cny: 6.0
    known_issues:
      - "Rate limits during peak hours (UTC 02:00-10:00)"
  # ... 其餘模型見附錄 A
```

**`config/routing.yaml`**（路由規則）：

```yaml
defaults:
  scout_model: "deepseek-v4-pro"
  judge_model: "qwen-37-max"
  default_model: "deepseek-v4-pro"

type_routing:
  reasoning:  { primary: "deepseek-v4-pro", fallback: "qwen-37-max" }
  code:       { primary: "kimi-k27-code",   fallback: "qwen-37-max" }
  analysis:   { primary: "minimax-m3",      fallback: "deepseek-v4-pro" }
  creative:   { primary: "qwen-37-max",     fallback: "deepseek-v4-pro" }
  data:       { primary: "qwen-37-max",     fallback: "deepseek-v4-pro" }

verification:
  rule: "verifier_model != worker_model"
  default_verifier: "qwen-37-max"
  overrides:
    "qwen-37-max": "deepseek-v4-pro"
    "deepseek-v4-pro": "qwen-37-max"
```

**`config/policies.yaml`**（策略設定）：

```yaml
fast_track:
  enabled: true
  max_subtasks_for_fast_track: 1

timeouts:
  scout: 15
  worker_single: 20
  verify: 15
  fuse: 15
  total_p95_budget: 15
  total_hard_limit: 60

cost:
  max_per_task: 0.50     # USD
  daily_budget: 50.00

waggle_dance:
  enabled: false         # MVP 不實作，Phase 2 加入
  max_iterations: 3
  convergence_threshold: 0.7
```

#### 4.9 錯誤處理與降級鏈

```
完整 Swarm/Checkpoint/Pipeline
    │ (某子任務失敗 2 次)
    v
跳過失敗子任務 + 標記缺口
    │ (缺口導致後續也失敗)
    v
降級到 Pipeline 模式
    │ (Pipeline 也失敗)
    v
降級到 Fast-Track（單模型嘗試）
    │ (單模型也失敗)
    v
返回錯誤 + 記錄負面經驗 + 通知用戶
```

錯誤分級：

| 級別 | 描述 | 處理 | 例子 |
|------|------|------|------|
| RECOVERABLE | 單子任務失敗 | retry 同模型(2次) → retry 其他模型(1次) | API timeout, rate limit |
| DEGRADABLE | 非關鍵子任務持續失敗 | 跳過 + 標記缺口 | 可選增強子任務 |
| FATAL | 分解本身有問題 | abort + 上報人類 | 不可能的依賴、所有模型同失敗 |

---

### 五、風險評估與應對

> 本節整合審稿蜂（Critic Bee）的風險地圖 + 建築蜂/工程蜂的具體應對措施。

#### 5.1 風險地圖

##### 致命風險（1 項）

| ID | 風險 | 嚴重度 | 建築蜂應對 | 工程蜂應對 | 覆蓋狀態 |
|----|------|--------|-----------|-----------|---------|
| O1 | Orchestrator 任務拆解錯誤 → 全線垃圾進垃圾出 | **致命** | 模板匹配取代自由拆解 + 分解覆核檢查 + 降級到 Pipeline | `DecompositionGuard`：循環依賴檢測、過度分解檢測、空分解檢測 | **已覆蓋** |

O1 殘餘風險：模板庫覆蓋不到的新任務類型仍需自由分解。應對：新任務類型觸發 exploration run，結果沉澱為新模板。

##### 嚴重風險（5 項）

| ID | 風險 | 嚴重度 | 建築蜂應對 | 工程蜂應對 | 覆蓋狀態 |
|----|------|--------|-----------|-----------|---------|
| E1 | 第一性原理評估對開放式任務無效 | 嚴重 | 任務類型感知評估策略（analytical/creative/code） | `FirstPrincipleCheck` 通用 but 缺少任務類型路由 | **部分覆蓋** — 需在 verify 階段加入任務類型路由 |
| W1 | 擺尾舞正反饋放大早期錯誤（馬太效應） | 嚴重 | 結構化辯論 + 紅隊 + 置信度上限 0.8 + 衰減 + 交叉授粉 | MVP 禁用擺尾舞（`waggle_dance.enabled: false`） | **已覆蓋**（Phase 2） |
| X1 | 經驗過時 / 錯誤經驗擴散 | 嚴重 | TTL + model_version 追蹤 + 強制探索 + stale 標記 | `experience_gc`：過期清理 + 低置信度清理 + 矛盾檢測 | **已覆蓋** |
| C1 | 耦合度判斷錯誤 → 產出不一致需重做 | 嚴重 | 三級耦合 + 三種執行模式 + 動態模式切換 + 預設保守 | 三種模式實作 + 拓撲分組 + 預設 Pipeline | **已覆蓋** |
| D1 | 延遲 3-5 倍 + 成本 5 倍 | 嚴重 | Fast-Track Gate + 延遲預算 + 流式輸出 | `LatencyGuard` + 成本警報 + Fast-Track 分類器 | **已覆蓋** |

##### 可控風險（2 項）

| ID | 風險 | 嚴重度 | 應對 | 覆蓋狀態 |
|----|------|--------|------|---------|
| P1 | 與 LangGraph 無本質差異 | 可控 | 定位為 LangGraph Blueprint；差異化在模板庫 + 辯論協議 + 經驗系統 | **已覆蓋** |
| M1 | MVP 範圍過大 | 可控 | 只驗證一個假說（交叉驗證融合 vs 簡單集成），一個週末出結果 | **已覆蓋** |

#### 5.2 E1 殘餘風險處理計劃

審稿蜂指出「第一性原理評估對開放式任務無效」，建築蜂已提出任務類型感知策略但工程蜂的 `verify.py` 尚未實作路由。整合者裁決：

1. MVP 階段：在 `Scout` 的 `TaskDecomposition` 中標記 `task_type`（analytical/code/creative）
2. `verify.py` 根據 `task_type` 選擇不同的 VERIFY_SYSTEM_PROMPT
3. creative 類型任務跳過自動驗證，直接進入融合（置信度標記為 "human_review_needed"）

---

### 六、Wiki 經驗庫整合

> 本節整合偵查蜂（Scout Bee）對 AIP-LLMWiki 172 個檔案的全量掃描結果。

#### 6.1 可直接複用的 Wiki 先驗知識

| Wiki 先驗 | 來源檔案 | 在 Scout-then-Swarm 中的應用 |
|-----------|---------|--------------------------|
| 3-Phase 流水線（主Agent + N Worker + 聚合） | `Agent并行架构.md` | Scout→Swarm→Synthesizer 的三階段架構 |
| 依賴拓撲分析法（三條規則判斷串/並行） | `Agent并行架构.md` | 耦合度判斷的理論基礎 |
| 按產品拆分 5 Agent 並行，牆鐘 ↓80% | `Agent并行架构.md` | 支持「分工不投票」原則的實證數據 |
| LLM-as-Judge 5 總監 + 質檢框架 | `OPC质检Agent独立审计框架.md` | Judge Bee 的原型：獨立審計、PASS/REVISE/ROLLBACK |
| 四類任務差異化評分（產出物/流程/決策/持續） | `OPC质检Agent独立审计框架.md` | 任務類型感知評估策略的先驗 |
| Agent-Handoff 標準協議 | `Agent-Handoff协议.md` | Worker 間的資訊交接格式 |
| 經驗反饋閉環（執行前查 → 執行中記 → 執行後沉澱） | `Agent工作流协议.md` | 經驗系統的生命周期設計 |
| PAP 五型分類（MUST/FORBID/THRESHOLD/FORMAT/PITFALL） | `Prompt_Augmentation_Pipeline.md` | Scout 輸出的結構化知識格式 |
| OODA 循環（Observe→Orient→Decide→Act） | `态势感知系统-OODA循环与经验积累.md` | Scout=Observe/Orient, Workers=Decide/Act, Judge=Learn |
| SPE 路徑矩陣（P0 API < P1 JS < P2 UI） | `最短时间执行路径方法论.md` | Worker 執行路徑可達性評估 |
| 反自欺協議（物理驗證成功狀態） | `最短时间执行路径方法论.md` | Verify 階段的核心原則 |
| Conductor-Executor 雙 Agent 模型 | `P0指挥官协同方法论.md` | Orchestrator 的一對多擴展基礎 |

#### 6.2 關鍵設計原則（從 Wiki 經驗提煉）

1. **按產品/實體拆分，不按任務類型拆分**（Agent 並行架構實證：按產品拆 = 最高並行度 + 最低協調成本 + 最強一致性）
2. **切分點唯一**（Phase 1 的結構化輸出是唯一分發點）
3. **質檢 Agent 必須獨立**（不參與執行、不看執行過程、基於預設目標評分）
4. **經驗閉環是護城河**（OODA 循環每多轉一圈，對手就落後一圈）
5. **PAP 注入是必要前置**（裸 Agent 精度 5%，Wiki 注入後 100%）
6. **反自欺協議**（任何「成功」都必須經過物理驗證）
7. **升級由資料驅動，不由時間驅動**（三階段升級路徑的核心教訓）

#### 6.3 知識缺口

| 缺口 | 嚴重度 | Scout-then-Swarm 的處理 |
|------|--------|------------------------|
| Scout-then-Swarm 專屬文件 | 高 | 本技術規格書即為填補 |
| Model Fusion / 模型融合實測 | 高 | MVP 的核心驗證目標 |
| Swarm 動態協調（任務搶佔、負載均衡） | 中 | Phase 2+，MVP 用靜態分配 |
| 失敗恢復與自動重分配 | 中 | 降級鏈已覆蓋基礎場景 |
| Token 成本優化（多 Agent 並行時） | 低 | Fast-Track + 成本紅線已覆蓋 |

#### 6.4 建議新增的 Wiki 頁面（執行後沉澱）

1. `Scout-then-Swarm架構設計.md` — 本規格書的 Wiki 版本
2. `Model-Fusion多模型融合實測.md` — MVP 基準測試結果
3. `Swarm協調機制設計.md` — Worker 間動態協調經驗
4. `agentfw代理網關評估.md` — Proxy/Gateway 工具選型

---

### 七、MVP 路線圖

> **核心假說**：cross-verification + weighted fusion（交叉驗證 + 加權融合）顯著優於 simple ensemble（簡單集成）。
> **時間框架**：一個週末（整合審稿蜂 + 工程蜂的共識）。
> **成功判據**：預定義，不可事後移動龍門。

#### 7.1 MVP 範圍（一個週末）

| 階段 | 做什麼 | 不做什麼 |
|------|--------|---------|
| Scout | 3 個固定模板（code-review, doc-analysis, research）+ 模板匹配 | 自由形式分解 |
| Swarm | 2-3 個 Worker 並行執行（Swarm 模式 only） | Pipeline / Checkpoint 模式 |
| Verify | 交叉驗證（不同模型驗證）+ 第一性原理檢查 | 任務類型感知路由（Phase 2） |
| Fuse | 加權融合（0.4 self + 0.6 verify） | 擺尾舞（Phase 2） |
| Learn | SQLite 基本 CRUD + 90 天 TTL | 強制探索、GC（Phase 2） |
| Fast-Track | 基礎規則分類器 | ML 分類器 |
| Benchmark | 100 任務 A/B 測試（swarm_judge vs simple_ensemble） | 人類盲評（Phase 2） |

#### 7.2 MVP 成功標準（Go / No-Go）

| 指標 | 目標 | 測量方式 |
|------|------|----------|
| 品質提升 | swarm_judge confidence 比 baseline 高 ≥ 5% | Mann-Whitney U test |
| 統計顯著性 | p < 0.05 | 雙尾檢定 |
| P95 延遲 | < 15 秒 | 100 個任務的 P95 |
| Fast-Track 準確率 | 簡單任務 100% 被分類為 fast_track | 30 個簡單任務命中數 |
| 錯誤率 | < 5% | 100 個任務中失敗數 |
| 平均成本 | < $0.10 USD / 任務 | 總成本 / 100 |

**Go 條件**：以上 6 項全部達成。
**No-Go 條件**：任何 1 項未達成 → 停止或重新設計。

#### 7.3 分階段路線圖

```
Phase 0 (一個週末) — 核心假說驗證
├── 實作 swarm_judge() 完整流水線
├── 實作 simple_ensemble 對照組
├── 跑 100 任務 A/B 基準測試
├── 統計分析：Go / No-Go
└── 產出：benchmark results + Go/No-Go 決策

Phase 1 (一個月) — 如果 Phase 0 Go
├── 加入 Pipeline + Checkpoint 執行模式
├── 擴展模板庫到 10+ 個任務類型
├── 任務類型感知評估路由（解決 E1 殘餘風險）
├── 人類盲評 20 任務（swarm vs 單模型最佳）
├── 經驗 GC + 矛盾檢測
└── 產出：人類評估報告 + 擴展模板庫

Phase 2 (三個月) — 如果 Phase 1 Go
├── 擺尾舞協議（結構化辯論 + 紅隊 + 衰減）
├── 強制探索機制
├── 動態模式切換（執行中發現耦合度錯誤時自動調整）
├── 交叉授粉（方向合併）
├── LangSmith 整合（追蹤 + 可觀測性）
└── 產出：完整 Blueprint 發布

Phase 3 (持續) — 如果 Phase 2 Go
├── 多租戶經驗庫
├── 模型能力矩陣自動更新（定期跑 benchmark）
├── 模型版本變更時的自動經驗重驗證
└── 產出：生產級 Blueprint + 社群貢獻
```

#### 7.4 MVP 快速啟動

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

---

### 附錄

#### A. 模型 Provider 定價與能力矩陣

> 參照獨立檔案 `appendix-model-matrix.md`（包含 2026-06 定價、能力雷達圖、API 相容性矩陣、已知限制）。

#### B. 與現有框架對比

| 維度 | Scout-then-Swarm | LangGraph | CrewAI | AutoGen |
|------|-----------------|-----------|--------|---------|
| **定位** | Blueprint（可 clone 的 Graph 模板） | 通用狀態機引擎 | Agent 角色框架 | 多 Agent 對話框架 |
| **任務分解** | 模板匹配 + 結構化輸出 + 覆核檢查 | 用戶自行實現 | 內建 Task 分配 | 群聊自動分配 |
| **決策融合** | 加權融合 + 交叉驗證 + 結構化辯論 | 用戶自行實現 | 順序/並行 + 委派 | 對話式共識 |
| **經驗系統** | SQLite + TTL + 強制探索 + GC | Checkpoint（無經驗學習） | 無 | 無 |
| **模型分工** | 按子任務類型路由到最佳模型 | 用戶自行配置 | 按角色配置 | 按 Agent 配置 |
| **快速通道** | 規則引擎 < 50ms 分類 | 無 | 無 | 無 |
| **成本透明** | 每次任務顯示實際成本 | 透過 LangSmith | 無 | 無 |
| **差異化價值** | 擺尾舞決策算法 + 經驗學習閉環 + 任務模板庫 | 基礎設施完善 | 易用性 | 對話式協作 |

**核心差異**：Scout-then-Swarm 不做框架，而是 LangGraph 上的一個 Blueprint。價值在應用層（模板庫 + 辯論協議 + 經驗系統），不在基礎設施層。

#### C. 四蜂產出摘要與交叉驗證結果

##### C.1 四蜂產出摘要

| 蜂 | 核心產出 | 關鍵貢獻 |
|-----|---------|---------|
| 偵查蜂 | Wiki 172 檔案全量掃描，22 個高度相關檔案分析 | 先驗知識基礎、角色映射、7 條設計原則、9 個知識缺口 |
| 建築蜂 | 完整系統架構設計（元件圖、資料流、3 種執行模式） | Fast-Track Gate、擺尾舞結構化辯論、模板匹配、經驗系統 Schema |
| 工程蜂 | 完整 MVP 實作計畫（可執行程式碼骨架、Schema、Config、測試） | swarm_judge() 入口、LiteLLM 統一層、加權融合算法、A/B 基準測試 |
| 審稿蜂 | 第一性原理攻擊（1 致命 + 5 嚴重 + 2 可控風險） |  Orchestrator 單點故障、馬太效應、經驗過時、延遲成本、框架差異化 |

##### C.2 四蜂一致性檢查

| 檢查項 | 結果 | 說明 |
|--------|------|------|
| MVP 核心假說 | **一致** | 四蜂共識：cross-verification + weighted fusion > simple ensemble |
| 模型角色分配 | **一致** | Architect/Engineer/Model Matrix 三者完全對齊 |
| 執行模式 | **一致** | Critic 建議 3 模式 → Architect 採納 → Engineer 實作 |
| Fast-Track | **一致** | Critic 提出延遲風險 → Architect 設計 Gate → Engineer 實作分類器 |
| 經驗系統 | **一致** | Critic 提出過時風險 → Architect 設計 TTL → Engineer 實作 GC |
| LangGraph 定位 | **一致** | Critic 建議 Blueprint → Architect 採納 → Engineer 以 StateGraph 實作 |
| 擺尾舞 | **有條件一致** | Architect 設計完整版 → Engineer 延後到 Phase 2 → Critic 建議結構化辯論取代正反饋 → 整合者裁決：Phase 2 採用 Architect 的結構化辯論版 |

##### C.3 衝突解決記錄

| 衝突 | 各方立場 | 整合者裁決 | 理由 |
|------|---------|-----------|------|
| MVP 時程 | Architect: 2 週 vs Critic/Engineer: 1 週末 | **1 週末** | Critic 和 Engineer 正確：最小假說驗證（交叉驗證融合 vs 簡單集成）可在一週末完成。Architect 的 2 週包含更多基礎設施，屬於 Phase 1。 |
| 擺尾舞是否 MVP | Architect: 包含 vs Engineer: 排除 | **排除** | MVP 的核心假說是「交叉驗證融合」而非「擺尾舞」。擺尾舞是進階優化，需先驗證基礎融合有效。 |
| 第一性原理評估通用性 | 骨架規格書: 通用 vs Critic: 不適用於創意任務 | **任務類型感知** | Critic 的攻擊有效。Architect 已修正為任務類型感知策略。骨架規格書的「通用」說法已改為 §1.2 的分類表。 |
| 成本倍數 | Architect: 1.8x vs Critic: 5x | **1.8x（含 Fast-Track）** | Architect 的估算是基於實際 token 計數。Critic 的 5x 是不含 Fast-Track 的最壞情況。80% 簡單任務走 Fast-Track 後，平均約 2x。 |

##### C.4 第一性原理終極檢查

1. **邏輯自洽**：整體方案無內部矛盾。四蜂產出經過交叉驗證，衝突已解決。 ✓
2. **回答完整**：從需求（多模型分工協作）到實現（程式碼骨架 + 配置 + 測試）完整覆蓋。 ✓
3. **有沒有硬傷**：無技術上不可行的假設。所有元件基於現有 API 和框架。 ✓
4. **MVP 可驗證性**：一個週末可完成核心假設驗證（100 任務 A/B 測試）。 ✓
5. **成本合理性**：平均任務成本 ~¥0.12（含 Fast-Track 後更低），月成本可控。 ✓

---

**文件狀態：v1.0 定稿。整合偵查蜂、建築蜂、工程蜂、審稿蜂四蜂產出，交叉驗證完成。**
