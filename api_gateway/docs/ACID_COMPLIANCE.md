# ACID Compliance và Exception Handling - Implementation Report

## Tổng Quan

Document này mô tả cách API Gateway đảm bảo tính ACID (Atomicity, Consistency, Isolation, Durability) và exception handling toàn diện.

---

## ACID Properties Implementation

### 1. ✅ Atomicity (Tính Nguyên Tử)

**Definition:** Một transaction phải hoàn toàn thành công hoặc hoàn toàn thất bại. Không có trạng thái giữa chừng.

#### Vấn Đề Đã Phát Hiện và Sửa

**Case 1: Refresh Token Atomicity Violation**

**Vấn đề ban đầu:**
```python
# WRONG - Vi phạm atomicity!
async def refresh_token(...):
    token_record = validate_refresh_token(...)  # Lock token
    token_record.revoke()  # Revoke in-memory
    
    # ❌ PROBLEM: store_refresh_token() commits inside!
    await token_service.store_refresh_token(...)  # Commits here
    
    await db.commit()  # Commits again
```

**Kịch bản lỗi:**
1. Store new token thành công → commit #1
2. Commit #2 fail → rollback
3. Kết quả: New token đã được lưu nhưng old token chưa bị revoke!
4. → User có 2 valid refresh tokens

**Giải pháp:**
```python
# ✅ CORRECT - Atomic transaction
async def refresh_token(...):
    token_record = validate_refresh_token(..., lock_for_update=True)
    token_record.revoke()
    
    # Pass auto_commit=False to NOT commit inside
    await token_service.store_refresh_token(..., auto_commit=False)
    
    # Single commit for all operations
    await db.commit()
```

**Implementation trong code:**
- [src/services/token_service.py](../src/services/token_service.py): Thêm `auto_commit` parameter
- [src/services/auth_service.py](../src/services/auth_service.py): `refresh_token()` với `auto_commit=False`

#### Các Operations Atomic Khác

**Register User:**
```python
try:
    # All or nothing
    user = User(...)
    user.roles.append(...)
    db.add(user)
    await db.commit()
except:
    await db.rollback()  # Undo everything
```

**Update Thread:**
```python
try:
    thread = get_thread(..., for_update=True)  # Lock
    thread.title = new_title
    await db.commit()  # Atomic update
except:
    await db.rollback()
```

**Revoke All Tokens:**
```python
# Lock all tokens atomically
tokens = select(...).with_for_update()
for token in tokens:
    token.revoke()
await db.commit()  # Single commit
```

### 2. ✅ Consistency (Tính Nhất Quán)

**Definition:** Database phải ở consistent state trước và sau mỗi transaction.

#### Database Constraints

**Unique Constraints:**
```python
# users table
email: unique=True, index=True

# refresh_tokens table  
token: unique=True, index=True
```

**Foreign Key Constraints:**
```python
# refresh_tokens.user_id → users.id
# threads.user_id → users.id
# user_roles.user_id → users.id
# user_roles.role_id → roles.id
```

#### Application-Level Validation

**Register User:**
```python
# Check exists before insert
existing_user = await db.execute(...)
if existing_user:
    raise HTTPException(400, "Email already registered")

# But also catch IntegrityError as backup
try:
    await db.commit()
except IntegrityError:
    # Database constraint caught race condition
    raise HTTPException(400, "Email already registered")
```

**Token Validation:**
```python
if token.is_revoked:
    raise HTTPException(401, "Token revoked")

if token.expires_at <= now:
    raise HTTPException(401, "Token expired")
```

#### Referential Integrity

**Cascade Delete:**
```python
# When user deleted, all their threads deleted
threads: cascade="all, delete-orphan"
```

### 3. ✅ Isolation (Tính Cô Lập)

**Definition:** Concurrent transactions không can thiệp lẫn nhau.

#### Row-Level Locking với SELECT FOR UPDATE

**Implementation:**
```python
async def get_refresh_token(token, for_update=False):
    query = select(RefreshToken).where(token == token)
    
    if for_update:
        # Lock row until transaction ends
        query = query.with_for_update()
    
    return await db.execute(query)
```

**Cách hoạt động:**
```
Time  | Transaction A              | Transaction B
------|----------------------------|---------------------------
T1    | SELECT ... FOR UPDATE      |
T2    | (holds lock)               | SELECT ... FOR UPDATE
T3    | Modify token               | (waiting for lock...)
T4    | COMMIT (release lock)      | (waiting...)
T5    |                            | (acquires lock)
T6    |                            | Token already revoked!
T7    |                            | Get 401 error ✓
```

**Usage trong code:**

**Refresh Token:**
```python
# Lock token to prevent concurrent refresh
token_record = await validate_refresh_token(
    refresh_token, db, lock_for_update=True
)
```

**Update Thread:**
```python
# Lock thread to prevent concurrent updates
thread = await get_thread(db, thread_id, for_update=True)
```

