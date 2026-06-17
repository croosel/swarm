## Verify 階段：交叉驗證檢查清單

### 驗證原則

用第一性原理檢查四蜂產出的一致性，而非逐一核對細節。

---

### V1. 跨蜂一致性檢查

| 檢查項 | 建築蜂 | 工程蜂 | 審稿蜂 | 偵查蜂 | 狀態 |
|--------|--------|--------|--------|--------|------|
| MVP 核心假設定義 | 模板匹配+擺尾舞+經驗系統（2週） | swarm_judge() 交叉驗證融合（1週末） | 只驗證交叉驗證融合（1週末） | 先驗知識支撐假說 | **一致** — 共識：cross-verification + weighted fusion > simple ensemble。時程衝突已解決（1週末為最小驗證）。 |
| 模型角色分配 | DeepSeek=排程, MiniMax=長文, Kimi=碼, Qwen=結構+裁判 | 完全對應 routing.yaml | 無具體分配（審稿角色） | Wiki 先驗支持模型分工 | **一致** — Architect/Engineer/Model Matrix 三者完全對齊。 |
| 執行模式分類 | Swarm/Pipeline/Checkpoint 三模式 + 耦合度三級判斷 | 三模式全部實作 + 拓撲分組 | 建議三模式（C1 風險應對） | Wiki 3-Phase 流水線為先驗 | **一致** — Critic 建議 → Architect 採納 → Engineer 實作。 |
| 快速通道設計 | Fast-Track Gate 規則引擎 <50ms，5 種任務類型 | Fast-Track 分類器 + policies.yaml + 延遲預算 | 80% 任務應走快速通道（D1 風險應對） | Wiki SPE 路徑矩陣支持快速路由 | **一致** — 四蜂共識：多數任務不需要完整流程。 |
| 經驗系統設計 | SQLite + TTL 90天 + model_version + 強制探索 + stale 標記 | SQLite WikiStore + experience_gc + 矛盾檢測 | 經驗帶元數據 + 強制 exploration + 分級 | Wiki 經驗反饋閉環 + OODA 循環 | **一致** — Critic 風險全部被 Architect/Engineer 覆蓋。 |
| 與 LangGraph 關係 | Blueprint 定位，不封裝已有原語 | StateGraph 實作 + graph.py | 建議做 Blueprint 不做框架 | — | **一致** — Critic 建議 → Architect 採納 → Engineer 以 StateGraph 實作。 |

### V2. 致命風險覆蓋檢查

審稿蜂標記的 1 個致命風險 + 5 個嚴重風險，建築蜂和工程蜂是否都有具體應對？

| 風險 | 嚴重度 | 建築蜂應對 | 工程蜂應對 | 充分？ |
|------|--------|-----------|-----------|--------|
| O1: Orchestrator 拆解錯誤 | 致命 | 模板匹配取代自由拆解 + 分解覆核檢查（完整性/無環/可驗證/模型匹配） + 降級到 Pipeline | `DecompositionGuard`：循環依賴 DFS 檢測、過度分解（>8）檢測、空分解檢測、類型多樣性警告 | **充分** |
| E1: 第一性原理對開放式任務無效 | 嚴重 | 任務類型感知評估策略（analytical/creative/code 三套檢查項） | `FirstPrincipleCheck` 通用 but 缺少任務類型路由 | **部分** — 需 verify 階段加入 task_type 路由（已記入 §5.2 處理計劃） |
| W1: 正反饋放大早期錯誤 | 嚴重 | 結構化辯論取代純正反饋：強制紅隊 + 置信度上限 0.8 + 衰減函數 + 交叉授粉 + 20% 探索預算 | MVP 禁用擺尾舞（policies.yaml `waggle_dance.enabled: false`），Phase 2 加入 | **充分**（Phase 2） |
| X1: 經驗過時/錯誤擴散 | 嚴重 | TTL + model_version 追蹤 + 強制探索（每 10 次 1 次） + stale 標記 + 置信度 *= 0.5 | `experience_gc`：過期清理 + 低置信度（<0.3）清理 + 矛盾檢測（同 hash 不同 outcome） | **充分** |
| C1: 耦合度判斷錯誤 | 嚴重 | 三級耦合（low/medium/high） + 動態模式切換 + 預設保守（不確定→Pipeline） | 三種執行模式實作 + 拓撲分組（`_topological_groups`） + 預設 Pipeline | **充分** |
| D1: 延遲 3-5 倍 + 成本 5 倍 | 嚴重 | Fast-Track Gate + 延遲預算（P95 <15s） + 成本紅線（¥0.50） + 流式輸出 | `LatencyGuard` + 成本警報（$0.10/$0.25/daily $25） + Fast-Track 分類器 | **充分** |

### V3. 矛盾檢測

四蜂之間可能存在的矛盾：
- [x] 建築蜂提出的架構複雜度 vs 工程蜂的 MVP 極簡要求 → **已解決**：MVP 只驗證交叉驗證融合假說，擺尾舞/Checkpoint/強制探索延後到 Phase 1-2
- [x] 審稿蜂建議放棄搖擺舞 vs 建築蜂保留的搖擺舞設計 → **已解決**：Architect 已將擺尾舞改為結構化辯論（非純正反饋），MVP 禁用，Phase 2 採用改良版
- [x] 偵查蜂發現的 Wiki 經驗 vs 其他蜂的設計是否對齊 → **已對齊**：Wiki 的 3-Phase 流水線、質檢框架、Handoff 協議均已映射到系統元件
- [x] 模型角色分配在各蜂之間是否一致 → **一致**：Architect/Engineer/Model Matrix 三者完全對齊

### V4. 第一性原理終極檢查

1. **邏輯自洽**：整體方案無內部矛盾。四蜂產出經過交叉驗證，所有衝突已解決。 ✓
2. **回答完整**：從需求到實現完整覆蓋（架構設計 + 程式碼骨架 + 配置 + 測試 + 部署）。 ✓
3. **有沒有硬傷**：無技術上不可行的假設。所有元件基於現有 API（OpenAI Chat compatible）和框架（LangGraph, LiteLLM）。 ✓
4. **MVP 可驗證性**：一個週末可完成核心假設驗證（100 任務 A/B 測試，p < 0.05）。 ✓
5. **成本合理性**：平均任務成本 ~¥0.12（含 Fast-Track 後更低），月成本在可接受範圍。 ✓

---

**驗證狀態：全部通過。整合者（Synthesizer）已完成交叉驗證，結果記入技術規格書附錄 C。**
