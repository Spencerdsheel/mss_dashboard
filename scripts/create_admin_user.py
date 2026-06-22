"""Create initial admin user in database.

This script creates the global admin user (admin@demo.local) with a secure password.
Run this once during initial setup or when resetting the admin account.

Usage:
    python scripts/create_admin_user.py
    python scripts/create_admin_user.py --password "MySecurePassword123!"
    python scripts/create_admin_user.py --email "newadmin@example.com"
"""

import argparse
import os
import sys
import psycopg

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.common.security import hash_password

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:admin@localhost:5433/shopmetrics_demo",
)

DEFAULT_ADMIN_EMAIL = "admin@demo.local"
DEFAULT_ADMIN_PASSWORD = "Demo123!"
DEFAULT_ADMIN_NAME = "System Administrator"


def main():
    parser = argparse.ArgumentParser(description="Create admin user")
    parser.add_argument(
        "--email",
        type=str,
        default=DEFAULT_ADMIN_EMAIL,
        help=f"Admin email (default: {DEFAULT_ADMIN_EMAIL})",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=DEFAULT_ADMIN_PASSWORD,
        help=f"Admin password (default: {DEFAULT_ADMIN_PASSWORD})",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=DEFAULT_ADMIN_NAME,
        help=f"Admin display name (default: {DEFAULT_ADMIN_NAME})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing admin user",
    )
    args = parser.parse_args()

    print("=" * 80)
    print("Create Admin User")
    print("=" * 80)
    print(f"\nEmail: {args.email}")
    print(f"Name: {args.name}")
    print(f"Password: {'*' * len(args.password)}")
    print(f"Force: {args.force}")

    try:
        conn = psycopg.connect(DATABASE_URL)
        cur = conn.cursor()

        # Check if user already exists
        cur.execute("""
            SELECT user_id, email, role
            FROM dashboard.users
            WHERE email = %s
        """, (args.email,))
        existing = cur.fetchone()

        if existing:
            if args.force:
                print(f"\n[UPDATE] Updating existing user: {existing[0]}")
                hashed_pw = hash_password(args.password)
                cur.execute("""
                    UPDATE dashboard.users
                    SET 
                        name = %s,
                        role = 'ADMIN',
                        tenant_id = NULL,
                        project_ids = ARRAY[]::TEXT[],
                        hashed_password = %s,
                        updated_at = now()
                    WHERE user_id = %s
                """, (args.name, hashed_pw, existing[0]))
                conn.commit()
                print(f"[OK] User updated successfully")
            else:
                print(f"\n[SKIP] User already exists: {existing[0]}")
                print("Use --force to overwrite")
                return
        else:
            # Create new admin user
            user_id = "user_admin"
            hashed_pw = hash_password(args.password)
            
            print(f"\n[CREATE] Creating new admin user...")
            cur.execute("""
                INSERT INTO dashboard.users
                (user_id, tenant_id, email, name, role, project_ids, hashed_password, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', now())
            """, (user_id, None, args.email, args.name, 'ADMIN', [], hashed_pw))
            conn.commit()
            print(f"[OK] Admin user created successfully")

        # Verify
        cur.execute("""
            SELECT user_id, email, name, role, tenant_id, project_ids
            FROM dashboard.users
            WHERE email = %s
        """, (args.email,))
        result = cur.fetchone()
        
        if result:
            print("\n" + "=" * 80)
            print("ADMIN USER CREATED SUCCESSFULLY")
            print("=" * 80)
            print(f"User ID:     {result[0]}")
            print(f"Email:       {result[1]}")
            print(f"Name:        {result[2]}")
            print(f"Role:        {result[3]}")
            print(f"Tenant ID:   {result[4] or 'NULL (global access)'}")
            print(f"Project IDs: {result[5] or '[] (all projects)'}")
            print("\nYou can now login with these credentials:")
            print(f"  Email:    {result[1]}")
            print(f"  Password: {args.password}")
            print("\n[WARNING] Change the default password in production!")

        cur.close()
        conn.close()

    except Exception as e:
        print(f"\n[ERROR] Failed to create admin user: {e}")
        raise


if __name__ == "__main__":
    main()
