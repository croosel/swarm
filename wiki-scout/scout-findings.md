---
agent: Scout Bee (偵查蜂)
created: 2026-06-17
source: AIP-LLMWiki 全量掃描（172 個檔案）
objective: 為 Scout-then-Swarm 多 Agent 架構搜尋相關先驗知識
---

# Scout Bee 偵查報告：LLM Wiki 先驗知識掃描

## 一、Wiki 結構概覽

AIP-LLMWiki 共 172 個 Markdown 檔案，涵蓋以下主題域：

| 主題域 | 檔案數（約） | 與 Scout-then-Swarm 相關度 |
|--------|------------|--------------------------|
| Agent 架構與協議 | 6 | 極高 |
| OPC AI 員工化體系 | 8 | 極高 |
| Sense-Reason-Act / OODA 架構 | 5 | 高 |
| 模型整合與評估 | 4 | 中 |
| 工作流自動化 | 6 | 高 |
| Prompt Augmentation Pipeline | 3 | 高 |
| 執行方法論（SPE/P0） | 4 | 高 |
| LLM Wiki 知識底座設計 | 2 | 中 |
| LILIS 品牌運營 | 20+ | 低-中 |
| Palantir AIP 平台 | 30+ | 中 |
| Ontology 設計 | 8 | 低 |
| 商業模式與競品分析 | 15+ | 低 |

---

## 二、高度相關發現

### 2.1 多 Agent 協作架構

Wiki 中有**三個已驗證的多 Agent 協作模式**，可直接為 Scout-then-Swarm 提供設計參考：

#### (A) Agent 並行架構（Agent并行架构.md）—— 最直接的先驗

這是 Wiki 中與 Swarm 概念最接近的文件。核心發現：

- **3-Phase 流水線模板**：Phase 1（主 Agent 串列：資料篩選 + 結構化）→ Phase 2（N Agent 並行：各自獨立執行）→ Phase 3（主 Agent 聚合：一致性檢查 + 彙總）
- **依賴拓撲分析法**：判斷任務應串列還是並行的三條規則：
  1. 子任務之間有資料依賴 → 必須串列
  2. 子任務之間零依賴且各自獨立 → 應該並行
  3. 子任務需要一致性閉環（如標題↔賣點↔主圖）→ 綁在同一 Agent
- **實證數據**：按「產品」拆 5 Agent 並行，牆鐘時間從 300s → 60s（↓80%），且一致性最強
- **關鍵約束**：切分點唯一（Phase 1 的結構化 JSON 是唯一分發點）、入參獨立、聚合驗證

**對 Scout-then-Swarm 的啟示**：Scout Bee 相當於 Phase 1 的前置偵查，Swarm 相當於 Phase 2 的並行執行。Phase 3 的聚合驗證是現有架構已驗證的必要環節。

#### (B) P0 指揮官協同方法論（P0指挥官协同方法论.md）—— Conductor-Executor 模型

- **雙 Agent 協作**：指揮官（Conductor/Accio）負責從 LLM Wiki 提取知識、生成高精度指令；執行官（Executor/生意助手）負責 API 層物理執行
- **P0 路徑鎖定**：已知 API 可用時，禁止退化到 UI 模擬
- **物理閉環標準**：以伺服器返回 `type: "success"` 為第一驗證點 + 非同步回讀確認

**對 Scout-then-Swarm 的啟示**：指揮官角色等同於 Orchestrator，但此模式只有一對一，Scout-then-Swarm 需要一對多的擴展。

#### (C) OPC 質檢 Agent 獨立審計框架（OPC质检Agent独立审计框架.md）—— LLM-as-Judge 的完整實現

這是 Wiki 中**最完整的 LLM-as-Judge 模式**：

