# Implementation Plan Topic Modeling Pipeline cho Dashboard Service (Phiên bản đã chốt)

## 1. Mục tiêu implementation

- Hiện thực đúng kiến trúc đã chốt trong `plan.md`.
- Không dùng Celery, chỉ FastAPI BackgroundTasks.
- One-active-job toàn hệ thống, idempotent ở trigger API.
- Lưu full history các run, nhưng endpoint kết quả chỉ trả latest.
- Time range xử lý theo GMT+7.
- Không hỗ trợ cancel job.

## 2. Thiết kế triển khai và cấu trúc thư mục

```text
dashboard/
├── src/
│   ├── models/
│   │   └── topic_pipeline.py
│   ├── repositories/
│   │   ├── topic_job_repository.py
│   │   └── topic_result_repository.py
│   ├── pipeline/
│   │   ├── orchestrator.py
│   │   ├── inputs/
│   │   │   ├── missing_knowledge_input.py
│   │   │   ├── popular_questions_input.py
│   │   │   └── registry.py
│   │   └── outputs/
│   │       ├── csv_exporter.py
│   │       ├── db_exporter.py
│   │       └── registry.py
│   ├── services/
│   │   ├── topic_engine.py
│   │   ├── topic_job_service.py
│   │   └── timezone_utils.py
│   ├── routes/
│   │   └── topics.py
│   ├── schemas/
│   │   └── topics.py
│   └── core/
│       └── settings.py
├── alembic/versions/
│   └── <revision>_topic_pipeline_job_and_results.py
└── tests/
    ├── unit/
    │   ├── services/test_topic_job_service.py
    │   ├── services/test_timezone_utils.py
    │   ├── pipeline/inputs/test_missing_knowledge_input.py
    │   ├── pipeline/inputs/test_popular_questions_input.py
    │   └── pipeline/outputs/test_csv_exporter.py
    └── integration/test_topics_api.py
```

## 3. Danh sách file tạo/cập nhật và nội dung cần làm

### 3.1 Database models và migration

1) `src/models/topic_pipeline.py` (NEW)
- Khai báo bảng `dashboard_topic_pipeline_jobs`.
- Khai báo bảng `dashboard_topic_results`.
- Khai báo bảng `dashboard_topic_assignments`.
- Khai báo bảng `dashboard_topic_labels` (nếu tách riêng labels).
- Khai báo đầy đủ named constraints, named indexes, FK names.

2) `alembic/versions/<revision>_topic_pipeline_job_and_results.py` (NEW)
- Tạo bảng trong schema `dashboard`.
- Tạo partial unique index chống nhiều active job:
  - status in (`pending`, `running`).
- Tạo index cho query latest result theo `topic_type`, `created_at`.
- Đảm bảo downgrade chạy được.

Áp dụng convention:
- Prefix bảng `dashboard_`.
- Constraint/FK/index phải có tên.
- Chỉ ghi vào schema `dashboard`.

### 3.2 Repository layer

3) `src/repositories/topic_job_repository.py` (NEW)
- Hàm `create_job_if_no_active(...)` dùng transaction, bắt unique-violation -> map thành conflict business error.
- Hàm `get_current_job()` ưu tiên `pending/running`, fallback gần nhất.
- Hàm `update_job_progress(...)` cập nhật status, stage, progress, message, timestamps.
- Hàm `mark_job_failed(...)` thống nhất error handling.

4) `src/repositories/topic_result_repository.py` (NEW/UPDATE)
- Hàm lưu kết quả run + assignments + labels.
- Hàm `get_latest_result(topic_type)` trả đúng bản mới nhất.
- Hàm `get_latest_questions(...)` phục vụ pagination/sort/filter cho frontend.

Áp dụng convention:
- Tách data access khỏi route/service.
- Query tối ưu bằng index.

### 3.3 Input adapters

5) `src/pipeline/inputs/missing_knowledge_input.py` (NEW)
- Query trực tiếp `agent_schema.missing_knowledge_logs` (READ only).
- Lọc theo time range GMT+7 quy đổi sang UTC trước khi query.
- Dùng cột `query` làm nội dung câu hỏi.

6) `src/pipeline/inputs/popular_questions_input.py` (NEW)
- Gọi API read-only từ agent/api_gateway để lấy user messages toàn hệ thống.
- Request có `from_ts`, `to_ts`, paging.
- Chuẩn hóa response thành danh sách documents.

7) `src/pipeline/inputs/registry.py` (UPDATE)
- Map mặc định:
  - `missing_knowledge` -> `MissingKnowledgeInput`
  - `popular_questions` -> `PopularQuestionsInput`

Áp dụng convention:
- Dashboard không phụ thuộc code agent service.
- Read shared data đúng trách nhiệm service owner.

### 3.4 Topic engine và orchestrator

8) `src/services/topic_engine.py` (UPDATE)
- Trích xuất core từ `experiments/topic_modeling/fast_topic_modeling.py` vào `FastTopicEngine`.
- Bỏ phần CLI/demo print.
- Đọc cấu hình từ `settings` (`TOPIC_EMBEDDING_MODEL`, tokenizer, labeling provider...).

9) `src/pipeline/orchestrator.py` (UPDATE)
- Điều phối pipeline theo stage.
- Gọi callback cập nhật tiến độ DB sau mỗi mốc.
- Tách rõ bước input -> modeling -> output(file+db).

