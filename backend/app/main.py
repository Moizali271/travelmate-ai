from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import client, db
from app.routers import auth, trips


@asynccontextmanager
async def lifespan(app: FastAPI):
    await client.admin.command("ping")
    print("MongoDB connected")
    await db.trips.create_index([("userId", 1), ("createdAt", -1)])
    await db.users.create_index(
        [("oauthProvider", 1), ("oauthSubject", 1)], unique=True
    )
    yield
    await client.close()


app = FastAPI(title="TravelMate AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(trips.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}