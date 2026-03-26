from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from app.db.session import engine, Base
from app import api
from app.websockets import generate_mock_prices, router as ws_router
from app.trading import router as trading_router, bot_runner_loop, alert_watcher_loop, options_watcher_loop, alpha_trader_loop, bracket_order_loop, ai_signal_loop
from app.payments import router as payments_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # Start background tasks
    price_task = asyncio.create_task(generate_mock_prices())
    bot_task = asyncio.create_task(bot_runner_loop())
    alert_task = asyncio.create_task(alert_watcher_loop())
    opt_task = asyncio.create_task(options_watcher_loop())
    alpha_task = asyncio.create_task(alpha_trader_loop())
    bracket_task = asyncio.create_task(bracket_order_loop())
    ai_signal_task = asyncio.create_task(ai_signal_loop())
    yield
    price_task.cancel()
    bot_task.cancel()
    alert_task.cancel()
    opt_task.cancel()
    alpha_task.cancel()
    bracket_task.cancel()
    ai_signal_task.cancel()

app = FastAPI(title="Trading App API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router, prefix="/auth", tags=["auth"])
app.include_router(ws_router, tags=["websockets"])
app.include_router(trading_router, prefix="/trade", tags=["trading"])
app.include_router(payments_router, prefix="/payments", tags=["payments"])

import os
from fastapi.staticfiles import StaticFiles
frontend_path = os.path.join(os.path.dirname(__file__), "../../frontend")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
