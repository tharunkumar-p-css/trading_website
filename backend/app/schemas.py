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
    is_2fa_enabled: bool
    xp: int
    level: int
    trading_style: str
    risk_score: float
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
    created_at: datetime
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
    stop_loss_price: Optional[float] = None
    take_profit_price: Optional[float] = None
    trailing_stop_active: Optional[bool] = False

class OrderResponse(BaseModel):
    id: int
    symbol: str
    order_type: OrderType
    side: OrderSide
    quantity: int
    price: Optional[float]
    stop_loss_price: Optional[float]
    take_profit_price: Optional[float]
    trailing_stop_active: Optional[bool]
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
    name: str = "Sentinel Bot"
    symbol: str
    amount_per_trade: float
    interval_seconds: int
    is_vol_aware: bool = False
    rsi_min: Optional[float] = None

class TradingBotResponse(BaseModel):
    id: int
    name: str
    symbol: str
    amount_per_trade: float
    interval_seconds: int
    is_vol_aware: bool
    rsi_min: Optional[float]
    status: str
    pnl: float
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

class CopyTradeRequest(BaseModel):
    target_user_email: str
    allocated_amount: float

class OtcListingResponse(BaseModel):
    id: int
    seller_id: int
    seller_name: Optional[str] = None
    symbol: str
    quantity: int
    price: float
    status: str
    class Config:
        from_attributes = True

class OtcListingCreate(BaseModel):
    symbol: str
    quantity: int
    price: float

class IpoListingResponse(BaseModel):
    id: int
    name: str
    symbol: str
    price: float
    min_qty: int
    status: str
    ends_in: str
    description: str
    has_bid: Optional[bool] = False
    class Config:
        from_attributes = True
class BrokerAccountCreate(BaseModel):
    broker_name: str
    api_key: str
    api_secret: str
    is_live: bool = False

class BrokerAccountResponse(BaseModel):
    id: int
    broker_name: str
    is_active: bool
    is_live: bool
    created_at: datetime
    class Config:
        from_attributes = True

class TwoFactorSetup(BaseModel):
    secret: str
    otp_auth_url: str
    
class TwoFactorVerify(BaseModel):
    code: str
