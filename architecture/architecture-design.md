# Scout-then-Swarm 系統架構設計書

> **版本**: 0.9.0-mvp
> **建築蜂**: Architect Bee
> **日期**: 2026-07-17
> **狀態**: 初版設計，待 Critic Bee 第二輪審閱

---

## 0. 設計原則與反原則

### 設計原則

| # | 原則 | 具體含義 |
|---|------|----------|
| P1 | **分工而非投票** | 每個模型做不同的子任務，不是三個模型做同一件事再挑最好的 |
| P2 | **一階原則評估** | 通用簡單檢查（邏輯一致？完整？有錯？）取代複雜評分表 |
| P3 | **經驗引導搜索** | Orchestrator 分解前先查 Wiki 經驗庫，避免重複踩坑 |
| P4 | **正向反饋放大 + 法定人數收斂** | 好的方向吸引更多資源（擺尾舞），差的方向衰減；多條路徑必須收斂才能定案 |
| P5 | **藍圖而非框架** | 定位為 LangGraph Blueprint，不造新輪子 |

### 反原則（明確不做的事）

- **不做**通用 LLM 框架（不對標 LangChain / LangGraph 本身）
- **不做**模型抽象層（不封裝 unified API，直接用各模型原生 API）
- **不做**自動模型選擇（模型陣容固定，不做 router）
- **不做**無限 agent 迴圈（所有執行路徑有明確終止條件）

---

## 1. 系統元件圖

```
+====================================================================+
|                        Scout-then-Swarm                            |
|                     (LangGraph Blueprint)                          |
|                                                                    |
|  +-------------------+    +-------------------+                    |
|  |   User / Client   |    |   Experience DB   |                    |
|  +--------+----------+    |   (SQLite + FTS)  |                    |
|           |               +--------+----------+                    |
|           v                        |                               |
|  +--------+----------+            |                                |
|  |   Fast-Track      |            |                                |
|  |   Gate            |            |                                |
|  |   (複雜度分類器)   |            |                                |
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
|  |   Waggle Dance     |                                            |
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

---

## 2. 針對 Critic Bee 風險的架構決策

### 2.1 [FATAL] Orchestrator 任務分解錯誤級聯

**問題**: 如果分解本身就錯了，後面全部白做。

**決策**: **模板匹配 + 分解覆核雙重機制**

```
分解流程:
1. Orchestrator 先查 Experience DB 是否有相似任務的歷史分解
2. 若命中 → 使用模板（Template），不做自由形式分解
3. 若未命中 → 使用預定義的 Task Template 中最近似的
4. 分解結果必須通過「分解覆核檢查」才能進入執行

分解覆核檢查 (Decomposition Sanity Check):
- 完整性: 子任務的輸出集合是否覆蓋了原始任務的所有要求？
- 無環性: DAG 是否真的是 DAG（無循環依賴）？
- 可驗證性: 每個子任務是否都有明確的完成條件？
- 模型匹配: 每個子任務分配的模型是否在該模型的能力範圍內？

若覆核失敗:
- 不重試自由分解，而是：
  a) 降級到 Pipeline 模式，一步一步做
  b) 或標記為「需要人類確認」
```

**模板庫結構**:

```yaml
# templates/code-review.yaml
template_id: "code-review"
match_patterns:
  - "review.*code"
  - "code.*review"
  - "審查.*程式碼"
  - "PR.*review"
decomposition:
  - task: "static_analysis"
    model: "kimi-k2.7-code"
    input: "{source_code}"
    output: "static_issues"
    depends_on: []
  - task: "logic_review"
    model: "deepseek-v4-pro"
    input: "{source_code}"
    output: "logic_issues"
    depends_on: []
  - task: "synthesis"
    model: "qwen-3.7-max"
    input: "{static_issues, logic_issues}"
    output: "review_report"
    depends_on: ["static_analysis", "logic_review"]
