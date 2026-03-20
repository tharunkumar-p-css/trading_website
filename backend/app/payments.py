from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.models import User, Wallet, Transaction, TransactionType, PaymentStatus
from app.schemas import AddMoneyRequest, WithdrawRequest, WalletResponse
from app.api import get_current_user
from app.websockets import manager
import asyncio

router = APIRouter()

@router.post("/withdraw")
async def withdraw_money(req: WithdrawRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_res.scalars().first()
    
    if wallet.balance < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance to withdraw")
    
    await asyncio.sleep(1.0)
    wallet.balance -= req.amount
    
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.WITHDRAWAL,
        amount=req.amount,
        status=PaymentStatus.SUCCESS
    )
    db.add(transaction)
    
    await db.commit()
    await db.refresh(wallet)
    
    await manager.send_personal_message({
        "type": "wallet_updated",
        "data": {
            "balance": wallet.balance,
            "amount_deducted": req.amount,
            "status": "SUCCESS"
        }
    }, current_user.email)
    
    return {"status": "success", "message": f"Successfully withdrew ₹{req.amount} to {req.account_details}", "balance": wallet.balance}

@router.get("/wallet", response_model=WalletResponse)
async def get_wallet(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_res.scalars().first()
    return wallet

@router.post("/add-money")
async def add_money(req: AddMoneyRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
        
    # Simulate an external UPI payment processing delay
    await asyncio.sleep(1.5)
    
    status = PaymentStatus.SUCCESS
    # We can mock a failure if amount is exactly 13 (unlucky number) for testing
    if req.amount == 13:
        status = PaymentStatus.FAILED
        
    transaction = Transaction(
        user_id=current_user.id,
        type=TransactionType.DEPOSIT,
        amount=req.amount,
        status=status
    )
    db.add(transaction)
    
    if status == PaymentStatus.SUCCESS:
        wallet_res = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
        wallet = wallet_res.scalars().first()
        wallet.balance += req.amount
        wallet.upi_id = req.upi_id
        
        await db.commit()
        await db.refresh(wallet)
        
        # Notify user of successful topup
        await manager.send_personal_message({
            "type": "wallet_updated",
            "data": {
                "balance": wallet.balance,
                "amount_added": req.amount,
                "status": "SUCCESS"
            }
        }, current_user.email)
        
        return {"status": "success", "message": "Money added successfully", "balance": wallet.balance}
    else:
        await db.commit()
        return {"status": "failed", "message": "UPI Payment failed"}
