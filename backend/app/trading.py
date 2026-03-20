import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from app.db.session import get_db, AsyncSessionLocal
from app.models import User, Order, Wallet, Portfolio, Transaction, TransactionType, OrderStatus, OrderType, OrderSide, TradingBot, BotStatus, Achievement, PriceAlert, AlertDir, OptionContract, OptionType
from app.schemas import OrderCreate, OrderResponse, PortfolioItemResponse, TradingBotCreate, TradingBotResponse, AchievementResponse, PriceAlertCreate, PriceAlertResponse, OptionCreate, OptionResponse
from app.api import get_current_user
from app.websockets import manager, stock_prices
from typing import List

router = APIRouter()

async def execute_trade_background(order_id: int, user_email: str):
    import traceback
    try:
        async with AsyncSessionLocal() as db:
            order_res = await db.execute(select(Order).where(Order.id == order_id))
            order = order_res.scalars().first()
            if not order or order.status != OrderStatus.PENDING: return
            order_type_val = getattr(order.order_type, 'value', str(order.order_type).split('.')[-1])
            side_val = getattr(order.side, 'value', str(order.side).split('.')[-1])
            target_price = order.price
            symbol = order.symbol

        if order_type_val == "LIMIT":
            while True:
                current_p = stock_prices.get(symbol, target_price)
                if side_val == "BUY" and current_p <= target_price: break
                elif side_val == "SELL" and current_p >= target_price: break
                
                async with AsyncSessionLocal() as db:
                    check_res = await db.execute(select(Order).where(Order.id == order_id))
                    check_ord = check_res.scalars().first()
                    if not check_ord or check_ord.status != OrderStatus.PENDING: return
                await asyncio.sleep(1.0)
        else:
            await asyncio.sleep(3) 

        async with AsyncSessionLocal() as db:
            order_res = await db.execute(select(Order).where(Order.id == order_id))
            order = order_res.scalars().first()
            if not order or order.status != OrderStatus.PENDING: return
            
            wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == order.user_id))
            wallet = wallet_res.scalars().first()
            
            port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == order.user_id).where(Portfolio.symbol == order.symbol))
            portfolio = port_res.scalars().first()
            
            total_cost = order.price * order.quantity
            side_val = getattr(order.side, 'value', str(order.side).split('.')[-1])
            
            if side_val == "BUY":
                if wallet.balance < total_cost:
                    order.status = OrderStatus.FAILED
                    await db.commit()
                    await manager.send_personal_message({"type": "order_failed", "data": {"symbol": order.symbol, "reason": "Insufficient funds at execution"}}, user_email)
                    return
                wallet.balance -= total_cost
                if portfolio:
                    new_qty = portfolio.quantity + order.quantity
                    portfolio.avg_price = ((portfolio.avg_price * portfolio.quantity) + total_cost) / new_qty
                    portfolio.quantity = new_qty
                else:
                    portfolio = Portfolio(user_id=order.user_id, symbol=order.symbol, quantity=order.quantity, avg_price=order.price)
                    db.add(portfolio)
            elif side_val == "SELL":
                if not portfolio or portfolio.quantity < order.quantity:
                    order.status = OrderStatus.FAILED
                    await db.commit()
                    await manager.send_personal_message({"type": "order_failed", "data": {"symbol": order.symbol, "reason": "Insufficient stock at execution"}}, user_email)
                    return
                wallet.balance += total_cost
                portfolio.quantity -= order.quantity
                
            order.status = OrderStatus.EXECUTED
            transaction = Transaction(
                user_id=order.user_id,
                type=TransactionType.BUY if side_val == "BUY" else TransactionType.SELL,
                amount=total_cost
            )
            db.add(transaction)
            await db.commit()
            
            ach_res = await db.execute(select(Achievement).where(Achievement.user_id == order.user_id))
            existing_badges = [a.badge_name for a in ach_res.scalars().all()]
            
            if wallet.balance >= 100000 and "Plutocrat" not in existing_badges:
                ach = Achievement(user_id=order.user_id, badge_name="Plutocrat", description="Reached a wallet balance of over ₹1,00,000")
                db.add(ach)
                await manager.send_personal_message({"type": "achievement_unlocked", "data": {"badge": "Plutocrat", "desc": "Wallet balance over ₹1L"}}, user_email)
            if side_val == "BUY" and order.quantity >= 1000 and "High Roller" not in existing_badges:
                ach = Achievement(user_id=order.user_id, badge_name="High Roller", description="Executed a single trade of over 1000 shares")
                db.add(ach)
                await manager.send_personal_message({"type": "achievement_unlocked", "data": {"badge": "High Roller", "desc": "Trade size over 1000 shares"}}, user_email)
            await db.commit()
            
            await manager.send_personal_message({
                "type": "trade_executed",
                "data": {
                    "symbol": order.symbol,
                    "side": side_val,
                    "quantity": order.quantity,
                    "price": order.price,
                    "wallet_balance": wallet.balance
                }
            }, user_email)
    except Exception as e:
        print("BACKGROUND EXCEPTION:", e)
        traceback.print_exc()