coupling: "low"  # static 和 logic 可以完全平行
estimated_mode: "swarm"
```

### 2.2 [SEVERE] 一階原則評估不適用於開放性創意任務

**問題**: 「邏輯一致？完整？有錯？」這些檢查對創意寫作無意義。

**決策**: **任務類型分流評估策略**

```python
ASSESSMENT_STRATEGIES = {
    "analytical": {
        # 分析型任務：用一階原則
        "checks": [
            "邏輯是否自洽？",
            "是否覆蓋所有要求？",
            "是否有事實性錯誤？",
            "推導步驟是否完整？"
        ]
    },
    "creative": {
        # 創意型任務：用約束符合性檢查
        "checks": [
            "是否符合用戶指定的風格/調性？",
            "是否滿足長度/格式約束？",
            "是否有明顯的陳腔濫調或 AI 味？",
            "是否偏離了核心主題？"
        ]
    },
    "code": {
        # 程式碼任務：用可執行性檢查
        "checks": [
            "程式碼是否能編譯/執行？",
            "是否處理了邊界情況？",
            "是否符合指定的框架/API 版本？",
            "是否有明顯的安全漏洞？"
        ]
    }
}
```

**任務類型判定**: 在模板匹配階段同時確定 `task_type`，不依賴 Orchestrator 即時判斷。

### 2.3 [SEVERE] 擺尾舞正向反饋放大早期錯誤（馬太效應）

**問題**: 如果第一個方向是錯的，正向反饋會讓它越來越大。

**決策**: **結構化辯論機制取代純正向反饋**（詳見第 5 節）

核心改動：
1. **強制紅隊**: 每次擺尾舞必須有一個 Red Team 角色嘗試反駁
2. **置信度上限**: 單個方向的置信度不得超過 0.8（保留不確定性）
3. **衰減函數**: 未被再次確認的方向，其權重隨時間衰減
4. **最低探索預算**: 至少 20% 的資源必須分配給非主流方向

### 2.4 [SEVERE] 經驗庫在模型更新後過時

**決策**: **經驗帶 TTL + 強制探索機制**（詳見第 7 節）

核心改動：
1. 每條經驗帶 `model_version` 和 `expires_at`
2. 模型版本變更時，舊經驗自動標記為 `stale`
3. 每 N 次執行強制不使用經驗庫（exploration run）

### 2.5 [SEVERE] 耦合度判斷錯誤導致返工

**決策**: **耦合度預判 + 執行中動態調整**

```python
def determine_coupling(task_graph):
    """
    耦合度判斷不是二元的，而是三級：
    """
    data_dependencies = count_shared_data_nodes(task_graph)
    output_dependencies = count_output_as_input_edges(task_graph)

    if output_dependencies == 0:
        return "low"      # 完全平行 → Swarm 模式
    elif output_dependencies <= len(task_graph.nodes) * 0.3:
        return "medium"   # 少量依賴 → Checkpoint 模式
    else:
        return "high"     # 高度依賴 → Pipeline 模式

def dynamic_mode_switch(current_mode, checkpoint_results):
    """
    執行中發現耦合度判斷錯誤時的處理
    """
    if current_mode == "swarm":
        # Swarm 模式下發現某子任務需要另一子任務的輸出
        # → 暫停該子任務，切換到 Checkpoint
        return "checkpoint"
    elif current_mode == "checkpoint":
        # Checkpoint 模式下發現某階段完全不需要前置輸出
        # → 該階段切換為 Swarm 平行
        return "partial_swarm"
    return current_mode
```

### 2.6 [SEVERE] 3-5 倍延遲

**決策**: **Fast-Track 快速通道 + 流式輸出**

80% 的任務不需要完整的四階段流程。Fast-Track Gate 在 50ms 內決定任務複雜度。

```
延遲預算:
- Fast-Track 分類: <50ms（規則引擎，不呼叫 LLM）
- 簡單任務直達: <2s（單模型呼叫）
- 複雜任務完整流程: <30s（含分解+執行+收斂）

目標: 80% 的請求走 Fast-Track，平均延遲 <3s
```

### 2.7 [SEVERE] 與 LangGraph 無實質差異

**決策**: **不造框架，直接作為 LangGraph Blueprint 發布**（詳見第 9 節）

核心定位：
1. 不封裝任何 LangGraph 已有的原語（StateGraph, nodes, edges）
2. 價值在於：任務分解模板庫 + 擺尾舞協議 + 經驗系統
3. 發布形式：可 clone 的 LangGraph Blueprint 專案 + 模板庫

---

## 3. 執行模式資料流程圖

### 3.1 Fast-Track 模式（簡單任務直達）

```
用戶輸入
    |
    v
+---+-----------------+
| Fast-Track Gate      |
| (規則引擎, <50ms)    |
|                      |
| 判斷規則:            |
| - 無多步分解需求     |
| - 無跨模型協作需求   |
| - 模板庫無匹配       |
|   (或精確匹配單模型) |
+---+----------+------+
    |          |
  命中快速通道  |
    v          | 未命中
+---+---+      v
| 單模型 |    進入完整流程
| 直接   |    (見 3.2-3.4)
| 執行   |
+---+---+
    |
    v
  輸出
```

**Fast-Track Gate 規則**:

```python
class FastTrackGate:
    """
    不使用 LLM，純規則引擎。
    在 50ms 內決定任務是否走快速通道。
    """

    FAST_TRACK_TEMPLATES = {
        "translation": {"model": "kimi-k2.7-code", "reason": "中文理解強"},
        "summarization": {"model": "minimax-m3", "reason": "長文本處理"},
        "code_snippet": {"model": "kimi-k2.7-code", "reason": "程式碼生成"},
        "structured_extract": {"model": "qwen-3.7-max", "reason": "結構化輸出"},
        "reasoning_step": {"model": "deepseek-v4-pro", "reason": "推理最便宜"},
    }

    def classify(self, user_input: str) -> GateResult:
        # 規則 1: 輸入長度 < 500 字 且無多步指令詞
        if len(user_input) < 500 and not self._has_multi_step_signals(user_input):
            template = self._match_fast_template(user_input)
            if template:
                return GateResult(
                    fast_track=True,
                    template=template,
                    confidence=self._calc_confidence(user_input, template)
                )

        # 規則 2: 精確模板命中且模板本身是單模型
        template_match = self._exact_template_match(user_input)
        if template_match and template_match.is_single_model:
            return GateResult(fast_track=True, template=template_match)

        # 預設: 進入完整流程
        return GateResult(fast_track=False)

    def _has_multi_step_signals(self, text: str) -> bool:
        signals = [
            "然後", "接著", "之後", "最後",
            "先.*再.*", "第一步", "步驟",
            "同時", "並且.*分別",
        ]
        return any(re.search(s, text) for s in signals)
