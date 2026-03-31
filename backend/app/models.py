from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Boolean
from sqlalchemy.orm import relationship
import enum
from cryptography.fernet import Fernet
import os
import datetime
from app.db.session import Base

# For AES encryption of API keys
ENCRYPTION_KEY = os.getenv("TRADING_APP_SECRET_KEY", Fernet.generate_key().decode())
cipher_suite = Fernet(ENCRYPTION_KEY.encode())

class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"

class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

class OrderType(str, enum.Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    BRACKET = "BRACKET"

class OrderSide(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"

class TransactionType(str, enum.Enum):
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    TRADE_BUY = "TRADE_BUY"
    TRADE_SELL = "TRADE_SELL"
    PNL = "PNL"

class BotStatus(str, enum.Enum):
    RUNNING = "RUNNING"
    STOPPED = "STOPPED"
    ERROR = "ERROR"

class AlertDir(str, enum.Enum):
    ABOVE = "ABOVE"
    BELOW = "BELOW"

class OptionType(str, enum.Enum):
    CALL = "CALL"
    PUT = "PUT"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_2fa_enabled = Column(Boolean, default=False)
    two_fa_secret = Column(String, nullable=True)
    
    # Sentinel Stats
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    trading_style = Column(String, default="NOVICE") # E.g. "DIAMOND_HANDS", "SCALPER", "WHALE"
    risk_score = Column(Float, default=0.5) # 0.0 to 1.0 (Conservative to Chaos)

    wallet = relationship("Wallet", back_populates="user", uselist=False)
    orders = relationship("Order", back_populates="user")
    portfolio = relationship("Portfolio", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    bots = relationship("TradingBot", back_populates="user")
    achievements = relationship("Achievement", back_populates="user")
    alerts = relationship("PriceAlert", back_populates="user")
    options = relationship("OptionContract", back_populates="user")
    broker_accounts = relationship("BrokerAccount", back_populates="user")
    watchlist = relationship("Watchlist", back_populates="user")

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    balance = Column(Float, default=100000.0) # Simulation balance
    real_balance = Column(Float, default=0.0)
    upi_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="wallet")

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    side = Column(Enum(OrderSide))
    order_type = Column("type", Enum(OrderType))
    quantity = Column(Integer)
    price = Column(Float)
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Bracket orders
    stop_loss_price = Column(Float, nullable=True)
    take_profit_price = Column(Float, nullable=True)
    parent_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    trailing_stop_active = Column(Boolean, default=False)

    user = relationship("User", back_populates="orders")

class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    quantity = Column(Integer)
    avg_price = Column("average_price", Float)
    
    user = relationship("User", back_populates="portfolio")

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    type = Column(Enum(TransactionType))
    amount = Column(Float)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.SUCCESS)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="transactions")

class TradingBot(Base):
    __tablename__ = "trading_bots"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    symbol = Column(String)
    strategy = Column(String) # e.g. "DCA", "SMART_DCA"
    amount_per_trade = Column(Float, default=100.0)
    interval_seconds = Column(Integer, default=3600)
    is_vol_aware = Column(Boolean, default=False)
    rsi_min = Column(Float, nullable=True)
    status = Column(Enum(BotStatus), default=BotStatus.RUNNING)
    pnl = Column(Float, default=0.0)
    last_executed = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="bots")

class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    badge_name = Column(String)
    description = Column(String)
    icon = Column(String)
    unlocked_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="achievements")

class PriceAlert(Base):
    __tablename__ = "price_alerts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    price_target = Column(Float)
    direction = Column(Enum(AlertDir))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="alerts")

class Watchlist(Base):
    __tablename__ = "watchlists"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    
    user = relationship("User", back_populates="watchlist")

class OptionContract(Base):
    __tablename__ = "option_contracts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    strike_price = Column(Float)
    premium_paid = Column(Float)
    quantity = Column(Integer)
    option_type = Column(Enum(OptionType))
    expires_at = Column(DateTime)
    is_settled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="options")

class CopySubscription(Base):
    __tablename__ = "copy_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    subscriber_id = Column(Integer, ForeignKey("users.id"))
    target_user_id = Column(Integer, ForeignKey("users.id"))
    allocated_amount = Column(Float, default=0.0)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class OtcStatus(str, enum.Enum):
    OPEN = "OPEN"
    FILLED = "FILLED"

class IpoStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"

class OtcListing(Base):
    __tablename__ = "otc_listings"
    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    quantity = Column(Integer)
    price = Column(Float)
    status = Column(Enum(OtcStatus), default=OtcStatus.OPEN)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class IpoListing(Base):
    __tablename__ = "ipo_listings"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    symbol = Column(String, unique=True, index=True)
    price = Column(Float)
    min_qty = Column(Integer)
    status = Column(Enum(IpoStatus), default=IpoStatus.OPEN)
    ends_in = Column(String)
    description = Column(String)

class IpoBid(Base):
    __tablename__ = "ipo_bids"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    ipo_id = Column(Integer, ForeignKey("ipo_listings.id"))
    quantity_bid = Column(Integer)
    allocated = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class BrokerAccount(Base):
    __tablename__ = "broker_accounts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    broker_name = Column(String) # e.g., 'Alpaca', 'Zerodha'
    api_key = Column(String)
    _api_secret_encrypted = Column("api_secret", String)
    is_active = Column(Boolean, default=True)
    is_live = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    @property
    def api_secret(self):
        if not self._api_secret_encrypted: return None
        return cipher_suite.decrypt(self._api_secret_encrypted.encode()).decode()

    @api_secret.setter
    def api_secret(self, value):
        if value:
            self._api_secret_encrypted = cipher_suite.encrypt(value.encode()).decode()

    user = relationship("User", back_populates="broker_accounts")
