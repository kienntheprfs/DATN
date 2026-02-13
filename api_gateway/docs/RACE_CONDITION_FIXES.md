# Race Condition và Database Concurrency Fixes

## Tổng Quan

Document này mô tả các vấn đề về race condition và database concurrency đã được phát hiện và sửa trong API Gateway.

## Các Vấn Đề Đã Phát Hiện

### 1. Race Condition trong Refresh Token

**Vấn đề:**
- Khi nhiều requests cùng gọi `/auth/refresh` với cùng một refresh token
- Giữa lúc validate token và revoke token không có locking
- Dẫn đến cả 2 requests đều pass validation và tạo ra 2 refresh tokens mới khác nhau

**Ví dụ:**
```
Request 1: validate token -> OK
Request 2: validate token -> OK (vì Request 1 chưa revoke)
Request 1: revoke old token, create new token A
Request 2: revoke old token, create new token B
=> Kết quả: Cả 2 tokens A và B đều hợp lệ!
```

**Giải pháp:**
- Sử dụng `SELECT FOR UPDATE` để lock row khi validate
- Đảm bảo chỉ 1 request có thể sử dụng token tại một thời điểm
- Thêm error handling và rollback

**Files đã sửa:**
- `src/services/token_service.py`: Thêm `for_update` parameter cho `get_refresh_token()` và `validate_refresh_token()`
- `src/services/auth_service.py`: Sử dụng `lock_for_update=True` khi validate token

### 2. Race Condition trong Revoke Token

**Vấn đề:**
- Giữa lúc get token và revoke có thể có multiple requests
- Không có row-level locking
- Có thể dẫn đến inconsistent state

**Giải pháp:**
- Sử dụng `SELECT FOR UPDATE` trong `revoke_refresh_token()`
- Thao tác revoke trở nên atomic và idempotent
- Thêm try-except với rollback

**Files đã sửa:**
- `src/services/token_service.py`: `revoke_refresh_token()` method

### 3. Race Condition trong Revoke All User Tokens

**Vấn đề:**
- Select tokens và revoke không atomic
- Có thể miss tokens được tạo giữa lúc select và revoke

**Giải pháp:**
- Sử dụng `SELECT FOR UPDATE` để lock tất cả matching rows atomically
- Thêm error handling

**Files đã sửa:**
- `src/services/token_service.py`: `revoke_all_user_tokens()` method

### 4. Race Condition trong User Registration

**Vấn đề:**
- Giữa lúc check email exists và insert user mới có race window
- Nếu 2 requests cùng register với cùng email, cả 2 có thể pass check
- Dẫn đến IntegrityError khi insert

**Giải pháp:**
- Dựa vào unique constraint ở database để handle duplicate
- Catch `IntegrityError` và return error message thân thiện
- Thêm proper error handling và rollback

**Files đã sửa:**
- `src/services/auth_service.py`: `register_user()` method

### 5. Race Condition trong Thread Update

**Vấn đề:**
- Giữa lúc get thread và commit update có race window
- 2 requests cùng update có thể ghi đè lẫn nhau (lost update problem)

**Giải pháp:**
- Sử dụng `SELECT FOR UPDATE` khi get thread để update
- Đảm bảo atomic update operation

**Files đã sửa:**
- `src/services/thread_service.py`: Thêm `for_update` parameter cho `get_thread()`, update `update_thread()` method

### 6. Thiếu Error Handling và Rollback

**Vấn đề:**
- Các service methods không có try-except blocks
- Không có rollback khi có error
- Database session có thể bị ở inconsistent state

**Giải pháp:**
- Thêm comprehensive error handling trong tất cả database operations
- Catch `IntegrityError` riêng để handle duplicate constraints
- Catch general `Exception` và rollback
- Re-raise `HTTPException` để preserve error messages

**Files đã sửa:**
- `src/services/token_service.py`: store, revoke, revoke_all methods
- `src/services/auth_service.py`: register, refresh_token methods
- `src/services/thread_service.py`: update_thread method

### 7. Database Connection Pooling không được configure

**Vấn đề:**
- Engine chỉ có `pool_pre_ping=True`
- Không có pool_size, max_overflow, timeout settings
- Có thể gây connection exhaustion khi load cao

**Giải pháp:**
- Thêm configuration settings cho connection pool:
  - `db_pool_size`: 10 connections
  - `db_max_overflow`: 20 extra connections
  - `db_pool_timeout`: 30 seconds
  - `db_pool_recycle`: 3600 seconds (1 hour)

**Files đã sửa:**
- `src/config.py`: Thêm database pool settings
- `src/dependencies.py`: Configure engine với pool parameters

### 8. Database Session không rollback khi có error

**Vấn đề:**
- `get_db()` dependency chỉ có finally block để close
- Không rollback khi có exception
- Có thể để lại uncommitted transactions

**Giải pháp:**
- Thêm except block để catch exceptions
- Rollback session trước khi re-raise
- Log errors để debugging

