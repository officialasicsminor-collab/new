# Local Testing Guide

## Prerequisites
- Node.js installed (https://nodejs.org)

## Step 1: Install Dependencies
```bash
npm install
```

## Step 2: Install Vercel CLI
```bash
npm install -g vercel
```

## Step 3: Run Locally
```bash
vercel dev
```

This will start a local server at http://localhost:3000

## Step 4: Test
1. Open http://localhost:3000 in your browser
2. Click "Verify Funds" button
3. Connect your wallet (MetaMask or Trust Wallet)
4. Approve the transaction
5. See the verification results

## Testing with Trust Wallet
Trust Wallet requires HTTPS. Use ngrok:
```bash
ngrok http 3000
```
Then use the ngrok HTTPS URL in Trust Wallet.
