# How to Create Users in Your Backend Database

This guide explains how to create the `cashier@extremedeptkidz.com` user (and other role users) in your backend database so they can log in to the warehouse app.

---

## Quick Summary

You need to create a user in your **backend database** with:
- **Email:** `cashier@extremedeptkidz.com` (exactly, lowercase, no spaces)
- **Password:** `EDK-!@#` (exactly, case-sensitive)
- **Role:** `cashier` (must match exactly)
- **Status:** Active/Enabled

---

## Option 1: Using Your Backend Admin Panel (Easiest)

If you have access to your backend admin panel (e.g., `extremedeptkidz.com/admin`):

### Steps:

1. **Log into your backend admin panel**
   - Go to `https://extremedeptkidz.com/admin` (or wherever your admin panel is)
   - Log in with your admin credentials

2. **Navigate to User Management**
   - Look for "Users", "User Management", "Manage Users", or similar
   - This is usually in a sidebar menu or dashboard

3. **Click "Add User" or "Create User"**

4. **Fill in the form with these exact values:**
   - **Full Name:** `Jane Doe` (or any name)
   - **Email:** `cashier@extremedeptkidz.com` (must be exact, lowercase)
   - **Password:** `EDK-!@#` (must be exact, case-sensitive)
   - **Role:** Select `cashier` (or set role field to `cashier`)
   - **Status:** Active/Enabled

5. **Save the user**

6. **Verify the user was created:**
   - Check that the email is exactly `cashier@extremedeptkidz.com`
   - Check that the role is set to `cashier` (not "Cashier" or "CASHIER")
   - Check that the user is Active/Enabled

7. **Test login:**
   - Go to `https://warehouse.extremedeptkidz.com/login`
   - Try logging in with `cashier@extremedeptkidz.com` / `EDK-!@#`

---

## Option 2: Using Laravel (PHP) - If You Have Code Access

If your backend is Laravel and you have access to the code:

### Method A: Using Laravel Tinker (Command Line)

```bash
# SSH into your server or open terminal in your Laravel project
cd /path/to/your/laravel/project

# Run Laravel Tinker
php artisan tinker

# Create the user
$user = new App\Models\User();
$user->name = 'Jane Doe';
$user->email = 'cashier@extremedeptkidz.com';
$user->password = Hash::make('EDK-!@#');
$user->role = 'cashier';
$user->is_active = true;
$user->save();

# Exit tinker
exit
```

### Method B: Create a Seeder

Create a file `database/seeders/RoleUsersSeeder.php`:

```php
<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class RoleUsersSeeder extends Seeder
{
    public function run()
    {
        $users = [
            [
                'name' => 'Store Manager',
                'email' => 'manager@extremedeptkidz.com',
                'password' => 'EDK-!@#',
                'role' => 'manager',
            ],
            [
                'name' => 'Jane Doe',
                'email' => 'cashier@extremedeptkidz.com',
                'password' => 'EDK-!@#',
                'role' => 'cashier',
            ],
            [
                'name' => 'Warehouse Staff',
                'email' => 'warehouse@extremedeptkidz.com',
                'password' => 'EDK-!@#',
                'role' => 'warehouse',
            ],
            [
                'name' => 'Delivery Driver',
                'email' => 'driver@extremedeptkidz.com',
                'password' => 'EDK-!@#',
                'role' => 'driver',
            ],
            [
                'name' => 'View Only Accountant',
                'email' => 'viewer@extremedeptkidz.com',
                'password' => 'EDK-!@#',
                'role' => 'viewer',
            ],
        ];

        foreach ($users as $userData) {
            User::updateOrCreate(
                ['email' => $userData['email']],
                [
                    'name' => $userData['name'],
                    'password' => Hash::make($userData['password']),
                    'role' => $userData['role'],
                    'is_active' => true,
                ]
            );
        }
    }
}
```

Then run:
```bash
php artisan db:seed --class=RoleUsersSeeder
```

---

## Option 3: Using Node.js/Express - If You Have Code Access

If your backend is Node.js/Express:

### Method A: Using a Script

Create a file `scripts/create-role-users.js`:

```javascript
const bcrypt = require('bcrypt');
const { User } = require('../models'); // Adjust path to your User model

async function createRoleUsers() {
  const users = [
    {
      name: 'Store Manager',
      email: 'manager@extremedeptkidz.com',
      password: 'EDK-!@#',
      role: 'manager',
      isActive: true,
    },
    {
      name: 'Jane Doe',
      email: 'cashier@extremedeptkidz.com',
      password: 'EDK-!@#',
      role: 'cashier',
      isActive: true,
    },
    {
      name: 'Warehouse Staff',
      email: 'warehouse@extremedeptkidz.com',
      password: 'EDK-!@#',
      role: 'warehouse',
      isActive: true,
    },
    {
      name: 'Delivery Driver',
      email: 'driver@extremedeptkidz.com',
      password: 'EDK-!@#',
      role: 'driver',
      isActive: true,
    },
    {
      name: 'View Only Accountant',
      email: 'viewer@extremedeptkidz.com',
      password: 'EDK-!@#',
      role: 'viewer',
      isActive: true,
    },
  ];

  for (const userData of users) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    await User.findOneAndUpdate(
      { email: userData.email },
      {
        ...userData,
        password: hashedPassword,
      },
      { upsert: true, new: true }
    );
    console.log(`Created/Updated user: ${userData.email}`);
  }

  console.log('All role users created successfully!');
}

createRoleUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error creating users:', error);
    process.exit(1);
  });
```

