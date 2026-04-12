# API Gateway Service

## Tổng quan
API Gateway là cổng vào chính của hệ thống, sử dụng Apache APISIX để quản lý và định tuyến traffic đến các microservices khác. Service hoạt động như một reverse proxy và load balancer cho toàn bộ ứng dụng.

## Công nghệ
- **Apache APISIX 3.14.1**: API Gateway và reverse proxy
- **Docker**: Containerization
- **YAML Configuration**: File-based configuration

## Port và Endpoint
- **Port**: 8002 (container), 9080 (internal)
- **Health Check**: Available through APISIX endpoints

## Architecture
API Gateway sử dụng cấu hình YAML để định tuyến requests đến các upstream services:

### Upstream Services
- **Auth Service**: `host.docker.internal:8008`
- **Agent Service**: `host.docker.internal:8080`
- **Knowledge Service**: `host.docker.internal:8000`
- **Wayfinder Service**: `host.docker.internal:8001`
- **Dashboard Service**: `host.docker.internal:8010`
- **Voice Service**: `host.docker.internal:7860`

## Cấu hình chính

### Environment Variables
```yaml
AUTH_SERVICE_URL: http://host.docker.internal:8008
AUTH_UPSTREAM_ADDR: host.docker.internal:8008
AGENT_UPSTREAM_ADDR: host.docker.internal:8080
KNOWLEDGE_UPSTREAM_ADDR: host.docker.internal:8000
WAYFINDER_UPSTREAM_ADDR: host.docker.internal:8001
DASHBOARD_UPSTREAM_ADDR: host.docker.internal:8010
VOICE_UPSTREAM_ADDR: host.docker.internal:7860
INTERNAL_SECRET: ${INTERNAL_SECRET:-your-internal-secret-for-service-to-service-auth}
```

### Volume Mounts
- `./apisix/conf/config.yaml:/usr/local/apisix/conf/config.yaml:ro`
- `./apisix/conf/apisix.yaml:/usr/local/apisix/conf/apisix.yaml:ro`

## Chức năng chính

### 1. Request Routing
- Định tuyến requests đến appropriate upstream services
- Load balancing giữa multiple instances
- Path-based routing

### 2. Authentication & Authorization
- JWT token validation
- Service-to-service authentication với INTERNAL_SECRET
- User identity injection qua headers

### 3. Security
- Rate limiting
- Request/response transformation
- CORS handling
- SSL termination

### 4. Monitoring & Logging
- Request logging
- Performance metrics
- Error tracking

## Cách chạy

### Với Docker Compose
```bash
cd api_gateway
docker-compose up -d
```

### Kiểm tra hoạt động
```bash
curl -X GET "http://localhost:8002/health"
```

## File cấu hình quan trọng

### 1. `docker-compose.yml`
Định nghĩa service APISIX container với environment variables và volume mounts.

### 2. `apisix/conf/config.yaml`
Cấu hình chính của APISIX bao gồm:
- Database connection
- Plugin configuration
- Discovery settings

### 3. `apisix/conf/apisix.yaml`
Định nghĩa routes, upstreams, và plugins:
- Route definitions
- Upstream service configurations
- Plugin chains cho từng route

## Integration với các services khác

### Auth Service Integration
- Forward authentication requests
- Validate JWT tokens
- Inject user information vào downstream requests

### Service-to-Service Communication
- Internal authentication với shared secret
- Secure communication channels
- Health check propagation

## Troubleshooting

### Common Issues
1. **Service Unreachable**: Kiểm tra upstream service status
2. **Authentication Failures**: Verify INTERNAL_SECRET configuration
3. **Configuration Errors**: Validate YAML syntax

### Debug Commands
```bash
# Check APISIX logs
docker logs api_gateway_apisix

# Test routing
curl -H "Host: your-domain" http://localhost:8002/path

# Check upstream status
curl http://localhost:8002/apisix/admin/upstreams
```

## Performance Considerations
- Connection pooling cho upstream services
- Caching strategies
- Timeout configurations
- Health check intervals

## Security Best Practices
- Regular secret rotation
- Network segmentation
- Rate limiting per client
- Request size limits
- SSL/TLS enforcement