@router.post("/order", response_model=OrderResponse)
async def place_order(order_req: OrderCreate, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    symbol = order_req.symbol
    if symbol not in stock_prices:
        raise HTTPException(status_code=400, detail="Invalid stock symbol")

    order_type_val = getattr(order_req.order_type, 'value', str(order_req.order_type).split('.')[-1])
    side_val = getattr(order_req.side, 'value', str(order_req.side).split('.')[-1])

    if order_type_val == "LIMIT" and order_req.price is None:
        raise HTTPException(status_code=400, detail="Limit price is required for LIMIT orders")

    current_price = stock_prices[symbol]
    execute_price = current_price if order_type_val == "MARKET" else order_req.price
    total_cost = execute_price * order_req.quantity
    
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_res.scalars().first()
    
    if side_val == "BUY" and wallet.balance < total_cost:
         raise HTTPException(status_code=400, detail="Insufficient funds")
    
    port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == current_user.id).where(Portfolio.symbol == symbol))
    portfolio = port_res.scalars().first()
    if side_val == "SELL" and (not portfolio or portfolio.quantity < order_req.quantity):
         raise HTTPException(status_code=400, detail="Insufficient stock to sell")

    order = Order(
        user_id=current_user.id,
        symbol=symbol,
        order_type=order_req.order_type,
        side=order_req.side,
        quantity=order_req.quantity,
        price=execute_price,
        status=OrderStatus.PENDING
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    background_tasks.add_task(execute_trade_background, order.id, current_user.email)
    
    await manager.send_personal_message({
        "type": "order_pending",
        "data": { "symbol": symbol, "side": side_val, "status": "PENDING" }
    }, current_user.email)

    return order

@router.delete("/order/{order_id}")
async def cancel_order(order_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order_res = await db.execute(select(Order).where(Order.id == order_id).where(Order.user_id == current_user.id))
    order = order_res.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=400, detail="Only pending orders can be cancelled")
        
    order.status = OrderStatus.CANCELLED
    await db.commit()
    return {"message": "Order cancelled successfully"}

@router.get("/portfolio", response_model=List[PortfolioItemResponse])
async def get_portfolio(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Portfolio).where(Portfolio.user_id == current_user.id).where(Portfolio.quantity > 0))
    return result.scalars().all()

@router.get("/analyze/{symbol}")
async def analyze_stock(symbol: str, current_user: User = Depends(get_current_user)):
    import random, asyncio
    if symbol not in stock_prices:
        raise HTTPException(status_code=404, detail="Symbol not found in live engine")
        
    price = stock_prices[symbol]
    
    analysis_pool = [
        f"Technical indicators highlight strong momentum for {symbol}. Moving averages cross suggests accumulation.",
        f"{symbol} is currently testing major resistance levels near ₹{(price*1.02):.2f}. Caution advised.",
        f"RSI for {symbol} indicates it is heavily oversold. Potential mean reversion bounce expected.",
        f"High volume node detected in {symbol}. Bullish divergence present on the hourly charts.",
        f"{symbol} shows a bearish MACD crossover. Support expected around ₹{(price*0.95):.2f}."
    ]
    
    await asyncio.sleep(1.5)
    return {"symbol": symbol, "analysis": random.choice(analysis_pool)}

from app.models import Watchlist
from app.schemas import WatchlistResponse, WatchlistCreate

@router.get("/watchlist", response_model=List[WatchlistResponse])
async def get_watchlist(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Watchlist).where(Watchlist.user_id == current_user.id))
    return result.scalars().all()

@router.post("/watchlist", response_model=WatchlistResponse)
async def add_watchlist(req: WatchlistCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.symbol not in stock_prices:
        raise HTTPException(status_code=400, detail="Invalid stock symbol")
    existing_res = await db.execute(select(Watchlist).where(Watchlist.user_id == current_user.id).where(Watchlist.symbol == req.symbol))
    if existing_res.scalars().first():
        raise HTTPException(status_code=400, detail="Stock already in watchlist")
    wl = Watchlist(user_id=current_user.id, symbol=req.symbol)
    db.add(wl)
    await db.commit()
    await db.refresh(wl)
    return wl

@router.delete("/watchlist/{symbol}")
async def remove_watchlist(symbol: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Watchlist).where(Watchlist.user_id == current_user.id).where(Watchlist.symbol == symbol))
    wl = result.scalars().first()
    if not wl:
        raise HTTPException(status_code=404, detail="Stock not found in watchlist")
    await db.delete(wl)
    await db.commit()
    return {"status": "success"}

