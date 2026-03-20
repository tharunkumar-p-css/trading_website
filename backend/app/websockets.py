import asyncio
import json
import random
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
    "NIFTY_50": 22000.0,
    "BANKNIFTY": 46000.0,
    
    # Large Cap
    "RELIANCE": 2500.0,
    "TCS": 3500.0,
    "HDFCBANK": 1500.0,
    "INFY": 1400.0,
    "ICICIBANK": 900.0,
    "BHARTIARTL": 1100.0,
    "ITC": 400.0,
    "LT": 3200.0,
    "SBIN": 600.0,
    "BAJFINANCE": 7000.0,
    "ASIANPAINT": 3100.0,
    "MARUTI": 10500.0,
    "TITAN": 3600.0,
    "ZOMATO": 280.0,
    
    # Mid Cap
    "TRENT": 3900.0,
    "TATAPOWER": 380.0,
    "PNB": 125.0,
    "IDFCFIRSTB": 85.0,
    "YESBANK": 25.0,
    "IRCTC": 900.0,
    "RVNL": 260.0,
    "SUZLON": 40.0,
    "PAYTM": 160.0,
    "JIOFIN": 350.0,
    "HDFCAMC": 3100.0,
    "BHEL": 250.0,
    "NHPC": 90.0,
    
    # Small Cap
    "IEX": 150.0,
    "ZENTEC": 850.0,
    "CDSL": 1800.0,
    "RENUKA": 45.0,
    "JPPOWER": 15.0,
    "IDEA": 13.0,
    "SOUTHBANK": 30.0,
    "RPOWER": 25.0,
    "HCC": 35.0,
    "GMRINFRA": 85.0,
    "NBCC": 120.0,

    # Mutual Funds
    "PARAGPARIKH": 65.5,
    "QUANTUM": 110.2,
    "SBISMALL": 150.3,
    "MIRAEASSET": 80.4,
    "HDFCMIDCAP": 125.6,
    "NIPPONIND": 95.8,
    "AXISBLUECHIP": 55.4,
    "SBIBLUECHIP": 75.2,
    "ICICIPRU": 300.5,
    "MOTILALOSWAL": 450.0,
    "KOTAKSMALL": 120.8,
    "UTINIFTY": 90.1,
    "DSPMIDCAP": 85.3,
    "FRANKLININD": 115.6,
    "TATAELSS": 45.4,

    # Global
    "AAPL": 175.0,
    "MSFT": 400.0,
    "GOOGL": 140.0,
    "AMZN": 150.0,
    "TSLA": 200.0,
    "NVDA": 850.0,
    
    # Crypto
    "BTC_INR": 5500000.0,
    "ETH_INR": 250000.0,
    "SOL_INR": 11000.0,
    "DOGE_INR": 12.5,
    "PEPE_INR": 0.05,
    "ADA_INR": 45.20,
    "DOT_INR": 620.50,
    "XRP_INR": 52.10,
    "LINK_INR": 1450.0,
    "MATIC_INR": 75.30,
    "SHIB_INR": 0.002,
    "AVAX_INR": 3200.0,
    "UNI_INR": 650.0,
    "LTC_INR": 6800.0
}
stock_prices = initial_stocks.copy()

async def generate_mock_prices():
    while True:
        updates = {}
        candles = {}
        for symbol in stock_prices:
            base = stock_prices[symbol]
            # Emulate random walk: -0.5% to +0.5% drift per second
            volatility = random.uniform(0.995, 1.005)
            new_price = round(base * volatility, 2)
            
            high = round(max(base, new_price) * random.uniform(1.0, 1.002), 2)
            low = round(min(base, new_price) * random.uniform(0.998, 1.0), 2)
            
            stock_prices[symbol] = new_price
            updates[symbol] = new_price
            candles[symbol] = {
                "open": base,
                "close": new_price,
                "high": high,
                "low": low,
                "price": new_price
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
