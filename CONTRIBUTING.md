# 貢獻指南

感謝你對 Scout-then-Swarm 的興趣！這份文件說明如何參與貢獻。

---

## 行為準則

本專案採用 [Contributor Covenant](https://www.contributor-covenant.org/) 行為準則。參與本專案即表示你同意遵守其條款。

---

## 如何貢獻

### 報告 Bug

1. 使用 GitHub Issues 提交 bug 報告
2. 提供重現步驟、預期行為與實際行為
3. 包含環境資訊（Python 版本、作業系統、依賴版本）

### 建議功能

1. 先在 Issues 討論你的想法
2. 說明使用場景與預期效益
3. 等待維護者確認後再實作

### 提交程式碼

1. Fork 本專案
2. 建立功能分支：`git checkout -b feature/amazing-feature`
3. 提交變更：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 開啟 Pull Request

### 程式碼風格

- 使用 Python 3.11+
- 遵循 PEP 8
- 使用 type hints
- 所有公開函式需有 docstring
- 執行 `pytest` 確保測試通過

---

## 開發環境設置

```bash
# 複製專案
git clone <your-fork-url> && cd scout-then-swarm

# 建立虛擬環境
python3 -m venv .venv && source .venv/bin/activate

# 安裝依賴
pip install -e ".[dev]"

# 複製環境變數範本
cp .env.example .env
# 編輯 .env 填入 API keys
```

---

## 測試

```bash
# 執行所有測試
pytest

# 執行特定測試
pytest tests/test_swarm_judge.py

# 執行基準測試
python -m tests.benchmark.run_benchmark --tasks tests/benchmark/tasks.json
```

---

## Pull Request 流程

1. 確保你的程式碼通過所有測試
2. 更新相關文檔（如有需要）
3. 描述你的變更與動機
4. 等待維護者審查
5. 根據審查意見修改（如有需要）

---

## 提交訊息規範

使用清晰的提交訊息：

- `feat: 新增功能`
- `fix: 修復 bug`
- `docs: 更新文檔`
- `test: 新增測試`
- `refactor: 重構程式碼`
- `chore: 雜項變更`

---

## 授權

貢獻的程式碼將採用 MIT License 授權。提交 Pull Request 即表示你同意此授權條款。

---

## 聯絡方式

如有疑問，請透過 GitHub Issues 或 Discussions 聯繫。