@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.user_id == current_user.id).order_by(Order.timestamp.desc()))
    return result.scalars().all()

@router.get("/bots", response_model=List[TradingBotResponse])
async def get_bots(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TradingBot).where(TradingBot.user_id == current_user.id))
    return result.scalars().all()

@router.post("/bots", response_model=TradingBotResponse)
async def create_bot(bot_req: TradingBotCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if bot_req.symbol not in stock_prices:
        raise HTTPException(status_code=400, detail="Invalid target symbol")
    if bot_req.amount_per_trade < 10 or bot_req.interval_seconds < 5:
        raise HTTPException(status_code=400, detail="Minimum ₹10 per trade and 5 second intervals")
        
    bot = TradingBot(
        user_id=current_user.id,
        symbol=bot_req.symbol,
        amount_per_trade=bot_req.amount_per_trade,
        interval_seconds=bot_req.interval_seconds
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return bot

@router.delete("/bots/{bot_id}")
async def delete_bot(bot_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TradingBot).where(TradingBot.id == bot_id).where(TradingBot.user_id == current_user.id))
    bot = result.scalars().first()
    if not bot:
         raise HTTPException(status_code=404, detail="Bot not found")
    await db.delete(bot)
    await db.commit()
    return {"status": "success"}

async def bot_runner_loop():
    import traceback
    from datetime import datetime
    while True:
        try:
            async with AsyncSessionLocal() as db:
                bots_res = await db.execute(select(TradingBot).where(TradingBot.status == BotStatus.ACTIVE))
                active_bots = bots_res.scalars().all()
                now = datetime.utcnow()
                
                for bot in active_bots:
                    if not bot.last_executed or (now - bot.last_executed).total_seconds() >= bot.interval_seconds:
                        symbol = bot.symbol
                        current_price = stock_prices.get(symbol)
                        if not current_price: continue
                        
                        qty = max(1, int(bot.amount_per_trade // current_price))
                        total_cost = qty * current_price
                        
                        wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == bot.user_id))
                        wallet = wallet_res.scalars().first()
                        if not wallet or wallet.balance < total_cost:
                            continue
                            
                        wallet.balance -= total_cost
                        port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == bot.user_id).where(Portfolio.symbol == symbol))
                        portfolio = port_res.scalars().first()
                        if portfolio:
                            new_qty = portfolio.quantity + qty
                            portfolio.avg_price = ((portfolio.avg_price * portfolio.quantity) + total_cost) / new_qty
                            portfolio.quantity = new_qty
                        else:
                            portfolio = Portfolio(user_id=bot.user_id, symbol=symbol, quantity=qty, avg_price=current_price)
                            db.add(portfolio)
                            
                        # create order record
                        order = Order(
                            user_id=bot.user_id,
                            symbol=symbol,
                            order_type=OrderType.MARKET,
                            side=OrderSide.BUY,
                            quantity=qty,
                            price=current_price,
                            status=OrderStatus.EXECUTED
                        )
                        db.add(order)
                        
                        bot.last_executed = now
                        await db.commit()
                        
                        user_res = await db.execute(select(User).where(User.id == bot.user_id))
                        usr = user_res.scalars().first()
                        if usr:
                            await manager.send_personal_message({
                                "type": "bot_trade_executed",
                                "data": {
                                    "symbol": symbol,
                                    "quantity": qty,
                                    "price": current_price,
                                    "cost": total_cost,
                                    "wallet_balance": wallet.balance
                                }
                            }, usr.email)
        except Exception as e:
            print("BOT RUNNER EXCEPTION:", e)
            traceback.print_exc()
        await asyncio.sleep(5)

@router.get("/achievements", response_model=List[AchievementResponse])
async def get_achievements(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Achievement).where(Achievement.user_id == current_user.id).order_by(Achievement.unlocked_at.desc()))
    return result.scalars().all()

@router.get("/alerts", response_model=List[PriceAlertResponse])
async def get_alerts(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PriceAlert).where(PriceAlert.user_id == current_user.id).where(PriceAlert.is_active == True))
    return result.scalars().all()

@router.post("/alerts", response_model=PriceAlertResponse)
async def create_alert(alert_req: PriceAlertCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if alert_req.symbol not in stock_prices:
        raise HTTPException(status_code=400, detail="Invalid target symbol")
    alert = PriceAlert(
        user_id=current_user.id,
        symbol=alert_req.symbol,
        price_target=alert_req.price_target,
        direction=AlertDir.ABOVE if alert_req.direction.upper() == "ABOVE" else AlertDir.BELOW
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert

@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PriceAlert).where(PriceAlert.id == alert_id).where(PriceAlert.user_id == current_user.id))
    alert = result.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()
    return {"status": "success"}

