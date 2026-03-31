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
    # Indices & Major Stocks (Indian & Global)
    "NIFTY_50": 22050.0, "SENSEX": 72500.0, "BANKNIFTY": 47500.0,
    "RELIANCE": 2500.0, "TCS": 3500.0, "HDFCBANK": 1500.0, "INFY": 1400.0, "ICICIBANK": 950.0,
    "SBIN": 580.0, "BHARTIARTL": 850.0, "LIC": 650.0, "HINDUNILVR": 2400.0, "ITC": 450.0,
    "LT": 2300.0, "BAJFINANCE": 7100.0, "BAJAJFINSV": 1500.0, "MARUTI": 9200.0, "TITAN": 3000.0,
    "KOTAKBANK": 1800.0, "ADANIENT": 2400.0, "AXISBANK": 980.0, "ASIANPAINT": 3200.0, "SUNPHARMA": 1100.0,
    "NESTLEIND": 22000.0, "NTPC": 190.0, "M&M": 1450.0, "ADANIPORTS": 750.0, "POWERGRID": 250.0,
    "ULTRACEMCO": 8200.0, "TATAMOTORS": 620.0, "ONGC": 170.0, "COALINDIA": 230.0, "JSWSSTEEL": 780.0,
    "AAPL": 175.0, "MSFT": 420.0, "GOOGL": 150.0, "AMZN": 180.0, "TSLA": 170.0, "META": 480.0, "NVDA": 900.0, "BRK-B": 400.0, "V": 280.0, "MA": 450.0, 
    "JNJ": 160.0, "UNH": 490.0, "XOM": 120.0, "WMT": 60.0, "PG": 160.0, "JPM": 190.0, "CVX": 155.0, "LLY": 750.0, "HD": 350.0, "ABBV": 180.0, 
    "MRK": 125.0, "PFE": 28.0, "PEP": 170.0, "KO": 60.0, "BAC": 38.0, "AVGO": 1300.0, "COST": 720.0, "TMO": 580.0, "CSCO": 50.0, "MCD": 290.0, 
    "ACN": 340.0, "WFC": 58.0, "DIS": 110.0, "DHR": 250.0, "LIN": 450.0, "ADI": 190.0, "NKE": 95.0, "PM": 95.0, "VZ": 40.0, "TXN": 170.0, 
    "AMD": 180.0, "INTC": 45.0, "MS": 90.0, "RTX": 95.0, "AMAT": 200.0, "LOW": 240.0, "UPS": 150.0, "HON": 200.0, "IBM": 190.0, "GS": 400.0,

    # 80 Mutual Funds
    "PARAGPARIKH": 65.4, "QUANTUM": 54.2, "SBISMALL": 128.5, "MIRAEASSET": 98.2, "HDFCMIDCAP": 112.4,
    "NIPPONIND": 45.6, "AXISBLUECHIP": 52.1, "SBIBLUECHIP": 68.3, "ICICIPRU": 49.0, "MOTILALOSWAL": 34.5,
    "KOTAKSMALL": 189.2, "UTINIFTY": 145.6, "DSPMIDCAP": 82.1, "FRANKLININD": 98.4, "TATAELSS": 42.1,
    "ABSLFRONTLINE": 320.5, "PGIMINDIA": 24.5, "CANARAROB": 12.4, "SUNDARAM": 85.6, "EDELWEISS": 38.2,
    "INVESCO": 45.1, "BANDHAN": 56.4, "SAMCO": 14.5, "QUANT": 156.4, "NAVISMALL": 28.4,
    "HSBC": 67.2, "BARODA": 120.4, "MAHINDRA": 89.2, "UNION": 34.5, "TAURUS": 56.1,
    "NJ": 45.2, "WHITEFR": 33.1, "BANKOFI": 18.5, "ITI": 22.4, "SHRIRAM": 89.2, "GROWW": 12.5, "ZERODHA": 15.4, "HELIOS": 44.2, "TRUST": 11.2, "OLD-BRIDGE": 10.5,
    "PPFAS": 120.4, "NAVI-F": 33.2, "KOTAK-G": 45.6, "SBI-G": 88.2, "ICICI-G": 122.4, "HDFC-G": 145.6, "AXIS-G": 66.4, "NIPPON-G": 44.5, "UT-G": 189.2, "DSP-G": 55.4,
    "FRANK-G": 12.4, "TATA-G": 88.7, "ABSL-G": 55.2, "PGIM-G": 34.1, "CANARA-G": 99.2, "SUN-G": 12.4, "EDEL-G": 55.6, "INV-G": 88.4, "BAND-G": 33.1, "SAM-G": 122.4,
    "QUA-G": 445.6, "HSBC-G": 122.1, "BAR-G": 145.5, "MAH-G": 12.2, "UNI-G": 189.4, "TAU-G": 12.4, "REL-G": 44.2, "L&T-G": 11.2, "IDFC-G": 88.4, "DHFL-G": 12.4,
    "INDI-G": 55.6, "JM-G": 33.1, "SR-G": 122.4, "BOI-G": 33.5, "ESSEL-G": 12.4, "MIR-G": 44.5, "MOT-G": 66.4, "PAR-G": 12.4, "QUA-S": 155.6, "SB-S": 122.4,

    # 80 Crypto Assets
    "BTC_INR": 5500000.0, "ETH_INR": 250000.0, "SOL_INR": 8200.0, "DOGE_INR": 14.2, "PEPE_INR": 0.0006,
    "ADA_INR": 42.5, "DOT_INR": 650.4, "XRP_INR": 54.2, "LINK_INR": 1450.6, "MATIC_INR": 68.2,
    "SHIB_INR": 0.002, "AVAX_INR": 3200.4, "UNI_INR": 650.1, "LTC_INR": 7500.5, "BCH_INR": 32000.4,
    "ATOM_INR": 850.1, "ALGO_INR": 15.4, "XLM_INR": 14.5, "VET_INR": 3.4, "ICP_INR": 1100.5,
    "FIL_INR": 450.4, "THETA_INR": 180.2, "AAVE_INR": 8500.2, "EOS_INR": 85.4, "XTZ_INR": 95.2,
    "MKR_INR": 250000.4, "AXS_INR": 650.4, "SAND_INR": 45.2, "MANA_INR": 42.1, "GALA_INR": 3.2,
    "NEAR_INR": 550.4, "FTM_INR": 65.2, "GRT_INR": 22.4, "LDO_INR": 180.2, "APT_INR": 850.4, "OP_INR": 280.2, "ARB_INR": 150.4, "RNDR_INR": 850.2, "INJ_INR": 3200.4, "STX_INR": 180.2,
    "IMX_INR": 180.2, "TIA_INR": 1200.4, "SEI_INR": 65.2, "SUI_INR": 120.4, "KAS_INR": 12.4, "ORDI_INR": 4500.5, "BEAM_INR": 2.4, "FET_INR": 220.4, "AGIX_INR": 85.2, "OCEAN_INR": 88.4,
    "FLOKI_INR": 0.015, "BONK_INR": 0.002, "WIF_INR": 250.4, "BOME_INR": 1.2, "MEW_INR": 0.45, "TURBO_INR": 0.55, "MOG_INR": 0.0001, "BRETT_INR": 12.4, "SLERF_INR": 35.2, "BOOK_INR": 1.2,
    "POPCAT_INR": 45.2, "MICHI_INR": 85.4, "GUMMY_INR": 12.4, "MANEKI_INR": 10.5, "NOT_INR": 1.2, "TON_INR": 650.4, "TRX_INR": 10.5, "HBAR_INR": 8.4, "AKT_INR": 450.4, "RENDER_INR": 850.2,
    "JUP_INR": 85.4, "PYTH_INR": 45.2, "RAY_INR": 150.4, "HNT_INR": 450.2, "MOBILE_INR": 0.25, "HONEY_INR": 12.4, "JTO_INR": 320.4, "BONK2_INR": 0.001, "PEPE2_INR": 0.0001, "DOGE2_INR": 0.1
}

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

        # --- Whale Tracker: Institutional Block Trades (> ₹50L) ---
        for symbol, candle in candles_packet.items():
            trade_value = candle["price"] * candle["volume"]
            if trade_value > 5000000: # ₹50L Threshold
                await manager.broadcast({
                    "type": "whale_alert",
                    "data": {
                        "symbol": symbol,
                        "price": candle["price"],
                        "volume": candle["volume"],
                        "value": trade_value,
                        "timestamp": ts,
                        "side": random.choice(["BUY", "SELL"])
                    }
                })
        
        # Occasional random news / sentiment
        if random.random() < 0.03:
            await _broadcast_random_sentiment()

        await asyncio.sleep(1.0)

    await manager.broadcast({"type": "sentiment_post", "data": post})

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

