import sqlite3
import os

db_path = "trading_app.db"

def migrate():
    try:
        if not os.path.exists(db_path):
            print(f"Database {db_path} not found.")
            return
            
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check current columns in users
        cursor.execute("PRAGMA table_info(users)")
        cols = [col[1] for col in cursor.fetchall()]
        
        # Normalize users table - Ensure is_2fa_enabled exists
        if "is_2fa_enabled" not in cols:
            if "two_factor_enabled" in cols:
                print("Renaming two_factor_enabled to is_2fa_enabled...")
                # SQLite doesn't directly support RENAME COLUMN in older versions easily but let's try
                try:
                    cursor.execute("ALTER TABLE users RENAME COLUMN two_factor_enabled TO is_2fa_enabled")
                except:
                    # Alternative: add is_2fa_enabled
                     cursor.execute("ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0")
                     cursor.execute("UPDATE users SET is_2fa_enabled = two_factor_enabled")
            else:
                 cursor.execute("ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0")
        
        # Check if status exists in transactions
        cursor.execute("PRAGMA table_info(transactions)")
        cols = [col[1] for col in cursor.fetchall()]
        if "status" not in cols:
            print("Adding status to transactions...")
            cursor.execute("ALTER TABLE transactions ADD COLUMN status VARCHAR DEFAULT 'SUCCESS'")

        # Check if upi_id exists in wallets
        cursor.execute("PRAGMA table_info(wallets)")
        cols = [col[1] for col in cursor.fetchall()]
        if "upi_id" not in cols:
            print("Adding upi_id to wallets...")
            cursor.execute("ALTER TABLE wallets ADD COLUMN upi_id VARCHAR")

        # Check if is_active exists in broker_accounts
        cursor.execute("PRAGMA table_info(broker_accounts)")
        cols = [col[1] for col in cursor.fetchall()]
        if "is_active" not in cols:
            print("Adding is_active to broker_accounts...")
            cursor.execute("ALTER TABLE broker_accounts ADD COLUMN is_active BOOLEAN DEFAULT 1")
            
        conn.commit()
        conn.close()
        print("Migration complete.")
    except Exception as e:
        print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