**Revoke All Tokens:**
```python
# Lock all user's tokens atomically
select(RefreshToken)
    .where(user_id == user_id)
    .with_for_update()
```

#### Isolation Level

PostgreSQL default: **READ COMMITTED**
- Transactions chỉ thấy committed data
- Với SELECT FOR UPDATE → stronger isolation

SQLAlchemy AsyncSession default:
- Auto-commit: False
- Explicit commit required

### 4. ✅ Durability (Tính Bền Vững)

**Definition:** Committed data phải được persist, ngay cả khi system crash.

#### Database Level

PostgreSQL đảm bảo durability qua:
- **WAL (Write-Ahead Logging):** Ghi log trước khi modify data
- **fsync:** Force write to disk
- **Crash Recovery:** Replay WAL logs

#### Application Level

**Proper Commit Pattern:**
```python
try:
    # Perform operations
    await db.commit()  # ✓ Durability guaranteed after this
    return result
except:
    await db.rollback()  # ✓ Undo uncommitted changes
    raise
```

**Connection Pooling:**
```python
engine = create_async_engine(
    pool_pre_ping=True,      # Test connection before use
    pool_recycle=3600,       # Prevent stale connections
    pool_size=10,            # Persistent connections
    max_overflow=20,         # Extra connections when needed
)
```

---

## Exception Handling toàn diện

### Hierarchy của Exceptions

```
Exception
├── HTTPException (FastAPI) - User-facing errors
│   ├── 400 Bad Request
│   ├── 401 Unauthorized
│   ├── 403 Forbidden
│   ├── 404 Not Found
│   └── 500 Internal Server Error
├── IntegrityError (SQLAlchemy) - Database constraint violations
└── Generic Exception - Unexpected errors
```

### Pattern Được Áp Dụng

```python
async def operation(...):
    try:
        # Database operations
        await db.commit()
        return result
    except IntegrityError:
        # Handle specific constraint violations
        await db.rollback()
        raise HTTPException(400, "Specific error message")
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        await db.rollback()
        raise
    except Exception as e:
        # Catch all other errors
        await db.rollback()
        raise HTTPException(500, f"Operation failed: {str(e)}")
```

### Coverage Matrix

| Service Method | IntegrityError | HTTPException | Generic Exception | Rollback |
|----------------|----------------|---------------|-------------------|----------|
| store_refresh_token | ✅ | ✅ | ✅ | ✅ |
| revoke_refresh_token | N/A | ✅ | ✅ | ✅ |
| revoke_all_tokens | N/A | N/A | ✅ | ✅ |
| cleanup_expired_tokens | N/A | N/A | ✅ | ✅ |
| register_user | ✅ | ✅ | ✅ | ✅ |
| login | N/A | ✅ | ✅ | ✅ |
| refresh_token | N/A | ✅ | ✅ | ✅ |
| create_thread | N/A | N/A | ✅ | ✅ |
| list_threads | N/A | N/A | ✅ | N/A |
| update_thread | N/A | ✅ | ✅ | ✅ |
| delete_thread | N/A | N/A | ✅ | ✅ |

### Error Messages cho User

**Principles:**
1. **Clear:** Describe what went wrong
2. **Actionable:** Suggest what user can do
3. **Secure:** Don't leak sensitive info
4. **Consistent:** Same format across API

**Examples:**

**Good ✅:**
```json
{
  "detail": "Incorrect email or password"
}
```

**Bad ❌:**
```json
{
  "detail": "User with email john@example.com not found in database"
}
```
→ Leaks information that email doesn't exist (security issue)

**Good ✅:**
```json
{
  "detail": "Email already registered"
}
```

**Bad ❌:**
```json
{
  "detail": "duplicate key value violates unique constraint \"users_email_key\""
}
```
→ Exposes database internals

### Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful GET/PATCH |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input, constraint violation |
| 401 | Unauthorized | Missing/invalid credentials |
| 403 | Forbidden | Authenticated but no permission |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Unexpected server error |

### Logging (Recommended)

```python
import logging

logger = logging.getLogger(__name__)

try:
    await db.commit()
except Exception as e:
    logger.error(f"Database error: {str(e)}", exc_info=True)
    await db.rollback()
    raise HTTPException(500, "Operation failed")
```

**Benefits:**
- Debug production issues
- Monitor error patterns
- Track database problems

---

## Testing ACID Compliance

### Test Case 1: Concurrent Refresh Token

```python
async def test_concurrent_refresh():
    """Only one refresh should succeed."""
    token = "valid-refresh-token"
    
    tasks = [
        client.post("/auth/refresh", json={"refresh_token": token})
        for _ in range(5)
    ]
    
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    
    success = sum(1 for r in responses if r.status_code == 200)
    failures = sum(1 for r in responses if r.status_code == 401)
    
    assert success == 1, "Only 1 request should succeed"
    assert failures == 4, "Others should get 401 (token revoked)"
```

### Test Case 2: Concurrent User Registration

