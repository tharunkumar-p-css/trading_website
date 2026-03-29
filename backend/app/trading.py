import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from app.db.session import get_db, AsyncSessionLocal
from app.models import User, Order, Wallet, Portfolio, Transaction, TransactionType, OrderStatus, OrderType, OrderSide, TradingBot, BotStatus, Achievement, PriceAlert, AlertDir, OptionContract, OptionType, CopySubscription, OtcListing, OtcStatus, IpoListing, IpoStatus, IpoBid, BrokerAccount
from app.schemas import OrderCreate, OrderResponse, PortfolioItemResponse, TradingBotCreate, TradingBotResponse, AchievementResponse, PriceAlertCreate, PriceAlertResponse, OptionCreate, OptionResponse, CopyTradeRequest, OtcListingResponse, OtcListingCreate, IpoListingResponse, BrokerAccountCreate, BrokerAccountResponse
from app.api import get_current_user
from app.websockets import manager, stock_prices, stock_order_books
from app.models import BrokerAccount
from sqlalchemy import or_
from typing import List, Dict
import math
import datetime
import alpaca_trade_api as alpaca
import random

router = APIRouter()
# Simple Psychology Engine State
trader_psychology: Dict[int, Dict] = {} # { user_id: { "bias_score": 0.5, "tilt_detected": False } }

async def execute_alpaca_order(symbol: str, qty: int, side: str, order_type: str, api_key: str, api_secret: str, base_url: str):
    try:
        api = alpaca.REST(api_key, api_secret, base_url, api_version='v2')
        # Map internal types to Alpaca
        a_side = 'buy' if side == 'BUY' else 'sell'
        a_type = 'market' if order_type == 'MARKET' else 'limit'
        
        # This is a synchronous call in many SDK versions, but we assume async-capable or wrapped
        # In this mock-real context, we'll simulate the call success
        await asyncio.sleep(0.5) # Network latency simulation
        # return api.submit_order(symbol, qty, a_side, a_type, 'gtc')
        return {"id": f"alp-{random.randint(1000, 9999)}", "status": "accepted"}
    except Exception as e:
        raise HTTPException(400, f"Broker Error: {str(e)}")

async def process_copy_trades(source_order_id: int):
    try:
        async with AsyncSessionLocal() as db:
            src_res = await db.execute(select(Order).where(Order.id == source_order_id))
            src_order = src_res.scalars().first()
            if not src_order: return
            
            subs_res = await db.execute(select(CopySubscription).where(CopySubscription.target_user_id == src_order.user_id).where(CopySubscription.active == True))
            subscribers = subs_res.scalars().all()
            
            spawned_orders = []
            for sub in subscribers:
                copy_cost = src_order.quantity * src_order.price
                if copy_cost > sub.allocated_amount: continue
                
                sub_res = await db.execute(select(User).where(User.id == sub.subscriber_id))
                sub_user = sub_res.scalars().first()
                if not sub_user: continue
                
                copy_order = Order(
                    user_id=sub.subscriber_id,
                    symbol=src_order.symbol,
                    order_type=src_order.order_type,
                    side=src_order.side,
                    quantity=src_order.quantity,
                    price=src_order.price,
                    stop_loss_price=src_order.stop_loss_price,
                    take_profit_price=src_order.take_profit_price,
                    trailing_stop_active=src_order.trailing_stop_active,
                    status=OrderStatus.PENDING
                )
                db.add(copy_order)
                spawned_orders.append((copy_order, sub_user.email))
                
            await db.commit()
            
            for o, email in spawned_orders:
                await db.refresh(o)
                asyncio.create_task(execute_trade_background(o.id, email))
    except Exception as e:
        import traceback
        print("COPY TRADING ERROR:", e)
        traceback.print_exc()

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

    # Real-world Execution Logic
    res = await db.execute(select(BrokerAccount).where(BrokerAccount.user_id == current_user.id, BrokerAccount.is_live == True))
    live_account = res.scalars().first()
    
    execution_msg = "Order simulated internally."
    if live_account and live_account.broker_name == "Alpaca":
        base_url = "https://paper-api.alpaca.markets" # Hardcoded for safety during demo
        await execute_alpaca_order(
            order_req.symbol, order_req.quantity, side_val, 
            order_type_val, live_account.api_key, live_account.api_secret, base_url
        )
        execution_msg = "Order transmitted to Alpaca Paper Gateway."

    order = Order(
        user_id=current_user.id,
        symbol=symbol,
        order_type=order_req.order_type,
        side=order_req.side,
        quantity=order_req.quantity,
        price=execute_price,
        stop_loss_price=order_req.stop_loss_price,
        take_profit_price=order_req.take_profit_price,
        trailing_stop_active=order_req.trailing_stop_active,
        status=OrderStatus.PENDING
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    background_tasks.add_task(execute_trade_background, order.id, current_user.email)
    
    # Broadcast copy-trades to all subscribers securely in background
    background_tasks.add_task(process_copy_trades, order.id)
    
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
    result = await db.execute(select(Order).where(Order.user_id == current_user.id).order_by(Order.created_at.desc()))
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

@router.post("/copy")
async def setup_copy_trading(req: CopyTradeRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == req.target_user_email))
    target_user = res.scalars().first()
    if not target_user:
        target_user = User(email=req.target_user_email, hashed_password="mock")
        db.add(target_user)
        await db.commit()
        await db.refresh(target_user)
        
    sub_res = await db.execute(select(CopySubscription).where(CopySubscription.subscriber_id == current_user.id).where(CopySubscription.target_user_id == target_user.id))
    sub = sub_res.scalars().first()
    
    if req.allocated_amount <= 0:
        if sub:
            sub.active = False
            await db.commit()
            return {"status": "success", "message": f"Unsubscribed from {req.target_user_email}"}
        return {"status": "success", "message": "Nothing to unsubscribe"}
        
    if sub:
        sub.allocated_amount = req.allocated_amount
        sub.active = True
    else:
        sub = CopySubscription(
            subscriber_id=current_user.id,
            target_user_id=target_user.id,
            allocated_amount=req.allocated_amount,
            active=True
        )
        db.add(sub)
    await db.commit()
    return {"status": "success", "message": f"Successfully mirroring {req.target_user_email}"}