```

### 3.2 Swarm 模式（低耦合平行執行）

```
用戶輸入 → Orchestrator → Task Graph (DAG)
                                |
          +---------------------+---------------------+
          |                     |                     |
          v                     v                     v
   +------+------+     +------+------+      +------+------+
   | Worker A    |     | Worker B    |      | Worker C    |
   | MiniMax M3  |     | Kimi K2.7   |      | DeepSeek V4 |
   | 子任務 1    |     | 子任務 2    |      | 子任務 3    |
   +------+------+     +------+------+      +------+------+
          |                     |                     |
          v                     v                     v
   +------+------+     +------+------+      +------+------+
   | Self-Check  |     | Self-Check  |      | Self-Check  |
   +------+------+     +------+------+      +------+------+
          |                     |                     |
          +---------------------+---------------------+
                                |
                                v
                    +-----------+-----------+
                    |   Waggle Dance       |
                    |   (結構化辯論收斂)    |
                    +-----------+-----------+
                                |
                                v
                    +-----------+-----------+
                    |   Synthesizer         |
                    |   (Qwen 3.7 Max)      |
                    +-----------+-----------+
                                |
                                v
                              輸出
```

**適用條件**: 子任務之間無資料依賴（`coupling = "low"`）
**典型場景**: 程式碼審查（靜態分析、邏輯審查、風格檢查平行進行）

### 3.3 Pipeline 模式（高耦合順序執行）

```
用戶輸入 → Orchestrator → Task Graph (DAG, 線性鏈)
                                |
                                v
                    +-----------+-----------+
                    | Stage 1               |
                    | DeepSeek V4 Pro       |
                    | 需求分析/方案设计       |
                    +-----------+-----------+
                                |
                                v
                    +-----------+-----------+
                    | Checkpoint α          |
                    | 驗證 Stage 1 輸出     |
                    | 不符合 → 重試(最多2次) |
                    +-----------+-----------+
                                |
                                v
                    +-----------+-----------+
                    | Stage 2               |
                    | Kimi K2.7 Code        |
                    | 程式碼實現             |
                    +-----------+-----------+
                                |
                                v
                    +-----------+-----------+
                    | Checkpoint β          |
                    | 驗證 Stage 2 輸出     |
                    +-----------+-----------+
                                |
                                v
                    +-----------+-----------+
                    | Stage 3               |
                    | Qwen 3.7 Max          |
                    | 文件生成/整合          |
                    +-----------+-----------+
                                |
                                v
                              輸出
```

**適用條件**: 子任務之間有強資料依賴（`coupling = "high"`）
**典型場景**: 需求分析 → 程式碼實現 → 測試生成

**Checkpoint 機制**:
```python
class Checkpoint:
    """
    Pipeline 模式下的階段驗證點。
    每個 Checkpoint 執行一階原則評估。
    """

    MAX_RETRIES = 2

    def validate(self, stage_output, task_spec, strategy):
        checks = strategy["checks"]
        results = []
        for check in checks:
            result = self._run_check(check, stage_output)
            results.append(result)

        passed = all(r.passed for r in results)
        if not passed and self.retry_count < self.MAX_RETRIES:
            # 把失敗的檢查結果回饋給同一個 Worker
            return CheckpointResult(
                passed=False,
                retry=True,
                feedback=[r for r in results if not r.passed]
            )
        elif not passed:
            # 重試耗盡，標記問題但繼續
            return CheckpointResult(
                passed=False,
                retry=False,
                escalate=True
            )
        return CheckpointResult(passed=True)
```

### 3.4 Checkpoint 模式（混合模式）

```
用戶輸入 → Orchestrator → Task Graph (DAG, 分層)
                                |
              +-----------------+-----------------+
              |                                   |
              v                                   v
   +----------+----------+            +-----------+-----------+
   | Swarm Phase 1       |            | Swarm Phase 1         |
   | +---+ +---+ +---+  |            | +---+ +---+           |
   | | A | | B | | C |  |            | | D | | E |           |
   | +---+ +---+ +---+  |            | +---+ +---+           |
   +----------+----------+            +-----------+-----------+
              |                                   |
              v                                   v
   +----------+----------+            +-----------+-----------+
   | Checkpoint γ        |            | Checkpoint δ          |
   | 收斂 Phase 1 結果    |            | 收斂 Phase 1 結果     |
   +----------+----------+            +-----------+-----------+
              |                                   |
              +-----------------+-----------------+
                                |
                                v
                    +-----------+-----------+
                    | Pipeline Phase 2      |
                    | 依賴 Phase 1 的輸出    |
                    +-----------+-----------+
                                |
                                v
                              輸出
