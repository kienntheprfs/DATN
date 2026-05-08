from backend.main import app
for route in app.routes:
    path = getattr(route, 'path', 'unknown')
    methods = getattr(route, 'methods', [])
    print(f"{path} {methods}")