async def alpha_trader_loop():
    import traceback
    import random
    while True:
        try:
            await asyncio.sleep(15.0)
            async with AsyncSessionLocal() as db:
                subs_res = await db.execute(select(CopySubscription).where(CopySubscription.active == True))
                subs = subs_res.scalars().all()
                target_ids = list(set([s.target_user_id for s in subs]))
                
                if not target_ids:
                    continue
                
                target_id = random.choice(target_ids)
                usr_res = await db.execute(select(User).where(User.id == target_id))
                target_user = usr_res.scalars().first()
                if not target_user: continue
                
                symbol = random.choice(list(stock_prices.keys()))
                price = stock_prices[symbol]
                qty = random.randint(10, 100)
                
                mock_order = Order(
                    user_id=target_user.id,
                    symbol=symbol,
                    order_type=OrderType.MARKET,
                    side=OrderSide.BUY if random.random() > 0.5 else OrderSide.SELL,
                    quantity=qty,
                    price=price,
                    status=OrderStatus.EXECUTED
                )
                db.add(mock_order)
                await db.commit()
                await db.refresh(mock_order)
                
                asyncio.create_task(process_copy_trades(mock_order.id))
        except Exception as e:
            print("ALPHA TRADER LOOP EXCEPT", e)
            traceback.print_exc()

async def bracket_order_loop():
    import traceback
    while True:
        try:
            await asyncio.sleep(3.0)
            async with AsyncSessionLocal() as db:
                ords_res = await db.execute(select(Order).where(Order.status == OrderStatus.EXECUTED).where(Order.side == OrderSide.BUY))
                executed_buys = ords_res.scalars().all()
                for o in executed_buys:
                    if not o.stop_loss_price and not o.take_profit_price:
                        continue
                        
                    current_price = stock_prices.get(o.symbol)
                    if not current_price: continue
                    
                    trigger_sell = False
                    reason = ""
                    if o.stop_loss_price and current_price <= o.stop_loss_price:
                        trigger_sell = True
                        reason = f"Stop Loss hit at {current_price}"
                    elif o.take_profit_price and current_price >= o.take_profit_price:
                        trigger_sell = True
                        reason = f"Take Profit hit at {current_price}"
                        
                    if trigger_sell:
                        port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == o.user_id).where(Portfolio.symbol == o.symbol))
                        port = port_res.scalars().first()
                        if port and port.quantity > 0:
                            qty_to_sell = min(port.quantity, o.quantity)
                            sell_order = Order(
                                user_id=o.user_id,
                                symbol=o.symbol,
                                order_type=OrderType.MARKET,
                                side=OrderSide.SELL,
                                quantity=qty_to_sell,
                                price=current_price,
                                status=OrderStatus.PENDING
                            )
                            db.add(sell_order)
                            o.stop_loss_price = None
                            o.take_profit_price = None
                            await db.commit()
                            await db.refresh(sell_order)
                            
                            user_res = await db.execute(select(User).where(User.id == o.user_id))
                            usr = user_res.scalars().first()
                            if usr:
                                await manager.send_personal_message({
                                    "type": "order_pending",
                                    "data": { "symbol": o.symbol, "side": "SELL", "status": "PENDING", "reason": reason }
                                }, usr.email)
                                asyncio.create_task(execute_trade_background(sell_order.id, usr.email))
        except Exception as e:
            print("BRACKET LOOP EXCEPTION", e)
            traceback.print_exc()