async def alert_watcher_loop():
    import traceback
    while True:
        try:
            async with AsyncSessionLocal() as db:
                alerts_res = await db.execute(select(PriceAlert).where(PriceAlert.is_active == True))
                active_alerts = alerts_res.scalars().all()
                for alert in active_alerts:
                    current_price = stock_prices.get(alert.symbol)
                    if not current_price: continue
                    
                    triggered = False
                    if alert.direction.value == "ABOVE" and current_price >= alert.price_target: triggered = True
                    if alert.direction.value == "BELOW" and current_price <= alert.price_target: triggered = True
                    
                    if triggered:
                        alert.is_active = False
                        await db.commit()
                        user_res = await db.execute(select(User).where(User.id == alert.user_id))
                        usr = user_res.scalars().first()
                        if usr:
                            await manager.send_personal_message({
                                "type": "price_alert",
                                "data": {
                                    "symbol": alert.symbol,
                                    "target": alert.price_target,
                                    "direction": alert.direction.value,
                                    "current": current_price
                                }
                            }, usr.email)
        except Exception as e:
            print("ALERT WATCHER EXCEPTION:", e)
            traceback.print_exc()
        await asyncio.sleep(2.0)

@router.get("/options", response_model=List[OptionResponse])
async def get_options(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OptionContract).where(OptionContract.user_id == current_user.id).order_by(OptionContract.created_at.desc()))
    return result.scalars().all()

@router.post("/options", response_model=OptionResponse)
async def create_option(opt_req: OptionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if opt_req.symbol not in stock_prices: raise HTTPException(status_code=400, detail="Invalid target symbol")
    
    current_price = stock_prices[opt_req.symbol]
    premium = (current_price * 0.05) * opt_req.quantity
    
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_res.scalars().first()
    if not wallet or wallet.balance < premium:
        raise HTTPException(status_code=400, detail="Insufficient funds for option premium")
    
    wallet.balance -= premium
    
    import datetime
    expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=opt_req.expires_in_minutes)
    
    opt = OptionContract(
        user_id=current_user.id,
        symbol=opt_req.symbol,
        strike_price=opt_req.strike_price,
        premium_paid=premium,
        quantity=opt_req.quantity,
        option_type=OptionType.CALL if opt_req.option_type.upper() == "CALL" else OptionType.PUT,
        expires_at=expiry,
        is_settled=False
    )
    db.add(opt)
    
    transaction = Transaction(user_id=current_user.id, type=TransactionType.BUY, amount=premium)
    db.add(transaction)
    
    await db.commit()
    await db.refresh(opt)
    return opt

async def options_watcher_loop():
    import traceback
    import datetime
    while True:
        try:
            async with AsyncSessionLocal() as db:
                now = datetime.datetime.utcnow()
                opts_res = await db.execute(select(OptionContract).where(OptionContract.is_settled == False).where(OptionContract.expires_at <= now))
                expired_opts = opts_res.scalars().all()
                for opt in expired_opts:
                    current_price = stock_prices.get(opt.symbol, opt.strike_price)
                    payout = 0
                    if opt.option_type.value == "CALL" and current_price > opt.strike_price:
                        payout = (current_price - opt.strike_price) * opt.quantity
                    elif opt.option_type.value == "PUT" and current_price < opt.strike_price:
                        payout = (opt.strike_price - current_price) * opt.quantity
                        
                    opt.is_settled = True
                    notif_msg = f"{opt.option_type.value} Option Expired Worthless (Strike {opt.strike_price}, Close {current_price:.2f})"
                    
                    if payout > 0:
                        wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == opt.user_id))
                        wallet = wallet_res.scalars().first()
                        if wallet:
                            wallet.balance += payout
                        transaction = Transaction(user_id=opt.user_id, type=TransactionType.SELL, amount=payout)
                        db.add(transaction)
                        notif_msg = f"{opt.option_type.value} Contract ITM! Payout ₹{payout:.2f} credited. (Strike {opt.strike_price}, Close {current_price:.2f})"
                        
                    await db.commit()
                    
                    user_res = await db.execute(select(User).where(User.id == opt.user_id))
                    usr = user_res.scalars().first()
                    if usr:
                        await manager.send_personal_message({"type": "options_settled", "data": {"message": notif_msg}}, usr.email)
        except Exception as e:
            print("OPTIONS WATCHER EXCEPTION:", e)
            traceback.print_exc()
        await asyncio.sleep(5.0)