```

**適用條件**: 中等耦合，可分階段平行但階段間有依賴（`coupling = "medium"`）
**典型場景**: 前端元件開發（多個元件平行）→ 整合測試（依賴所有元件）

---

## 4. Orchestrator 決策樹

```
                    用戶輸入到達
                         |
                         v
               +----+----+----+
               | Fast-Track   |
               | Gate (規則)   |
               +----+----+----+
                    |
            +-------+-------+
            |               |
         命中 FT         未命中
            |               |
            v               v
      單模型直達     +------+------+
                     | 查詢經驗庫   |
                     +------+------+
                            |
                    +-------+-------+
                    |               |
                 命中經驗        未命中
                    |               |
                    v               v
            +-------+----+   +------+------+
            | 使用歷史    |   | 模板匹配    |
            | 分解模板    |   | (最近似)    |
            +-------+----+   +------+------+
                    |               |
                    +-------+-------+
                            |
                            v
                   +--------+--------+
                   | 分解覆核檢查     |
                   +--------+--------+
                            |
                    +-------+-------+
                    |               |
                  通過            未通過
                    |               |
                    v               v
            +-------+----+   +------+------+
            | 判斷耦合度   |   | 降級處理    |
            +-------+----+   | Pipeline 或  |
                    |         | 人類確認     |
            +-------+-------+ +-------------+
            |       |       |
          low    medium    high
            |       |       |
            v       v       v
         Swarm  Checkpoint Pipeline
```

**Orchestrator 提示詞模板**（DeepSeek V4 Pro）:

```
你是一個任務分解器。你的工作是把用戶的需求拆成可以平行或順序執行的子任務。

規則:
1. 每個子任務必須指定: 任務描述、負責模型、輸入來源、預期輸出、完成條件
2. 子任務數量: 最少 2 個，最多 5 個
3. 模型分配指南:
   - MiniMax M3: 需要處理超長文本 (>50K tokens) 或 agent 推理
   - Kimi K2.7 Code: 程式碼生成/修改、中文深度理解
   - Qwen 3.7 Max: 結構化輸出、多模態、綜合判斷
   - DeepSeek V4 Pro: 推理、數學、任務分解
4. 耦合度判斷:
   - 如果子任務 A 的輸出是子任務 B 的輸入 → 有依賴
   - 如果兩個子任務只需要原始輸入 → 無依賴

{experience_context}

原始任務: {user_input}

輸出 JSON 格式:
{output_schema}
```

---

## 5. 擺尾舞演算法（結構化辯論收斂）

### 5.1 核心概念

擺尾舞**不是**純粹的正向反饋放大器。它是一個**結構化辯論協議**，確保多個方向在被採納前經過充分質疑。

### 5.2 角色定義

| 角色 | 數量 | 職責 | 實現 |
|------|------|------|------|
| **Scout** (偵查蜂) | 2-3 | 各自獨立提出解決方案方向 | 不同 Worker Bee |
| **Advocate** (倡議蜂) | 1 | 為某個方向辯護，闡述優勢 | 提出該方向的 Scout |
| **Red Team** (紅隊蜂) | 1 | 嘗試找出每個方向的缺陷 | Qwen 3.7 Max (Judge) |
| **Quorum Counter** | 1 | 統計收斂條件是否滿足 | 程式邏輯，非 LLM |

### 5.3 偽代碼

```python
class WaggleDance:
    """
    結構化辯論收斂協議。
    取代純正向反饋，防止馬太效應。
    """

    MAX_ROUNDS = 3
    QUORUM_THRESHOLD = 0.6  # 60% 的角色同意才能收斂
    CONFIDENCE_CAP = 0.8    # 置信度上限，保留不確定性
    EXPLORATION_BUDGET = 0.2  # 至少 20% 資源給非主流方向
    DECAY_RATE = 0.15       # 未被再次確認的方向，每輪衰減 15%

    def run(self, task, scout_results: list[ScoutResult]) -> DanceResult:
        """
        scout_results: 各 Scout 獨立完成任務後的結果
        """
        # 初始化方向池
        directions = []
        for sr in scout_results:
            directions.append(Direction(
                id=sr.scout_id,
                content=sr.output,
                confidence=min(sr.self_confidence, self.CONFIDENCE_CAP),
                advocate=sr.scout_id,
                round_proposed=0,
                staleness=0  # 未被確認的輪數
            ))

        for round_num in range(self.MAX_ROUNDS):
            # === Phase 1: 紅隊質詢 ===
            red_team_critique = self.red_team_critique(directions, task)

            for direction in directions:
                critique = red_team_critique[direction.id]
                if critique.has_fatal_flaw:
                    direction.confidence *= 0.5  # 致命缺陷直接腰斬
                    direction.marked_for_decay = True

            # === Phase 2: 倡議蜂回應 ===
            for direction in directions:
                if direction.confidence > 0.3:  # 置信度太低就不浪費資源辯護
                    rebuttal = self.advocate_respond(
                        direction, red_team_critique[direction.id]
                    )
                    if rebuttal.successful:
                        direction.confidence = min(
                            direction.confidence + 0.1,
                            self.CONFIDENCE_CAP  # 永遠不超過上限
                        )

            # === Phase 3: 交叉授粉 (Cross-Pollination) ===
            # 不是贏者通吃，而是嘗試合併方向
            if len(directions) >= 2:
                merged = self.attempt_merge(directions, task)
                if merged:
                    directions.append(merged)  # 合併方向加入池

            # === Phase 4: 衰減和淘汰 ===
            for direction in directions:
                direction.staleness += 1
                # 衰減: 未被再次確認的方向逐漸失去權重
                direction.confidence *= (1 - self.DECAY_RATE)

            # 淘汰置信度過低的方向
            directions = [d for d in directions if d.confidence > 0.2]

            # === Phase 5: 法定人數檢查 ===
            quorum = self.check_quorum(directions)
            if quorum.converged:
                return DanceResult(
                    status="converged",
                    winner=quorum.winning_direction,
                    rounds_used=round_num + 1,
                    confidence=quorum.confidence,
                    merged=any(d.is_merged for d in directions)
                )

        # 最大輪數用完，強制收斂
        return DanceResult(
            status="forced_convergence",
            winner=max(directions, key=lambda d: d.confidence),
            rounds_used=self.MAX_ROUNDS,
            confidence=max(d.confidence for d in directions),
            needs_human_review=True  # 強制收斂標記需要人類審閱
        )

    def check_quorum(self, directions) -> QuorumResult:
        """
        法定人數檢查。不是簡單多數決，而是：
        1. 領先方向的置信度必須 >= QUORUM_THRESHOLD
        2. 領先方向的置信度必須是第二名的 1.5 倍以上
        3. 紅隊沒有標記任何致命缺陷
        """
        if not directions:
            return QuorumResult(converged=False)

        sorted_dirs = sorted(directions, key=lambda d: d.confidence, reverse=True)
        leader = sorted_dirs[0]
        runner_up = sorted_dirs[1] if len(sorted_dirs) > 1 else None

        # 條件 1: 絕對置信度
        if leader.confidence < self.QUORUM_THRESHOLD:
            return QuorumResult(converged=False)

        # 條件 2: 相對領先度
        if runner_up and leader.confidence < runner_up.confidence * 1.5:
            return QuorumResult(converged=False)

        # 條件 3: 紅隊無致命缺陷
        if leader.has_fatal_flaw:
            return QuorumResult(converged=False)

        return QuorumResult(
            converged=True,
            winning_direction=leader,
            confidence=leader.confidence
        )

    def red_team_critique(self, directions, task) -> dict:
        """
        紅隊（Qwen 3.7 Max）對每個方向提出質疑。
        提示詞：
        """
        prompt = f"""你是一個嚴格的審查者。你的工作是找出每個方案的缺陷。

原始任務: {task.description}

方案列表:
{self._format_directions(directions)}

對每個方案，回答:
1. 這個方案最大的邏輯漏洞是什麼？
2. 它遺漏了什麼？
3. 是否有事實性錯誤？
4. 致命缺陷 (true/false): 是否存在讓方案完全不可行的問題？

如果一個方案確實很好，直接說「無明顯缺陷」，不要為了批評而批評。"""
        return self.judge_model.call(prompt)

    def attempt_merge(self, directions, task) -> Direction | None:
        """
        交叉授粉：嘗試合併多個方向的優點。
        只有當合併結果確實優於任何單一方向時才保留。
        """
        prompt = f"""以下是同一個任務的多個方案。請嘗試合併它們的優點。

原始任務: {task.description}

方案:
{self._format_directions(directions)}

如果兩個方案有互補的優點，請合併。
如果無法有意義地合併（只是拼湊），請輸出 null。"""
        result = self.judge_model.call(prompt)
        if result and result != "null":
            return Direction(
                id="merged",
                content=result,
                confidence=min(
                    max(d.confidence for d in directions) + 0.05,
                    self.CONFIDENCE_CAP
                ),
                is_merged=True
            )
        return None
