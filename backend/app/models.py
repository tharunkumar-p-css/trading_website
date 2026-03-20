from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Boolean
from sqlalchemy.orm import relationship
import enum
import datetime
from app.db.session import Base

class TransactionType(str, enum.Enum):
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    BUY = "BUY"
    SELL = "SELL"

class OrderType(str, enum.Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"

class OrderSide(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"

class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"

class BotStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"

class AlertDir(str, enum.Enum):
    ABOVE = "ABOVE"
    BELOW = "BELOW"

class OptionType(str, enum.Enum):
    CALL = "CALL"
    PUT = "PUT"

class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    wallet = relationship("Wallet", back_populates="user", uselist=False)
    portfolio = relationship("Portfolio", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    watchlist = relationship("Watchlist", back_populates="user")
    orders = relationship("Order", back_populates="user")
    bots = relationship("TradingBot", back_populates="user")
    achievements = relationship("Achievement", back_populates="user")
    alerts = relationship("PriceAlert", back_populates="user")
    options = relationship("OptionContract", back_populates="user")

class Wallet(Base):
    __tablename__ = "wallets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    balance = Column(Float, default=0.0)
    upi_id = Column(String, nullable=True)
    
    user = relationship("User", back_populates="wallet")

class Portfolio(Base):
    __tablename__ = "portfolios"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    quantity = Column(Integer, default=0)
    avg_price = Column(Float, default=0.0)
    
    user = relationship("User", back_populates="portfolio")
    
class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    type = Column(Enum(TransactionType))
    amount = Column(Float)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.SUCCESS)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="transactions")

class Watchlist(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String)
    
    user = relationship("User", back_populates="watchlist")

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    order_type = Column(Enum(OrderType))
    side = Column(Enum(OrderSide))
    quantity = Column(Integer)
    price = Column(Float, nullable=True) # None for MARKET orders
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="orders")

class TradingBot(Base):
    __tablename__ = "trading_bots"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    symbol = Column(String, index=True)
    amount_per_trade = Column(Float)
    interval_seconds = Column(Integer)
    status = Column(Enum(BotStatus), default=BotStatus.ACTIVE)
    last_executed = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="bots")

class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    badge_name = Column(String)
    description = Column(String)
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
