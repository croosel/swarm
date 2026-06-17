# Scout-then-Swarm Dashboard & Observability 技術規格書

> **版本**: 1.0.0
> **日期**: 2026-07-17
> **作者**: Observability Architect
> **狀態**: 初版設計，可直接交付工程蜂實作
> **依賴文件**: `architecture-design.md`、`engineering-plan.md`、`Scout-then-Swarm-技術規格書.md`

---

## 目錄

1. [Dashboard 架構](#1-dashboard-架構)
2. [關鍵指標定義](#2-關鍵指標定義)
3. [事件資料模型（Event Schema）](#3-事件資料模型event-schema)
4. [Dashboard 視圖設計](#4-dashboard-視圖設計)
5. [告警規則](#5-告警規則)
6. [與現有系統的整合](#6-與現有系統的整合)

---

## 1. Dashboard 架構

### 1.1 即時資料流

```
+=====================================================================+
|                    Scout-then-Swarm 執行引擎                         |
|                                                                     |
|  scout_node ──► swarm_node ──► verify_node ──► fuse_node ──► learn  |
|       │              │              │              │           │     |
|       └──────┬───────┴──────┬───────┴──────┬───────┴─────┬─────┘    |
|              │              │              │             │           |
|              v              v              v             v           |
|  +-----------+--------------+--------------+-------------+--------+ |
|  |              Event Emitter (事件發射器)                         | |
|  |              src/swarm/observability/event_emitter.py          | |
|  +-----------+----------------------------------------------------+ |
+=====================================================================+
              │
              │ emit(TaskEvent) — 非阻塞，fire-and-forget
              v
+-------------+-----------+
|     Event Bus (事件匯流排) |
|     Redis Streams        |
|     Topic: "swarm.events"|
+-------------+-----------+
              │
      +-------+-------+
      |               |
      v               v
+-----+------+  +-----+--------+
| Time-Series|  |  WebSocket   |
| DB         |  |  Relay       |
| (InfluxDB) |  |  (FastAPI)   |
+-----+------+  +-----+--------+
      |               |
      v               v
+-----+------+  +-----+--------+
| Grafana    |  |  Dashboard   |
| (分析面板)  |  |  Frontend    |
|            |  |  (React)     |
+------------+  +--------------+
```

### 1.2 資料流時序

```
Agent 節點執行 ──(0ms)──► Event Emitter 序列化事件
                              │
                              ├──(1ms)──► Redis Stream XADD（非阻塞）
                              │
                              └──(1ms)──► WebSocket 推送（前端即時更新）
                                            │
                              Redis Consumer │
                                            v
                              ┌──(50-200ms)──► InfluxDB 批量寫入
                              │
                              └──(50-200ms)──► Grafana 面板查詢
```

**設計原則**：

- **非阻塞**：Event Emitter 使用 `asyncio.create_task()` 非同步發送，絕不阻塞 Agent 執行
- **批量寫入**：InfluxDB Consumer 每 200ms 或累積 50 筆事件後批量寫入，降低 DB 壓力
- **斷線重連**：WebSocket 客戶端自動重連，斷線期間的事件在重連後補發（基於 Redis Stream 的 Consumer Group）

### 1.3 技術選型（MVP 輕量方案）

| 元件 | 技術 | 選型理由 | 替代方案（Phase 2+） |
|------|------|----------|---------------------|
| **Event Bus** | Redis Streams | 專案已依賴 Redis（LangGraph Checkpointer）；Streams 原生支援 Consumer Group，適合多消費者 | Kafka（高流量場景） |
| **Time-Series DB** | InfluxDB OSS 3.x | 開源免費、原生支援 Flux 查詢語言、與 Grafana 無縫整合 | Prometheus + VictoriaMetrics |
| **即時推送** | FastAPI WebSocket | 與現有的 FastAPI 入口共用进程，零額外部署 | Server-Sent Events (SSE) |
| **前端** | React + Recharts | 輕量圖表庫、元件化、TypeScript 原生支援 | Next.js + D3.js |
| **分析面板** | Grafana OSS | 開源免費、支援 InfluxDB 資料源、內建告警 | 自研面板 |
| **告警引擎** | Grafana Alerting | 與 Grafana 面板共用查詢，減少維護成本 | Prometheus Alertmanager |

### 1.4 部署拓撲（MVP 單機）

```yaml
# docker-compose.dashboard.yaml
version: "3.9"
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis-data:/data"]

  influxdb:
    image: influxdb:3-oss
    ports: ["8086:8086"]
    environment:
      INFLUXDB_BUCKET: "swarm_metrics"
      INFLUXDB_ADMIN_TOKEN: "${INFLUXDB_TOKEN}"
    volumes: ["influx-data:/var/lib/influxdb2"]

  grafana:
    image: grafana/grafana-oss:11.4.0
    ports: ["3001:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: "${GRAFANA_PASSWORD}"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - grafana-data:/var/lib/grafana

  dashboard-api:
    build: ./dashboard/api
    ports: ["8090:8090"]
    environment:
      REDIS_URL: "redis://redis:6379"
      INFLUXDB_URL: "http://influxdb:8086"
    depends_on: [redis, influxdb]

  dashboard-web:
    build: ./dashboard/web
    ports: ["3000:3000"]
    environment:
      VITE_API_URL: "http://localhost:8090"
    depends_on: [dashboard-api]

volumes:
  redis-data:
  influx-data:
  grafana-data:
```

### 1.5 資料存儲分層

| 層級 | 存儲 | 保留期 | 用途 |
|------|------|--------|------|
| **熱資料** | Redis Streams | 24 小時 | 即時推送、Consumer 處理佇列 |
| **溫資料** | InfluxDB（精確度 1s） | 30 天 | Grafana 查詢、告警計算 |
| **冷資料** | InfluxDB（降採樣 1min） | 365 天 | 長期趨勢分析 |
| **原始事件** | SQLite `task_events.db` | 90 天 | 除錯、審計、單任務鑽取 |

---

## 2. 關鍵指標定義

### 2.1 運營指標（Operational Metrics）

#### 2.1.1 任務吞吐量

| 屬性 | 值 |
|------|-----|
| **名稱** | `task_throughput` |
| **單位** | tasks/min |
| **公式** | `count(completed_tasks) / time_window_minutes` |
| **InfluxDB 查詢** | `from(bucket:"swarm_metrics") \|> range(start: -1h) \|> filter(fn: (r) => r._measurement == "task_complete") \|> aggregateWindow(every: 1m, fn: count)` |
| **告警閾值** | Warning: < 0.5 tasks/min（持續 5 分鐘）; Critical: < 0.1 tasks/min（持續 10 分鐘） |
| **標籤** | `execution_mode`（swarm/pipeline/checkpoint/fast_track）、`task_type`（analytical/code/creative） |

#### 2.1.2 端到端延遲

| 屬性 | 值 |
|------|-----|
| **名稱** | `e2e_latency` |
| **單位** | milliseconds |
| **公式** | `P50 = percentile(latency, 0.50)` / `P95 = percentile(latency, 0.95)` / `P99 = percentile(latency, 0.99)` |
| **InfluxDB 查詢** | `from(bucket:"swarm_metrics") \|> range(start: -1h) \|> filter(fn: (r) => r._measurement == "task_complete" and r._field == "total_latency_ms") \|> quantile(q: 0.95)` |
| **告警閾值** | Fast-Track P95 > 3,000ms (Warning), > 5,000ms (Critical); Full-flow P95 > 15,000ms (Warning), > 30,000ms (Critical) |
| **標籤** | `execution_mode`、`is_fast_track` |

#### 2.1.3 每模型延遲拆解

| 屬性 | 值 |
|------|-----|
| **名稱** | `model_latency` |
| **單位** | milliseconds |
| **公式** | `per_model_p50 = percentile(model_call_latency, 0.50) grouped by model` |
| **InfluxDB 查詢** | `from(bucket:"swarm_metrics") \|> range(start: -1h) \|> filter(fn: (r) => r._measurement == "model_call") \|> group(columns: ["model"]) \|> quantile(q: 0.50)` |
| **告警閾值** | 任何模型 P95 > 20,000ms |
| **標籤** | `model`（deepseek-v4-pro / kimi-k27-code / qwen-37-max / minimax-m3）、`call_role`（orchestrator/worker/verifier/fuser） |

#### 2.1.4 每任務成本

| 屬性 | 值 |
|------|-----|
| **名稱** | `cost_per_task` |
| **單位** | CNY (¥) |
| **公式** | `cost = sum(model_call.input_tokens * model.input_price_per_token + model_call.output_tokens * model.output_price_per_token) for all calls in task` |
| **InfluxDB 查詢** | `from(bucket:"swarm_metrics") \|> range(start: -1d) \|> filter(fn: (r) => r._measurement == "task_complete" and r._field == "total_cost_cny") \|> mean()` |
| **告警閾值** | Warning: 平均 > ¥0.15; Critical: 單任務 > ¥0.50 |
| **標籤** | `execution_mode`、`task_type` |

**成本計算參考（基於 `config/models.yaml` 定價）**：

```python
# 每模型每百萬 token 定價（CNY）
MODEL_PRICING = {
    "deepseek-v4-pro": {"input": 3.0,  "output": 6.0},   # 最便宜
    "kimi-k27-code":   {"input": 24.0, "output": 24.0},
    "qwen-37-max":     {"input": 8.0,  "output": 32.0},
    "minimax-m3":      {"input": 2.0,  "output": 8.0},   # 長文本性價比高
}

def compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """計算單次模型呼叫的成本（CNY）"""
    p = MODEL_PRICING[model]
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000
```

#### 2.1.5 日/月成本燃燒速率

| 屬性 | 值 |
|------|-----|
| **名稱** | `cost_burn_rate` |
| **單位** | CNY/day, CNY/month |
| **公式** | `daily_burn = sum(cost_per_task) over rolling 24h window`; `monthly_projection = daily_burn * 30` |
| **InfluxDB 查詢** | `from(bucket:"swarm_metrics") \|> range(start: -24h) \|> filter(fn: (r) => r._measurement == "task_complete" and r._field == "total_cost_cny") \|> sum()` |
| **告警閾值** | Warning: daily > ¥35 (70% of ¥50 budget); Critical: daily > ¥50 |
| **標籤** | 無（全域指標） |

#### 2.1.6 API 錯誤率（按 Provider）

| 屬性 | 值 |
|------|-----|
| **名稱** | `api_error_rate` |
| **單位** | % |
| **公式** | `error_rate = count(status in ["error","timeout","rate_limited"]) / count(all_model_calls) * 100` per provider, over rolling 5-minute window |
| **InfluxDB 查詢** | `from(bucket:"swarm_metrics") \|> range(start: -5m) \|> filter(fn: (r) => r._measurement == "model_call") \|> group(columns: ["model"]) \|> filter(fn: (r) => r._field == "status") \|> count()` |
| **告警閾值** | Warning: > 3%; Critical: > 5%（持續 3 分鐘） |
| **標籤** | `model`、`error_type`（timeout / rate_limited / server_error / parse_error / context_overflow） |

#### 2.1.7 模型超時率

| 屬性 | 值 |
|------|-----|
| **名稱** | `model_timeout_rate` |
| **單位** | % |
| **公式** | `timeout_rate = count(latency > timeout_threshold) / count(all_calls) * 100` per model |
| **告警閾值** | Warning: > 5%; Critical: > 10% |
| **超時閾值來源** | `config/policies.yaml` → `timeouts.worker_single`（預設 20s）、`timeouts.verify`（15s）、`timeouts.fuse`（15s） |
| **標籤** | `model`、`call_role` |

### 2.2 Swarm 專屬指標

#### 2.2.1 階段耗時拆解

| 屬性 | 值 |
|------|-----|
| **名稱** | `phase_duration` |
| **單位** | milliseconds |
| **公式** | 分別計算 `scout_duration = scout_end - scout_start`、`swarm_duration = swarm_end - swarm_start`、`verify_duration = verify_end - verify_start`、`fuse_duration = fuse_end - fuse_start`、`learn_duration = learn_end - learn_start` |
| **告警閾值** | scout P95 > 5,000ms; swarm P95 > 10,000ms; verify P95 > 8,000ms; fuse P95 > 8,000ms |
| **標籤** | `phase`（scout/swarm/verify/fuse/learn）、`execution_mode` |

**InfluxDB 查詢（各階段 P95 柱狀圖）**：

```flux
from(bucket: "swarm_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "phase_complete")
  |> filter(fn: (r) => r._field == "duration_ms")
  |> group(columns: ["phase"])
  |> quantile(q: 0.95)
```

#### 2.2.2 擺尾舞收斂時間

| 屬性 | 值 |
|------|-----|
| **名稱** | `waggle_dance_convergence` |
| **單位** | rounds (1-3) + milliseconds |
| **公式** | `convergence_rounds = dance_result.rounds_used`; `convergence_latency = dance_end - dance_start` |
| **告警閾值** | forced_convergence 比率 > 30%（表示擺尾舞頻繁無法自然收斂） |
| **標籤** | `convergence_type`（natural/forced）、`rounds_used` |

**子指標**：

| 子指標 | 公式 | 目標 |
|--------|------|------|
| 自然收斂率 | `count(convergence_type == "natural") / count(all_dances) * 100` | > 70% |
| 平均輪數 | `mean(rounds_used)` | < 2.5 |
| 交叉授粉成功率 | `count(merged_direction_adopted) / count(merge_attempts) * 100` | > 20% |

#### 2.2.3 交叉驗證一致率

| 屬性 | 值 |
|------|-----|
| **名稱** | `verification_agreement_rate` |
| **單位** | % |
| **公式** | `agreement_rate = count(all_subtasks_verified == true) / count(all_subtasks) * 100` per task |
| **告警閾值** | Warning: < 60%（rolling 1h）; Critical: < 40% |
| **標籤** | `task_type`、`verifier_model` |

**子指標**：

| 子指標 | 公式 | 說明 |
|--------|------|------|
| 首次驗證通過率 | `count(verified == true on first attempt) / count(all_verifications) * 100` | 反映 Worker 輸出品質 |
| 重試觸發率 | `count(retry_triggered) / count(all_verifications) * 100` | 過高表示 Worker 品質不足 |
| 驗證置信度均值 | `mean(verification_confidence)` | < 0.5 表示驗證標準過嚴或 Worker 品質過低 |

#### 2.2.4 Orchestrator 分解準確率

| 屬性 | 值 |
|------|-----|
| **名稱** | `decomposition_accuracy` |
| **單位** | % |
| **公式** | `accuracy = count(decomposition_sanity_check == "valid") / count(all_decompositions) * 100` |
| **人類標注樣本** | 每週隨機抽取 20 個任務，由人類標注「分解是否合理」，計算 `human_accuracy = count(human_approved) / 20 * 100` |
| **告警閾值** | 自動檢查 < 70% (Critical); 人類標注 < 60% (Critical) |
| **標籤** | `template_used`（template_id 或 "free_form"）、`task_type` |

#### 2.2.5 Fast-Track vs Full-Swarm 路由分佈

| 屬性 | 值 |
|------|-----|
| **名稱** | `routing_distribution` |
| **單位** | % |
| **公式** | `fast_track_pct = count(routing == "fast_track") / count(all_tasks) * 100`; `full_swarm_pct = count(routing == "full") / count(all_tasks) * 100` |
| **目標** | Fast-Track 佔比 > 70%（大多數任務應該是簡單的） |
| **標籤** | `routing_decision`（fast_track/swarm/pipeline/checkpoint） |

#### 2.2.6 經驗庫增長率

| 屬性 | 值 |
|------|-----|
| **名稱** | `experience_growth_rate` |
| **單位** | entries/day |
| **公式** | `growth = count(experience_writes where outcome == "success") / time_window_days` |
| **告警閾值** | < 1 entry/day（持續 3 天）表示經驗庫停滯 |
| **標籤** | `task_type`、`execution_mode` |

#### 2.2.7 經驗命中率

| 屬性 | 值 |
|------|-----|
| **名稱** | `experience_hit_rate` |
| **單位** | % |
| **公式** | `hit_rate = count(tasks where experience_used == true) / count(all_full_flow_tasks) * 100` |
| **告警閾值** | Warning: < 10%（rolling 7d）；可能表示經驗庫覆蓋不足或搜索邏輯有問題 |
| **目標** | > 30%（Phase 1），> 50%（Phase 2） |
| **標籤** | `task_type` |

### 2.3 品質指標（Quality Metrics）

#### 2.3.1 任務成功率

| 屬性 | 值 |
|------|-----|
| **名稱** | `task_success_rate` |
| **單位** | % |
| **公式** | `success_rate = count(tasks where final_status == "success") / count(all_tasks) * 100` |
| **判定規則** | `success` = 任務完成且未被標記為需要重做; `partial` = 任務完成但有子任務被跳過; `failure` = 任務未完成 |
| **告警閾值** | Warning: < 85%; Critical: < 70% |
| **標籤** | `execution_mode`、`task_type`、`template_used` |

#### 2.3.2 返工率

| 屬性 | 值 |
|------|-----|
| **名稱** | `rework_rate` |
| **單位** | % |
| **公式** | `rework_rate = count(tasks where retry_triggered == true or user_flagged == "needs_redo") / count(all_tasks) * 100` |
| **子指標** | `auto_rework_rate` = 系統自動重試觸發率; `manual_rework_rate` = 用戶標記需重做率 |
| **告警閾值** | Warning: > 20%; Critical: > 35% |
| **標籤** | `rework_reason`（verify_failed / user_rejected / error_recovery） |

#### 2.3.3 品質提升對比（vs 單模型基線）

| 屬性 | 值 |
|------|-----|
| **名稱** | `quality_improvement_over_baseline` |
| **單位** | % improvement |
| **公式** | `improvement = (mean(swarm_confidence) - mean(baseline_confidence)) / mean(baseline_confidence) * 100` |
| **基線** | `simple_ensemble` 對照組（同任務、同模型陣容，但不做交叉驗證，只做簡單拼接） |
| **測量方式** | MVP 基準測試（100 任務 A/B）；Phase 2+ 用每週抽樣 20 任務的人類盲評 |
| **目標** | MVP: improvement >= 5% (p < 0.05); Phase 2: improvement >= 10% |
| **標籤** | `task_type`、`evaluation_method`（auto/human_blind） |

---

## 3. 事件資料模型（Event Schema）

### 3.1 事件類型總覽

| 事件類型 | 觸發時機 | 發射位置 |
|---------|---------|---------|
| `task_started` | 任務進入系統 | `swarm_judge()` 入口 |
| `phase_started` | 某階段開始執行 | 各 stage node 入口 |
| `phase_completed` | 某階段執行完畢 | 各 stage node 出口 |
| `model_call_started` | 開始呼叫 LLM API | `litellm_client.py` |
| `model_call_completed` | LLM API 回傳結果 | `litellm_client.py` |
| `waggle_dance_round` | 擺尾舞每一輪結束 | `waggle_dance.py` |
| `verification_completed` | 交叉驗證完成 | `verify.py` |
| `experience_hit` | 經驗庫搜索命中 | `experience.py` |
| `experience_write` | 經驗寫入經驗庫 | `experience.py` |
| `task_completed` | 整個任務完成 | `swarm_judge()` 出口 |
| `error_occurred` | 任何錯誤發生 | 全域 error handler |

### 3.2 核心事件 Schema（TypeScript / JSON Schema）

#### 3.2.1 TaskCompletedEvent（任務完成事件 — 最完整的聚合事件）

```jsonschema
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://scout-then-swarm.dev/schemas/task-completed.json",
  "title": "TaskCompletedEvent",
  "description": "任務完成時的聚合事件，包含整個任務生命週期的所有資料",
  "type": "object",
  "required": [
    "event_type", "event_id", "task_id", "session_id",
    "timestamp", "phases", "model_calls", "total_cost_cny",
    "total_latency_ms", "final_status"
  ],
  "properties": {
    "event_type": {
      "type": "string",
      "const": "task_completed"
    },
    "event_id": {
      "type": "string",
      "format": "uuid",
      "description": "事件唯一識別符"
    },
    "task_id": {
      "type": "string",
      "format": "uuid",
      "description": "任務唯一識別符，貫穿整個生命週期"
    },
    "session_id": {
      "type": "string",
      "description": "用戶對話 session ID，用於關聯同一對話中的多個任務"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "事件產生的 ISO-8601 時間戳"
    },
    "task_metadata": {
      "type": "object",
      "description": "任務中繼資料",
      "properties": {
        "task_type": {
          "type": "string",
          "enum": ["analytical", "code", "creative", "data", "unknown"]
        },
        "execution_mode": {
          "type": "string",
          "enum": ["fast_track", "swarm", "pipeline", "checkpoint"]
        },
        "template_used": {
          "type": ["string", "null"],
          "description": "命中的模板 ID，null 表示自由形式分解"
        },
        "coupling_level": {
          "type": ["string", "null"],
          "enum": ["low", "medium", "high", null]
        },
        "user_input_length": {
          "type": "integer",
          "description": "用戶輸入的字元數"
        }
      },
      "required": ["task_type", "execution_mode"]
    },
    "phases": {
      "type": "array",
      "description": "各階段的耗時與狀態",
      "items": {
        "type": "object",
        "required": ["phase", "start_time", "end_time", "duration_ms", "status"],
        "properties": {
          "phase": {
            "type": "string",
            "enum": ["scout", "swarm", "verify", "fuse", "learn", "fast_track"]
          },
          "start_time": { "type": "string", "format": "date-time" },
          "end_time": { "type": ["string", "null"], "format": "date-time" },
          "duration_ms": { "type": "integer" },
          "status": {
            "type": "string",
            "enum": ["completed", "failed", "skipped", "timed_out"]
          },
          "details": {
            "type": "object",
            "description": "階段特定的詳細資料",
            "properties": {
              "scout": {
                "type": "object",
                "properties": {
                  "experience_hit": { "type": "boolean" },
                  "template_matched": { "type": ["string", "null"] },
                  "subtask_count": { "type": "integer" },
                  "decomposition_valid": { "type": "boolean" },
                  "decomposition_retry_count": { "type": "integer" }
                }
              },
              "swarm": {
                "type": "object",
                "properties": {
                  "worker_count": { "type": "integer" },
                  "parallel_degree": { "type": "integer" },
                  "worker_ids": {
                    "type": "array",
                    "items": { "type": "string" }
                  }
                }
              },
              "verify": {
                "type": "object",
                "properties": {
                  "verification_count": { "type": "integer" },
                  "all_passed": { "type": "boolean" },
                  "retry_triggered": { "type": "boolean" }
                }
              }
            }
          }
        }
      }
    },
    "model_calls": {
      "type": "array",
      "description": "所有 LLM API 呼叫的詳細記錄",
      "items": {
        "type": "object",
        "required": ["call_id", "model", "input_tokens", "output_tokens", "latency_ms", "cost_cny", "status"],
        "properties": {
          "call_id": {
            "type": "string",
            "format": "uuid"
          },
          "model": {
            "type": "string",
            "enum": ["deepseek-v4-pro", "kimi-k27-code", "qwen-37-max", "minimax-m3"]
          },
          "call_role": {
            "type": "string",
            "enum": ["orchestrator", "worker", "verifier", "fuser", "red_team", "synthesizer"],
            "description": "該呼叫在系統中的角色"
          },
          "phase": {
            "type": "string",
            "enum": ["scout", "swarm", "verify", "fuse", "waggle_dance"]
          },
          "subtask_id": {
            "type": ["string", "null"],
            "description": "對應的子任務 ID，非子任務呼叫為 null"
          },
          "input_tokens": {
            "type": "integer",
            "minimum": 0
          },
          "output_tokens": {
            "type": "integer",
            "minimum": 0
          },
          "total_tokens": {
            "type": "integer",
            "minimum": 0
          },
          "latency_ms": {
            "type": "integer",
            "description": "從發出請求到收到完整回應的耗時"
          },
          "cost_cny": {
            "type": "number",
            "minimum": 0,
            "description": "本次呼叫的成本（人民幣）"
          },
          "status": {
            "type": "string",
            "enum": ["success", "timeout", "rate_limited", "server_error", "parse_error", "context_overflow"]
          },
          "error_message": {
            "type": ["string", "null"],
            "description": "失敗時的錯誤訊息"
          },
          "retry_count": {
            "type": "integer",
            "minimum": 0,
            "description": "重試次數（0 = 首次嘗試即成功）"
          },
          "temperature": {
            "type": "number",
            "description": "呼叫時使用的 temperature 參數"
          }
        }
      }
    },
    "waggle_dance_state": {
      "type": ["object", "null"],
      "description": "擺尾舞狀態（MVP 階段通常為 null）",
      "properties": {
        "enabled": { "type": "boolean" },
        "rounds_used": {
          "type": "integer",
          "minimum": 0,
          "maximum": 3
        },
        "max_rounds": { "type": "integer" },
        "convergence_type": {
          "type": ["string", "null"],
          "enum": ["natural", "forced", null]
        },
        "winner_direction_id": {
          "type": ["string", "null"]
        },
        "final_confidence": {
          "type": ["number", "null"],
          "minimum": 0,
          "maximum": 1
        },
        "directions_proposed": { "type": "integer" },
        "directions_eliminated": { "type": "integer" },
        "merge_attempted": { "type": "boolean" },
        "merge_adopted": { "type": "boolean" },
        "round_details": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "round": { "type": "integer" },
              "duration_ms": { "type": "integer" },
              "directions_active": { "type": "integer" },
              "red_team_fatal_flags": { "type": "integer" },
              "quorum_met": { "type": "boolean" }
            }
          }
        }
      }
    },
    "verification_result": {
      "type": ["object", "null"],
      "description": "交叉驗證結果",
      "properties": {
        "total_subtasks": { "type": "integer" },
        "verified_count": { "type": "integer" },
        "failed_count": { "type": "integer" },
        "agreement_score": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "description": "所有子任務驗證置信度的均值"
        },
        "flags": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "subtask_id": { "type": "string" },
              "flag_type": {
                "type": "string",
                "enum": ["logical_inconsistency", "incompleteness", "factual_error", "irrelevance", "low_confidence"]
              },
              "severity": {
                "type": "string",
                "enum": ["info", "warning", "critical"]
              },
              "detail": { "type": "string" }
            }
          }
        },
        "retry_triggered": { "type": "boolean" },
        "retry_succeeded": { "type": ["boolean", "null"] }
      }
    },
    "experience_hits": {
      "type": "array",
      "description": "經驗庫搜索命中的記錄",
      "items": {
        "type": "object",
        "properties": {
          "experience_id": { "type": "string" },
          "relevance_score": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "was_used": {
            "type": "boolean",
            "description": "是否實際被採用"
          },
          "is_stale": {
            "type": "boolean",
            "description": "經驗是否已過期/過時"
          }
        }
      }
    },
    "experience_writes": {
      "type": "array",
      "description": "經驗寫入記錄",
      "items": {
        "type": "object",
        "properties": {
          "experience_id": { "type": "string" },
          "action": {
            "type": "string",
            "enum": ["create", "update", "delete"]
          },
          "outcome": {
            "type": "string",
            "enum": ["success", "failure"]
          },
          "ttl_days": { "type": "integer" }
        }
      }
    },
    "total_cost_cny": {
      "type": "number",
      "minimum": 0,
      "description": "任務總成本（人民幣）"
    },
    "total_latency_ms": {
      "type": "integer",
      "description": "端到端總耗時（毫秒）"
    },
    "final_status": {
      "type": "string",
      "enum": ["success", "partial", "failure", "timeout", "aborted"],
      "description": "任務最終狀態"
    },
    "final_confidence": {
      "type": ["number", "null"],
      "minimum": 0,
      "maximum": 1,
      "description": "最終輸出的置信度"
    },
    "degradation_path": {
      "type": ["array", "null"],
      "items": { "type": "string" },
      "description": "如果觸發了降級鏈，記錄降級路徑，例如 ['swarm','pipeline','fast_track']"
    },
    "error_summary": {
      "type": ["object", "null"],
      "properties": {
        "total_errors": { "type": "integer" },
        "recoverable": { "type": "integer" },
        "fatal": { "type": "integer" },
        "primary_error_type": { "type": ["string", "null"] },
        "primary_error_message": { "type": ["string", "null"] }
      }
    }
  }
}
```

#### 3.2.2 ModelCallEvent（模型呼叫事件 — 即時推送用）

```jsonschema
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ModelCallEvent",
  "description": "單次 LLM API 呼叫事件，用於即時推送",
  "type": "object",
  "required": ["event_type", "event_id", "task_id", "timestamp", "model", "call_role", "status"],
  "properties": {
    "event_type": {
      "type": "string",
      "enum": ["model_call_started", "model_call_completed"]
    },
    "event_id": { "type": "string", "format": "uuid" },
    "task_id": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "model": {
      "type": "string",
      "enum": ["deepseek-v4-pro", "kimi-k27-code", "qwen-37-max", "minimax-m3"]
    },
    "call_role": {
      "type": "string",
      "enum": ["orchestrator", "worker", "verifier", "fuser", "red_team", "synthesizer"]
    },
    "phase": { "type": "string" },
    "subtask_id": { "type": ["string", "null"] },
    "status": {
      "type": "string",
      "enum": ["started", "success", "timeout", "rate_limited", "server_error", "parse_error", "context_overflow"]
    },
    "input_tokens": { "type": ["integer", "null"] },
    "output_tokens": { "type": ["integer", "null"] },
    "latency_ms": { "type": ["integer", "null"] },
    "cost_cny": { "type": ["number", "null"] },
    "error_message": { "type": ["string", "null"] }
  }
}
```

#### 3.2.3 PhaseEvent（階段事件）

```jsonschema
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PhaseEvent",
  "type": "object",
  "required": ["event_type", "event_id", "task_id", "timestamp", "phase", "action"],
  "properties": {
    "event_type": {
      "type": "string",
      "enum": ["phase_started", "phase_completed"]
    },
    "event_id": { "type": "string", "format": "uuid" },
    "task_id": { "type": "string", "format": "uuid" },
    "timestamp": { "type": "string", "format": "date-time" },
    "phase": {
      "type": "string",
      "enum": ["scout", "swarm", "verify", "fuse", "learn", "fast_track"]
    },
    "action": {
      "type": "string",
      "enum": ["started", "completed", "failed", "skipped"]
    },
    "duration_ms": { "type": ["integer", "null"] }
  }
}
```

### 3.3 Python 資料模型（Pydantic v2）

```python
# src/swarm/observability/models.py
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class EventType(str, Enum):
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    PHASE_STARTED = "phase_started"
    PHASE_COMPLETED = "phase_completed"
    MODEL_CALL_STARTED = "model_call_started"
    MODEL_CALL_COMPLETED = "model_call_completed"
    WAGGLE_DANCE_ROUND = "waggle_dance_round"
    VERIFICATION_COMPLETED = "verification_completed"
    EXPERIENCE_HIT = "experience_hit"
    EXPERIENCE_WRITE = "experience_write"
    ERROR_OCCURRED = "error_occurred"


class ModelName(str, Enum):
    DEEPSEEK_V4_PRO = "deepseek-v4-pro"
    KIMI_K27_CODE = "kimi-k27-code"
    QWEN_37_MAX = "qwen-37-max"
    MINIMAX_M3 = "minimax-m3"


class CallRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    WORKER = "worker"
    VERIFIER = "verifier"
    FUSER = "fuser"
    RED_TEAM = "red_team"
    SYNTHESIZER = "synthesizer"


class TaskStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    ABORTED = "aborted"


class ModelCallRecord(BaseModel):
    """單次模型呼叫記錄"""
    call_id: UUID = Field(default_factory=uuid4)
    model: ModelName
    call_role: CallRole
    phase: str
    subtask_id: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    cost_cny: float = 0.0
    status: str = "success"
    error_message: str | None = None
    retry_count: int = 0
    temperature: float = 0.0


class PhaseRecord(BaseModel):
    """階段執行記錄"""
    phase: str
    start_time: datetime
    end_time: datetime | None = None
    duration_ms: int = 0
    status: str = "completed"
    details: dict[str, Any] = Field(default_factory=dict)


class VerificationFlag(BaseModel):
    """驗證標記"""
    subtask_id: str
    flag_type: str
    severity: str
    detail: str


class VerificationRecord(BaseModel):
    """交叉驗證結果"""
    total_subtasks: int
    verified_count: int
    failed_count: int
    agreement_score: float
    flags: list[VerificationFlag] = Field(default_factory=list)
    retry_triggered: bool = False
    retry_succeeded: bool | None = None


class WaggleDanceRoundDetail(BaseModel):
    """擺尾舞單輪詳情"""
    round: int
    duration_ms: int
    directions_active: int
    red_team_fatal_flags: int
    quorum_met: bool


class WaggleDanceRecord(BaseModel):
    """擺尾舞狀態"""
    enabled: bool = False
    rounds_used: int = 0
    max_rounds: int = 3
    convergence_type: str | None = None  # natural / forced
    winner_direction_id: str | None = None
    final_confidence: float | None = None
    directions_proposed: int = 0
    directions_eliminated: int = 0
    merge_attempted: bool = False
    merge_adopted: bool = False
    round_details: list[WaggleDanceRoundDetail] = Field(default_factory=list)


class ExperienceHitRecord(BaseModel):
    """經驗命中記錄"""
    experience_id: str
    relevance_score: float
    was_used: bool
    is_stale: bool


class ExperienceWriteRecord(BaseModel):
    """經驗寫入記錄"""
    experience_id: str
    action: str  # create / update / delete
    outcome: str  # success / failure
    ttl_days: int = 90


class TaskCompletedEvent(BaseModel):
    """任務完成聚合事件 — 發往 InfluxDB 的主要事件"""
    event_type: EventType = EventType.TASK_COMPLETED
    event_id: UUID = Field(default_factory=uuid4)
    task_id: UUID
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    task_metadata: dict[str, Any] = Field(default_factory=dict)
    phases: list[PhaseRecord] = Field(default_factory=list)
    model_calls: list[ModelCallRecord] = Field(default_factory=list)
    waggle_dance_state: WaggleDanceRecord | None = None
    verification_result: VerificationRecord | None = None
    experience_hits: list[ExperienceHitRecord] = Field(default_factory=list)
    experience_writes: list[ExperienceWriteRecord] = Field(default_factory=list)

    total_cost_cny: float = 0.0
    total_latency_ms: int = 0
    final_status: TaskStatus = TaskStatus.SUCCESS
    final_confidence: float | None = None
    degradation_path: list[str] | None = None
    error_summary: dict[str, Any] | None = None
```

### 3.4 InfluxDB 寫入格式

TaskCompletedEvent 在寫入 InfluxDB 時被拆解為多條 time-series point：

```python
# src/swarm/observability/influx_writer.py

def event_to_influx_points(event: TaskCompletedEvent) -> list[Point]:
    """將聚合事件拆解為 InfluxDB point 序列"""
    points = []
    ts = event.timestamp

    # 1. 任務層級聚合 point
    points.append(
        Point("task_complete")
        .tag("task_id", str(event.task_id))
        .tag("session_id", event.session_id)
        .tag("task_type", event.task_metadata.get("task_type", "unknown"))
        .tag("execution_mode", event.task_metadata.get("execution_mode", "unknown"))
        .tag("template_used", event.task_metadata.get("template_used", "none"))
        .tag("final_status", event.final_status.value)
        .field("total_latency_ms", event.total_latency_ms)
        .field("total_cost_cny", event.total_cost_cny)
        .field("final_confidence", event.final_confidence or 0.0)
        .field("model_call_count", len(event.model_calls))
        .field("phase_count", len(event.phases))
        .field("total_input_tokens", sum(c.input_tokens for c in event.model_calls))
        .field("total_output_tokens", sum(c.output_tokens for c in event.model_calls))
        .time(ts)
    )

    # 2. 各階段耗時 point
    for phase in event.phases:
        points.append(
            Point("phase_complete")
            .tag("task_id", str(event.task_id))
            .tag("phase", phase.phase)
            .tag("status", phase.status)
            .field("duration_ms", phase.duration_ms)
            .time(ts)
        )

    # 3. 各模型呼叫 point
    for call in event.model_calls:
        points.append(
            Point("model_call")
            .tag("task_id", str(event.task_id))
            .tag("model", call.model.value)
            .tag("call_role", call.call_role.value)
            .tag("phase", call.phase)
            .tag("status", call.status)
            .field("input_tokens", call.input_tokens)
            .field("output_tokens", call.output_tokens)
            .field("latency_ms", call.latency_ms)
            .field("cost_cny", call.cost_cny)
            .field("retry_count", call.retry_count)
            .time(ts)
        )

    # 4. 驗證結果 point
    if event.verification_result:
        vr = event.verification_result
        points.append(
            Point("verification")
            .tag("task_id", str(event.task_id))
            .tag("retry_triggered", str(vr.retry_triggered))
            .field("total_subtasks", vr.total_subtasks)
            .field("verified_count", vr.verified_count)
            .field("failed_count", vr.failed_count)
            .field("agreement_score", vr.agreement_score)
            .field("flag_count", len(vr.flags))
            .time(ts)
        )

    # 5. 擺尾舞 point（如果啟用）
    if event.waggle_dance_state and event.waggle_dance_state.enabled:
        wd = event.waggle_dance_state
        points.append(
            Point("waggle_dance")
            .tag("task_id", str(event.task_id))
            .tag("convergence_type", wd.convergence_type or "none")
            .field("rounds_used", wd.rounds_used)
            .field("directions_proposed", wd.directions_proposed)
            .field("directions_eliminated", wd.directions_eliminated)
            .field("final_confidence", wd.final_confidence or 0.0)
            .field("merge_adopted", int(wd.merge_adopted))
            .time(ts)
        )

    # 6. 經驗命中/寫入 point
    for hit in event.experience_hits:
        points.append(
            Point("experience_hit")
            .tag("task_id", str(event.task_id))
            .tag("experience_id", hit.experience_id)
            .tag("is_stale", str(hit.is_stale))
            .field("relevance_score", hit.relevance_score)
            .field("was_used", int(hit.was_used))
            .time(ts)
        )

    for write in event.experience_writes:
        points.append(
            Point("experience_write")
            .tag("task_id", str(event.task_id))
            .tag("action", write.action)
            .tag("outcome", write.outcome)
            .field("ttl_days", write.ttl_days)
            .time(ts)
        )

    return points
```

---

## 4. Dashboard 視圖設計

### 4.1 視圖總覽

| # | 視圖名稱 | 主要受眾 | 更新頻率 | 核心問題 |
|---|---------|---------|---------|---------|
| 1 | **Live Task View** | 開發者 / 維運 | 即時（WebSocket） | 「現在系統在幹嘛？這個任務跑到哪了？」 |
| 2 | **Cost Analytics** | PM / 管理層 | 1 分鐘 | 「花了多少錢？會不會爆預算？」 |
| 3 | **Model Performance** | 開發者 / PM | 1 分鐘 | 「哪個模型最快最穩？有沒有拖後腿的？」 |
| 4 | **Experience Base** | 開發者 / PM | 5 分鐘 | 「經驗庫健康嗎？有沒有在發揮作用？」 |

### 4.2 Live Task View（即時任務視圖）

**佈局**：

```
+==================================================================+
| 🟢 System Status: Healthy    Tasks/min: 3.2   Active: 2          |
+==================================================================+
|                                                                    |
| ┌─ Active Tasks ──────────────────────────────────────────────┐   |
| │                                                               │   |
| │  Task #a3f2  [██████████░░░░░░░░░░] 62%  Verify  8.2s       │   |
| │    ├─ Scout    ✅ 1.2s   (DeepSeek V4 Pro, template: code-review)
| │    ├─ Swarm   ✅ 4.5s   (Kimi ∥ DeepSeek ∥ Qwen, 3 workers) │   |
| │    ├─ Verify  🔄 2.5s   (Qwen 3.7 Max cross-verifying...)   │   |
| │    ├─ Fuse    ⏳ waiting                                     │   |
| │    └─ Learn   ⏳ waiting                                     │   |
| │                                                               │   |
| │  Task #b7e1  [██░░░░░░░░░░░░░░░░░░] 12%  Scout   0.8s       │   |
| │    ├─ Scout   🔄 0.8s   (searching experience base...)       │   |
| │    └─ ...     ⏳ waiting                                      │   |
| └───────────────────────────────────────────────────────────────┘   |
|                                                                    |
| ┌─ Recent Completed (last 10) ─────────────────────────────────┐  |
| │ #c4d1  ✅ success  Swarm   ¥0.08  6.2s   confidence: 0.82   │  |
| │ #c3b2  ✅ success  F-Track ¥0.01  1.1s   confidence: 0.91   │  |
| │ #c2a3  ⚠️ partial  Pipe    ¥0.15  12.4s  confidence: 0.55   │  |
| │ #c1f4  ❌ failure  Swarm   ¥0.22  18.1s  error: rate_limit  │  |
| └───────────────────────────────────────────────────────────────┘  |
|                                                                    |
| ┌─ Event Stream (live) ────────────────────────────────────────┐  |
| │ 14:32:05 [model_call] Task #a3f2: qwen-37-max verifier ✅ 2.1s│  |
| │ 14:32:03 [phase]      Task #a3f2: verify started              │  |
| │ 14:31:58 [model_call] Task #a3f2: deepseek-v4-pro worker ✅ 3.8s│  |
| │ 14:31:58 [model_call] Task #a3f2: kimi-k27-code worker ✅ 4.2s │  |
| │ 14:31:55 [phase]      Task #a3f2: swarm started (3 workers)   │  |
| └───────────────────────────────────────────────────────────────┘  |
+==================================================================+
```

**元件規格**：

| 元件 | 資料源 | 描述 |
|------|--------|------|
| **System Status Bar** | WebSocket → `task_throughput` counter | 系統狀態燈（綠/黃/紅）、每分鐘任務數、當前活躍任務數 |
| **Active Task Card** | WebSocket → `phase_started`/`phase_completed` | 進度條 + 各階段狀態圖示（✅🔄⏳❌）、已耗時 |
| **Recent Completed Table** | REST API → `/api/tasks/recent?limit=10` | 最近完成的任務列表，可點擊鑽取 |
| **Event Stream** | WebSocket → 所有事件類型 | 即時事件流，可按 task_id / event_type 篩選 |

**互動功能**：
- 點擊 Active Task Card → 展開詳細面板（模型呼叫、token 用量、成本）
- 點擊 Recent Completed 行 → 跳轉到任務詳情頁（完整 TaskCompletedEvent 渲染）
- 事件流支援按 `task_id` 過濾，只看某個任務的事件時間線

### 4.3 Cost Analytics（成本分析視圖）

**佈局**：

```
+==================================================================+
| Daily Budget: ¥50.00  |  Today: ¥18.32 (36.6%)  |  🔴 Projection: ¥55 |
+==================================================================+
|                                                                    |
| ┌─ Cost Trend (24h) ───────────────────────────────────────────┐  |
| │  ¥/hour                                                       │  |
| │  3.0 │          ╱╲                                            │  |
| │  2.5 │        ╱    ╲      ╱╲                                  │  |
| │  2.0 │      ╱        ╲  ╱    ╲                                │  |
| │  1.5 │    ╱            ╳       ╲                               │  |
| │  1.0 │  ╱                                ╱── budget: ¥2.08/h  │  |
| │  0.5 │╱                                  │                     │  |
| │  0.0 └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──│                    │  |
| │        00 02 04 06 08 10 12 14 16 18 20 22                     │  |
| └────────────────────────────────────────────────────────────────┘  |
|                                                                    |
| ┌─ Per-Model Cost Breakdown ────┐  ┌─ Per-Phase Cost ──────────┐  |
| │ (Pie Chart)                   │  │ (Stacked Bar)              │  |
| │                                │  │                            │  |
| │   Qwen 3.7 Max    42%  ¥7.69 │  │ Scout  8%   (Decompose)   │  |
| │   Kimi K2.7 Code  28%  ¥5.13 │  │ Swarm  65%  (Workers)     │  |
| │   DeepSeek V4 Pro 18%  ¥3.30 │  │ Verify 18%  (Cross-ver.)  │  |
| │   MiniMax M3      12%  ¥2.20 │  │ Fuse   9%   (Synthesis)   │  |
| └────────────────────────────────┘  └────────────────────────────┘  |
|                                                                    |
| ┌─ Top 10 Costliest Tasks ─────────────────────────────────────┐  |
| │ Task #x8f2  ¥0.48  Swarm  code  12 model calls  ⚠️ near cap │  |
| │ Task #x7e1  ¥0.41  Pipe   analytical  8 calls               │  |
| │ Task #x6d3  ¥0.35  Swarm  creative  6 calls                 │  |
| └───────────────────────────────────────────────────────────────┘  |
+==================================================================+
```

**元件規格**：

| 元件 | 查詢 | 說明 |
|------|------|------|
| **Budget Gauge** | `sum(cost_per_task) over today` | 甜甜圈圖，顯示已用/剩餘預算 + 每日投射 |
| **Cost Trend** | `sum(cost) grouped by hour over 24h` | 折線圖 + 預算線 |
| **Per-Model Pie** | `sum(cost) grouped by model over 24h` | 圓餅圖，各模型成本佔比 |
| **Per-Phase Bar** | `sum(cost) grouped by phase over 24h` | 堆疊長條圖，各階段成本佔比 |
| **Costliest Tasks** | `top 10 tasks by cost over 24h` | 表格，可鑽取到任務詳情 |

### 4.4 Model Performance（模型效能視圖）

**佈局**：

```
+==================================================================+
| Model Health Overview                                              |
| 🟢 DeepSeek V4 Pro  🟢 Kimi K2.7  🟡 Qwen 3.7 Max  🟢 MiniMax  |
+==================================================================+
|                                                                    |
| ┌─ Latency Comparison (P50 / P95) ─────────────────────────────┐  |
| │                                                                │  |
| │  DeepSeek V4 Pro  │████████░░│ P50: 1.8s  P95: 4.2s         │  |
| │  Kimi K2.7 Code   │██████████████░░░░│ P50: 2.5s  P95: 7.1s │  |
| │  Qwen 3.7 Max     │████████████████░░░░│ P50: 3.1s P95: 8.5s│  |
| │  MiniMax M3       │████████████░░░░│ P50: 2.2s  P95: 5.8s   │  |
| └────────────────────────────────────────────────────────────────┘  |
|                                                                    |
| ┌─ Error Rate (5m rolling) ──┐  ┌─ Quality Score ──────────────┐  |
| │ (Line Chart, per model)    │  │ (Verification pass rate)      │  |
| │                             │  │                               │  |
| │ DeepSeek  0.2%  ✅         │  │ DeepSeek  89%  ✅            │  |
| │ Kimi      0.5%  ✅         │  │ Kimi      92%  ✅            │  |
| │ Qwen      2.1%  🟡         │  │ Qwen      85%  🟡            │  |
| │ MiniMax   0.1%  ✅         │  │ MiniMax   88%  ✅            │  |
| └─────────────────────────────┘  └───────────────────────────────┘  |
|                                                                    |
| ┌─ Token Usage Trend (1h) ─────────────────────────────────────┐  |
| │ (Stacked area chart: input tokens vs output tokens per model) │  |
| └───────────────────────────────────────────────────────────────┘  |
+==================================================================+
```

**元件規格**：

| 元件 | 查詢 | 說明 |
|------|------|------|
| **Health Indicator** | `error_rate per model over 5m` | 綠燈: < 1%、黃燈: 1-5%、紅燈: > 5% |
| **Latency Comparison** | `quantile(latency, 0.50/0.95) grouped by model` | 水平長條圖，P50 + P95 雙柱 |
| **Error Rate Trend** | `error_rate per model over 1h, 5m windows` | 折線圖，每模型一條線 |
| **Quality Score** | `mean(verification_confidence) grouped by worker_model` | 各模型作為 Worker 時的驗證通過率 |
| **Token Usage** | `sum(input_tokens), sum(output_tokens) grouped by model over 1h` | 堆疊面積圖 |

### 4.5 Experience Base（經驗庫視圖）

**佈局**：

```
+==================================================================+
| Experience Base Health                                             |
| Total: 342 entries  |  Stale: 23 (6.7%)  |  Growth: +12/day      |
+==================================================================+
|                                                                    |
| ┌─ Experience Hit Rate (7d trend) ─────────────────────────────┐  |
| │                                                                │  |
| │  60% │                                              ╱── 52%   │  |
| │  50% │                                     ╱──╲──╱            │  |
| │  40% │                          ╱──╲──╲──╱                   │  |
| │  30% │                ╱──╲──╱                                 │  |
| │  20% │      ╱──╲──╱                                           │  |
| │  10% │  ──╱                                                     │  |
| │   0% └──┬───┬───┬───┬───┬───┬───┬──                            │  |
| │        Mon Tue Wed Thu Fri Sat Sun                              │  |
| └────────────────────────────────────────────────────────────────┘  |
|                                                                    |
| ┌─ Entry Distribution by Task Type ──┐  ┌─ Top Templates ──────┐  |
| │ (Donut Chart)                      │  │ (Table)              │  |
| │                                     │  │                      │  |
| │   code          45%  (154 entries) │  │ code-review    89 🔥  │  |
| │   analytical    30%  (103 entries) │  │ doc-analysis   67     │  |
| │   creative      15%  (51 entries)  │  │ research-report 52    │  |
| │   data          10%  (34 entries)  │  │ translation    41     │  |
| └─────────────────────────────────────┘  └──────────────────────┘  |
|                                                                    |
| ┌─ Stale Entry Warnings ───────────────────────────────────────┐  |
| │ ⚠️  12 entries for model_version="deepseek-v3" (expired 15d) │  |
| │ ⚠️   8 entries with success_rate < 0.3 (candidates for GC)   │  |
| │ ⚠️   3 entries never validated since creation (> 30d old)    │  |
| └───────────────────────────────────────────────────────────────┘  |
+==================================================================+
```

**元件規格**：

| 元件 | 查詢 | 說明 |
|------|------|------|
| **Summary Cards** | `SELECT count(*), ... FROM experiences` | 總條目、stale 佔比、每日增長率 |
| **Hit Rate Trend** | `experience_hit_rate per day over 7d` | 折線圖 + 目標線（30% Phase 1, 50% Phase 2） |
| **Entry Distribution** | `SELECT count(*) GROUP BY task_type FROM experiences` | 甜甜圈圖 |
| **Top Templates** | `SELECT template, count(*) GROUP BY template ORDER BY count DESC LIMIT 10` | 最常被使用的模板排行 |
| **Stale Warnings** | `SELECT * FROM experiences WHERE stale = true OR (last_validated < now - 30d)` | 需要關注的過期/低品質經驗 |

---

## 5. 告警規則

### 5.1 告警嚴重度定義

| 嚴重度 | 含義 | 通知方式 | 回應 SLA |
|--------|------|---------|---------|
| **INFO** | 需關注，不需立即行動 | Dashboard 標記 | 下个工作日 |
| **WARNING** | 趨勢異常，需調查 | Slack/飛書通知 | 4 小時 |
| **CRITICAL** | 服務品質受影響，需立即處理 | Slack/飛書 + 簡訊 + 電話 | 15 分鐘 |

### 5.2 告警規則清單

#### 5.2.1 成本預算告警

```yaml
# config/alerts/cost.yaml
alerts:
  - id: COST_DAILY_WARNING
    name: "每日成本預算預警"
    severity: WARNING
    description: "今日累計成本已達每日預算的 70%"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: today())
        |> filter(fn: (r) => r._measurement == "task_complete" and r._field == "total_cost_cny")
        |> sum()
    condition: "value > 35.0"   # ¥50 * 70%
    for_duration: "0m"          # 立即觸發
    cooldown: "30m"
    labels:
      category: "cost"
    annotations:
      summary: "今日成本 ¥{{ value | printf \"%.2f\" }}，已達預算 70%"
      runbook: "https://wiki.internal/runbooks/cost-budget"
    action:
      - notify_slack: "#swarm-alerts"
      - notify_lark: "Scout-then-Swarm 維運群"

  - id: COST_DAILY_CRITICAL
    name: "每日成本預算超限"
    severity: CRITICAL
    description: "今日累計成本已超過每日預算"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: today())
        |> filter(fn: (r) => r._measurement == "task_complete" and r._field == "total_cost_cny")
        |> sum()
    condition: "value > 50.0"
    for_duration: "0m"
    cooldown: "15m"
    labels:
      category: "cost"
    annotations:
      summary: "🚨 今日成本 ¥{{ value | printf \"%.2f\" }}，已超過每日預算 ¥50"
    action:
      - notify_slack: "#swarm-alerts"
      - notify_lark: "Scout-then-Swarm 維運群"
      - execute: "throttle_new_tasks"   # 自動限流：新任務排隊，不拒絕但延遲

  - id: COST_SINGLE_TASK
    name: "單任務成本異常"
    severity: WARNING
    description: "單個任務成本超過 ¥0.30（正常上限 ¥0.50 的 60%）"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: -5m)
        |> filter(fn: (r) => r._measurement == "task_complete" and r._field == "total_cost_cny")
        |> max()
    condition: "value > 0.30"
    for_duration: "0m"
    cooldown: "5m"
    annotations:
      summary: "Task {{ task_id }} 成本 ¥{{ value | printf \"%.2f\" }}，異常偏高"

  - id: COST_SINGLE_TASK_CRITICAL
    name: "單任務成本超限"
    severity: CRITICAL
    description: "單個任務成本超過硬上限 ¥0.50"
    condition: "value > 0.50"
    action:
      - execute: "abort_if_running"     # 中止正在執行的超成本任務
      - notify_slack: "#swarm-alerts"
```

#### 5.2.2 模型 Provider 錯誤率告警

```yaml
# config/alerts/model_errors.yaml
alerts:
  - id: MODEL_ERROR_RATE_WARNING
    name: "模型錯誤率預警"
    severity: WARNING
    description: "某模型 Provider 在 5 分鐘窗口內錯誤率 > 3%"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: -5m)
        |> filter(fn: (r) => r._measurement == "model_call")
        |> group(columns: ["model"])
        |> filter(fn: (r) => r._field == "status")
        |> count()
    # 計算: error_count / total_count * 100
    condition: "error_rate > 3.0"
    for_duration: "3m"           # 持續 3 分鐘才觸發，避免瞬間波動
    cooldown: "10m"
    labels:
      category: "reliability"
    annotations:
      summary: "{{ model }} 錯誤率 {{ value }}% (5m window)"

  - id: MODEL_ERROR_RATE_CRITICAL
    name: "模型錯誤率嚴重"
    severity: CRITICAL
    description: "某模型 Provider 在 5 分鐘窗口內錯誤率 > 5%，持續 3 分鐘"
    condition: "error_rate > 5.0"
    for_duration: "3m"
    cooldown: "5m"
    action:
      - notify_slack: "#swarm-alerts"
      - execute: "activate_fallback_model"  # 自動啟用 fallback 模型
    annotations:
      summary: "🚨 {{ model }} 錯誤率 {{ value }}%，已啟用 fallback"

  - id: MODEL_TIMEOUT_SPIKE
    name: "模型超時尖峰"
    severity: WARNING
    description: "某模型超時率 > 10%（5 分鐘窗口）"
    condition: "timeout_rate > 10.0"
    for_duration: "3m"
    cooldown: "10m"
    annotations:
      summary: "{{ model }} 超時率 {{ value }}%，可能 Provider 端有問題"
```

#### 5.2.3 延遲告警

```yaml
# config/alerts/latency.yaml
alerts:
  - id: LATENCY_P95_WARNING
    name: "端到端延遲 P95 預警"
    severity: WARNING
    description: "完整流程任務 P95 延遲 > 15 秒"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: -10m)
        |> filter(fn: (r) => r._measurement == "task_complete"
            and r._field == "total_latency_ms"
            and r.execution_mode != "fast_track")
        |> quantile(q: 0.95)
    condition: "value > 15000"
    for_duration: "5m"
    cooldown: "15m"
    annotations:
      summary: "Full-flow P95 延遲 {{ value }}ms ({{ value / 1000 }}s)"

  - id: LATENCY_P95_CRITICAL
    name: "端到端延遲 P95 嚴重"
    severity: CRITICAL
    description: "完整流程任務 P95 延遲 > 30 秒"
    condition: "value > 30000"
    for_duration: "5m"
    cooldown: "10m"
    action:
      - notify_slack: "#swarm-alerts"
      - execute: "enable_fast_track_only"  # 暫時只允許 Fast-Track

  - id: LATENCY_FAST_TRACK
    name: "Fast-Track 延遲異常"
    severity: WARNING
    description: "Fast-Track 任務 P95 延遲 > 3 秒"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: -10m)
        |> filter(fn: (r) => r._measurement == "task_complete"
            and r._field == "total_latency_ms"
            and r.execution_mode == "fast_track")
        |> quantile(q: 0.95)
    condition: "value > 3000"
    for_duration: "5m"
```

#### 5.2.4 Orchestrator 分解準確率告警

```yaml
# config/alerts/decomposition.yaml
alerts:
  - id: DECOMPOSITION_ACCURACY
    name: "任務分解準確率下降"
    severity: CRITICAL
    description: "分解覆核檢查通過率 < 70%（過去 10 個任務）"
    query: |
      from(bucket: "swarm_metrics")
        |> range(start: -30m)
        |> filter(fn: (r) => r._measurement == "task_complete"
            and r._field == "decomposition_valid")
        |> last()
        |> limit(n: 10)
    # 計算: valid_count / 10 * 100
    condition: "valid_rate < 70.0"
    cooldown: "30m"
    action:
      - notify_slack: "#swarm-alerts"
      - execute: "force_pipeline_mode"    # 強制使用 Pipeline 模式
      - execute: "disable_free_form_decompose"  # 禁用自由分解，只用模板
    annotations:
      summary: "🚨 分解準確率 {{ value }}%，已降級為 Pipeline-only"
```

#### 5.2.5 經驗庫告警

```yaml
# config/alerts/experience.yaml
alerts:
  - id: EXPERIENCE_STALE_ACCUMULATION
    name: "經驗庫 stale 條目堆積"
    severity: WARNING
    description: "stale 經驗佔比 > 20%"
    query: "SELECT count(*) FROM experiences WHERE stale = true"
    # 計算: stale_count / total_count * 100
    condition: "stale_rate > 20.0"
    cooldown: "12h"                # 低頻率告警
    action:
      - notify_slack: "#swarm-alerts"
      - execute: "trigger_model_version_audit"  # 檢查是否有模型版本更新未處理
    annotations:
      summary: "經驗庫 stale 率 {{ value }}%，共 {{ stale_count }} 條需處理"

  - id: EXPERIENCE_LOW_HIT_RATE
    name: "經驗庫命中率過低"
    severity: WARNING
    description: "過去 7 天經驗命中率 < 10%"
    condition: "hit_rate_7d < 10.0"
    cooldown: "24h"
    annotations:
      summary: "經驗庫 7 日命中率僅 {{ value }}%，可能搜索邏輯或經驗覆蓋不足"

  - id: EXPERIENCE_GROWTH_STALLED
    name: "經驗庫增長停滯"
    severity: INFO
    description: "連續 3 天無新經驗寫入"
    condition: "growth_rate_3d < 1.0"
    cooldown: "72h"
    annotations:
      summary: "經驗庫 3 天內僅新增 {{ value }} 條，增長停滯"
```

### 5.3 告警自動處置動作

| 動作 ID | 觸發條件 | 處置邏輯 |
|---------|---------|---------|
| `throttle_new_tasks` | 日預算超限 | 新任務進入排隊佇列，每秒最多處理 0.5 個任務 |
| `abort_if_running` | 單任務成本超限 | 發送 cancel signal 給 LangGraph `interrupt_before`，中止執行 |
| `activate_fallback_model` | 模型錯誤率嚴重 | 切換到 `config/routing.yaml` 中定義的 fallback 模型 |
| `enable_fast_track_only` | 延遲嚴重 | 暫時禁用完整流程，所有任務走 Fast-Track |
| `force_pipeline_mode` | 分解準確率低 | 強制所有非 Fast-Track 任務使用 Pipeline 模式 |
| `disable_free_form_decompose` | 分解準確率低 | 禁用自由形式分解，只允許模板匹配 |
| `trigger_model_version_audit` | stale 經驗堆積 | 比對 `config/models.yaml` 中的模型版本與經驗庫記錄，標記不匹配項 |

---

## 6. 與現有系統的整合

### 6.1 與 LangGraph 執行引擎的連接

Scout-then-Swarm 使用 LangGraph 的 `StateGraph` 作為執行引擎。Dashboard 的資料採集通過以下方式整合：

```
+==================================================================+
|  LangGraph StateGraph (src/swarm/graph/swarm_graph.py)           |
|                                                                    |
|  START → scout → [route] → swarm → verify → fuse → learn → END  |
|             │                  │        │        │       │         |
|             └──────┬───────────┴────┬───┴────┬───┴───────┘         |
|                    │                │        │                      |
|                    v                v        v                      |
|  +-----------------+----------------+--------+------------------+  |
|  |  ObservationMiddleware（觀察中介層）                           |  |
|  |                                                              |  |
|  |  每個 node 的 enter/exit 自動發射 PhaseEvent                 |  |
|  |  每次 LLM call 自動發射 ModelCallEvent                       |  |
|  |  任務完成時自動聚合為 TaskCompletedEvent                      |  |
|  +--------------------------------------------------------------+  |
|                    │                                                |
|                    v                                                |
|  +-----------------+----------------+                             |
|  |  EventEmitter → Redis Stream     |                             |
|  +----------------------------------+                             |
+==================================================================+
```

**整合方式：LangGraph Node Middleware**

```python
# src/swarm/observability/middleware.py
"""
LangGraph node middleware — 自動為每個 node 注入觀測邏輯。
不需要修改任何 node 的內部程式碼。
"""
from __future__ import annotations
import time
import functools
from typing import Callable, Any
from uuid import uuid4

from swarm.observability.event_emitter import EventEmitter
from swarm.observability.models import (
    PhaseEvent, EventType, ModelCallRecord, TaskCompletedEvent
)

# 全域 event emitter，在 app startup 時初始化
_emitter: EventEmitter | None = None

def init_observability(redis_url: str = "redis://localhost:6379"):
    """在 app startup 時呼叫，初始化觀測系統"""
    global _emitter
    _emitter = EventEmitter(redis_url=redis_url)

def observe_node(node_name: str):
    """
    裝飾器：自動觀測 LangGraph node 的執行。
    用法：@observe_node("scout")
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(state: dict, **kwargs) -> dict:
            task_id = state.get("task_id", str(uuid4()))
            session_id = state.get("session_id", "unknown")

            # 1. 發射 phase_started 事件
            t0 = time.monotonic()
            await _emitter.emit(PhaseEvent(
                event_type=EventType.PHASE_STARTED,
                event_id=uuid4(),
                task_id=task_id,
                phase=node_name,
                action="started",
            ))

            try:
                # 2. 執行原始 node 邏輯
                result = await fn(state, **kwargs)

                # 3. 發射 phase_completed 事件
                duration_ms = int((time.monotonic() - t0) * 1000)
                await _emitter.emit(PhaseEvent(
                    event_type=EventType.PHASE_COMPLETED,
                    event_id=uuid4(),
                    task_id=task_id,
                    phase=node_name,
                    action="completed",
                    duration_ms=duration_ms,
                ))

                # 4. 如果是 learn node（最後一個），聚合並發射 TaskCompletedEvent
                if node_name == "learn":
                    await _emit_task_completed(state, result)

                return result

            except Exception as e:
                await _emitter.emit(PhaseEvent(
                    event_type=EventType.PHASE_COMPLETED,
                    event_id=uuid4(),
                    task_id=task_id,
                    phase=node_name,
                    action="failed",
                    duration_ms=int((time.monotonic() - t0) * 1000),
                ))
                raise

        return wrapper
    return decorator
```

**在 `swarm_graph.py` 中使用**：

```python
# src/swarm/graph/swarm_graph.py
from swarm.observability.middleware import observe_node, init_observability

@observe_node("scout")
async def scout_node(state: SwarmState) -> dict:
    # 原有的 scout 邏輯，不需要任何修改
    ...

@observe_node("swarm")
async def swarm_node(state: SwarmState) -> dict:
    ...

@observe_node("verify")
async def verify_node(state: SwarmState) -> dict:
    ...

@observe_node("fuse")
async def fuse_node(state: SwarmState) -> dict:
    ...

@observe_node("learn")
async def learn_node(state: SwarmState) -> dict:
    ...

def build_swarm_graph() -> CompiledGraph:
    # 在 build graph 之前初始化觀測系統
    init_observability(redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"))

    graph = StateGraph(SwarmState)
    graph.add_node("scout", scout_node)
    graph.add_node("swarm", swarm_node)
    graph.add_node("verify", verify_node)
    graph.add_node("fuse", fuse_node)
    graph.add_node("learn", learn_node)
    # ... edges ...
    return graph.compile()
```

### 6.2 程式碼埋點位置（工程蜂實作指引）

以下是每個檔案需要新增的觀測邏輯，以最小侵入性為原則：

#### 6.2.1 `src/swarm/core/litellm_client.py` — 模型呼叫埋點

```python
# 在 call_model() 和 call_model_structured() 中新增：

async def call_model(model: str, messages: list, **kwargs) -> tuple[str, CallMeta]:
    call_id = uuid4()
    t0 = time.monotonic()

    # 發射 model_call_started
    await _emitter.emit_model_call_start(
        call_id=call_id, model=model,
        call_role=kwargs.get("call_role", "worker"),
        phase=kwargs.get("phase", "unknown"),
        subtask_id=kwargs.get("subtask_id"),
    )

    try:
        response = await litellm.acompletion(model=model, messages=messages, **kwargs)
        latency_ms = int((time.monotonic() - t0) * 1000)
        usage = response.usage
        cost = compute_cost(model, usage.prompt_tokens, usage.completion_tokens)

        # 發射 model_call_completed
        await _emitter.emit_model_call_complete(
            call_id=call_id, model=model,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            latency_ms=latency_ms, cost_cny=cost,
            status="success",
        )

        return response.choices[0].message.content, CallMeta(
            cost_usd=cost, latency_ms=latency_ms,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
        )

    except Exception as e:
        latency_ms = int((time.monotonic() - t0) * 1000)
        error_type = _classify_error(e)

        await _emitter.emit_model_call_complete(
            call_id=call_id, model=model,
            latency_ms=latency_ms, cost_cny=0,
            status=error_type, error_message=str(e),
        )
        raise
```

#### 6.2.2 `src/swarm/wiki/experience.py` — 經驗庫埋點

```python
# 在 search() 和 write_experience() 中新增：

def search(self, task: str, limit: int = 3) -> list[Experience]:
    results = self._full_text_search(task, limit)

    # 發射 experience_hit 事件
    for exp in results:
        _emitter.emit_experience_hit(
            experience_id=exp.id,
            relevance_score=exp.relevance,
            is_stale=exp.stale,
        )

    return results

def write_experience(self, task: str, output: SwarmOutput):
    exp_id = self._insert_experience(task, output)

    # 發射 experience_write 事件
    _emitter.emit_experience_write(
        experience_id=exp_id,
        action="create",
        outcome="success",
    )
```

#### 6.2.3 `src/swarm/swarm_judge.py` — 任務層級聚合

```python
# 在 swarm_judge() 的入口和出口新增：

async def swarm_judge(task: str, **kwargs) -> SwarmOutput:
    task_id = uuid4()
    session_id = kwargs.get("session_id", "default")
    t0 = time.monotonic()

    # 收集整個任務的所有事件
    collector = TaskEventCollector(task_id=task_id, session_id=session_id)

    # 發射 task_started
    await _emitter.emit_task_started(task_id=task_id, session_id=session_id)

    try:
        # ... 原有的 scout/swarm/verify/fuse/learn 流程 ...
        output = ...  # SwarmOutput

        # 聚合為 TaskCompletedEvent 並發射
        event = collector.build_completed_event(
            output=output,
            total_latency_ms=int((time.monotonic() - t0) * 1000),
            final_status=TaskStatus.SUCCESS,
        )
        await _emitter.emit(event)

        return output

    except Exception as e:
        event = collector.build_completed_event(
            output=None,
            total_latency_ms=int((time.monotonic() - t0) * 1000),
            final_status=TaskStatus.FAILURE,
            error=e,
        )
        await _emitter.emit(event)
        raise
```

### 6.3 新增檔案結構

```
src/swarm/observability/
├── __init__.py
├── event_emitter.py       # EventEmitter: Redis Stream 發射器
├── models.py              # 所有事件 Pydantic 模型
├── middleware.py           # @observe_node 裝飾器
├── influx_writer.py        # InfluxDB Consumer: Redis → InfluxDB
├── websocket_relay.py      # WebSocket Relay: Redis → Frontend
├── cost_calculator.py      # 成本計算邏輯
└── alert_manager.py        # 告警規則引擎（與 Grafana 配合）

config/alerts/
├── cost.yaml              # 成本告警規則
├── model_errors.yaml      # 模型錯誤告警
├── latency.yaml           # 延遲告警
├── decomposition.yaml     # 分解準確率告警
└── experience.yaml        # 經驗庫告警

dashboard/
├── api/                   # FastAPI 後端
│   ├── main.py            # FastAPI app + WebSocket endpoint
│   ├── routes/
│   │   ├── tasks.py       # /api/tasks/* endpoints
│   │   ├── metrics.py     # /api/metrics/* endpoints
│   │   └── alerts.py      # /api/alerts/* endpoints
│   └── requirements.txt
├── web/                   # React 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LiveTaskView.tsx
│   │   │   ├── CostAnalytics.tsx
│   │   │   ├── ModelPerformance.tsx
│   │   │   └── ExperienceBase.tsx
│   │   ├── components/
│   │   │   ├── TaskCard.tsx
│   │   │   ├── PhaseTimeline.tsx
│   │   │   ├── CostGauge.tsx
│   │   │   └── EventStream.tsx
│   │   └── hooks/
│   │       ├── useWebSocket.ts
│   │       └── useMetrics.ts
│   └── package.json
└── grafana/
    └── provisioning/
        ├── datasources/
        │   └── influxdb.yaml
        ├── dashboards/
        │   ├── swarm-overview.json
        │   ├── cost-analytics.json
        │   ├── model-performance.json
        │   └── experience-base.json
        └── alerting/
            └── rules.yaml

docker-compose.dashboard.yaml  # 一鍵部署所有觀測元件
```

### 6.4 資料保留策略

| 資料類型 | 存儲位置 | 熱保留 | 溫保留 | 冷保留 | 清理機制 |
|---------|---------|--------|--------|--------|---------|
| **即時事件流** | Redis Stream `swarm.events` | 24 小時 | — | — | Redis `MAXLEN ~10000` 自動修剪 |
| **指標資料（精確）** | InfluxDB `swarm_metrics` | — | 30 天 | — | InfluxDB retention policy `warm_30d` |
| **指標資料（降採樣）** | InfluxDB `swarm_metrics_downsampled` | — | — | 365 天 | InfluxDB retention policy `cold_365d` + 每小時降採樣任務 |
| **原始事件** | SQLite `data/task_events.db` | — | — | 90 天 | Cron job: 每日清理 90 天前的記錄 |
| **告警歷史** | Grafana internal DB | — | 90 天 | — | Grafana 內建清理 |
| **Dashboard 配置** | Grafana provisioning | — | — | 永久 | 版本控制（Git） |

**InfluxDB 降採樣任務**：

```flux
// 每小時執行一次，將精確資料降採樣為 1 分鐘解析度
option task = {name: "downsample_swarm_metrics", every: 1h}

from(bucket: "swarm_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "task_complete")
  |> aggregateWindow(every: 1m, fn: mean)
  |> to(bucket: "swarm_metrics_downsampled")

from(bucket: "swarm_metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "model_call")
  |> aggregateWindow(every: 1m, fn: mean)
  |> to(bucket: "swarm_metrics_downsampled")
```

**SQLite 原始事件清理 Cron**：

```python
# src/swarm/observability/event_gc.py
import sqlite3
from datetime import datetime, timedelta

def cleanup_old_events(db_path: str = "data/task_events.db", retention_days: int = 90):
    """清理超過保留期的原始事件"""
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM task_events WHERE timestamp < ?",
        (cutoff.isoformat(),)
    )
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted

# 建議 crontab: 0 3 * * * python -m swarm.observability.event_gc
```

### 6.5 環境變數

```bash
# .env.dashboard
# Redis（與 LangGraph Checkpointer 共用）
REDIS_URL=redis://localhost:6379

# InfluxDB
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-influxdb-token
INFLUXDB_ORG=scout-then-swarm
INFLUXDB_BUCKET=swarm_metrics

# Grafana
GRAFANA_URL=http://localhost:3001
GRAFANA_PASSWORD=your-grafana-password

# Dashboard API
DASHBOARD_API_PORT=8090
DASHBOARD_API_HOST=0.0.0.0

# 告警通知
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
LARK_WEBHOOK_URL=https://open.larksuite.com/open-apis/bot/v2/hook/xxx

# 成本預算（CNY）
DAILY_BUDGET_CNY=50.0
MONTHLY_BUDGET_CNY=1500.0
MAX_COST_PER_TASK_CNY=0.50
```

---

## 附錄 A：InfluxDB Bucket 初始化腳本

```bash
#!/bin/bash
# scripts/init-influxdb.sh

INFLUX_URL="http://localhost:8086"
INFLUX_TOKEN="${INFLUXDB_TOKEN}"
ORG="scout-then-swarm"

# 建立 Organization
influx org create --name "$ORG" --host "$INFLUX_URL" --token "$INFLUX_TOKEN"

# 建立 Bucket（溫資料 30 天）
influx bucket create \
  --name "swarm_metrics" \
  --org "$ORG" \
  --retention 30d \
  --host "$INFLUX_URL" \
  --token "$INFLUX_TOKEN"

# 建立 Bucket（冷資料 365 天，降採樣）
influx bucket create \
  --name "swarm_metrics_downsampled" \
  --org "$ORG" \
  --retention 365d \
  --host "$INFLUX_URL" \
  --token "$INFLUX_TOKEN"

echo "InfluxDB buckets created successfully."
```

## 附錄 B：Grafana Provisioning 範例

```yaml
# dashboard/grafana/provisioning/datasources/influxdb.yaml
apiVersion: 1
datasources:
  - name: InfluxDB-Swarm
    type: influxdb
    access: proxy
    url: http://influxdb:8086
    jsonData:
      version: Flux
      organization: scout-then-swarm
      defaultBucket: swarm_metrics
    secureJsonData:
      token: "${INFLUXDB_TOKEN}"
    isDefault: true
```

```yaml
# dashboard/grafana/provisioning/dashboards/dashboards.yaml
apiVersion: 1
providers:
  - name: "Scout-then-Swarm"
    orgId: 1
    folder: "Swarm"
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true
```

## 附錄 C：Dashboard API 路由表

| 方法 | 路徑 | 說明 | 資料源 |
|------|------|------|--------|
| GET | `/api/tasks/active` | 當前活躍任務列表 | Redis（即時狀態） |
| GET | `/api/tasks/recent?limit=10` | 最近完成任務 | InfluxDB |
| GET | `/api/tasks/{task_id}` | 單任務詳情（鑽取） | SQLite（原始事件） |
| GET | `/api/tasks/{task_id}/events` | 單任務事件時間線 | SQLite |
| GET | `/api/metrics/throughput?window=1h` | 吞吐量指標 | InfluxDB |
| GET | `/api/metrics/latency?window=1h&percentile=95` | 延遲指標 | InfluxDB |
| GET | `/api/metrics/cost?window=24h` | 成本指標 | InfluxDB |
| GET | `/api/metrics/models?window=1h` | 模型效能指標 | InfluxDB |
| GET | `/api/metrics/experience?window=7d` | 經驗庫指標 | InfluxDB + SQLite |
| GET | `/api/alerts/active` | 當前活躍告警 | Grafana API proxy |
| GET | `/api/alerts/history?limit=50` | 告警歷史 | Grafana API proxy |
| WS | `/ws/live` | WebSocket 即時事件流 | Redis Streams |
