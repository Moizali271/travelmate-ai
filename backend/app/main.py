from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import OperationFailure

from app.db import client, db
from app.routers import auth, destinations, trips


@asynccontextmanager
async def lifespan(app: FastAPI):
    await client.admin.command("ping")
    print("MongoDB connected")
    await db.trips.create_index([("userId", 1), ("createdAt", -1)])

    # Purana unique index hata kar naya (partial) banate hain, taake
    # email/password wale users (jin ke paas oauth fields nahi) bhi chalen.
    try:
        await db.users.drop_index("oauthProvider_1_oauthSubject_1")
    except OperationFailure:
        pass
    await db.users.create_index(
        [("oauthProvider", 1), ("oauthSubject", 1)],
        unique=True,
        partialFilterExpression={"oauthSubject": {"$type": "string"}},
    )
    await db.users.create_index(
        "email",
        unique=True,
        partialFilterExpression={"email": {"$type": "string"}},
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
app.include_router(destinations.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}