# Hashtrion Transaction API — XRPL Agentic Payments

## Overview

The Transaction API handles XRPL payment execution for Hashtrion Agentic Commerce.

It prepares transactions from authorized payment records, coordinates signing through the Signing API, submits transactions to XRPL, and verifies payment finality.

## Key Features

- Agent Account setup and XRPL RegularKey activation verification.
- XRP and RLUSD payment execution using stored payment and pricing data.
- XRPL transaction preparation, autofill, and fee validation.
- Azure Key Vault signing through the Hashtrion Signing API.
- Cryptographic verification of signed transactions before submission.
- Duplicate-submission prevention and payment status tracking.
- XRPL validated-ledger confirmation.

## How It Works

**Agent Account Setup**

1. Platform API manages Agent Account and Signing Authority records.
2. Wallet signs the `SetRegularKey` transaction locally.
3. Transaction API submits the signed transaction to XRPL, verifies RegularKey activation, and updates Platform API.

**Agent Payment Execution**

1. Platform API validates the payment request and Spending Policy, then creates a payment record.
2. Transaction API retrieves the payment, pricing snapshot, and active Signing Authority.
3. It validates the account, asset, amount, recipient, and signing key before preparing the XRPL transaction.
4. Signing API signs the transaction using Azure Key Vault.
5. Transaction API verifies the returned signature and transaction contents before submission.
6. The payment moves atomically from `CREATED` to `PENDING`, preventing duplicate submission.
7. Transaction API submits the transaction and checks the validated ledger for final confirmation.

Only validated `tesSUCCESS` results are treated as successful payments. Uncertain outcomes remain `PENDING` until resolved.

## Responsibilities

| Component | Responsibility |
|---|---|
| Platform API | Agent Accounts, Spending Policies, payment authorization |
| Transaction API | XRPL transaction preparation, verification, submission, and finality |
| Signing API | Azure Key Vault signing |
| Wallet | Local signing for account authority setup |

Spending Policies are enforced off-chain by the Platform API, not by XRPL.

## Build & Configuration

Requires **Node.js 24**, SQL Server, Azure Key Vault, and access to the Hashtrion Platform and Signing APIs.

```bash
npm ci
npm run build
npm test
```

Configuration is provided through environment variables, including:

- `PORT`, `NODE_ENV`
- `DB_USER`, `DB_PASSWORD`, `DB_SERVER`, `DB_NAME`
- `AZURE_KEY_VAULT_NAME` and Azure identity credentials
- `APPCLIENT_SECRET`, `INTERNAL_API_KEY` and Key Vault secret names
- `PLATFORM_API_BASE_URL`, `SIGNING_API_BASE_URL`
- `XRPL_NETWORK`, `XRPL_ENDPOINT`

Keep credentials outside the repository. The service loads authentication secrets from Azure Key Vault.