10) `src/services/topic_job_service.py` (NEW)
- API trigger gọi vào đây để tạo job và enqueue BackgroundTask.
- Chứa hàm chạy background job, bắt lỗi, update status/stage chuẩn.
- Không triển khai cancel API/hành vi cancel.

11) `src/services/timezone_utils.py` (NEW)
- Chuẩn hóa chuyển đổi time range GMT+7 -> UTC interval.
- Hỗ trợ `24h|7d|14d|30d`.

### 3.5 Output adapters

12) `src/pipeline/outputs/csv_exporter.py` (NEW)
- Ghi file `dashboard/topic_modeling_results/{job_id}_topic_assignments.csv`.
- Cột chuẩn bắt buộc: `Document,Topic,Label,Question`.
- Cột metadata bổ sung (đề xuất):
  - `job_id`
  - `topic_type`
  - `time_range`
  - `source`
  - `created_at`

13) `src/pipeline/outputs/db_exporter.py` (UPDATE)
- Lưu summary, assignments, labels vào schema `dashboard`.
- Gắn liên kết theo `job_id`.
- Giao dịch DB toàn vẹn, rollback nếu fail.

### 3.6 API và schema DTO

14) `src/schemas/topics.py` (UPDATE)
- Request/Response cho trigger, polling, latest result, latest questions.
- Enum hóa `topic_type`, `time_range`, `status`, `stage`.

15) `src/routes/topics.py` (UPDATE)
- `POST /topics/jobs`
  - trả 202 khi tạo job.
  - trả 409 khi có active job.
- `GET /topics/jobs/current`
  - trả current hoặc latest job.
- `GET /topics/jobs/{job_id}`
  - trả chi tiết tiến độ.
- `GET /topics/results/latest`
  - chỉ latest result, chưa có thì 404.
- `GET /topics/results/latest/questions`
  - dữ liệu danh sách câu hỏi cho UI.

16) `src/core/settings.py` (UPDATE)
- Bổ sung config agent API endpoint/token cho popular questions.
- Bổ sung config timezone mặc định `Asia/Ho_Chi_Minh`.
- Bổ sung config output directory và retention knobs (nếu có).

### 3.7 Kế hoạch bổ sung phía agent service

17) Gọi API trực tiếp Agent service (NEW task liên service)
- Bổ sung endpoint read-only, ví dụ:
  - `GET /admin/conversations/messages`
- Hỗ trợ lọc theo from/to, paging, chỉ trả user messages cần cho topic modeling.
- Auth admin/service token.

Ghi chú:
- Đây là integration point bắt buộc cho `popular_questions` do không dùng trực tiếp bảng checkpointer nội bộ.

## 4. Kế hoạch code review, kiểm thử, chất lượng, hiệu năng

### 4.1 Code review plan
- Review 1: DB migration + constraints/index naming + downgrade.
- Review 2: idempotency race-condition tại trigger API.
- Review 3: timezone boundary (GMT+7) và dữ liệu latest-only API.
- Review 4: security cho call sang agent API và log redaction.

### 4.2 Test plan

Unit tests:
- `create_job_if_no_active` không tạo job thứ hai khi có active.
- Mapping và transition status/stage hợp lệ.
- Time range GMT+7 conversion đúng các mốc ngày/tuần/tháng.
- CSV exporter có đủ 4 cột chuẩn + metadata columns.
- `get_latest_result` trả đúng bản mới nhất.

Integration tests:
- Trigger -> polling -> completed flow.
- Trigger khi đang chạy -> 409.
- `GET /topics/results/latest` khi rỗng -> 404.
- `GET /topics/results/latest/questions` pagination/sort đúng.

### 4.3 Performance plan
- Thêm index cho truy vấn latest và truy vấn assignments theo result/topic.
- Bulk insert assignments để giảm thời gian commit.
- Polling endpoint chỉ trả field cần thiết, tránh payload quá lớn.

## 5. Success criteria checklist

- [ ] Không còn Celery dependency trong flow topic modeling dashboard.
- [ ] Tại mọi thời điểm chỉ có tối đa 1 job `pending/running`.
- [ ] Polling phản ánh đúng stage/progress/status theo DB updates.
- [ ] Hệ thống không hỗ trợ cancel job và không expose API cancel.
- [ ] Time range hoạt động theo GMT+7.
- [ ] API kết quả chỉ trả latest run; chưa có dữ liệu trả 404.
- [ ] CSV có 4 cột chuẩn + metadata columns.
- [ ] DB schema `dashboard` lưu đầy đủ lịch sử mọi run và dữ liệu chi tiết.
- [ ] Popular questions dùng nguồn agent API read-only; missing knowledge dùng read DB trực tiếp đúng chuẩn shared-db read-only.

## 6. Convention mapping (tóm tắt)

- Convention tách lớp kiến trúc: áp dụng qua route/service/repository/pipeline adapter rõ ràng.
- Convention shared DB: dashboard chỉ READ dữ liệu service khác; write vào schema `dashboard`.
- Convention naming constraints/index/FK: áp dụng đầy đủ trong migration.
- Convention test cho tính năng mới: có unit + integration theo flow chính và edge cases.

---

**Version**: 3.1  
**Updated**: 2026-04-22  
**Status**: Ready for coding