**Files đã sửa:**
- `src/dependencies.py`: `get_db()` dependency

## Chi Tiết Kỹ Thuật

### SELECT FOR UPDATE

`SELECT FOR UPDATE` là mechanism của SQL để lock rows cho đến khi transaction kết thúc:

```python
# Không lock (có thể có race condition)
result = await db.execute(
    select(RefreshToken).where(RefreshToken.token == token)
)

# Lock row (prevent race condition)
result = await db.execute(
    select(RefreshToken)
    .where(RefreshToken.token == token)
    .with_for_update()
)
```

**Cách hoạt động:**
1. Transaction A lock row với SELECT FOR UPDATE
2. Transaction B cố gắng SELECT FOR UPDATE cùng row -> phải đợi
3. Transaction A commit/rollback -> release lock
4. Transaction B mới có thể acquire lock

### Error Handling Pattern

```python
try:
    # Database operations
    await db.commit()
    return result
except IntegrityError:
    # Handle specific constraint violations
    await db.rollback()
    raise HTTPException(...)
except HTTPException:
    # Re-raise HTTP exceptions
    await db.rollback()
    raise
except Exception as e:
    # Catch all other errors
    await db.rollback()
    raise HTTPException(...)
```

## Testing

### Test Cases Cần Chạy

1. **Concurrent Refresh Token**
   - Gửi 2+ requests với cùng refresh token đồng thời
   - Verify chỉ 1 request thành công
   - Verify các request khác nhận 401 (token đã bị revoke)

2. **Concurrent User Registration**
   - Gửi 2+ requests register với cùng email đồng thời
   - Verify chỉ 1 request thành công
   - Verify các request khác nhận 400 (email already registered)

3. **Concurrent Thread Update**
   - Gửi 2+ requests update cùng thread đồng thời
   - Verify update cuối cùng được apply
   - Không có lost updates

4. **Connection Pool Exhaustion**
   - Gửi nhiều requests đồng thời (>30 concurrent)
   - Verify không có connection timeout
   - Verify tất cả requests được xử lý

### Script Test Concurrent Refresh

```python
import asyncio
import httpx

async def concurrent_refresh(token):
    async with httpx.AsyncClient() as client:
        tasks = [
            client.post(
                "http://localhost:8002/auth/refresh",
                json={"refresh_token": token}
            )
            for _ in range(5)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        success = sum(1 for r in responses if not isinstance(r, Exception) and r.status_code == 200)
        errors = sum(1 for r in responses if isinstance(r, Exception) or r.status_code != 200)
        
        print(f"Success: {success}, Errors: {errors}")
        assert success == 1, "Chỉ 1 request nên thành công"
        assert errors == 4, "4 requests nên fail"
```

## Performance Impact

### SELECT FOR UPDATE

- **Pros:**
  - Đảm bảo data consistency
  - Prevent lost updates
  - Atomic operations

- **Cons:**
  - Lock contention nếu nhiều requests cùng access
  - Có thể tăng latency một chút
  - Deadlock risk nếu không cẩn thận

**Giải pháp cho performance:**
- Keep transactions ngắn gọn
- Lock chỉ những gì cần thiết
- Đảm bảo indexes trên các columns được lock

### Connection Pooling

- **Before:** Unlimited connections, có thể exhaust
- **After:** Pool size 10 + overflow 20 = max 30 connections
- **Impact:** Better resource management, prevent connection exhaustion

## Migration Notes

Không cần migration database schema. Tất cả changes chỉ ở application code.

## Monitoring

Nên monitor các metrics sau:

1. **Database connections:**
   - Active connections
   - Connection wait time
   - Connection timeouts

2. **Lock contention:**
   - Lock wait time
   - Deadlocks

3. **Error rates:**
   - IntegrityError frequency
   - Transaction rollback rate

4. **Performance:**
   - P95/P99 latency cho refresh endpoint
   - Transaction duration

## Best Practices Đã Áp Dụng

1. ✅ Row-level locking với SELECT FOR UPDATE
2. ✅ Proper transaction management
3. ✅ Comprehensive error handling
4. ✅ Database constraint enforcement (unique, foreign keys)
5. ✅ Connection pooling configuration
6. ✅ Idempotent operations (revoke token)
7. ✅ Atomic operations (refresh token rotation)

## Tài Liệu Tham Khảo

- [PostgreSQL SELECT FOR UPDATE](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [SQLAlchemy Row Locking](https://docs.sqlalchemy.org/en/20/orm/queryguide/select.html#sqlalchemy.sql.expression.Select.with_for_update)
- [Database Concurrency Control](https://en.wikipedia.org/wiki/Concurrency_control)

## Changelog

### 2025-02-13
- ✅ Fixed race condition in refresh token
- ✅ Fixed race condition in revoke operations
- ✅ Fixed race condition in user registration
- ✅ Fixed race condition in thread update
- ✅ Added comprehensive error handling
- ✅ Configured connection pooling
- ✅ Improved database session management