- **5 總監架構**：內容總監 + 獨立站建站總監 + 運營總監 + 客服總監 + **質檢總監（獨立審計層）**
- **質檢總監核心原則**：不參與執行、不看執行過程、只看交付物和日誌、基於任務預設目標評分
- **三種審計判定**：PASS（≥80 分且無關鍵項不合格）/ REVISE（60-79 分，最多 2 輪）/ ROLLBACK（<60 分或關鍵項嚴重不合格）
- **四類任務差異化評分**：產出物型 / 流程型 / 決策型 / 持續型，各有不同權重
- **自動化驗證工具箱**：Lighthouse、Link Checker、HTML Validator、Image Checker、Spelling Checker 等
- **CEO 審核比例漸進路徑**：100% → 30% → 10% → 5%

**對 Scout-then-Swarm 的啟示**：質檢 Agent 就是 Judge Bee 的完美原型。四類任務的差異化評分模板可直接複用。

### 2.2 Agent 間交接協議

#### Agent-Handoff 協議（Agent-Handoff协议.md）

完整定義了 Agent 間交接的標準流程：

- **Handoff 觸發條件**：任務範圍越界、領域不匹配、审批需求、衝突無法解決等
- **Handoff 資訊格式**：標準結構（基本資訊 + 已完成工作 + 待處理事項 + 關鍵決策記錄 + 上下文說明 + 相關檔案清單 + 預期結果）
- **緊急程度分級**：P0 阻斷 / P1 重要 / P2 普通 / P3 建議
- **狀態快照協議**：交接時生成知識庫狀態快照
- **一致性檢查點**：接收 Agent 必須驗證 Handoff 資訊完整性、已完成工作、連結一致性、標籤術語一致性

**對 Scout-then-Swarm 的啟示**：Swarm 中各 Agent 的任務交接可直接採用此協議格式，確保資訊不丟失。

#### Agent 工作流協議（Agent工作流协议.md）

定義了所有 Agent 的操作規範：

- **角色定義與權限矩陣**：LLM Wiki Agent（主力內容生成）、Agent（維護與健康檢查）、Human Editor（審批與策略）、其他 Agent（指令範圍執行）
- **經驗反饋閉環**：執行前查經驗 → 執行中記錄關鍵決策 → 執行後沉澱經驗
- **經驗驗證等級**：verified（A/B 測試驗證）→ high（多次復現）→ medium（單次經驗）→ low（假設）

**對 Scout-then-Swarm 的啟示**：經驗反饋閉環機制應內建到 Swarm 的每個 Agent 中。

### 2.3 任務拆解策略

#### OPC AI 員工化架構（OPC-AI员工化架构.md）

- **17-21 AI Agent 編制**：按職能分為 4 總監 + 各組，覆蓋 82%+ 執行工作
- **工具鏈分工**：每個 Agent 有明確的工具對應（如文案組用營銷文案 skill、圖片組用 Midjourney/DALL-E）
- **四階段實施路線圖**：內容生產 AI 化 → 運營自動化 → 客戶服務 AI 化 → 全面 AI 團隊編排

**對 Scout-then-Swarm 的啟示**：按職能拆分的 Agent 團隊編制可作為 Swarm Worker Bee 角色分配的參考。

#### ICBU 工作流與 Skill 架構（ICBU_工作流与Skill架构.md）

- **三層架構**：原子操作層（每個操作獨立可用）→ 工作流編排層（鏈式/批量操作）→ 資料匯出層（只讀）
- **決策樹**：根據用戶需求自動路由到對應的 Skill / 工作流
- **設計決策**：`icbu-workflow` 通過 symlink 引用 `icbu_engine.py`，代碼只維護一份

**對 Scout-then-Swarm 的啟示**：原子層 + 編排層的分層思路，對應 Scout-then-Swarm 中 Skill（原子能力）與 Workflow（編排邏輯）的分離。

### 2.4 Sense-Reason-Act 與 OODA 循環

#### Sense-Reason-Act 架構（Sense-Reason-Act架构.md）

三層運營範式：感知層採集資料 → 推理層分析決策 → 行動層執行操作。

#### 態勢感知系統（态势感知系统-OODA循环与经验积累.md）

四層架構擴展：
- L1 資料層（Ontology 即時資料）
- L2 決策層（Sense → Reason → Act）
- L3 學習層（AI-FDE Closed-Loop）
- L4 經驗層（高置信規則庫 = 護城河）

