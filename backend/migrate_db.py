import sqlite3
import os

db_path = "g:/My Drive/trading_app/backend/trading_app.db"

def migrate():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Add two_factor_enabled to users
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT 0")
        except sqlite3.OperationalError as e:
            print(f"users: two_factor_enabled possibly already exists: {e}")
            
        # Add two_factor_secret to users
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR")
        except sqlite3.OperationalError as e:
            print(f"users: two_factor_secret possibly already exists: {e}")
            
        # Create broker_accounts table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS broker_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            broker_name VARCHAR,
            api_key VARCHAR,
            api_secret VARCHAR,
            is_active BOOLEAN DEFAULT 1,
            is_live BOOLEAN DEFAULT 0,
            created_at DATETIME,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """)
        
        conn.commit()
        conn.close()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