async def ai_signal_loop():
    import traceback
    import random
    while True:
        try:
            await asyncio.sleep(45.0)
            symbol = random.choice(list(stock_prices.keys()))
            patterns = [
                "Bullish Engulfing", "Bearish MACD Divergence", "Golden Cross",
                "Death Cross", "Double Bottom Breakout", "Head and Shoulders",
                "Cup and Handle", "Triple Top"
            ]
            pattern = random.choice(patterns)
            direction = "Bullish" if "Bullish" in pattern or "Cross" in pattern or "Bottom" in pattern or "Cup" in pattern else "Bearish"
            if "Death" in pattern or "Top" in pattern: direction = "Bearish"
            
            await manager.broadcast({
                "type": "trade_signal",
                "data": {
                    "symbol": symbol,
                    "pattern": pattern,
                    "direction": direction,
                    "confidence": random.randint(65, 95)
                }
            })
        except Exception as e:
            print("AI SIGNAL LOOP EXCEPT", e)
            traceback.print_exc()

from pydantic import BaseModel
class SandboxRequest(BaseModel):
    strategy: str
    asset: str
    capital: float

@router.post("/sandbox")
async def run_sandbox(req: SandboxRequest, current_user: User = Depends(get_current_user)):
    import random, asyncio
    await asyncio.sleep(2.0)
    
    # Real backtest logic placeholder, generating simulated historical trades
    if req.strategy == "sma_crossover":
        base_factor = 1.15
        win_rate = random.randint(55, 75)
    elif req.strategy == "mean_reversion":
        base_factor = 1.08
        win_rate = random.randint(50, 70)
    else:
        base_factor = 0.95
        win_rate = random.randint(40, 55)
        
    final_val = req.capital * base_factor * (1 + (random.random() * 0.1))
    return {
        "finalValue": final_val,
        "pnl": final_val - req.capital,
        "winRate": win_rate,
        "trades": random.randint(20, 100)
    }

@router.get("/otc", response_model=List[OtcListingResponse])
async def get_otc(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(OtcListing).order_by(OtcListing.created_at.desc()))
    listings = res.scalars().all()
    out = []
    for l in listings:
        usr_res = await db.execute(select(User).where(User.id == l.seller_id))
        usr = usr_res.scalars().first()
        out.append({
            "id": l.id, "seller_id": l.seller_id, "seller_name": usr.email.split("@")[0] if usr else "Unknown",
            "symbol": l.symbol, "quantity": l.quantity, "price": l.price, "status": l.status.value
        })
    return out

@router.post("/otc")
async def create_otc(req: OtcListingCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.symbol not in stock_prices: raise HTTPException(400, "Invalid symbol")
    port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == current_user.id).where(Portfolio.symbol == req.symbol))
    port = port_res.scalars().first()
    if not port or port.quantity < req.quantity:
        raise HTTPException(400, "Insufficient portfolio balance to list OTC block")
        
    listing = OtcListing(seller_id=current_user.id, symbol=req.symbol, quantity=req.quantity, price=req.price)
    db.add(listing)
    
    # lock the portfolio quantity
    port.quantity -= req.quantity
    await db.commit()
    
    return {"status": "success", "message": "OTC Listing Created"}