async def generate_global_news():
    """Generates high-impact tactical news for the AI Terminal."""
    headlines = [
        ("FED Interest Rate Decision Imminent", "BULLISH", 0.85),
        ("Tech Giants to Report Record Earnings", "BULLISH", 0.92),
        ("Global Supply Chain Disruptions Detected", "BEARISH", -0.75),
        ("New Green Energy Subsidies Announced", "BULLISH", 0.60),
        ("Oil Prices Surge Amidst Mid-East Tensions", "NEUTRAL", 0.05),
        ("Banking Crisis Fears Subside", "BULLISH", 0.40),
        ("Unemployment Data Better Than Expected", "BULLISH", 0.70),
        ("Inflation Hits 3-Year Low", "BULLISH", 0.88),
        ("Regulatory Crackdown on Crypto Exchange", "BEARISH", -0.90),
        ("Major Merger in Telecom Sector", "NEUTRAL", 0.15)
    ]
    while True:
        await asyncio.sleep(random.randint(15, 30))
        h, s, score = random.choice(headlines)
        news = {
            "id": int(_time.time() * 1000),
            "headline": h,
            "sentiment": s,
            "score": score,
            "timestamp": _time.time(),
            "source": random.choice(["SENTINEL-AI", "QUANT-WIRE", "BLOOMBERG-MOCK"])
        }
        print(f"BROADCASTING AI NEWS: {h}")
        await manager.broadcast({"type": "ai_news_flash", "data": news})

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
