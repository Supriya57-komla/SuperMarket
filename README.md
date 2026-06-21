# 🌿 FreshCart India — Premium Daily Groceries & Essentials

Welcome to **FreshCart India**, a highly interactive, responsive, and robust e-commerce web application for daily grocery and essential deliveries. The project features a premium frontend interface built with semantic HTML and vanilla CSS, backed by a Node.js/Express API server and a MySQL database.

---

## 🌟 Key Features

*   🔐 **User Authentication**: Secure signup and login systems with password hashing (bcryptjs) and JSON Web Tokens (JWT) for secure session management.
*   🛒 **Dynamic Shopping Cart**: Interactive cart to add items, modify quantities, remove products, and see price calculations instantly.
*   🧾 **Checkout System**: Automatic calculation of subtotals, tax, discounts, delivery charges, and total billing amounts. Supports multiple payment options.
*   📦 **Order Database Storage**: Orders placed by customers are verified, validated, and stored directly in the MySQL database.
*   👑 **Admin Dashboard Console**: 
    *   Manage product catalog (Add new products, set pricing, categories, and stock).
    *   Monitor all orders placed in the system.
    *   View registered customers and manage user roles.
*   🌿 **Premium Styling**: Responsive web design using curated color palettes, elegant animations, custom fonts, and high-quality iconography (FontAwesome).

---

## 🛠️ Technology Stack

*   **Frontend**: Semantic HTML5, Vanilla CSS3, JavaScript (ES6+), Google Fonts, FontAwesome
*   **Backend**: Node.js, Express.js
*   **Database**: MySQL (relational database storage)
*   **Security**: JSON Web Tokens (JWT), bcryptjs (password hashing)
*   **Environment**: Dotenv (environment configuration)

---

## 💻 Getting Started

Follow these steps to run the application locally on your computer:

### 1. Database Setup
1. Open your local MySQL server (such as XAMPP, WAMP, or local MySQL instance).
2. Create a database named `freshcart_db`:
   ```sql
   CREATE DATABASE freshcart_db;
   ```
3. The database tables (`users`, `products`, `orders`, `order_items`, etc.) will be automatically created and seeded by the backend server when it starts!

### 2. Configuration
Create a `.env` file in the project root directory and add your MySQL database credentials:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=freshcart_db
DB_PORT=3306
JWT_SECRET=your_secure_jwt_secret_key_here
PORT=3000
```

### 3. Installation & Launch
1. Open your terminal in the project directory:
   ```bash
   cd C:\Users\supri\OneDrive\Desktop\HTML\HTMLCoding
   ```
2. Install the backend dependencies:
   ```bash
   npm install
   ```
3. Start the Express server:
   ```bash
   npm start
   ```
   The backend server will run on `http://localhost:3000`.

### 4. Running the Storefront
*   You can access the shop by opening the storefront file `index.html` directly in your web browser.
*   Alternatively, the running Node server hosts the frontend statically. Simply visit `http://localhost:3000` in your web browser to browse and shop!

---

## 🔑 Admin Access
To access the Admin dashboard:
1. Register a new user with an email containing the word `admin` (e.g., `supriya_admin@freshcart.com`).
2. The registration endpoint auto-detects `admin` in the email address and automatically registers the user with the role of `admin`.
3. Log in with this account, and click the **Admin Dashboard** option in the navigation bar to manage products, view sales logs, and fulfill orders.

---

## 📄 License
This project is open-source and available under the ISC License.
