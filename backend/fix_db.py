import sqlite3
import os

db_path = "trading_app.db"

def fix():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check current columns in users
        cursor.execute("PRAGMA table_info(users)")
        cols = [col[1] for col in cursor.fetchall()]
        print(f"Current columns in users: {cols}")
        
        new_cols = []
        if "is_2fa_enabled" not in cols:
            new_cols.append("ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0")
        if "full_name" not in cols:
            new_cols.append("ALTER TABLE users ADD COLUMN full_name VARCHAR")
        if "is_active" not in cols:
            new_cols.append("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1")
        if "created_at" not in cols:
            new_cols.append("ALTER TABLE users ADD COLUMN created_at DATETIME")
        if "two_fa_secret" not in cols:
             new_cols.append("ALTER TABLE users ADD COLUMN two_fa_secret VARCHAR")
            
        for cmd in new_cols:
            print(f"Executing: {cmd}")
            cursor.execute(cmd)
            
        # Also check wallets
        cursor.execute("PRAGMA table_info(wallets)")
        cols = [col[1] for col in cursor.fetchall()]
        if "upi_id" not in cols:
            print("Adding upi_id to wallets")
            cursor.execute("ALTER TABLE wallets ADD COLUMN upi_id VARCHAR")
            
        # Also check transactions
        cursor.execute("PRAGMA table_info(transactions)")
        cols = [col[1] for col in cursor.fetchall()]
        if "status" not in cols:
            print("Adding status to transactions")
            cursor.execute("ALTER TABLE transactions ADD COLUMN status VARCHAR DEFAULT 'SUCCESS'")
            
        conn.commit()
        conn.close()
        print("Fix complete.")
    except Exception as e:
        print(f"Fix error: {e}")

if __name__ == "__main__":
    fix()
