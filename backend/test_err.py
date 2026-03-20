import asyncio
from app.db.session import SessionLocal, engine, Base
from app.schemas import UserCreate
from app.api import register
from app.models import User, Wallet

async def test():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with SessionLocal() as db:
            user_in = UserCreate(email='test99@example.com', password='password')
            user = await register(user_in, db)
            print('Success!', user.email)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(test())