OODA 循環速度決定競爭優勢：每比對手多轉一圈，對手就落後一圈。

**對 Scout-then-Swarm 的啟示**：
- Scout Bee 對應 Observe/Orient 階段
- Swarm Workers 對應 Decide/Act 階段
- Judge Bee 對應 Learn 階段（回饋閉環）
- 整個 Scout-then-Swarm 架構就是一個 OODA 循環的工程實現

### 2.5 Prompt Augmentation Pipeline (PAP)

四階段管線：領域匹配 → 規則檢索 → 規則清洗（五型分類）→ 提示詞重組。

- **精度提升實測**：裸 Agent 5% → Wiki 注入後 100%（+95pp）
- **五型分類**：MUST / FORBID / THRESHOLD / FORMAT / PITFALL
- **總延遲**：2-4 秒

**對 Scout-then-Swarm 的啟示**：Scout Bee 的偵查輸出可以採用 PAP 的五型分類格式，讓 Swarm Workers 能快速消費結構化的領域知識。

---

## 三、中度相關發現

### 3.1 模型評估與治理

#### AIP Evals（AIP-Evals.md）

- **Evaluation Suite**：測試用例 + 目標函數 + 評估函數
- **模型橫向對比**：定量比較不同 LLM 在相同 Logic 函數上的準確率、響應時間、Token 消耗
- **決策穩定性分析**：多次運行間的偏差可視化

**對 Scout-then-Swarm 的啟示**：Judge Bee 的評分機制可參考 Evaluation Suite 的測試用例設計思路。

#### 模型整合實操（模型集成实操.md）

四種整合方式：模型權重匯入 / 容器模型 / 外部 API 代理 / LLM 函數接口。

### 3.2 模型能力對比

#### 深度競品分析（深度竞品分析-生意助手vsOKKI.md）

唯一提到具體模型能力的文件：
- Accio Work 支援**多重模型**：通義 Qwen 3.6 Plus / Qwen 3 Max / Kimi K2.5 / GLM-5 / MiniMax M2.5
- 這是現有 Wiki 中對模型選擇最具體的參考

### 3.3 三階段升級路徑（三阶段升级路径-Sense-Reason-Act.md）

- Phase 1：診斷顧問（Sense + Reason, Manual Act）
- Phase 2：半託管（Sense + Reason + Staged Act）—— 低風險自動執行，高風險保留人工確認
- Phase 3：全託管（Auto-apply Act）
- **升級觸發條件不是時間驅動，是資料條件滿足才升級**

### 3.4 最短時間執行路徑方法論（最短时间执行路径方法论.md）

- **路徑路由決策矩陣**：P0（API 直連 <2s）→ P1（Console/JS 注入 2-5s）→ P2（UI 模擬 15-60s）
- **反自欺協議**：路徑可達性必須經過物理驗證（權限證據 + 餘額證據 + 物證證據）
- **雙 Agent 協同的前置條件**：活躍會話 + i-bean 餘額 + OAuth 授權

**對 Scout-then-Swarm 的啟示**：Scout Bee 在偵查時應同時評估各 Worker 的執行路徑可達性。

---

## 四、缺口分析（Wiki 尚未涵蓋的領域）

以下為 Scout-then-Swarm 架構所需但 Wiki 中**不存在或嚴重不足**的知識：

