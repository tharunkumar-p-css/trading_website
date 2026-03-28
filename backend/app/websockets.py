import asyncio
import json
import random
import time as _time
from collections import defaultdict, deque
from typing import Dict, List
from fastapi import WebSocket, APIRouter, WebSocketDisconnect

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, token: str = None):
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

# Mock Stock Prices
initial_stocks = {
    # Indices
    "NIFTY_50": 22000.0, "BANKNIFTY": 46000.0, "SENSEX": 73000.0, "FINNIFTY": 21000.0, "MIDCPNIFTY": 10500.0,

    # Large Cap
    "RELIANCE": 2500.0, "TCS": 3500.0, "HDFCBANK": 1500.0, "INFY": 1400.0, "ICICIBANK": 900.0,
    "BHARTIARTL": 1100.0, "ITC": 400.0, "LT": 3200.0, "SBIN": 600.0, "BAJFINANCE": 7000.0,
    "ASIANPAINT": 3100.0, "MARUTI": 10500.0, "TITAN": 3600.0, "ZOMATO": 280.0, "HINDUNILVR": 2400.0,
    "KOTAKBANK": 1800.0, "AXISBANK": 1050.0, "SUNPHARMA": 1400.0, "NTPC": 310.0, "ONGC": 260.0,
    "POWERGRID": 270.0, "TATASTEEL": 150.0, "HCLTECH": 1600.0, "WIPRO": 500.0, "BAJAJFINSV": 1600.0,
    "NESTLEIND": 2500.0, "M&M": 1900.0, "ADANIENT": 3200.0, "ADANIPORTS": 1300.0, "DRREDDY": 6000.0,

    # Mid Cap
    "TRENT": 3900.0, "TATAPOWER": 380.0, "PNB": 125.0, "IDFCFIRSTB": 85.0, "YESBANK": 25.0,
    "IRCTC": 900.0, "RVNL": 260.0, "SUZLON": 40.0, "PAYTM": 160.0, "JIOFIN": 350.0,
    "HDFCAMC": 3100.0, "BHEL": 250.0, "NHPC": 90.0, "IRFC": 140.0, "IREDA": 160.0,
    "PFC": 400.0, "RECLTD": 450.0, "LODHA": 1100.0, "NYKAA": 160.0, "POLICYBZR": 1200.0,
    "MOTHERSON": 120.0, "BEL": 200.0, "HAL": 3100.0, "TVSMOTOR": 2100.0, "VOLTAS": 1400.0,
    "GODREJCP": 1200.0, "DIXON": 6500.0, "ASTRAL": 1900.0, "ESCORTS": 2800.0, "PIIND": 3500.0,

    # Small Cap
    "IEX": 150.0, "ZENTEC": 850.0, "CDSL": 1800.0, "RENUKA": 45.0, "JPPOWER": 15.0,
    "IDEA": 13.0, "SOUTHBANK": 30.0, "RPOWER": 25.0, "HCC": 35.0, "GMRINFRA": 85.0,
    "NBCC": 120.0, "EASEMYTRIP": 45.0, "UCOBANK": 55.0, "MAHABANK": 60.0, "CENTRALBK": 65.0,
    "IOB": 70.0, "HUDCO": 200.0, "RAILTEL": 400.0, "SJVN": 130.0, "NMDC": 220.0,
    "NATIONALUM": 160.0, "SAIL": 140.0, "RITES": 650.0, "JUBLFOOD": 450.0, "KALYANKJIL": 400.0,
    "BATAINDIA": 1400.0, "RADICO": 1700.0, "OLECTRA": 1800.0, "DATAATTNS": 2200.0, "CAMS": 2900.0,

    # Mutual Funds
    "PARAGPARIKH": 65.5, "QUANTUM": 110.2, "SBISMALL": 150.3, "MIRAEASSET": 80.4, "HDFCMIDCAP": 125.6,
    "NIPPONIND": 95.8, "AXISBLUECHIP": 55.4, "SBIBLUECHIP": 75.2, "ICICIPRU": 300.5, "MOTILALOSWAL": 450.0,
    "KOTAKSMALL": 120.8, "UTINIFTY": 90.1, "DSPMIDCAP": 85.3, "FRANKLININD": 115.6, "TATAELSS": 45.4,
    "ABSLFRONTLINE": 210.5, "PGIMINDIA": 65.4, "CANARAROB": 145.2, "SUNDARAM": 88.9, "EDELWEISS": 132.5,
    "INVESCO": 78.4, "BANDHAN": 56.7, "SAMCO": 44.2, "QUANT": 190.5, "NAVISMALL": 62.3,
    "HSBC": 112.4, "BARODA": 84.6, "MAHINDRA": 48.9, "UNION": 36.5, "TAURUS": 25.8,
    "NJ": 14.5, "WHITEFR": 22.8, "BANKOFI": 33.4, "ITI": 18.9, "SHRIRAM": 29.5,

    # Global
    "AAPL": 175.0, "MSFT": 400.0, "GOOGL": 140.0, "AMZN": 150.0, "TSLA": 200.0, "NVDA": 850.0,
    "META": 450.0, "NFLX": 600.0, "JPM": 190.0, "V": 280.0, "DIS": 110.0, "AMD": 180.0,
    "INTC": 45.0, "BABA": 75.0, "NKE": 95.0, "SBUX": 90.0, "MCD": 280.0, "PEP": 170.0,

    # Crypto
    "BTC_INR": 5500000.0, "ETH_INR": 250000.0, "SOL_INR": 11000.0, "DOGE_INR": 12.5, "PEPE_INR": 0.05,
    "ADA_INR": 45.20, "DOT_INR": 620.50, "XRP_INR": 52.10, "LINK_INR": 1450.0, "MATIC_INR": 75.30,
    "SHIB_INR": 0.002, "AVAX_INR": 3200.0, "UNI_INR": 650.0, "LTC_INR": 6800.0, "BCH_INR": 35000.0,
    "ATOM_INR": 750.0, "ALGO_INR": 16.5, "XLM_INR": 9.2, "VET_INR": 3.4, "ICP_INR": 1150.0,
    "FIL_INR": 450.0, "THETA_INR": 125.0, "AAVE_INR": 8200.0, "EOS_INR": 62.0, "XTZ_INR": 85.0,
    "MKR_INR": 220000.0, "AXS_INR": 550.0, "SAND_INR": 42.0, "MANA_INR": 38.0, "GALA_INR": 2.5,
    "ENJ_INR": 28.0, "CHZ_INR": 9.5, "QNT_INR": 8500.0, "NEAR_INR": 420.0, "FTM_INR": 35.0, "GRT_INR": 14.5
}