@router.post("/otc/{listing_id}/buy")
async def buy_otc(listing_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(OtcListing).where(OtcListing.id == listing_id))
    listing = res.scalars().first()
    if not listing: raise HTTPException(404, "Listing not found")
    if listing.status != OtcStatus.OPEN: raise HTTPException(400, "Listing already filled")
    
    cost = listing.quantity * listing.price
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_res.scalars().first()
    if not wallet or wallet.balance < cost: raise HTTPException(400, "Insufficient funds")
    
    wallet.balance -= cost
    listing.status = OtcStatus.FILLED
    
    # target user money
    t_wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == listing.seller_id))
    t_wallet = t_wallet_res.scalars().first()
    if t_wallet: t_wallet.balance += cost
    
    # portfolio user
    port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == current_user.id).where(Portfolio.symbol == listing.symbol))
    port = port_res.scalars().first()
    if port:
        new_qty = port.quantity + listing.quantity
        port.avg_price = ((port.avg_price*port.quantity) + cost) / new_qty
        port.quantity = new_qty
    else:
        port = Portfolio(user_id=current_user.id, symbol=listing.symbol, quantity=listing.quantity, avg_price=listing.price)
        db.add(port)
    await db.commit()
    return {"status": "success", "message": "Successfully bought OTC block"}

@router.get("/ipos", response_model=List[IpoListingResponse])
async def get_ipos(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IpoListing))
    listings = res.scalars().all()
    
    # Mock data if empty
    if not listings:
        mock_ipos = [
            IpoListing(name="Neuralink Corp", symbol="NRLNK", price=1540, min_qty=10, ends_in="24:00:00", description="Brain-computer UI."),
            IpoListing(name="SpaceX Exploration", symbol="SPCX", price=3200, min_qty=5, ends_in="48:30:00", description="Space transport."),
            IpoListing(name="Stark Industries", symbol="STARK", price=8500, min_qty=1, status=IpoStatus.CLOSED, ends_in="00:00:00", description="Defense tech")
        ]
        for m in mock_ipos: db.add(m)
        await db.commit()
        res = await db.execute(select(IpoListing))
        listings = res.scalars().all()
        
    out = []
    for ipo in listings:
        bid_res = await db.execute(select(IpoBid).where(IpoBid.user_id == current_user.id).where(IpoBid.ipo_id == ipo.id))
        has_bid = bid_res.scalars().first() is not None
        out.append({
            "id": ipo.id, "name": ipo.name, "symbol": ipo.symbol, "price": ipo.price, "min_qty": ipo.min_qty, "status": ipo.status.value, "ends_in": ipo.ends_in, "description": ipo.description, "has_bid": has_bid
        })
    return out

@router.post("/ipo/{symbol}/bid")
async def bid_ipo(symbol: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(IpoListing).where(IpoListing.symbol == symbol))
    ipo = res.scalars().first()
    if not ipo: raise HTTPException(404, "IPO not found")
    if ipo.status != IpoStatus.OPEN: raise HTTPException(400, "IPO bidding is closed")
    
    bid_res = await db.execute(select(IpoBid).where(IpoBid.user_id == current_user.id).where(IpoBid.ipo_id == ipo.id))
    if bid_res.scalars().first(): raise HTTPException(400, "You already placed a bid")
    
    cost = ipo.price * ipo.min_qty
    w_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    w = w_res.scalars().first()
    if not w or w.balance < cost: raise HTTPException(400, "Insufficient funds for IPO bid")
    
    w.balance -= cost
    bid = IpoBid(user_id=current_user.id, ipo_id=ipo.id, quantity_bid=ipo.min_qty)
    db.add(bid)
    
    # We trigger a transaction for history
    tx = Transaction(user_id=current_user.id, type=TransactionType.BUY, amount=cost)
    db.add(tx)
    
    await db.commit()
    return {"status": "success", "message": "Bid locked successfully."}


# ─────────────────────────────────────────────────────────────────────────────
# OPTIONS CHAIN WITH BLACK-SCHOLES GREEKS
# ─────────────────────────────────────────────────────────────────────────────
import math

def _norm_cdf(x):
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def _norm_pdf(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)

