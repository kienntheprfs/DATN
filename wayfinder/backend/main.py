from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.core.db import init_db
from fastapi.staticfiles import StaticFiles
from backend.routers import (
    maps,
    nodes,
    aliases,
    edges,
    routes,
    admin,
    buildings,
    events,
    missing_locations,
    missing_routes,
)

app = FastAPI(title="Indoor Wayfinder API", version="0.1.0")

# CORS dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve thư mục data/uploads dưới /static (để frontend load ảnh)
app.mount("/static", StaticFiles(directory="data"), name="static")


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


# routers
app.include_router(maps.router, prefix="/api/maps", tags=["maps"])
app.include_router(buildings.router, prefix="/api/buildings", tags=["buildings"])
app.include_router(nodes.router, prefix="/api/nodes", tags=["nodes"])
app.include_router(aliases.router, prefix="/api/aliases", tags=["aliases"])
app.include_router(edges.router, prefix="/api/edges", tags=["edges"])
app.include_router(routes.router, prefix="/api", tags=["route"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(
    missing_locations.router,
    prefix="/api/missing-locations",
    tags=["missing-locations"],
)
app.include_router(
    missing_routes.router,
    prefix="/api/missing-routes",
    tags=["missing-routes"],
)