stock_prices = initial_stocks.copy()
stock_trends = {sym: 0.0 for sym in initial_stocks}

# ─── Multi-Timeframe Candle Aggregation ────────────────────────────────────
# Timeframe in seconds → max candles to keep in memory
TF_SECONDS = {
    "5s": 5, "15s": 15, "1m": 60, "5m": 300, "15m": 900, "1h": 3600
}
MAX_CANDLES = 300   # keep last 300 candles per TF per symbol

# candle_store[symbol][tf] = deque of {open, high, low, close, volume, time}
candle_store: Dict[str, Dict[str, deque]] = defaultdict(lambda: {tf: deque(maxlen=MAX_CANDLES) for tf in TF_SECONDS})
# current open candle bucket per (symbol, tf)
open_buckets: Dict[str, Dict[str, dict]] = defaultdict(dict)

def _aggregate_candle(symbol: str, price: float, volume: int, ts: float):
    for tf, secs in TF_SECONDS.items():
        bucket_ts = int(ts // secs) * secs
        bucket = open_buckets[symbol].get(tf)
        if bucket is None or bucket["time"] != bucket_ts:
            # close the old bucket
            if bucket:
                candle_store[symbol][tf].append(bucket)
            # open new bucket
            open_buckets[symbol][tf] = {
                "time": bucket_ts,
                "open": price, "high": price, "low": price, "close": price,
                "volume": volume
            }
        else:
            bucket["high"]   = max(bucket["high"], price)
            bucket["low"]    = min(bucket["low"], price)
            bucket["close"]  = price
            bucket["volume"] += volume

# ─── Trade Tape ────────────────────────────────────────────────────────────
trade_tape: deque = deque(maxlen=200)

async def broadcast_trade_tape(symbol: str, side: str, qty: int, price: float):
    event = {
        "type": "trade_tape",
        "data": {
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "price": price,
            "ts": _time.time()
        }
    }
    trade_tape.append(event["data"])
    await manager.broadcast(event)

# ─── Sentiment broadcast helpers ──────────────────────────────────────────
_SENT_USERS = [
    "AlphaBull", "MoonWalker99", "HODL_Master", "BearHunter_X", "QuantKing",
    "DalalStreetPro", "NiftyTrader", "WallStWhale", "RetailRebel", "ZeroToHero",
    "TechBullRun", "ValueSeeker", "SwingKing99", "DeepValueFund", "MomentumX",
]
_SENT_TEMPLATES = [
    ("{sym} 🚀 breaking resistance! Big move incoming.", "BULLISH"),
    ("just loaded more {sym} here. Adding to my core.", "BULLISH"),
    ("{sym} cup-and-handle formation confirmed 🏆", "BULLISH"),
    ("{sym} volume surge — smart money accumulating 🐋", "BULLISH"),
    ("Sold my {sym} today. Not worth the risk.", "BEARISH"),
    ("{sym} showing classic distribution. Selling.", "BEARISH"),
    ("Shorts on {sym} paying off nicely today 📉", "BEARISH"),
    ("{sym} earnings miss imminent. Bears alert!", "BEARISH"),
    ("{sym} just crossed the 200-DMA. Watching closely.", "NEUTRAL"),
    ("Consolidation in {sym} — sideways action for now.", "NEUTRAL"),
]

async def generate_mock_prices():
    while True:
        ts = _time.time()
        updates = {}
        candles = {}
        for symbol in stock_prices:
            base = stock_prices[symbol]
            stock_trends[symbol] = stock_trends[symbol] * 0.9 + random.gauss(0, 0.0005)
            vol_base = 0.002 if 'INR' in symbol else (0.0005 if 'NIFTY' in symbol else 0.001)
            drift = stock_trends[symbol] + random.gauss(0, vol_base)
            new_price = round(base * (1 + drift), 2)
            if new_price <= 0: new_price = 0.01
            intra_1 = base * (1 + random.gauss(0, vol_base * 0.5))
            intra_2 = new_price * (1 + random.gauss(0, vol_base * 0.5))
            high = round(max(base, new_price, intra_1, intra_2), 2)
            low  = round(min(base, new_price, intra_1, intra_2), 2)
            vol  = random.randint(10, 5000)
            stock_prices[symbol] = new_price
            updates[symbol] = new_price
            candles[symbol] = {"open": base, "close": new_price, "high": high, "low": low, "price": new_price, "volume": vol}
            _aggregate_candle(symbol, new_price, vol, ts)

            # Occasional simulated trade tape entry
            if random.random() < 0.02:
                side = random.choice(["BUY", "SELL"])
                qty  = random.randint(1, 50)
                trade_tape.append({"symbol": symbol, "side": side, "qty": qty, "price": new_price, "ts": ts})

        await manager.broadcast({"type": "stock_price_update", "data": updates, "candles": candles})

        # Broadcast trade tape batch every tick
        if trade_tape:
            recent = [t for t in list(trade_tape)[-5:]]
            await manager.broadcast({"type": "trade_tape_batch", "data": recent})

        # Occasional news broadcast
        if random.random() < 0.05:
            target_symbol = random.choice(list(stock_prices.keys()))
            sentiment = random.choice(["Bullish", "Bearish", "Neutral"])
            templates = [
                f"Breaking: {target_symbol} shows unusual trading volume.",
                f"Market Watch: {target_symbol} upgraded following earnings expectations.",
                f"Caution: Regulatory scrutiny hits {target_symbol} sector.",
                f"Rumors swirl around {target_symbol} acquisition.",
                f"{target_symbol} secures major government contract.",
                f"Insiders buying up shares of {target_symbol}.",
            ]
            headline = f"[{sentiment}] " + random.choice(templates)
            if sentiment == "Bullish":
                stock_prices[target_symbol] = round(stock_prices[target_symbol] * 1.05, 2)
            elif sentiment == "Bearish":
                stock_prices[target_symbol] = round(stock_prices[target_symbol] * 0.95, 2)
            await manager.broadcast({"type": "news_update", "data": {"symbol": target_symbol, "headline": headline, "sentiment": sentiment}})

        # Sentiment post every ~8 seconds
        if int(ts) % 8 == 0 and random.random() < 0.6:
            sym = random.choice(list(stock_prices.keys()))
            tpl, sent = random.choice(_SENT_TEMPLATES)
            post = {
                "id": int(ts * 1000) + random.randint(0, 999),
                "user": random.choice(_SENT_USERS),
                "symbol": sym,
                "text": tpl.format(sym=sym),
                "sentiment": sent,
                "likes": random.randint(0, 420),
                "timestamp": ts,
            }
            await manager.broadcast({"type": "sentiment_post", "data": post})

        await asyncio.sleep(1.0)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message.get("type") == "authenticate":
                email = message.get("email")
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
    """Return aggregated OHLCV candles for the given symbol and timeframe."""
    if tf not in TF_SECONDS:
        tf = "5s"
    store = list(candle_store[symbol][tf])
    # Also append the current open bucket if it exists
    ob = open_buckets.get(symbol, {}).get(tf)
    if ob:
        store = store + [ob]
    return {"symbol": symbol, "tf": tf, "candles": store[-MAX_CANDLES:]}

@router.get("/trade_tape")
async def get_trade_tape():
    return list(trade_tape)[-100:]


router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, token: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        # In a real app we'd decode token to get email here
        # For simplicity, we just store it by email if provided in authenticate message later
        
    def authenticate(self, websocket: WebSocket, email: str):
        self.user_connections[email] = websocket

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        # Find and remove from user connections
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

# Mock Stock Prices
initial_stocks = {
    # Indices
    "NIFTY_50": 22000.0, "BANKNIFTY": 46000.0, "SENSEX": 73000.0, "FINNIFTY": 21000.0, "MIDCPNIFTY": 10500.0,
    
    # Large Cap
    "RELIANCE": 2500.0, "TCS": 3500.0, "HDFCBANK": 1500.0, "INFY": 1400.0, "ICICIBANK": 900.0,
    "BHARTIARTL": 1100.0, "ITC": 400.0, "LT": 3200.0, "SBIN": 600.0, "BAJFINANCE": 7000.0,
    "ASIANPAINT": 3100.0, "MARUTI": 10500.0, "TITAN": 3600.0, "ZOMATO": 280.0, "HINDUNILVR": 2400.0,
    "KOTAKBANK": 1800.0, "AXISBANK": 1050.0, "SUNPHARMA": 1400.0, "NTPC": 310.0, "ONGC": 260.0,
    "POWERGRID": 270.0, "TATASTEEL": 150.0, "HCLTECH": 1600.0, "WIPRO": 500.0, "BAJAJFINSV": 1600.0,
    "NESTLEIND": 2500.0, "M&M": 1900.0, "ADANIENT": 3200.0, "ADANIPORTS": 1300.0, "DRREDDY": 6000.0,
    
    # Mid Cap
    "TRENT": 3900.0, "TATAPOWER": 380.0, "PNB": 125.0, "IDFCFIRSTB": 85.0, "YESBANK": 25.0,
    "IRCTC": 900.0, "RVNL": 260.0, "SUZLON": 40.0, "PAYTM": 160.0, "JIOFIN": 350.0,
    "HDFCAMC": 3100.0, "BHEL": 250.0, "NHPC": 90.0, "IRFC": 140.0, "IREDA": 160.0,
    "PFC": 400.0, "RECLTD": 450.0, "LODHA": 1100.0, "NYKAA": 160.0, "POLICYBZR": 1200.0,
    "MOTHERSON": 120.0, "BEL": 200.0, "HAL": 3100.0, "TVSMOTOR": 2100.0, "VOLTAS": 1400.0,
    "GODREJCP": 1200.0, "DIXON": 6500.0, "ASTRAL": 1900.0, "ESCORTS": 2800.0, "PIIND": 3500.0,
    
    # Small Cap
    "IEX": 150.0, "ZENTEC": 850.0, "CDSL": 1800.0, "RENUKA": 45.0, "JPPOWER": 15.0,
    "IDEA": 13.0, "SOUTHBANK": 30.0, "RPOWER": 25.0, "HCC": 35.0, "GMRINFRA": 85.0,
    "NBCC": 120.0, "EASEMYTRIP": 45.0, "UCOBANK": 55.0, "MAHABANK": 60.0, "CENTRALBK": 65.0,
    "IOB": 70.0, "HUDCO": 200.0, "RAILTEL": 400.0, "SJVN": 130.0, "NMDC": 220.0,
    "NATIONALUM": 160.0, "SAIL": 140.0, "RITES": 650.0, "JUBLFOOD": 450.0, "KALYANKJIL": 400.0,
    "BATAINDIA": 1400.0, "RADICO": 1700.0, "OLECTRA": 1800.0, "DATAATTNS": 2200.0, "CAMS": 2900.0,

    # Mutual Funds
    "PARAGPARIKH": 65.5, "QUANTUM": 110.2, "SBISMALL": 150.3, "MIRAEASSET": 80.4, "HDFCMIDCAP": 125.6,
    "NIPPONIND": 95.8, "AXISBLUECHIP": 55.4, "SBIBLUECHIP": 75.2, "ICICIPRU": 300.5, "MOTILALOSWAL": 450.0,
    "KOTAKSMALL": 120.8, "UTINIFTY": 90.1, "DSPMIDCAP": 85.3, "FRANKLININD": 115.6, "TATAELSS": 45.4,
    "ABSLFRONTLINE": 210.5, "PGIMINDIA": 65.4, "CANARAROB": 145.2, "SUNDARAM": 88.9, "EDELWEISS": 132.5,
    "INVESCO": 78.4, "BANDHAN": 56.7, "SAMCO": 44.2, "QUANT": 190.5, "NAVISMALL": 62.3,
    "HSBC": 112.4, "BARODA": 84.6, "MAHINDRA": 48.9, "UNION": 36.5, "TAURUS": 25.8,
    "NJ": 14.5, "WHITEFR": 22.8, "BANKOFI": 33.4, "ITI": 18.9, "SHRIRAM": 29.5,

    # Global
    "AAPL": 175.0, "MSFT": 400.0, "GOOGL": 140.0, "AMZN": 150.0, "TSLA": 200.0, "NVDA": 850.0,
    "META": 450.0, "NFLX": 600.0, "JPM": 190.0, "V": 280.0, "DIS": 110.0, "AMD": 180.0,
    "INTC": 45.0, "BABA": 75.0, "NKE": 95.0, "SBUX": 90.0, "MCD": 280.0, "PEP": 170.0,
    
    # Crypto
    "BTC_INR": 5500000.0, "ETH_INR": 250000.0, "SOL_INR": 11000.0, "DOGE_INR": 12.5, "PEPE_INR": 0.05,
    "ADA_INR": 45.20, "DOT_INR": 620.50, "XRP_INR": 52.10, "LINK_INR": 1450.0, "MATIC_INR": 75.30,
    "SHIB_INR": 0.002, "AVAX_INR": 3200.0, "UNI_INR": 650.0, "LTC_INR": 6800.0, "BCH_INR": 35000.0,
    "ATOM_INR": 750.0, "ALGO_INR": 16.5, "XLM_INR": 9.2, "VET_INR": 3.4, "ICP_INR": 1150.0,
    "FIL_INR": 450.0, "THETA_INR": 125.0, "AAVE_INR": 8200.0, "EOS_INR": 62.0, "XTZ_INR": 85.0,
    "MKR_INR": 220000.0, "AXS_INR": 550.0, "SAND_INR": 42.0, "MANA_INR": 38.0, "GALA_INR": 2.5,
    "ENJ_INR": 28.0, "CHZ_INR": 9.5, "QNT_INR": 8500.0, "NEAR_INR": 420.0, "FTM_INR": 35.0, "GRT_INR": 14.5
}
import random
stock_prices = initial_stocks.copy()
stock_trends = {sym: 0.0 for sym in initial_stocks}

async def generate_mock_prices():
    while True:
        updates = {}
        candles = {}
        for symbol in stock_prices:
            base = stock_prices[symbol]
            
            # Geometric Brownian Motion with Mean-Reverting Momentum
            # The trend slowly drifts back to 0 so stocks don't crash to 0 or hit infinity
            stock_trends[symbol] = stock_trends[symbol] * 0.9 + random.gauss(0, 0.0005)
            
            # Higher base volatility for Crypto, lower for indices / mega caps
            vol_base = 0.002 if 'INR' in symbol else (0.0005 if 'NIFTY' in symbol else 0.001)
            
            drift = stock_trends[symbol] + random.gauss(0, vol_base)
            new_price = round(base * (1 + drift), 2)
            if new_price <= 0: new_price = 0.01
            
            # Simulate intra-second wicks securely above/below the close
            intra_1 = base * (1 + random.gauss(0, vol_base * 0.5))
            intra_2 = new_price * (1 + random.gauss(0, vol_base * 0.5))
            
            high = round(max(base, new_price, intra_1, intra_2), 2)
            low = round(min(base, new_price, intra_1, intra_2), 2)
            
            stock_prices[symbol] = new_price
            updates[symbol] = new_price
            candles[symbol] = {
                "open": base,
                "close": new_price,
                "high": high,
                "low": low,
                "price": new_price,
                "volume": random.randint(10, 5000)
            }
        
        await manager.broadcast({
            "type": "stock_price_update",
            "data": updates,
            "candles": candles
        })
        
        # Occasional news broadcast
        if random.random() < 0.05:  # ~every 20 seconds
            target_symbol = random.choice(list(stock_prices.keys()))
            sentiment = random.choice(["Bullish", "Bearish", "Neutral"])
            templates = [
                f"Breaking: {target_symbol} shows unusual trading volume.",
                f"Market Watch: {target_symbol} upgraded following earnings expectations.",
                f"Caution: Regulatory scrutiny hits {target_symbol} sector.",
                f"Rumors swirl around {target_symbol} acquisition.",
                f"{target_symbol} secures major government contract.",
                f"Insiders buying up shares of {target_symbol}."
            ]
            headline = f"[{sentiment}] " + random.choice(templates)
            
            # Add synthetic price swing correlating to sentiment
            if sentiment == "Bullish":
                stock_prices[target_symbol] = round(stock_prices[target_symbol] * 1.05, 2)
            elif sentiment == "Bearish":
                stock_prices[target_symbol] = round(stock_prices[target_symbol] * 0.95, 2)
                
            await manager.broadcast({"type": "news_update", "data": {"symbol": target_symbol, "headline": headline, "sentiment": sentiment}})

        await asyncio.sleep(1.0)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            # Basic handler for authentication and subscriptions
            if message.get("type") == "authenticate":
                # In real scenario: decode token from message['token'] verify and get email
                # Assuming frontend sends email directly for mock purposes if auth is simple
                email = message.get("email")
                if email:
                    manager.authenticate(websocket, email)
                    await manager.send_personal_message({"type": "auth_success"}, email)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@router.get("/stocks/current")
async def get_current_stocks():
    return stock_prices
