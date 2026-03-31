import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, Base
from app.models import User, Wallet, Order, Portfolio, Transaction, TradingBot, Achievement, PriceAlert, OptionContract, BrokerAccount, Watchlist

async def recreate():
    print("Recreating database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("Database recreated successfully.")

if __name__ == "__main__":
    asyncio.run(recreate())
