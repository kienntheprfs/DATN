# API Gateway - Exception Handling Architecture

## Design Pattern: Exception Hierarchy

### Layered Exception Handling

```
┌─ Global Exception Handlers (main.py)
│  ├─ RequestValidationError → 422
│  ├─ IntegrityError → 400 (constraint violations)
│  ├─ SQLAlchemyError → 500 (DB errors)
│  └─ Exception (catch-all) → 500
│
├─ Service Layer Exception Handling
│  ├─ Catch IntegrityError FIRST (specific errors)
│  ├─ Re-raise HTTPException (already formatted)
│  └─ Catch Exception LAST (safety net)
│  └─ ALWAYS: db.rollback() on error
│
├─ Route Layer Exception Handling
│  ├─ Validation BEFORE database operations
│  └─ Specific HTTPException for business logic
│
└─ Middleware Exception Handling
   ├─ TimeoutException → 504
   ├─ ConnectError → 503
   ├─ RequestError → 503
   └─ Exception → 500
```

## Key Design Principles

### 1. Exception Order in Service Layer

**CRITICAL:** IntegrityError must be caught BEFORE generic Exception:

```python
try:
    await db.commit()
except IntegrityError:  # ← FIRST: Specific constraint errors
    raise HTTPException(400, "Email already registered")
except HTTPException:   # ← SECOND: Already formatted errors
    raise
except Exception:       # ← LAST: Safety net
    raise HTTPException(500, "Operation failed")
```

**Why?** IntegrityError is a subclass of SQLAlchemyError. If you catch generic Exception first, you miss the chance to provide specific error messages.

### 2. Database Rollback Pattern

Every service method MUST rollback on error:

```python
try:
    await db.commit()
    return result
except Exception:
    await db.rollback()  # ← CRITICAL: Prevent zombie transactions
    raise
```

### 3. SELECT FOR UPDATE for Concurrency

Use row-level locking to prevent race conditions:

```python
# ❌ Race condition possible
result = await db.execute(select(Token).where(...))

# ✅ Race condition prevented
result = await db.execute(
    select(Token).where(...).with_for_update()
)
```

## HTTP Status Code Semantics

**400 Bad Request:** Client error - invalid data, constraint violation  
**401 Unauthorized:** Missing/invalid authentication  
**403 Forbidden:** Authenticated but insufficient permissions  
**404 Not Found:** Resource doesn't exist  
**422 Unprocessable Entity:** Validation error (Pydantic)  
**500 Internal Server Error:** Unexpected server error  
**503 Service Unavailable:** Downstream service down  
**504 Gateway Timeout:** Downstream service timeout

## Security: What NOT to Log

❌ Passwords  
❌ Access tokens  
❌ Refresh tokens  
❌ API keys  
❌ Database structure details in client-facing errors

**Pattern:** Generic messages to clients, detailed messages in logs

---

**Last Updated:** 2026-02-13