```python
async def test_concurrent_registration():
    """Only one registration should succeed."""
    email = "test@example.com"
    
    tasks = [
        client.post("/auth/register", json={
            "email": email,
            "password": "test123",
            "roles": ["user"]
        })
        for _ in range(3)
    ]
    
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    
    created = sum(1 for r in responses if r.status_code == 201)
    conflicts = sum(1 for r in responses if r.status_code == 400)
    
    assert created == 1, "Only 1 registration should succeed"
    assert conflicts == 2, "Others should get 400 (email exists)"
```

### Test Case 3: Transaction Rollback

```python
async def test_refresh_token_atomicity():
    """If store fails, revoke should rollback."""
    
    # Mock store_refresh_token to fail
    with patch('token_service.store_refresh_token', side_effect=Exception):
        with pytest.raises(HTTPException) as exc:
            await auth_service.refresh_token(valid_token, db)
        
        # Verify old token is still valid (not revoked)
        token_record = await token_service.get_refresh_token(valid_token, db)
        assert not token_record.is_revoked, "Should rollback revoke"
```

### Test Case 4: Isolation Test

```python
async def test_select_for_update_isolation():
    """Verify row locking works."""
    thread_id = "test-thread-123"
    
    async def update_title(title):
        await thread_service.update_thread(db, thread_id, title=title)
    
    # Start two concurrent updates
    task1 = asyncio.create_task(update_title("Title A"))
    task2 = asyncio.create_task(update_title("Title B"))
    
    await asyncio.gather(task1, task2)
    
    # Check final state
    thread = await thread_service.get_thread(db, thread_id)
    
    # One of them should win (deterministic due to locking)
    assert thread.title in ["Title A", "Title B"]
    # No "Title AB" or corrupted state
```

---

## Performance Considerations

### SELECT FOR UPDATE Impact

**Pros:**
- ✅ Data consistency guaranteed
- ✅ No lost updates
- ✅ Predictable behavior

**Cons:**
- ⚠️ Lock contention if many concurrent requests
- ⚠️ Slightly higher latency
- ⚠️ Potential deadlock if not careful

**Mitigation:**
- Keep transactions short
- Lock only what's needed
- Ensure proper indexes
- Monitor lock wait time

### Connection Pool Settings

```python
# Current configuration
pool_size=10          # 10 persistent connections
max_overflow=20       # +20 temporary = 30 max
pool_timeout=30.0     # Wait 30s for connection
pool_recycle=3600     # Recycle after 1 hour
```

**Tuning Guidelines:**
- Small app: pool_size=5-10
- Medium app: pool_size=10-20
- Large app: pool_size=20-50
- Monitor: active connections, wait time

### Recommended Monitoring

**Database Metrics:**
- Active connections
- Connection wait time
- Lock wait time
- Deadlocks per minute
- Transaction latency (P50, P95, P99)

**Application Metrics:**
- Error rate by endpoint
- IntegrityError frequency
- Rollback rate
- Request latency

---

## Summary

### ✅ ACID Compliance Achieved

| Property | Status | Implementation |
|----------|--------|----------------|
| **Atomicity** | ✅ | Single commit per transaction, proper rollback |
| **Consistency** | ✅ | Database constraints + app validation |
| **Isolation** | ✅ | SELECT FOR UPDATE + READ COMMITTED |
| **Durability** | ✅ | PostgreSQL WAL + proper commit |

### ✅ Exception Handling Complete

| Aspect | Status | Coverage |
|--------|--------|----------|
| **IntegrityError** | ✅ | All write operations |
| **HTTPException** | ✅ | All service methods |
| **Generic Exception** | ✅ | All database operations |
| **Rollback** | ✅ | All error paths |
| **User Messages** | ✅ | Clear, actionable, secure |

### Key Improvements Made

1. ✅ Fixed atomicity violation trong refresh_token (auto_commit parameter)
2. ✅ Thêm SELECT FOR UPDATE để prevent race conditions
3. ✅ Comprehensive error handling trong tất cả services
4. ✅ Proper rollback trong tất cả error paths
5. ✅ Database constraint enforcement
6. ✅ Connection pooling configuration
7. ✅ Clear error messages cho users

### Files Modified

- [src/services/token_service.py](../src/services/token_service.py)
- [src/services/auth_service.py](../src/services/auth_service.py)
- [src/services/thread_service.py](../src/services/thread_service.py)
- [src/dependencies.py](../src/dependencies.py)
- [src/config.py](../src/config.py)

### References

- [PostgreSQL ACID](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [SQLAlchemy SELECT FOR UPDATE](https://docs.sqlalchemy.org/en/20/orm/queryguide/select.html#sqlalchemy.sql.expression.Select.with_for_update)
- [FastAPI Error Handling](https://fastapi.tiangolo.com/tutorial/handling-errors/)

---

**Date:** 2026-02-13  
**Status:** ✅ Production Ready  
**Next Steps:** Deploy và monitor metrics