| 缺口領域 | 說明 | 嚴重度 |
|---------|------|--------|
| **Scout-then-Swarm 專屬文件** | Wiki 中沒有任何關於 Scout-then-Swarm 架構的記錄 | 高 |
| **Model Fusion / 模型融合** | 無任何關於多模型 ensemble、投票機制、加權融合的經驗 | 高 |
| **agentfw 或類似 Proxy/Gateway 工具** | 僅提到 Accio Gateway 的技術限制，無通用 agent proxy 的經驗 | 高 |
| **MiniMax / Kimi / Qwen / DeepSeek 模型能力實測** | 競品分析中提到 Accio 支援這些模型，但無獨立的能力測評報告 | 中 |
| **Swarm 協調機制** | Agent 並行架構只覆蓋了「主 Agent + N Worker」的簡單模式，未涉及 Worker 間的動態協調、任務搶佔、負載均衡 | 中 |
| **失敗恢復與重試策略** | 質檢框架有回滾機制，但 Swarm 中 Worker 失敗後的自動重分配策略未涵蓋 | 中 |
| **即時監控與可觀測性** | AIP Observability 有概念但無具體的 Agent 群監控實現 | 低 |
| **Token 成本優化** | 多 Agent 並行時的 Token 消耗控制與模型選擇策略 | 低 |
| **動態 Agent 池** | 根據任務負載動態增減 Worker 數量的機制 | 低 |

---

## 五、基於 Wiki 知識的架構建議

### 5.1 Scout-then-Swarm 角色映射

根據 Wiki 中已驗證的模式，建議以下角色對應：

| Scout-then-Swarm 角色 | Wiki 先驗原型 | 核心職責 |
|----------------------|-------------|---------|
| **Orchestrator Bee** | P0 指揮官 + 3-Phase 主 Agent | 任務拆解、分發、聚合驗證 |
| **Scout Bee** | PAP Stage 1-2 + 經驗索引 | 偵查 Wiki、匹配領域知識、輸出結構化上下文 |
| **Worker Bee (N)** | 3-Phase Phase 2 並行 Agent | 獨立執行原子任務 |
| **Judge Bee** | OPC 質檢總監 | 獨立審計、PASS/REVISE/ROLLBACK 判定 |
| **Handoff Protocol** | Agent-Handoff 協議 | Agent 間標準化資訊交接 |

### 5.2 建議的執行流程

```
[用戶任務]
    │
    ▼
Step 1: Scout Bee 偵查
    ├─ 搜尋 LLM Wiki（PAP Stage 1 領域匹配）
    ├─ 讀取相關經驗（經驗索引 → 經驗頁面）
    ├─ 輸出：結構化上下文 + PAP 五型分類規則
    └─ 輸出：任務可達性評估（SPE 路徑矩陣）
    │
    ▼
Step 2: Orchestrator 任務拆解
    ├─ 依賴拓撲分析（Agent 並行架構判定法）
    ├─ 確定並行度（按產品/按職能/按階段拆分）
    ├─ 為每個 Worker 生成：任務目標文檔（質檢框架模板）
    └─ 觸發並行 Worker Bee
    │
    ▼
Step 3: Worker Bees 並行執行
    ├─ 每個 Worker 收到：PAP 增強 Prompt + 任務目標 + 獨立入參
    ├─ 執行路徑：P0 API > P1 JS > P2 UI（SPE 方法論）
    ├─ 執行後：物理閉環驗證（反自欺協議）
    └─ 產出：交付物 + 執行日誌
    │
    ▼
Step 4: Judge Bee 審計
    ├─ 獨立審計（不看執行過程，只看交付物 + 日誌）
    ├─ 基於任務目標文檔評分（四類任務差異化評分）
    ├─ 判定：PASS / REVISE（最多 2 輪）/ ROLLBACK
    └─ 三大風險專項檢查（可嵌入 Scout-then-Swarm 特定風險）
    │
    ▼
Step 5: Orchestrator 聚合
    ├─ 一致性檢查（Agent 並行架構 Phase 3）
    ├─ 彙總報告
    └─ 經驗沉澱（經驗反饋閉環：記錄 → 索引 → 下次複用）
```

### 5.3 關鍵設計原則（從 Wiki 經驗提煉）

1. **按產品/實體拆分，不按任務類型拆分**（Agent 並行架構實證：按產品拆同時達成最高並行度 + 最低協調成本 + 最強一致性）

2. **切分點唯一**（Phase 1 的結構化輸出是唯一分發點，不可在更早或更晚處切）

3. **質檢 Agent 必須獨立**（不參與執行、不看執行過程、基於預設目標評分——OPC 質檢框架核心原則）