def black_scholes_greeks(S, K, T, r, sigma, option_type="call"):
    """Returns (price, delta, gamma, theta, vega, iv(=sigma)) using BSM."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return {"price": 0, "delta": 0, "gamma": 0, "theta": 0, "vega": 0, "iv": 0}
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    gamma = _norm_pdf(d1) / (S * sigma * math.sqrt(T))
    vega  = S * _norm_pdf(d1) * math.sqrt(T) / 100  # per 1% move in IV
    if option_type == "call":
        price  = S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
        delta  = _norm_cdf(d1)
        theta  = (-S * _norm_pdf(d1) * sigma / (2 * math.sqrt(T))
                  - r * K * math.exp(-r * T) * _norm_cdf(d2)) / 365
    else:
        price  = K * math.exp(-r * T) * _norm_cdf(-d2) - S * _norm_cdf(-d1)
        delta  = _norm_cdf(d1) - 1
        theta  = (-S * _norm_pdf(d1) * sigma / (2 * math.sqrt(T))
                  + r * K * math.exp(-r * T) * _norm_cdf(-d2)) / 365
    return {
        "price": round(max(price, 0), 2),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta, 4),
        "vega":  round(vega, 4),
        "iv":    round(sigma * 100, 2)
    }

@router.get("/options/chain/{symbol}")
async def get_options_chain(symbol: str, current_user: User = Depends(get_current_user)):
    S = stock_prices.get(symbol)
    if not S:
        raise HTTPException(404, f"Symbol {symbol} not found")
    r = 0.07       # risk-free rate (RBI repo ~7%)
    T = 30 / 365   # 30-day expiry
    sigma = 0.25   # base IV ~25%
    # Adjust vol for crypto and high-beta stocks
    if "_INR" in symbol:
        sigma = 0.80
    elif symbol in ("NIFTY_50", "SENSEX", "BANKNIFTY"):
        sigma = 0.15

    # Build ATM ± 10 strikes at ~0.5% intervals
    step = round(S * 0.005, 0) or 1
    atm  = round(S / step) * step
    strikes = [round(atm + step * i, 2) for i in range(-10, 11)]

    chain = []
    for K in strikes:
        call = black_scholes_greeks(S, K, T, r, sigma, "call")
        put  = black_scholes_greeks(S, K, T, r, sigma, "put")
        moneyness = "ATM" if K == atm else ("ITM" if K < atm else "OTM")
        chain.append({
            "strike": K,
            "moneyness": moneyness,
            "call": call,
            "put":  put,
        })
    return {"symbol": symbol, "spot": S, "expiry_days": 30, "chain": chain}


# ─────────────────────────────────────────────────────────────────────────────
# PORTFOLIO RISK ANALYTICS
# ─────────────────────────────────────────────────────────────────────────────
# Static betas vs NIFTY_50 (approximate real-world betas)
ASSET_BETAS = {
    "RELIANCE": 1.05, "TCS": 0.85, "HDFCBANK": 1.1, "INFY": 0.9,
    "ICICIBANK": 1.2, "SBIN": 1.3, "BAJFINANCE": 1.4, "AXISBANK": 1.25,
    "KOTAKBANK": 1.0, "ADANIENT": 1.5, "TATAMOTORS": 1.35, "MARUTI": 0.95,
    "WIPRO": 0.8, "HCLTECH": 0.88, "NTPC": 0.75, "ONGC": 1.1,
    "BTC_INR": 2.5, "ETH_INR": 2.8, "SOL_INR": 3.2, "DOGE_INR": 3.5,
    "NIFTY_50": 1.0, "BANKNIFTY": 1.1, "SENSEX": 1.0,
}

@router.get("/portfolio/risk")
async def get_portfolio_risk(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    port_res = await db.execute(select(Portfolio).where(Portfolio.user_id == current_user.id))
    items = port_res.scalars().all()
    if not items:
        return {"portfolio_beta": 0, "var_95": 0, "sharpe": 0, "allocation": [], "total_value": 0}

    total_value = sum((stock_prices.get(i.symbol, i.avg_price) * i.quantity) for i in items)
    if total_value == 0:
        return {"portfolio_beta": 0, "var_95": 0, "sharpe": 0, "allocation": [], "total_value": 0}

    # Weighted portfolio beta
    portfolio_beta = 0.0
    allocation = []
    for item in items:
        ltp = stock_prices.get(item.symbol, item.avg_price)
        val = ltp * item.quantity
        weight = val / total_value
        beta = ASSET_BETAS.get(item.symbol, 1.0)
        portfolio_beta += weight * beta
        pnl = (ltp - item.avg_price) * item.quantity
        allocation.append({
            "symbol": item.symbol,
            "value": round(val, 2),
            "weight_pct": round(weight * 100, 2),
            "beta": beta,
            "pnl": round(pnl, 2),
        })

    # VaR (95%) using Variance-Covariance method
    # Assumes daily return std of NIFTY ~1% * beta
    daily_vol = portfolio_beta * 0.01  # ~1% market daily vol
    var_95 = total_value * daily_vol * 1.645  # z-score for 95%

    # Estimated Sharpe — using realized PnL / VaR as proxy
    total_pnl = sum(a["pnl"] for a in allocation)
    risk_free_daily = 0.07 / 365
    sharpe = (total_pnl / total_value - risk_free_daily) / (daily_vol or 0.001) if total_value else 0

    return {
        "portfolio_beta": round(portfolio_beta, 3),
        "var_95": round(var_95, 2),
        "sharpe": round(sharpe, 3),
        "total_value": round(total_value, 2),
        "allocation": sorted(allocation, key=lambda x: -x["value"])
    }


# ─────────────────────────────────────────────────────────────────────────────
# SOCIAL SENTIMENT FEED
# ─────────────────────────────────────────────────────────────────────────────
import time as _time

_sentiment_store = []   # in-memory rolling buffer

SENTIMENT_USERS = [
    "AlphaBull", "MoonWalker99", "HODL_Master", "BearHunter_X", "QuantKing",
    "DalalStreetPro", "NiftyTrader", "WallStWhale", "RetailRebel", "ZeroToHero",
    "TechBullRun", "ValueSeeker", "SwingKing99", "DeepValueFund", "MomentumX",
]

SENTIMENT_TEMPLATES = [
    ("{sym} 🚀 breaking resistance! Big move incoming.", "BULLISH"),
    ("just loaded more {sym} here. Adding to my core.", "BULLISH"),
    ("{sym} pattern looks like a cup-and-handle formation 🏆", "BULLISH"),
    ("{sym} volume surge — smart money accumulating 🐋", "BULLISH"),
    ("Sold my {sym} position today. Not worth the risk.", "BEARISH"),
    ("{sym} showing classic distribution pattern. Selling.", "BEARISH"),
    ("Shorts on {sym} paying off nicely today 📉", "BEARISH"),
    ("{sym} earnings miss imminent. Watch out bears!", "BEARISH"),
    ("{sym} just crossed the 200-DMA. Watching closely.", "NEUTRAL"),
    ("Consolidation in {sym} — sideways action for now.", "NEUTRAL"),
    ("{sym} support holding strong at key level. Neutral here.", "NEUTRAL"),
]

def _generate_sentiment_post():
    import random as _r
    sym = _r.choice(list(stock_prices.keys()))
    tpl, sent = _r.choice(SENTIMENT_TEMPLATES)
    return {
        "id": int(_time.time() * 1000) + _r.randint(0, 999),
        "user": _r.choice(SENTIMENT_USERS),
        "symbol": sym,
        "text": tpl.format(sym=sym),
        "sentiment": sent,
        "likes": _r.randint(0, 420),
        "timestamp": _time.time(),
    }

@router.get("/sentiment/feed")
async def get_sentiment_feed(current_user: User = Depends(get_current_user)):
    """Return last 30 sentiment posts, generating if empty."""
    import random as _r
    if len(_sentiment_store) < 15:
        for _ in range(20):
            _sentiment_store.append(_generate_sentiment_post())
        _sentiment_store.sort(key=lambda x: -x["timestamp"])
    return _sentiment_store[-30:]

@router.get("/sentiment/trending")
async def get_trending_sentiment(current_user: User = Depends(get_current_user)):
    """Return top mentioned symbols with bull/bear scores from recent posts."""
    from collections import Counter, defaultdict
    import random as _r
    if len(_sentiment_store) < 5:
        for _ in range(15):
            _sentiment_store.append(_generate_sentiment_post())

    counts = Counter(p["symbol"] for p in _sentiment_store)
    bull_counts = defaultdict(int)
    bear_counts = defaultdict(int)
    for p in _sentiment_store:
        if p["sentiment"] == "BULLISH": bull_counts[p["symbol"]] += 1
        elif p["sentiment"] == "BEARISH": bear_counts[p["symbol"]] += 1

    trending = []
    for sym, cnt in counts.most_common(10):
        total = bull_counts[sym] + bear_counts[sym] + 1
        trending.append({
            "symbol": sym,
            "mentions": cnt,
            "bull_pct": round(bull_counts[sym] / total * 100),
            "bear_pct": round(bear_counts[sym] / total * 100),
            "price": stock_prices.get(sym, 0),
        })
    return trending


# ─────────────────────────────────────────────────────────────────────────────
# BRACKET ORDER PATCH (modify SL/TP on live order)  
# ─────────────────────────────────────────────────────────────────────────────
from pydantic import BaseModel as _BM

class BracketUpdate(_BM):
    stop_loss_price: float | None = None
    take_profit_price: float | None = None

@router.patch("/order/{order_id}/brackets")
async def update_brackets(
    order_id: int,
    body: BracketUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Order).where(Order.id == order_id).where(Order.user_id == current_user.id))
    order = res.scalars().first()
    if not order:
        raise HTTPException(404, "Order not found")
    if body.stop_loss_price is not None:
        order.stop_loss_price = body.stop_loss_price
    if body.take_profit_price is not None:
        order.take_profit_price = body.take_profit_price
    await db.commit()
    return {"status": "success", "message": "Brackets updated"}

# ─────────────────────────────────────────────────────────────────────────────
# AI PATTERN DISCOVERY (Autocharting Engine)  
# ─────────────────────────────────────────────────────────────────────────────

def _detect_patterns(candles: List[dict]):
    """
    Mock pattern recognition. In a real system, this would use ML models or 
    geometric algorithms on historical data.
    """
    if not candles or len(candles) < 20: return []
    
    # We simulate pattern detection based on some 'features' or randomly
    # to demonstrate the frontend visualization.
    patterns = []
    symbol_seed = candles[-1].get("close", 100)
    
    # Head & Shoulders (Look for 3 peaks, middle one highest)
    if symbol_seed % 3 < 1:
        patterns.append({
            "type": "Head & Shoulders",
            "sentiment": "BEARISH",
            "confidence": 88,
            "points": [
                {"x": 10, "y": symbol_seed * 1.02}, 
                {"x": 20, "y": symbol_seed * 1.05}, 
                {"x": 30, "y": symbol_seed * 1.02}
            ],
            "desc": "Head & Shoulders reversal detected."
        })
    
    # Double Top / Double Bottom
    if symbol_seed % 2 < 1:
        patterns.append({
            "type": "Double Top" if symbol_seed % 4 < 2 else "Double Bottom",
            "sentiment": "BEARISH" if symbol_seed % 4 < 2 else "BULLISH",
            "confidence": 75,
            "points": [
                {"x": 15, "y": symbol_seed * 1.1}, 
                {"x": 25, "y": symbol_seed * 1.1}
            ],
            "desc": "Testing major resistance/support level."
        })
        
    # Falling Wedge / Bull Flag
    if symbol_seed % 5 < 2:
        patterns.append({
            "type": "Wedge",
            "sentiment": "BULLISH",
            "confidence": 91,
            "points": [
                {"x": 5, "y": symbol_seed * 0.95}, 
                {"x": 15, "y": symbol_seed * 1.01}, 
                {"x": 25, "y": symbol_seed * 0.98}
            ],
            "desc": "Bullish consolidation pattern."
        })

    # Falling Wedge (or Bull Flag)
    if not patterns and symbol_seed % 3 < 1:
        patterns.append({
            "type": "Bull Flag",
            "sentiment": "BULLISH",
            "confidence": 92,
            "points": [
                {"x": 5, "y": symbol_seed * 0.9}, 
                {"x": 15, "y": symbol_seed * 1.05}, 
                {"x": 25, "y": symbol_seed * 1.03}
            ],
            "desc": "Strong momentum followed by brief consolidation."
        })

    return patterns

@router.get("/patterns/{symbol}")
async def get_stock_patterns(symbol: str, tf: str = "1m"):
    from app.websockets import candle_store
    
    symbol = symbol.upper()
    candles_deque = candle_store.get(symbol, {}).get(tf, [])
    candles = list(candles_deque)
    
    if not candles:
        return {"symbol": symbol, "patterns": []}
        
    found = _detect_patterns(candles)
    return {"symbol": symbol, "patterns": found}

@router.get("/brokers", response_model=List[BrokerAccountResponse])
async def get_brokers(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BrokerAccount).where(BrokerAccount.user_id == current_user.id))
    return res.scalars().all()

@router.post("/brokers/connect")
async def connect_broker(account: BrokerAccountCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # In a real app, validate credentials with the broker first
    new_account = BrokerAccount(
        user_id=current_user.id,
        broker_name=account.broker_name.upper(),
        api_key=account.api_key,
        api_secret=account.api_secret,
        is_live=account.is_live
    )
    db.add(new_account)
    await db.commit()
    return {"status": "success", "message": f"Connected to {account.broker_name} successfully"}

@router.post("/auth/2fa/verify")
async def verify_2fa(code: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Mock validation - in real app use pyotp.TOTP(current_user.two_factor_secret).verify(code)
    if code == "123456":
        current_user.two_factor_enabled = True
        await db.commit()
        return {"status": "success", "message": "2FA verified and enabled"}
    raise HTTPException(400, "Invalid 2FA code")
@router.get("/psychology/bias")
async def get_bias_score(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Calculate real bias based on recent trade history
    res = await db.execute(
        select(Order).where(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc()).limit(10)
    )
    recent_orders = res.scalars().all()
    
    # Simple logic: detect revenge trading if loss streak > 2 and frequency is high
    losses = [o for o in recent_orders if o.status == 'CANCELLED'] # Mocking losses as cancelled for now
    win_rate = 1.0 - (len(losses) / 10 if recent_orders else 0)
    
    # Bias Score: 0 (Panicked) to 1.0 (Confident)
    bias_score = max(0.2, min(0.9, win_rate + (0.1 if len(recent_orders) < 3 else -0.1)))
    last_order_ts = recent_orders[0].created_at if recent_orders else datetime.datetime.utcnow()
    tilt = len(losses) >= 3 and (datetime.datetime.utcnow() - last_order_ts).total_seconds() < 300
    
    return {
        "score": round(bias_score, 2),
        "tilt_detected": tilt,
        "recommendation": "TAKE A BREATH" if tilt else "FOCUSED",
        "recent_activity": len(recent_orders)
    }

# --- Background PnL & Achievement Watcher ----------------------------------
async def pnl_watcher_loop():
    while True:
        try:
            async with AsyncSessionLocal() as db:
                # Update PnL for all portfolios
                for symbol, price in stock_prices.items():
                    res = await db.execute(update(Portfolio).where(Portfolio.symbol == symbol).values())
                    # This needs a more nuanced approach for multi-user, but we loop over portfolios
                
                # Broadly calculate PnL per user and broadcast
                res = await db.execute(select(User))
                users = res.scalars().all()
                for user in users:
                    pres = await db.execute(select(Portfolio).where(Portfolio.user_id == user.id))
                    positions = pres.scalars().all()
                    
                    total_unrealized_pnl = 0.0
                    for pos in positions:
                        curr_price = stock_prices.get(pos.symbol, pos.average_price)
                        pos_pnl = (curr_price - pos.average_price) * pos.quantity
                        total_unrealized_pnl += pos_pnl
                    
                    await manager.send_personal_message({
                        "type": "pnl_update",
                        "unrealized_pnl": round(total_unrealized_pnl, 2),
                        "positions": [{ "symbol": p.symbol, "qty": p.quantity, "pnl": round((stock_prices.get(p.symbol, p.average_price) - p.average_price) * p.quantity, 2) } for p in positions]
                    }, user.email)
                    
        except Exception as e:
            print(f"PnL Watcher Error: {e}")
        await asyncio.sleep(2.0)

# Binary Greeks Utility (Black-Scholes Approximation)
def calculate_greeks(symbol: str, strike: float, days_to_expiry: int):
    price = stock_prices.get(symbol, strike)
    t = days_to_expiry / 365.0
    # Very simplified greeks for demo realism
    vol = 0.3 # 30% IV
    d1 = (math.log(price / strike) + (0.05 + 0.5 * vol**2) * t) / (vol * math.sqrt(t)) if t > 0 else 0
    delta = 0.5 + 0.5 * math.tanh(d1) # Mock N(d1)
    gamma = 0.1 / (price * vol * math.sqrt(t)) if t > 0 else 0
    return {"delta": round(delta, 3), "gamma": round(gamma, 4), "iv": vol}
