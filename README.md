# TapatChain

![TapatChain Logo](./src/assets/images/tapatchain.png)

## Overview

TapatChain is a blockchain-powered transparency platform engineered to monitor public infrastructure projects in the Philippines. Utilizing distributed ledger technology, the platform delivers immutable audit trails, real-time milestone tracking, and transparent fund flows to strengthen accountability in government infrastructure initiatives.

## Purpose

TapatChain addresses corruption and inefficiency in public works by providing citizens, auditors, and government officials with verifiable access to project data. Through blockchain's inherent transparency and tamper resistance, the platform ensures:
- End-to-end tracking of project funds from allocation to disbursement
- Cryptographic verification of milestone completions
- Permanent, publicly accessible audit trails
- Secure channels for stakeholder feedback and evidence-based reporting

## System Architecture

### Components
TapatChain comprises two integrated systems:
- **Frontend Application**: React 19 with Vite, providing role-based user interfaces for citizens, auditors, contractors, and administrators
- **Backend API**: .NET 6/7 service managing blockchain interactions, data persistence, and business logic

### Key Capabilities
- **Secure Authentication**: Wallet-based login via MetaMask with role-based access controls
- **Bot Protection**: Google reCAPTCHA v2 integration preventing automated abuse
- **Live Monitoring**: Real-time visualization of fund disbursements and milestone progress
- **Immutable Recording**: All platform actions cryptographically recorded on blockchain
- **Community Engagement**: Tools for public feedback submission with photographic evidence
- **Role-Specific Dashboards**: Tailored views for contractors, engineers, auditors, and administrators
- **Transparent Ledger**: Public view of all project transactions and activities
- **Professional Verification**: System for validating licensed professionals involved in projects

### User Experience Flow
1. Authenticate via MetaMask wallet with reCAPTCHA verification
2. System assigns role-based dashboard access according to wallet credentials
3. Users interact with role-appropriate interfaces:
   - Contractors: Submit work milestones and payment requests
   - Engineers: Inspect and certify work completion
   - Auditors: Review compliance and financial documentation
   - Administrators: Configure system parameters and manage user access
   - Public: Monitor project progress and submit community reports
4. Platform actions generate blockchain transactions creating permanent audit records
5. Frontend and backend synchronize in real-time for current project visibility

## Technology Stack

### Frontend
- **Framework**: React 19 (Vite-powered)
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **Blockchain Integration**: Ethers.js
- **Geospatial**: Leaflet.js
- **Data Visualization**: Lightweight Charts, Recharts, Nivo
- **Iconography**: Lucide React
- **Notifications**: Custom implementation
- **Language**: TypeScript

### Backend
- **Platform**: .NET 6/7 Web API
- **Data Store**: Relational database (SQL Server/PostgreSQL)
- **Blockchain Interface**: Web3.js/Nethereum
- **Authentication**: JWT with wallet signature validation
- **Security**: Environment-configurable reCAPTCHA validation
- **Language**: C#

### DevOps & Infrastructure
- **Build Systems**: Vite (frontend), dotnet CLI (backend)
- **Code Quality**: ESLint with React plugin
- **Type Safety**: TypeScript (frontend), C# (backend)
- **Deployment Targets**: Vercel (frontend), Azure/IIS (backend)

## Implementation Guide

### Requirements
- Node.js 18.x or later with npm
- .NET 6.x SDK or later
- MetaMask browser extension
- Google reCAPTCHA administrative account
- Localhost development environment

### Frontend Deployment
1. Repository acquisition:
   ```bash
   git clone <repository-url>
   cd tapatchain
   ```
2. Dependency installation:
   ```bash
   npm install
   ```
3. Environment configuration (create `.env`):
   ```
   VITE_RECAPTCHA_SITE_KEY=[your_site_key]
   VITE_SITE_URL=[deployment_url]
   ```
4. Development server initiation:
   ```bash
   npm run dev
   ```

### Backend Deployment (sibling `tapatchain-backend` directory)
1. Environment setup:
   ```bash
   cd ../tapatchain-backend
   ```
2. Environment configuration (create `.env`):
   ```
   RECAPTCHA_SECRET_KEY=[your_secret_key]
   RECAPTCHA_VERIFY_URL=https://www.google.com/recaptcha/api/siteverify
   RECAPTCHA_MIN_SCORE=0.5
   [additional_settings: database_connection, JWT_secrets, etc.]
   ```
3. Service execution:
   ```bash
   dotnet run --project tapatchain-backend/tapatchain-backend.csproj
   ```

### Environment Variables Reference
| Variable | Location | Description | Sensitivity |
|----------|----------|-------------|-------------|
| `VITE_RECAPTCHA_SITE_KEY` | Frontend `.env` | Google reCAPTCHA site key | Public |
| `VITE_SITE_URL` | Frontend `.env` | Application base URL | Public |
| `RECAPTCHA_SECRET_KEY` | Backend `.env` | Google reCAPTCHA secret key | Private |
| `RECAPTCHA_VERIFY_URL` | Backend `.env` | Google verification endpoint | Public |
| `RECAPTCHA_MIN_SCORE` | Backend `.env` | Minimum verification threshold (0.0-1.0) | Public |

## Repository Organization
```
tapatchain/
├── src/                 # Frontend application source
│   ├── assets/          # Static resources
│   │   └── images/      # Includes tapatchain.png logo
│   ├── components/      # Reusable UI elements
│   ├── context/         # React state providers
│   ├── pages/           # View components
│   └── shared/          # Common utilities and types
├── public/              # Static web assets
├── scripts/             # Build automation (sitemap generation)
├── .env.example         # Environment variable template
├── eslint.config.js     # Code quality configuration
├── index.html           # Application shell
├── package.json         # Frontend dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Frontend build tool configuration
```

## Participation Guidelines

We encourage community contributions to enhance TapatChain's capabilities. To contribute:
1. Create a personal fork of the repository
2. Develop features in an isolated branch (`git checkout -b feature/[descriptor]`)
3. Implement changes following established code patterns
4. Submit modifications via pull request for maintainer review

All contributions must adhere to the project's coding standards and include relevant test coverage where applicable.

## Licensing

TapatChain is distributed under the MIT License. Refer to the LICENSE file for complete terms and conditions.

## Contact

For project inquiries, partnership opportunities, or technical support:
**Maintainer Contact**: escarezjohnjoshuamanalo@gmail.com

## Attribution

TapatChain was developed to advance transparency in Philippine public infrastructure through blockchain technology. The platform represents a commitment to:
- Accountability in government expenditure
- Citizen participation in infrastructure oversight
- Immutable record keeping for public works
- Technical excellence ingovetec solutions