```

### 5.4 防止馬太效應的具體機制

| 機制 | 如何防止 |
|------|----------|
| 置信度上限 (0.8) | 即使方向再好，也不能完全確定，保留探索空間 |
| 強制紅隊 | 每個方向都必須被質疑，不會因為「先提出」就逃過審查 |
| 衰減函數 | 如果一個方向沒有持續被確認，其權重會自然下降 |
| 交叉授粉 | 鼓勵合併而非贏者通吃，後來的好想法有機會被採納 |
| 探索預算 (20%) | 即使已有明顯勝出方向，仍保留資源給替代方案 |

---

## 6. 模型分工策略

### 6.1 固定角色分配

```
+====================+==================+=========================+
| 角色               | 模型             | 負責的任務類型           |
+====================+==================+=========================+
| 排程蜂 (Orch.)     | DeepSeek V4 Pro  | 任務分解、推理、 cheapest|
| 長文蜂 (LongDoc)   | MiniMax M3       | >50K tokens、文件分析    |
| 碼蜂 (Coder)       | Kimi K2.7 Code   | 程式碼生成/修改/審查     |
| 結構蜂 (Struct)    | Qwen 3.7 Max     | 結構化輸出、JSON、表格   |
| 裁判蜂 (Judge)     | Qwen 3.7 Max     | 擺尾舞紅隊、最終綜合     |
| 推理蜂 (Reasoner)  | DeepSeek V4 Pro  | 數學、邏輯、分析         |
+====================+==================+=========================+
```

### 6.2 成本估算

```
典型複雜任務 (以程式碼審查為例):
- Orchestrator 分解: ~500 tokens out  → ¥0.003
- Kimi K2.7 靜態分析: ~2K in, ~1K out → ¥0.04
- DeepSeek V4 邏輯審查: ~2K in, ~1K out → ¥0.012
- Qwen 3.7 綜合: ~3K in, ~1.5K out → ¥0.045
- 紅隊質詢 (Qwen): ~2K in, ~500 out → ¥0.021
- 總計: ~¥0.12 / 次