4. **經驗閉環是護城河**（OODA 循環每多轉一圈，對手就落後一圈。每次執行都應沉澱經驗到 Wiki）

5. **PAP 注入是必要前置**（裸 Agent 精度 5%，Wiki 注入後 100%。每個 Worker 都應收到 Scout 偵查的結構化知識）

6. **反自欺協議**（任何「成功」都必須經過物理驗證，不可依賴表面成功狀態）

7. **升級由資料驅動，不由時間驅動**（三階段升級路徑的核心教訓）

### 5.4 建議新增的 Wiki 頁面

為填補缺口，建議 Scout-then-Swarm 項目執行後沉澱以下經驗頁面：

1. `Scout-then-Swarm架構設計.md` — 完整架構文件
2. `Model-Fusion多模型融合實測.md` — MiniMax/Kimi/Qwen/DeepSeek 能力對比
3. `agentfw代理網關評估.md` — Proxy/Gateway 工具選型
4. `Swarm協調機制設計.md` — Worker 間動態協調、失敗恢復策略

---

## 六、相關 Wiki 檔案索引

以下為本報告引用的所有 Wiki 檔案路徑：

| 檔案 | 相關度 | 主要貢獻 |
|------|--------|---------|
| `wiki/Agent并行架构.md` | 極高 | 3-Phase 流水線、依賴拓撲分析、並行效率實證 |
| `wiki/OPC质检Agent独立审计框架.md` | 極高 | LLM-as-Judge 完整實現、四類評分、回滾機制 |
| `wiki/Agent-Handoff协议.md` | 極高 | Agent 間交接標準格式 |
| `wiki/Agent工作流协议.md` | 極高 | 角色權限矩陣、經驗反饋閉環 |
| `wiki/P0指挥官协同方法论.md` | 高 | Conductor-Executor 雙 Agent 模型 |
| `wiki/OPC-AI员工化架构.md` | 高 | 17-24 Agent 團隊編制、四階段路線圖 |
| `wiki/Sense-Reason-Act架构.md` | 高 | 三層運營範式 |
| `wiki/态势感知系统-OODA循环与经验积累.md` | 高 | OODA 四層架構、經驗進化機制 |
| `wiki/Prompt_Augmentation_Pipeline.md` | 高 | PAP 四階段管線、五型分類 |
| `wiki/最短时间执行路径方法论.md` | 高 | SPE 路由矩陣、反自欺協議 |
| `wiki/Agent架构变更记录.md` | 中 | PAP 集成到 Agent 的具體實現 |
| `wiki/ICBU_工作流与Skill架构.md` | 中 | 三層 Skill 架構（原子+編排+匯出） |
| `wiki/AIP-Evals.md` | 中 | Evaluation Suite、模型對比 |
| `wiki/AIP跨境运营中枢-商业系统架构.md` | 中 | Sense-Reason-Act-Governance 四層系統 |
| `wiki/三阶段升级路径-Sense-Reason-Act.md` | 中 | 資料驅動的升級觸發條件 |
| `wiki/LLM-Wiki统一知识底座设计.md` | 中 | Wiki 四層結構、Wiki 模擬 Ontology |
| `wiki/模型集成实操.md` | 中 | 四種模型整合方式 |
| `wiki/模型评估与治理.md` | 中 | MetricSets、退化檢測 |
| `wiki/Automate与工作流.md` | 中 | 條件→效果自動化引擎 |
| `wiki/深度竞品分析-生意助手vsOKKI.md` | 低 | 多模型支援（Qwen/Kimi/GLM/MiniMax） |
| `wiki/经验索引.md` | 參考 | 所有經驗的中央索引 |
| `wiki/新品工作流效率模型.md` | 參考 | 55 分鐘 SOP 範例 |

---

*報告結束。Scout Bee 已完成 LLM Wiki 全量掃描，輸出 22 個相關檔案的深度分析，識別 9 個知識缺口，提出 7 條基於先驗知識的架構建議。*
