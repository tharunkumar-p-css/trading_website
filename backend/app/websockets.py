import asyncio
import json
import random
import time as _time
from datetime import datetime
from collections import defaultdict, deque
from typing import Dict, List, Set, Optional
from fastapi import WebSocket, APIRouter, WebSocketDisconnect

# Store real-time state
stock_prices: Dict[str, float] = {}
stock_order_books: Dict[str, Dict] = {} # { "symbol": { "bids": [], "asks": [] } }
stock_trends: Dict[str, float] = {}

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def authenticate(self, websocket: WebSocket, email: str):
        self.user_connections[email] = websocket

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        user_to_remove = None
        for email, ws in self.user_connections.items():
            if ws == websocket:
                user_to_remove = email
                break
        if user_to_remove:
            del self.user_connections[user_to_remove]

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except:
                self.disconnect(connection)

    async def send_personal_message(self, message: dict, email: str):
        if email in self.user_connections:
            try:
                await self.user_connections[email].send_json(message)
            except:
                self.disconnect(self.user_connections[email])

manager = ConnectionManager()

# --- Mock Market Config ----------------------------------------------------
initial_stocks = {
    "NIFTY_50": 22000.0, "BANKNIFTY": 46000.0, "RELIANCE": 2500.0, "TCS": 3500.0,
    "HDFCBANK": 1500.0, "INFY": 1400.0, "AAPL": 175.0, "BTC_INR": 5500000.0,
    "ETH_INR": 250000.0, "ZOMATO": 280.0, "TATASTEEL": 150.0, "NVDA": 850.0
}
# Add more common ones
for s in ["ICICIBANK", "ITC", "SBIN", "MSFT", "GOOGL", "TSLA", "SOL_INR", "DOGE_INR"]:
    if s not in initial_stocks: initial_stocks[s] = 1000.0 + random.random() * 500

stock_prices = initial_stocks.copy()
stock_trends = {sym: 0.0 for sym in initial_stocks}

TF_SECONDS = {"5s": 5, "15s": 15, "1m": 60, "5m": 300, "15m": 900, "1h": 3600}
MAX_CANDLES = 300
candle_store: Dict[str, Dict[str, deque]] = defaultdict(lambda: {tf: deque(maxlen=MAX_CANDLES) for tf in TF_SECONDS})
open_buckets: Dict[str, Dict[str, dict]] = defaultdict(dict)

def _aggregate_candle(symbol: str, price: float, volume: int, ts: float):
    for tf, secs in TF_SECONDS.items():
        bucket_ts = int(ts // secs) * secs
        bucket = open_buckets[symbol].get(tf)
        if bucket is None or bucket["time"] != bucket_ts:
            if bucket:
                candle_store[symbol][tf].append(bucket)
            open_buckets[symbol][tf] = {
                "time": bucket_ts,
                "open": price, "high": price, "low": price, "close": price,
                "volume": volume
            }
        else:
            bucket["high"] = max(bucket["high"], price)
            bucket["low"] = min(bucket["low"], price)
            bucket["close"] = price
            bucket["volume"] += volume

def generate_order_book(symbol: str, price: float):
    """Generates a realistic order book with 'Institutional Walls'."""
    bids, asks = [], []
    for i in range(1, 15):
        is_wall = (i % 5 == 0)
        bid_qty = random.randint(10, 500) * (6 if is_wall else 1)
        ask_qty = random.randint(10, 500) * (6 if is_wall else 1)
        bids.append({"price": round(price - i * 0.5, 2), "qty": bid_qty, "is_wall": is_wall})
        asks.append({"price": round(price + i * 0.5, 2), "qty": ask_qty, "is_wall": is_wall})
    stock_order_books[symbol] = {"bids": bids, "asks": asks}

# --- Background Loops ------------------------------------------------------
async def generate_mock_prices():
    while True:
        ts = _time.time()
        updates = {}
        candles_packet = {}
        
        for symbol in list(stock_prices.keys()):
            base = stock_prices[symbol]
            # Random walk with momentum
            stock_trends[symbol] = stock_trends[symbol] * 0.85 + random.gauss(0, 0.0004)
            vol = 0.0015 if 'INR' in symbol else 0.0008
            drift = stock_trends[symbol] + random.gauss(0, vol)
            
            new_price = round(base * (1 + drift), 2)
            if new_price <= 0: new_price = 0.01
            
            high = round(max(base, new_price) * (1 + random.random() * 0.001), 2)
            low = round(min(base, new_price) * (1 - random.random() * 0.001), 2)
            volume = random.randint(5, 2000)
            
            stock_prices[symbol] = new_price
            updates[symbol] = new_price
            
            # Update DOM
            generate_order_book(symbol, new_price)
            
            _aggregate_candle(symbol, new_price, volume, ts)
            candles_packet[symbol] = {
                "open": base, "high": high, "low": low, "close": new_price, 
                "price": new_price, "volume": volume,
                "book": stock_order_books[symbol]
            }

        # Broadcast everything
        await manager.broadcast({
            "type": "stock_price_update", 
            "data": updates, 
            "candles": candles_packet
        })
        
        # Occasional random news / sentiment
        if random.random() < 0.03:
            await _broadcast_random_sentiment()

        await asyncio.sleep(1.0)

async def _broadcast_random_sentiment():
    users = ["AlphaBull", "QuantWhale", "MarketNinja", "ChartWizard", "DeepValue"]
    sym = random.choice(list(stock_prices.keys()))
    sentiments = ["BULLISH", "BEARISH", "NEUTRAL"]
    s = random.choice(sentiments)
    post = {
        "id": int(_time.time() * 1000),
        "user": random.choice(users),
        "symbol": sym,
        "text": f"Analyzing {sym} structure. Looking {s.lower()} here. \ud83d\udcc8",
        "sentiment": s,
        "likes": random.randint(10, 500),
        "timestamp": _time.time()
    }
    await manager.broadcast({"type": "sentiment_post", "data": post})

# --- Routes ----------------------------------------------------------------
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "authenticate":
                email = msg.get("email")
                if email:
                    manager.authenticate(websocket, email)
                    await manager.send_personal_message({"type": "auth_success"}, email)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@router.get("/stocks/current")
async def get_current_stocks():
    return stock_prices

@router.get("/stocks/candles/{symbol}")
async def get_candles(symbol: str, tf: str = "5s"):
    symbol = symbol.upper()
    if tf not in TF_SECONDS: tf = "5s"
    store = list(candle_store[symbol][tf])
    ob = open_buckets.get(symbol, {}).get(tf)
    if ob: store = store + [ob]
    return {"symbol": symbol, "tf": tf, "candles": store[-MAX_CANDLES:]}