對比: 單模型 (Qwen Max): ~5K in, ~2K out → ¥0.066
倍數: ~1.8x（在可接受範圍內，遠低於 3-5x 擔憂）

成本紅線: 單次任務不超過 ¥0.50
```

---

## 7. 經驗系統

### 7.1 Schema

```sql
CREATE TABLE experiences (
    id              TEXT PRIMARY KEY,       -- UUID
    task_pattern    TEXT NOT NULL,          -- 任務模式 (正規表示式)
    task_type       TEXT NOT NULL,          -- analytical / creative / code
    decomposition   JSON NOT NULL,          -- 成功的分解模板
    execution_mode  TEXT NOT NULL,          -- swarm / pipeline / checkpoint
    model_versions  JSON NOT NULL,          -- {"deepseek": "v4-pro", "kimi": "k2.7", ...}
    outcome_score   REAL,                   -- 0-1, 人類反饋或自動評分
    usage_count     INTEGER DEFAULT 0,      -- 被使用次數
    success_rate    REAL DEFAULT 0.0,       -- 使用後的成功率
    created_at      DATETIME NOT NULL,
    expires_at      DATETIME,               -- 過期時間（可為 NULL = 不過期）
    last_validated  DATETIME,               -- 最後一次被驗證有效的時間
    ttl_days        INTEGER DEFAULT 90,     -- 預設 90 天 TTL
    stale           BOOLEAN DEFAULT FALSE,  -- 模型更新後標記
    source_session  TEXT,                   -- 來源對話 ID
    notes           TEXT                    -- 人類或系統備註
);

CREATE INDEX idx_pattern ON experiences(task_pattern);
CREATE INDEX idx_task_type ON experiences(task_type);
CREATE INDEX idx_stale ON experiences(stale);

-- 全文搜索支援
CREATE VIRTUAL TABLE experiences_fts USING fts5(
    task_pattern, notes, content=experiences, content_rowid=rowid
);
```

### 7.2 經驗生命周期

```
         任務執行成功
              |
              v
    +----+----+----+
    | 寫入經驗庫     |
    | TTL = 90 天    |
    | model_versions |
    | = 當前版本      |
    +----+----+-----+
              |
              v
    +----+----+----+
    | 被後續任務使用  |
    | usage_count++  |
    | 更新 success_  |
    | rate            |
    +----+----+-----+
              |
    +---------+---------+
    |                   |
    v                   v
  成功              失敗
    |                   |
    v                   v
  延長 TTL         標記降級
  last_validated    confidence *= 0.7
  = now             連續失敗 3 次 → 刪除

    +---------+---------+
              |
              v
    +----+----+----+
    | 模型版本變更    |
    | → stale = TRUE |
    | → 置信度 *= 0.5|
    | → 可被使用但   |
    |   權重降低      |
    +----+----+-----+
              |
              v
    +----+----+----+
    | 過期或被取代    |
    | → 歸檔          |
    +----+----+-----+
```

### 7.3 強制探索機制

```python
class ExperienceExplorer:
    """
    防止經驗庫陷入局部最優。
    """
    EXPLORATION_RATE = 0.1  # 每 10 次執行，強制 1 次不使用經驗庫
    STALE_RETRY_RATE = 0.3  # stale 的經驗，30% 的機率被重新驗證

    def should_explore(self, task) -> bool:
        """決定本次執行是否強制探索"""
        # 規則 1: 定期強制探索
        if self.global_counter % int(1 / self.EXPLORATION_RATE) == 0:
            return True

        # 規則 2: 新任務模式（從未見過的 pattern）
        if not self.experience_db.search(task.pattern):
            return True

        # 規則 3: stale 經驗的重新驗證
        matched = self.experience_db.search(task.pattern)
        if matched and all(exp.stale for exp in matched):
            return random.random() < self.STALE_RETRY_RATE

        return False

    def record_exploration_result(self, task, result, was_exploration):
        """記錄探索結果，用於更新經驗庫"""
        if was_exploration and result.success:
            # 探索成功 → 寫入新經驗
            self.experience_db.insert(Experience(
                task_pattern=task.pattern,
                decomposition=result.decomposition,
                execution_mode=result.mode,
                model_versions=get_current_model_versions(),
                outcome_score=result.score,
            ))
```

---

## 8. 錯誤處理與降級策略

### 8.1 錯誤分級

```python
ERROR_LEVELS = {
    "RECOVERABLE": {
        "description": "單個子任務失敗，可重試",
        "action": "retry_same_model(max=2), then retry_other_model(max=1)",
        "examples": ["API timeout", "rate limit", "temporary parse error"]
    },
    "DEGRADABLE": {
        "description": "某個子任務持續失敗，但可跳過",
        "action": "skip_subtask_and_note_gap, continue with partial results",
        "examples": ["non-critical sub-task failure", "optional enhancement"]
    },
    "FATAL": {
        "description": "任務分解本身有問題或系統性錯誤",
        "action": "abort_and_escalate_to_human",
        "examples": ["decomposition creates impossible dependencies",
                     "all models fail on the same sub-task"]
    }
}
```

### 8.2 降級鏈

```
完整 Swarm/Checkpoint/Pipeline
        |
        | (某個子任務失敗 2 次)
        v