Run it:
```bash
node scripts/create-role-users.js
```

---

## Option 4: Direct Database Access (Advanced)

If you have direct database access (MySQL, PostgreSQL, etc.):

### MySQL Example:

```sql
-- Make sure to hash the password first (use your application's password hashing)
-- For Laravel, passwords are hashed with bcrypt
-- For this example, you'd need to generate the hash first

-- Check if user exists
SELECT * FROM users WHERE email = 'cashier@extremedeptkidz.com';

-- If user doesn't exist, insert (replace PASSWORD_HASH with actual bcrypt hash)
INSERT INTO users (name, email, password, role, is_active, created_at, updated_at)
VALUES (
  'Jane Doe',
  'cashier@extremedeptkidz.com',
  '$2y$10$YOUR_BCRYPT_HASH_HERE', -- Generate this using your app's password hashing
  'cashier',
  1,
  NOW(),
  NOW()
);

-- If user exists, update
UPDATE users
SET 
  name = 'Jane Doe',
  password = '$2y$10$YOUR_BCRYPT_HASH_HERE', -- Generate this using your app's password hashing
  role = 'cashier',
  is_active = 1,
  updated_at = NOW()
WHERE email = 'cashier@extremedeptkidz.com';
```

**⚠️ Important:** Don't insert plain text passwords! You must hash them using your application's password hashing method (bcrypt, argon2, etc.).

---

## Option 5: Contact Your Backend Developer

If you don't have backend access, contact your backend developer and provide them with:

### Information to Share:

```
Subject: Need to Create Role Users for Warehouse App

Hi,

I need to create users in the backend database for the warehouse POS system. 
Please create the following users:

1. Cashier User:
   - Email: cashier@extremedeptkidz.com
   - Password: EDK-!@#
   - Role: cashier
   - Full Name: Jane Doe
   - Status: Active

2. Manager User:
   - Email: manager@extremedeptkidz.com
   - Password: EDK-!@#
   - Role: manager
   - Status: Active

3. Warehouse User:
   - Email: warehouse@extremedeptkidz.com
   - Password: EDK-!@#
   - Role: warehouse
   - Status: Active

4. Driver User:
   - Email: driver@extremedeptkidz.com
   - Password: EDK-!@#
   - Role: driver
   - Status: Active

5. Viewer User:
   - Email: viewer@extremedeptkidz.com
   - Password: EDK-!@#
   - Role: viewer
   - Status: Active

Important Notes:
- Email addresses must be exact (lowercase, no spaces)
- Password is case-sensitive: EDK-!@# (uppercase E, D, K, then hyphen, exclamation, at, hash)
- Role field must be exactly: cashier, manager, warehouse, driver, or viewer (lowercase)
- Users must be Active/Enabled

After creating, the login endpoint /admin/api/login should accept these credentials.

Thanks!
```

---

## Troubleshooting

### Issue: "Validation failed" error persists

**Check:**
1. ✅ User exists in database
2. ✅ Email is exactly `cashier@extremedeptkidz.com` (no spaces, lowercase)
3. ✅ Password is exactly `EDK-!@#` (case-sensitive)
4. ✅ Role field is set to `cashier` (not "Cashier" or "CASHIER")
5. ✅ User is Active/Enabled
6. ✅ Password is properly hashed (not stored in plain text)

### Issue: User created but login still fails

**Possible causes:**
- Password hash doesn't match (password was changed after creation)
- User is inactive/disabled
- Backend validation rules are rejecting the credentials
- Email format validation is failing

**Solution:**
- Reset the password in your backend admin panel
- Ensure the user is Active
- Check backend logs for specific validation errors

### Issue: Don't know which backend framework you're using

**Check:**
- Look at your backend codebase
- Check your hosting panel (cPanel, Plesk, etc.) - it might show the framework
- Check your server logs
- Ask your backend developer

---

## Verify User Was Created Correctly

After creating the user, verify:

1. **Check in database/admin panel:**
   ```sql
   SELECT email, role, is_active FROM users WHERE email = 'cashier@extremedeptkidz.com';
   ```
   Should return: `cashier@extremedeptkidz.com`, `cashier`, `1` (or `true`)

2. **Test login in backend admin:**
   - Try logging into your backend admin panel with `cashier@extremedeptkidz.com` / `EDK-!@#`
   - If this works, the warehouse app login should also work

3. **Test login in warehouse app:**
   - Go to `https://warehouse.extremedeptkidz.com/login`
   - Try logging in with `cashier@extremedeptkidz.com` / `EDK-!@#`
   - Should succeed!

---

## All Role Users to Create

| Role      | Email                        | Password  | Full Name (example)     |
|-----------|------------------------------|-----------|-------------------------|
| Manager   | manager@extremedeptkidz.com  | EDK-!@#   | Store Manager           |
| Cashier   | cashier@extremedeptkidz.com | EDK-!@#   | Jane Doe                |
| Warehouse | warehouse@extremedeptkidz.com| EDK-!@#   | Warehouse Staff         |
| Driver    | driver@extremedeptkidz.com   | EDK-!@#   | Delivery Driver         |
| Viewer    | viewer@extremedeptkidz.com   | EDK-!@#   | View Only Accountant    |

**Admin user:** Keep your existing admin credentials as-is.

---

## Need Help?

If you're still having issues:
1. Check your backend server logs for specific error messages
2. Verify the user exists in your database
3. Test the login endpoint directly with curl/Postman
4. Contact your backend developer with the error details
