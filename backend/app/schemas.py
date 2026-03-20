from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models import TransactionType, OrderType, OrderSide, OrderStatus, PaymentStatus

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class WalletResponse(BaseModel):
    id: int
    balance: float
    upi_id: Optional[str] = None
    class Config:
        from_attributes = True

class PortfolioItemResponse(BaseModel):
    id: int
    symbol: str
    quantity: int
    avg_price: float
    class Config:
        from_attributes = True

class TransactionResponse(BaseModel):
    id: int
    type: TransactionType
    amount: float
    status: PaymentStatus
    timestamp: datetime
    class Config:
        from_attributes = True

class WatchlistResponse(BaseModel):
    id: int
    symbol: str
    class Config:
        from_attributes = True

class WatchlistCreate(BaseModel):
    symbol: str
        
class OrderCreate(BaseModel):
    symbol: str
    order_type: OrderType
    side: OrderSide
    quantity: int
    price: Optional[float] = None

class OrderResponse(BaseModel):
    id: int
    symbol: str
    order_type: OrderType
    side: OrderSide
    quantity: int
    price: Optional[float]
    status: OrderStatus
    created_at: datetime
    class Config:
        from_attributes = True

class AddMoneyRequest(BaseModel):
    amount: float
    upi_id: str

class WithdrawRequest(BaseModel):
    amount: float
    account_details: str

class TradingBotCreate(BaseModel):
    symbol: str
    amount_per_trade: float
    interval_seconds: int

class TradingBotResponse(BaseModel):
    id: int
    symbol: str
    amount_per_trade: float
    interval_seconds: int
    status: str
    last_executed: Optional[datetime]
    created_at: datetime
    class Config:
        from_attributes = True

class AchievementResponse(BaseModel):
    id: int
    badge_name: str
    description: str
    unlocked_at: datetime
    class Config:
        from_attributes = True

class PriceAlertCreate(BaseModel):
    symbol: str
    price_target: float
    direction: str

class PriceAlertResponse(BaseModel):
    id: int
    symbol: str
    price_target: float
    direction: str
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class OptionCreate(BaseModel):
    symbol: str
    strike_price: float
    quantity: int
    option_type: str
    expires_in_minutes: int

class OptionResponse(BaseModel):
    id: int
    symbol: str
    strike_price: float
    premium_paid: float
    quantity: int
    option_type: str
    expires_at: datetime
    is_settled: bool
    created_at: datetime
    class Config:
        from_attributes = True