跳過失敗子任務 + 標記缺口
        |
        | (缺口導致後續也失敗)
        v
降級到 Pipeline 模式（一步一步來）
        |
        | (Pipeline 也失敗)
        v
降級到 Fast-Track（單模型嘗試）
        |
        | (單模型也失敗)
        v
返回錯誤 + 記錄到經驗庫（負面經驗）
        |
        v
通知用戶 + 提供部分結果（如果有）
```

---

## 9. LangGraph 整合

### 9.1 定位

```
+===========================+======================================+
| 我們提供 (Blueprint)       | LangGraph 已有 (不重複造輪子)         |
+===========================+======================================+
| 任務分解模板庫              | StateGraph 狀態機引擎                |
| 擺尾舞協議實現              | Checkpoint / Persistence            |
| 經驗系統 schema + 邏輯      | Streaming / Tool calling            |
| Fast-Track Gate 規則        | Human-in-the-loop                   |
| 模型分工配置                | Error handling primitives            |
| 成本估算與監控              | LangSmith tracing integration        |
+===========================+======================================+
```

### 9.2 映射關係

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# Scout-then-Swarm 作為 LangGraph 的 StateGraph 實現

class SwarmState(TypedDict):
    """狀態定義 — Blueprint 的核心資料結構"""
    task: str
    task_type: str                    # analytical / creative / code
    decomposition: list[SubTask]
    execution_mode: str               # swarm / pipeline / checkpoint
    sub_task_results: dict[str, Any]
    waggle_dance_state: DanceState
    final_output: str
    experience_used: bool
    cost_accumulated: float
    errors: list[Error]

def build_swarm_graph() -> StateGraph:
    """
    構建 Scout-then-Swarm 的 LangGraph 圖。
    這是一個 Blueprint，用戶可以 clone 並修改。
    """
    graph = StateGraph(SwarmState)

    # === 節點定義 ===
    graph.add_node("fast_track_gate", fast_track_gate_node)
    graph.add_node("single_model_exec", single_model_execution)
    graph.add_node("experience_search", experience_search_node)
    graph.add_node("orchestrator", orchestrator_decompose)
    graph.add_node("decomposition_check", decomposition_sanity_check)
    graph.add_node("mode_selector", mode_selection_node)
    graph.add_node("swarm_execute", swarm_parallel_execution)
    graph.add_node("pipeline_execute", pipeline_sequential_execution)
    graph.add_node("checkpoint_execute", checkpoint_hybrid_execution)
    graph.add_node("waggle_dance", waggle_dance_node)
    graph.add_node("synthesizer", synthesis_node)
    graph.add_node("experience_writeback", experience_writeback_node)

    # === 邊定義 ===
    graph.set_entry_point("fast_track_gate")

    # Fast-Track 分流
    graph.add_conditional_edges(
        "fast_track_gate",
        route_fast_track,
        {
            "fast": "single_model_exec",
            "full": "experience_search"
        }
    )

    graph.add_edge("single_model_exec", "experience_writeback")

    # 經驗搜索後進入分解
    graph.add_edge("experience_search", "orchestrator")
    graph.add_edge("orchestrator", "decomposition_check")

    # 分解覆核分流
    graph.add_conditional_edges(
        "decomposition_check",
        route_decomposition_result,
        {
            "valid": "mode_selector",
            "invalid": "orchestrator",  # 重試一次
            "degrade": "pipeline_execute"  # 降級到 Pipeline
        }
    )

    # 模式選擇
    graph.add_conditional_edges(
        "mode_selector",
        select_execution_mode,
        {
            "swarm": "swarm_execute",
            "pipeline": "pipeline_execute",
            "checkpoint": "checkpoint_execute"
        }
    )

    # 所有執行模式都進入擺尾舞
    graph.add_edge("swarm_execute", "waggle_dance")
    graph.add_edge("pipeline_execute", "waggle_dance")
    graph.add_edge("checkpoint_execute", "waggle_dance")

    # 擺尾舞後綜合
    graph.add_edge("waggle_dance", "synthesizer")
    graph.add_edge("synthesizer", "experience_writeback")
    graph.add_edge("experience_writeback", END)

    return graph.compile(checkpointer=MemorySaver())
```

### 9.3 發布形式

```
scout-then-swarm/
├── README.md
├── pyproject.toml
├── src/
│   ├── graph.py              # LangGraph StateGraph 定義
│   ├── state.py              # SwarmState TypedDict
│   ├── nodes/
│   │   ├── fast_track.py     # Fast-Track Gate
│   │   ├── orchestrator.py   # 任務分解 (DeepSeek V4 Pro)
│   │   ├── workers.py        # Worker Bee 實現
│   │   ├── waggle_dance.py   # 擺尾舞協議
│   │   └── synthesizer.py    # 最終綜合 (Qwen 3.7 Max)
│   ├── templates/            # 任務分解模板庫
│   │   ├── code-review.yaml
│   │   ├── document-analysis.yaml
│   │   ├── research-report.yaml
│   │   └── ...
│   ├── experience/
│   │   ├── schema.sql        # 經驗庫 schema
│   │   ├── store.py          # 經驗存取邏輯
│   │   └── explorer.py       # 強制探索機制
│   └── config.py             # 模型配置、API keys
├── examples/
│   ├── code_review.py        # 程式碼審查範例
│   └── research_report.py    # 研究報告範例
└── tests/
```

---

## 10. MVP 範圍定義

### 10.1 MVP 包含（Phase 1, 2 週）

| 元件 | 範圍 | 驗收條件 |
|------|------|----------|
| Fast-Track Gate | 5 種基礎任務類型 | 80% 的測試任務被正確分類 |
| 任務分解 | 3 個固定模板 (code-review, doc-analysis, research) | 模板命中時正確分解 |
| Swarm 模式 | 平行執行 2-3 個子任務 | 結果正確合併 |
| Pipeline 模式 | 順序執行 2-3 個階段 | Checkpoint 正確驗證 |
| 擺尾舞 (簡化版) | 紅隊質詢 + 置信度收斂 | 3 輪內收斂 |
| 經驗系統 | SQLite 基本 CRUD + TTL | 成功經驗被正確複用 |

### 10.2 MVP 不包含（Phase 2+）

| 元件 | 原因 |
|------|------|
| Checkpoint 模式（混合） | MVP 用 Swarm 或 Pipeline 即可覆蓋 |
| 交叉授粉（方向合併） | 先驗證基礎擺尾舞是否有效 |
| 強制探索機制 | 需要足夠的執行數據才有意義 |
| 動態模式切換 | MVP 在分解階段就確定模式 |
| LangSmith 整合 | 先用本地日誌 |
| 多租戶經驗庫 | 先單用戶 |

### 10.3 MVP 成功標準

```
功能正確性:
- 在 20 個測試任務上，Scout-then-Swarm 的輸出品質 >= 單模型最佳輸出
  (由人類盲評判斷，不自我評估)

延遲:
- Fast-Track 任務: p95 < 3s
- 完整流程任務: p95 < 30s

成本:
- 平均任務成本 < ¥0.15
- 無任何任務成本 > ¥0.50

與單模型對比:
- 在需要多視角的任務上（程式碼審查、研究報告），
  至少 60% 的人類評委認為 Swarm 結果更好
- 在簡單任務上，延遲增加 < 20%
```

---

## 11. 監控與可觀測性

### 11.1 核心指標

```python
METRICS = {
    # 延遲指標
    "fast_track_latency_ms": "Fast-Track Gate 分類耗時",
    "decomposition_latency_ms": "Orchestrator 分解耗時",
    "execution_latency_ms": "執行引擎總耗時",
    "waggle_dance_rounds": "擺尾舞輪數 (1-3)",
    "total_latency_ms": "端到端延遲",

    # 品質指標
    "decomposition_valid_rate": "分解覆核通過率",
    "waggle_dance_convergence_rate": "擺尾舞自然收斂率 (vs 強制收斂)",
    "checkpoint_pass_rate": "Checkpoint 首次通過率",

    # 成本指標
    "cost_per_task_yuan": "每次任務的總成本 (¥)",
    "cost_breakdown_by_model": "各模型成本占比",

    # 經驗系統指標
    "experience_hit_rate": "經驗庫命中率",
    "experience_stale_rate": "stale 經驗占比",
    "exploration_rate": "探索執行占比",
}
```

### 11.2 告警規則

```yaml
alerts:
  - name: "high_cost_task"
    condition: "cost_per_task_yuan > 0.30"
    severity: warning
    action: "log + notify"

  - name: "fatal_cost_task"
    condition: "cost_per_task_yuan > 0.50"
    severity: critical
    action: "abort + notify"

  - name: "high_latency"
    condition: "total_latency_ms > 60000"
    severity: warning
    action: "log"

  - name: "decomposition_failure_loop"
    condition: "decomposition_valid_rate < 0.5 over 10 tasks"
    severity: critical
    action: "disable_auto_decompose + notify"

  - name: "experience_stale_accumulation"
    condition: "experience_stale_rate > 0.5"
    severity: warning
    action: "trigger_model_version_check"
```

---

## 12. 附錄：術語表

| 術語 | 英文 | 定義 |
|------|------|------|
| 排程蜂 | Orchestrator | 負責任務分解和排程的核心元件，使用 DeepSeek V4 Pro |
| 偵查蜂 | Scout | 獨立探索解決方案方向的 Worker |
| 擺尾舞 | Waggle Dance | 結構化辯論收斂協議 |
| 紅隊蜂 | Red Team | 負責質疑每個方案的 Judge 角色 |
| 法定人數 | Quorum | 擺尾舞收斂所需的最低同意比例 |
| 交叉授粉 | Cross-Pollination | 合併多個方案優點的機制 |
| 快速通道 | Fast-Track | 簡單任務跳過完整流程的快速路徑 |
| 經驗庫 | Experience DB | 存儲歷史成功分解的 SQLite 資料庫 |
| 強制探索 | Forced Exploration | 定期不使用經驗庫以發現更優策略 |
| 藍圖 | Blueprint | 可 clone 的 LangGraph 專案模板，不是獨立框架 |

---

> **下一步行動**:
> 1. Critic Bee 審閱本設計書，重點攻擊 MVP 範圍是否足夠
> 2. 根據審閱意見調整後，開始 Phase 1 MVP 實作
> 3. MVP 完成後進行 20 任務盲評測試
